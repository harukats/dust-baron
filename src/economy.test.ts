// Economy acceptance tests — `pnpm test` (Vitest).

import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  BASE_TIERS,
  COST_GROWTH,
  CROWNS,
  GENS,
  MILESTONES,
  OFFLINE_CAP_S,
  OFFLINE_RATE,
  PICK_BASE_COST,
  QTY_MODES,
  RELICS,
  SHARD_BONUS,
  STORM_MULT,
} from './config.ts';
import {
  activeDigMultiplier,
  applyDigFrenzy,
  ascend,
  buyCrown,
  buyGen,
  buyPick,
  buyRelic,
  cacheReward,
  canAscend,
  clickPower,
  crownMult,
  deserialize,
  digGain,
  earn,
  formatNum,
  frenzySeconds,
  genCost,
  goldChance,
  isRevealed,
  isUnlocked,
  isWon,
  maxAffordable,
  milestoneMult,
  newState,
  offlineCapS,
  offlineGain,
  perSecond,
  pickCost,
  productionMult,
  relicCost,
  relicLevel,
  selectCacheKind,
  serialize,
  settleProduction,
  shardMult,
  shardsForReign,
  shopWindow,
  stormMult,
} from './economy.ts';

test('content', () => {
  assert.equal(GENS.length, BASE_TIERS + CROWNS.length - 1, 'the last crown unlocks no tier');
  assert.ok(
    CROWNS.every((c, i) => i === 0 || c.cost > CROWNS[i - 1].cost),
    'crowns get pricier',
  );
  assert.ok(
    GENS.every((g, i) => i === 0 || (g.baseCost > GENS[i - 1].baseCost && g.rate > GENS[i - 1].rate)),
    'tiers get pricier and more productive',
  );
});

test('digging and hiring', () => {
  const s = newState();
  assert.ok(s.scrap === 0 && s.owned.every((n) => n === 0), 'new run starts broke');
  assert.equal(clickPower(s, 0), 1, 'a bare-pick dig earns 1');
  for (let i = 0; i < 15; i++) earn(s, clickPower(s, perSecond(s)));
  assert.ok(s.scrap >= GENS[0].baseCost, '15 digs afford a scavenger');
  assert.equal(buyGen(s, 0, 1), 1);
  assert.equal(s.scrap, 15 - GENS[0].baseCost, 'buying spends its cost');
  assert.equal(perSecond(s), GENS[0].rate, 'crew produce scrap/s');
  assert.equal(buyGen(s, 5, 1), 0, 'cannot buy what you cannot afford');
  assert.equal(s.owned[5], 0);
});

test('costs', () => {
  assert.equal(genCost(0, 1), Math.ceil(GENS[0].baseCost * COST_GROWTH));
  const singles = Array.from({ length: 10 }, (_, k) => GENS[1].baseCost * COST_GROWTH ** (3 + k)).reduce(
    (a, b) => a + b,
    0,
  );
  assert.ok(Math.abs(genCost(1, 3, 10) - singles) <= 1, 'bulk cost = sum of singles');
  const rich = newState();
  rich.scrap = 10_000;
  const k = maxAffordable(0, 0, rich.scrap);
  assert.ok(k > 0 && genCost(0, 0, k) <= rich.scrap && genCost(0, 0, k + 1) > rich.scrap, 'MAX is exact');
  assert.equal(buyGen(rich, 0, QTY_MODES[2]), k, 'BUY MAX buys that many');
});

test('production multipliers', () => {
  const idle = newState();
  idle.owned[1] = 10;
  assert.equal(perSecond(idle, true), perSecond(idle) * STORM_MULT, 'storms multiply production');
  assert.equal(milestoneMult(MILESTONES[0]), 2);
  assert.equal(milestoneMult(MILESTONES[1]), 4);
  assert.equal(milestoneMult(MILESTONES[0] - 1), 1);
});

