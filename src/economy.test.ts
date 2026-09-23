// Economy acceptance tests — `pnpm test` (node:test, Node's native TS stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENS, COST_GROWTH, MILESTONES, CROWN_COST, STORM_MULT, OFFLINE_CAP_S, OFFLINE_RATE,
  PICK_BASE_COST, QTY_MODES,
} from './config.ts';
import {
  newState, genCost, maxAffordable, perSecond, clickPower, buyGen, buyPick, buyCrown, earn,
  milestoneMult, isRevealed, offlineGain, serialize, deserialize, formatNum, pickCost,
} from './economy.ts';

test('content', () => {
  assert.equal(GENS.length, 6);
  assert.ok(GENS.every((g, i) => i === 0 || (g.baseCost > GENS[i - 1]!.baseCost && g.rate > GENS[i - 1]!.rate)),
    'tiers get pricier and more productive');
});

test('digging and hiring', () => {
  const s = newState();
  assert.ok(s.scrap === 0 && s.owned.every((n) => n === 0), 'new run starts broke');
  assert.equal(clickPower(s, 0), 1, 'a bare-pick dig earns 1');
  for (let i = 0; i < 15; i++) earn(s, clickPower(s, perSecond(s)));
  assert.ok(s.scrap >= GENS[0]!.baseCost, '15 digs afford a scavenger');
  assert.equal(buyGen(s, 0, 1), 1);
  assert.equal(s.scrap, 15 - GENS[0]!.baseCost, 'buying spends its cost');
  assert.equal(perSecond(s), GENS[0]!.rate, 'crew produce scrap/s');
  assert.equal(buyGen(s, 5, 1), 0, 'cannot buy what you cannot afford');
  assert.equal(s.owned[5], 0);
});

test('costs', () => {
  assert.equal(genCost(0, 1), Math.ceil(GENS[0]!.baseCost * COST_GROWTH));
  const singles = Array.from({ length: 10 }, (_, k) => GENS[1]!.baseCost * Math.pow(COST_GROWTH, 3 + k)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(genCost(1, 3, 10) - singles) <= 1, 'bulk cost = sum of singles');
  const rich = newState(); rich.scrap = 10_000;
  const k = maxAffordable(0, 0, rich.scrap);
  assert.ok(k > 0 && genCost(0, 0, k) <= rich.scrap && genCost(0, 0, k + 1) > rich.scrap, 'MAX is exact');
  assert.equal(buyGen(rich, 0, QTY_MODES[2]!), k, 'BUY MAX buys that many');
});

test('production multipliers', () => {
  const idle = newState(); idle.owned[1] = 10;
  assert.equal(perSecond(idle, true), perSecond(idle) * STORM_MULT, 'storms multiply production');
  assert.equal(milestoneMult(MILESTONES[0]!), 2);
  assert.equal(milestoneMult(MILESTONES[1]!), 4);
  assert.equal(milestoneMult(MILESTONES[0]! - 1), 1);
});

test('forge pick', () => {
  const up = newState(); up.scrap = PICK_BASE_COST;
  assert.ok(buyPick(up) && up.pick === 1 && clickPower(up, 0) === 2, 'upgrade doubles digs');
  assert.ok(pickCost(1) > pickCost(0));
  assert.ok(clickPower(up, 1000) > clickPower(up, 0), 'digs scale with production');
});

test('discovery', () => {
  const s = newState();
  assert.ok(isRevealed(s, 0));
  assert.ok(!isRevealed(s, 3));
  s.owned[2] = 1;
  assert.ok(isRevealed(s, 3), 'owning a tier reveals the next');
});

test('win', () => {
  const w = newState();
  assert.ok(!buyCrown(w) && !w.won, 'not early');
  w.scrap = CROWN_COST;
  assert.ok(buyCrown(w) && w.won && w.scrap === 0);
  w.scrap = CROWN_COST * 2;
  assert.ok(!buyCrown(w), 'not twice');
});

test('save and offline', () => {
  const sv = newState(); sv.scrap = 123.5; sv.owned[2] = 7; sv.pick = 3; sv.total = 999;
  const back = deserialize(serialize(sv));
  assert.ok(back && back.scrap === 123.5 && back.owned[2] === 7 && back.pick === 3 && back.total === 999);
  assert.equal(deserialize('{nope'), null);
  assert.equal(deserialize(null), null);
  assert.equal(deserialize('{"scrap":-5,"owned":["x",3]}')!.scrap, 0);
  assert.equal(deserialize('{"owned":["x",3]}')!.owned[1], 3);
  const idle = newState(); idle.owned[1] = 10;
  assert.equal(offlineGain(idle, 10), 0, 'short absences earn nothing');
  assert.equal(offlineGain(idle, OFFLINE_CAP_S * 5), perSecond(idle) * OFFLINE_CAP_S * OFFLINE_RATE, 'capped and halved');
});

test('formatting', () => {
  assert.equal(formatNum(5), '5');
  assert.equal(formatNum(2.5), '2.5');
  assert.equal(formatNum(999), '999');
  assert.equal(formatNum(1234), '1.23K');
  assert.equal(formatNum(2_500_000), '2.50M');
  assert.equal(formatNum(CROWN_COST), '250M');
});

test('pacing: a greedy bot reaches the crown in 20 min – 3 h', () => {
  const b = newState();
  let t = 0;
  while (!b.won && t < 6 * 3600) {
    earn(b, perSecond(b) + clickPower(b, perSecond(b)) * 4); // 4 clicks/s
    t++;
    if (buyCrown(b)) break;
    let best = -1, bestEff = 0;
    for (let i = 0; i < GENS.length; i++) {
      const eff = GENS[i]!.rate * milestoneMult((b.owned[i] ?? 0) + 1) / genCost(i, b.owned[i] ?? 0);
      if (eff > bestEff) { bestEff = eff; best = i; }
    }
    if (b.scrap >= pickCost(b.pick) && pickCost(b.pick) < 20 * (perSecond(b) + 1)) buyPick(b);
    while (best >= 0 && buyGen(b, best, 1) === 1) { /* keep buying */ }
  }
  console.log(`  pacing bot crowned after ${(t / 60).toFixed(1)} min`);
  assert.ok(b.won && t <= 3 * 3600 && t >= 20 * 60);
});