test('forge pick', () => {
  const up = newState();
  up.scrap = PICK_BASE_COST;
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

test('crown chain: bought in order, each once, the last one wins', () => {
  const w = newState();
  assert.ok(!buyCrown(w) && w.crowns === 0, 'not early');
  CROWNS.forEach((c, i) => {
    w.scrap = c.cost * 0.99;
    assert.ok(!buyCrown(w) && w.crowns === i, `${c.name} needs its full price`);
    w.scrap = c.cost;
    assert.ok(buyCrown(w) && w.crowns === i + 1 && w.scrap === 0);
    assert.equal(isWon(w), i === CROWNS.length - 1, 'only the last crown wins');
  });
  w.scrap = Number.MAX_VALUE;
  assert.ok(!buyCrown(w) && w.crowns === CROWNS.length, 'chain is complete');
});

test('crowns multiply production and unlock one tier each', () => {
  const s = newState();
  s.owned[0] = 10;
  const base = perSecond(s);
  for (let k = 1; k <= CROWNS.length; k++) {
    s.crowns = k;
    assert.equal(perSecond(s), base * 2 ** k);
    assert.equal(crownMult(k), 2 ** k);
  }
  assert.equal(crownMult(99), 2 ** CROWNS.length, 'extra crowns are ignored');
  for (let c = 0; c <= 4; c++) {
    s.crowns = c;
    for (let i = 0; i < GENS.length; i++) assert.equal(isUnlocked(s, i), i < 6 + c, `tier ${i + 1} at ${c} crowns`);
  }
  s.crowns = 0;
  s.total = 1e12;
  s.owned[6] = 0;
  s.owned[5] = 1;
  assert.ok(!isRevealed(s, 6), 'a locked tier stays hidden however rich you are');
  s.crowns = 1;
  assert.ok(isRevealed(s, 6));
});

test('the shop shows the newest six unlocked tiers', () => {
  const s = newState();
  assert.deepEqual(shopWindow(s), [0, 1, 2, 3, 4, 5]);
  s.crowns = 1;
  assert.deepEqual(shopWindow(s), [1, 2, 3, 4, 5, 6]);
  s.crowns = 4;
  assert.deepEqual(shopWindow(s), [4, 5, 6, 7, 8, 9]);
  s.crowns = 5;
  assert.deepEqual(shopWindow(s), [4, 5, 6, 7, 8, 9], 'the last crown unlocks no tier');
});

test('save and offline', () => {
  const sv = newState();
  sv.scrap = 123.5;
  sv.owned[2] = 7;
  sv.pick = 3;
  sv.total = 999;
  const back = deserialize(serialize(sv));
  assert.ok(back && back.scrap === 123.5 && back.owned[2] === 7 && back.pick === 3 && back.total === 999);
  assert.equal(deserialize('{nope'), null);
  assert.equal(deserialize(null), null);
  assert.equal(deserialize('{"scrap":-5,"owned":["x",3]}')?.scrap, 0);
  assert.equal(deserialize('{"owned":["x",3]}')?.owned[1], 3);
  const idle = newState();
  idle.owned[1] = 10;
  assert.equal(offlineGain(idle, 10), 0, 'short absences earn nothing');
  assert.equal(
    offlineGain(idle, OFFLINE_CAP_S * 5),
    perSecond(idle) * OFFLINE_CAP_S * OFFLINE_RATE,
    'capped and halved',
  );
});

test('formatting', () => {
  assert.equal(formatNum(5), '5');
  assert.equal(formatNum(2.5), '2.5');
  assert.equal(formatNum(999), '999');
  assert.equal(formatNum(1234), '1.23K');
  assert.equal(formatNum(2_500_000), '2.50M');
  assert.equal(formatNum(CROWNS[0].cost), '250M');
});

/** A greedy bot (4 digs/s, best rate-per-cost buy, only what the shop window offers). Returns the second each crown was bought, counted from the bot's start (the state `b` is advanced in place). */
function playBot(maxCrowns: number, limitS: number, b = newState()): number[] {
  const times: number[] = [];
  for (let t = 1; t <= limitS && b.crowns < maxCrowns; t++) {
    earn(b, perSecond(b) + clickPower(b, perSecond(b)) * 4);
    if (buyCrown(b)) times.push(t);
    let best = -1,
      bestEff = 0;
    for (const i of shopWindow(b)) {
      const eff = (GENS[i].rate * milestoneMult((b.owned[i] ?? 0) + 1)) / genCost(i, b.owned[i] ?? 0);
      if (eff > bestEff) {
        bestEff = eff;
        best = i;
      }
    }
    if (b.scrap >= pickCost(b.pick) && pickCost(b.pick) < 20 * (perSecond(b) + 1)) buyPick(b);
    while (best >= 0 && buyGen(b, best, 1) === 1) {
      /* keep buying */
    }
  }
  return times;
}

test('pacing: a greedy bot reaches the first crown in 20 min – 3 h', () => {
  const [first] = playBot(1, 6 * 3600);
  console.log(`  pacing bot: first crown after ${(first / 60).toFixed(1)} min`);
  assert.ok(first <= 3 * 3600 && first >= 20 * 60);
});

test('pacing: each later crown takes the bot 15 min – 2 h', () => {
  const times = playBot(CROWNS.length, 72 * 3600);
  times.forEach((t, i) => {
    console.log(
      `  ${CROWNS[i].name}: +${((t - (times[i - 1] ?? 0)) / 60).toFixed(1)} min (total ${(t / 60).toFixed(1)} min)`,
    );
  });
  assert.equal(times.length, CROWNS.length, 'the bot finishes the chain');
  times.forEach((t, i) => {
    const gap = t - (times[i - 1] ?? 0);
    if (i > 0) assert.ok(gap >= 15 * 60 && gap <= 2 * 3600, `${CROWNS[i].name} took ${(gap / 60).toFixed(1)} min`);
  });
});

test('合計丸め305、MAX10個、不足304では変更しない', () => {
  assert.equal(genCost(0, 0, 10), 305);
  assert.equal(genCost(0, 0, 11), 366);
  assert.equal(genCost(0, 10), 61);
  assert.equal(maxAffordable(0, 0, 305), 10);
  const s = newState();
  s.scrap = 304;
  assert.equal(buyGen(s, 0, 10), 0);
  assert.equal(s.scrap, 304);
  s.scrap = 305;
  assert.equal(buyGen(s, 0, -1), 10);
  assert.equal(s.scrap, 0);
});
test('全種類・全倍率閾値・100回の不足購入', () => {
  for (let i = 0; i < GENS.length; i++) {
    const s = newState();
    s.scrap = GENS[i].baseCost - 1;
    for (let n = 0; n < 100; n++) assert.equal(buyGen(s, i, 1), 0);
    s.scrap++;
    assert.equal(buyGen(s, i, 1), 1);
    assert.equal(perSecond(s), GENS[i].rate);
  }
  MILESTONES.forEach((threshold, i) => {
    assert.equal(milestoneMult(threshold - 1), 2 ** i);
    assert.equal(milestoneMult(threshold), 2 ** (i + 1));
    assert.equal(milestoneMult(threshold + 1), 2 ** (i + 1));
  });
});
test('無効な購入と収入は正常な状態を壊さない', () => {
  const s = newState();
  s.scrap = 1e6;
  const before = serialize(s);
  for (const qty of [NaN, Infinity, 0.5, 1e308]) assert.equal(buyGen(s, 0, qty), 0);
  assert.equal(buyGen(s, 99, 1), 0);
  earn(s, Infinity);
  earn(s, -1);
  assert.equal(serialize(s), before);
});
test('不正なroot・各整数・各フィールドを独立して復旧する', () => {
  for (const root of ['[]', 'null', '{}', '42', '{"unknown":1}']) assert.equal(deserialize(root), null);
  const valid = { ...newState(), scrap: 123.5, total: 200, owned: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], pick: 3, crowns: 2 };
  for (const key of ['scrap', 'total', 'clicks', 'pick', 'playTime', 'lastSave']) {
    for (const invalid of [-1, 'bad', null]) {
      const s = deserialize(JSON.stringify({ ...valid, [key]: invalid }));
      assert.ok(s);
      assert.deepEqual(s.owned, valid.owned);
      assert.equal(s.crowns, 2);
      if (key !== 'pick') assert.equal(s.pick, 3);
      assert.equal(s[key as keyof typeof s], key === 'total' ? valid.scrap : 0);
    }
  }
  assert.equal(deserialize('{"clicks":1.5,"pick":3.5,"owned":[1.5,2]}')?.pick, 0);
  assert.deepEqual(deserialize('{"owned":[1.5,2]}')?.owned, [0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(deserialize('{"pick":1024,"won":true}')?.pick, 0);
  assert.equal(deserialize('{"won":true}')?.crowns, 1, 'a pre-chain save that won has the first crown');
  assert.equal(deserialize('{"won":false,"scrap":5}')?.crowns, 0);
  assert.equal(deserialize('{"crowns":3,"won":true}')?.crowns, 3);
  assert.equal(deserialize('{"crowns":99}')?.crowns, CROWNS.length, 'clamped to the chain');
  for (const bad of [-1, 1.5, 'x', null])
    assert.equal(deserialize(JSON.stringify({ crowns: bad, scrap: 1 }))?.crowns, 0);
  const extreme = deserialize('{"owned":[1e308,2],"pick":3}');
  assert.ok(extreme);
  assert.equal(extreme.owned[0], 0);
  assert.equal(extreme.owned[1], 2);
  assert.ok(Number.isFinite(perSecond(extreme)));
});

test('キャッシュ種類の10%境界と不正な抽選値', () => {
  for (const roll of [0, 0.099999]) assert.equal(selectCacheKind(roll), 'gold');
  for (const roll of [0.1, 0.999999, NaN, Infinity, -Infinity, -0.1, 1, 2]) {
    assert.equal(selectCacheKind(roll), 'chrome');
  }
});
test('ゴールド確定報酬とクローム50%境界・不正値は報酬なし', () => {
  const s = newState();
  for (const roll of [0, 0.75, NaN, Infinity, -Infinity, -1, 1]) {
    assert.deepEqual(cacheReward(s, 'gold', roll), { kind: 'frenzy', mult: 777 });
  }
  assert.deepEqual(cacheReward(s, 'chrome', 0.499999), { kind: 'credits', amount: 30 });
  assert.deepEqual(cacheReward(s, 'chrome', 0.5), { kind: 'frenzy', mult: 7 });
  for (const roll of [NaN, Infinity, -Infinity, -1, 1]) {
    assert.deepEqual(cacheReward(s, 'chrome', roll), { kind: 'none' });
  }
  assert.deepEqual(s, newState());
});
test('採掘倍率の全取得順・期限境界・同倍率更新', () => {
  for (const incoming of [7, 777] as const) {
    assert.deepEqual(applyDigFrenzy(1, 0, incoming, 1000), { mult: incoming, endsAtMs: 21000 });
    assert.deepEqual(applyDigFrenzy(incoming, 21000, incoming, 2000), { mult: incoming, endsAtMs: 22000 });
  }
  assert.deepEqual(applyDigFrenzy(7, 21000, 777, 2000), { mult: 777, endsAtMs: 22000 });
  assert.deepEqual(applyDigFrenzy(777, 21000, 7, 2000), { mult: 777, endsAtMs: 21000 });
  assert.deepEqual(applyDigFrenzy(777, 21000, 7, 21000), { mult: 7, endsAtMs: 41000 });
  assert.equal(activeDigMultiplier(777, 21000, 20999), 777);
  assert.equal(activeDigMultiplier(777, 21000, 21000), 1);
  assert.equal(activeDigMultiplier(777, 21000, 21001), 1);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(activeDigMultiplier(777, 21000, value), 1);
    assert.equal(activeDigMultiplier(777, value, 1000), 1);
    assert.deepEqual(applyDigFrenzy(777, 21000, 7, value), { mult: 777, endsAtMs: 21000 });
  }
  assert.equal(activeDigMultiplier(8, 21000, 1000), 1);
});
test('777倍は現在の通常採掘だけに適用し設備・装備変更を反映する', () => {
  const s = newState();
  assert.equal(digGain(s, 777, 21000, 1000), 777);
  assert.equal(digGain(s, 777, 21000, 21000), 1);
  s.pick = 3;
  s.owned[0] = 25;
  const base = clickPower(s, perSecond(s));
  const ps = perSecond(s),
    offline = offlineGain(s, 3600);
  const jackpot = cacheReward(s, 'chrome', 0);
  assert.equal(digGain(s, 777, 21000, 1000), base * 777);
  assert.equal(perSecond(s), ps);
  assert.equal(offlineGain(s, 3600), offline);
  assert.deepEqual(cacheReward(s, 'chrome', 0), jackpot);
  assert.equal(perSecond(s, true), ps * STORM_MULT);
  s.pick++;
  s.owned[0]++;
  assert.equal(digGain(s, 777, 21000, 1000), clickPower(s, perSecond(s)) * 777);
});

// ── Reign ───────────────────────────────────────────────────────────────────
/** A state in the middle of a reign: two crowns, a crew, a pick and plenty earned. */
function midReign(): ReturnType<typeof newState> {
  const s = newState();
  Object.assign(s, {
    scrap: 5e11,
    total: 2e12,
    reignTotal: 1e12,
    clicks: 50,
    pick: 5,
    crowns: 2,
    playTime: 9000,
    reignTime: 7000,
  });
  s.owned = GENS.map((_, i) => 10 + i);
  return s;
}

test('shards for a reign: floor(cbrt(earned / 1e7))', () => {
  for (const [earned, shards] of [
    [0, 0],
    [9_990_000, 0],
    [1e7, 1],
    [7.9e7, 1],
    [8e7, 2],
    [2.5e8, 2],
    [1e12, 46],
    [1e14, 215],
    [-5, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ] as const)
    assert.equal(shardsForReign(earned), shards, `${earned}`);
});

test('ascending needs a crown and at least one shard', () => {
  const s = newState();
  s.reignTotal = 1e12;
  assert.ok(!canAscend(s), 'no crown yet');
  s.crowns = 1;
  assert.ok(canAscend(s));
  s.reignTotal = 9_000_000;
  assert.ok(!canAscend(s), 'not even one shard');
  const before = serialize(s);
  assert.equal(ascend(s), 0);
  assert.equal(serialize(s), before, 'a refused ascend changes nothing');
});

test('ascend banks the shards, resets the reign and keeps the rest', () => {
  const s = midReign();
  s.relics[RELICS.findIndex((r) => r.id === 'storm_caller')] = 1;
  s.shards = 3;
  s.shardsEarned = 10;
  s.stats.storms = 4;
  const gain = ascend(s);
  assert.equal(gain, 46);
  assert.equal(s.shards, 49);
  assert.equal(s.shardsEarned, 56);
  assert.equal(s.reigns, 1);
  // reset
  assert.equal(s.scrap, 0);
  assert.ok(s.owned.every((n) => n === 0));
  assert.equal(s.pick, 0);
  assert.equal(s.crowns, 0);
  assert.equal(s.reignTotal, 0);
  assert.equal(s.reignTime, 0);
  // kept
  assert.equal(s.total, 2e12);
  assert.equal(s.clicks, 50);
  assert.equal(s.playTime, 9000);
  assert.equal(relicLevel(s, 'storm_caller'), 1);
  assert.equal(s.stats.storms, 4);
  assert.equal(perSecond(s), 0);
  assert.ok(!canAscend(s), 'cannot ascend twice in a row');
});

test('shards and crowns both multiply production', () => {
  const s = newState();
  s.owned[0] = 10;
  const base = perSecond(s);
  s.shardsEarned = 50;
  assert.equal(shardMult(s), 1 + 50 * SHARD_BONUS);
  assert.equal(perSecond(s), base * 2);
  s.crowns = 2;
  assert.equal(productionMult(s), 4 * 2);
  assert.equal(perSecond(s), base * 8);
});

test('relics: buying, costs, max level', () => {
  const s = newState();
  const storm = RELICS.findIndex((r) => r.id === 'storm_caller');
  assert.equal(relicCost(s, storm), RELICS[storm].costs[0]);
  assert.ok(!buyRelic(s, storm), 'no shards');
  s.shards = 1000;
  assert.ok(buyRelic(s, storm));
  assert.equal(s.shards, 1000 - RELICS[storm].costs[0]);
  assert.equal(relicCost(s, storm), RELICS[storm].costs[1]);
  assert.ok(buyRelic(s, storm));
  assert.equal(relicCost(s, storm), null, 'maxed');
  const before = serialize(s);
  assert.ok(!buyRelic(s, storm), 'cannot buy past the max');
  for (const bad of [-1, 99, 1.5, Number.NaN]) assert.ok(!buyRelic(s, bad));
  assert.equal(serialize(s), before);
});

test('every relic does what its blurb says', () => {
  const s = newState();
  const set = (id: string, level: number): void => {
    s.relics[RELICS.findIndex((r) => r.id === id)] = level;
  };
  assert.deepEqual(
    [stormMult(s), goldChance(s), frenzySeconds(s), offlineCapS(s)],
    [STORM_MULT, 0.1, 20, OFFLINE_CAP_S],
  );
  set('storm_caller', 2);
  assert.equal(stormMult(s), 3);
  s.owned[0] = 10;
  assert.equal(perSecond(s, true), perSecond(s) * 3);
  set('gold_rush', 2);
  assert.ok(Math.abs(goldChance(s) - 0.15) < 1e-9);
  assert.equal(selectCacheKind(0.12, goldChance(s)), 'gold');
  assert.equal(selectCacheKind(0.12), 'chrome', 'the default chance is unchanged');
  set('frenzy_lord', 3);
  assert.equal(frenzySeconds(s), 35);
  assert.equal(applyDigFrenzy(1, 0, 7, 1000, frenzySeconds(s)).endsAtMs, 1000 + 35_000);
  assert.equal(applyDigFrenzy(1, 0, 7, 1000).endsAtMs, 1000 + 20_000);
  set('long_shift', 3);
  assert.equal(offlineCapS(s), 4 * OFFLINE_CAP_S);
  assert.equal(offlineGain(s, 10 * OFFLINE_CAP_S), perSecond(s) * 4 * OFFLINE_CAP_S * OFFLINE_RATE);
  // a storm lasting 10 s of a 20 s stretch is paid at the relic multiplier
  const r = settleProduction(s, 0, 20_000, 10_000);
  assert.equal(r.gain, perSecond(s) * (20 + 10 * 2));
});

test('starting relics apply when a reign begins', () => {
  const s = midReign();
  s.relics[RELICS.findIndex((r) => r.id === 'head_start')] = 3;
  s.relics[RELICS.findIndex((r) => r.id === 'forge_memory')] = 2;
  ascend(s);
  assert.equal(s.owned[0], 30);
  assert.ok(s.owned.slice(1).every((n) => n === 0));
  assert.equal(s.pick, 2);
});

test('earn counts towards the reign too, bad amounts count for nothing', () => {
  const s = newState();
  earn(s, 100);
  assert.deepEqual([s.scrap, s.total, s.reignTotal], [100, 100, 100]);
  const before = serialize(s);
  earn(s, Number.NaN);
  earn(s, -1);
  earn(s, Number.MAX_VALUE * 2);
  assert.equal(serialize(s), before);
});

test('reign fields survive a save, old saves count as the first reign, junk is repaired', () => {
  const s = midReign();
  s.reigns = 3;
  s.shards = 7;
  s.shardsEarned = 90;
  s.relics = [2, 1, 0, 5, 0, 3];
  assert.deepEqual(deserialize(serialize(s)), s);
  // a save from before reigns
  const old = deserialize('{"scrap":5,"total":1000,"crowns":1,"playTime":420}');
  assert.ok(old);
  assert.equal(old.reigns, 0);
  assert.equal(old.reignTotal, 1000);
  assert.equal(old.reignTime, 420);
  assert.deepEqual(
    old.relics,
    RELICS.map(() => 0),
  );
  // junk
  assert.equal(deserialize('{"total":10,"reignTotal":1e30}')?.reignTotal, 10, 'a reign cannot out-earn the lifetime');
  assert.equal(deserialize('{"total":10,"reignTotal":"x"}')?.reignTotal, 0);
  assert.equal(deserialize('{"shards":9,"shardsEarned":3}')?.shardsEarned, 9, 'unspent shards were earned');
  assert.deepEqual(deserialize('{"relics":[99,-1,1.5,"x",null,2]}')?.relics, [2, 0, 0, 0, 0, 2]);
  assert.deepEqual(
    deserialize('{"relics":"nope"}')?.relics,
    RELICS.map(() => 0),
  );
  for (const bad of [-1, 1.5, 'x', null])
    assert.equal(deserialize(JSON.stringify({ reigns: bad, scrap: 1 }))?.reigns, 0);
});

test('pacing: a reign with shards and a head start is faster than the last', () => {
  const b = newState();
  const first = playBot(2, 12 * 3600, b);
  assert.equal(first.length, 2, 'the bot owns two crowns');
  assert.ok(canAscend(b));
  const gain = ascend(b);
  assert.ok(gain >= 1);
  b.shards += 5; // the shards pay for Head Start level 1 (10 Scavengers each reign)
  assert.ok(
    buyRelic(
      b,
      RELICS.findIndex((r) => r.id === 'head_start'),
    ),
  );
  const second = playBot(1, 12 * 3600, b);
  console.log(
    `  reign 1: crown 1 at ${(first[0] / 60).toFixed(1)} min, crown 2 at ${(first[1] / 60).toFixed(1)} min; reign 2 (${gain} shards): crown 1 at ${(second[0] / 60).toFixed(1)} min`,
  );
  assert.ok(second[0] < first[0], 'the second reign reaches its first crown sooner');
});
