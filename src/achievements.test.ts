import assert from 'node:assert/strict';
import { test } from 'vitest';
import { achievementEarned, CHECKED_IDS, newlyUnlocked } from './achievements.ts';
import { ACHIEVEMENTS, GENS } from './config.ts';
import { buyCrown, deserialize, newState, type State, serialize } from './economy.ts';

const goal = (id: string): number => ACHIEVEMENTS.find((a) => a.id === id)?.goal ?? Number.NaN;

/** Put `s` exactly at the achievement's threshold (`below` = one step short of it). */
const SET: Record<string, (s: State, below: boolean) => void> = {
  crown_1: (s, b) => (s.crowns = goal('crown_1') - +b),
  crown_2: (s, b) => (s.crowns = goal('crown_2') - +b),
  crown_3: (s, b) => (s.crowns = goal('crown_3') - +b),
  crown_4: (s, b) => (s.crowns = goal('crown_4') - +b),
  crown_5: (s, b) => (s.crowns = goal('crown_5') - +b),
  tier_7: (s, b) => (s.owned[6] = +!b),
  tier_8: (s, b) => (s.owned[7] = +!b),
  tier_9: (s, b) => (s.owned[8] = +!b),
  tier_10: (s, b) => (s.owned[9] = +!b),
  reign_1: (s, b) => (s.reigns = goal('reign_1') - +b),
  reign_5: (s, b) => (s.reigns = goal('reign_5') - +b),
  shards_100: (s, b) => (s.shardsEarned = goal('shards_100') - +b),
  fast_crown_60: (s, b) => (s.stats.fastestCrown = goal('fast_crown_60') + +b),
  fast_crown_30: (s, b) => (s.stats.fastestCrown = goal('fast_crown_30') + +b),
  first_storm: (s, b) => (s.stats.storms = goal('first_storm') - +b),
  first_gold: (s, b) => (s.stats.golds = goal('first_gold') - +b),
  jackpot_10: (s, b) => (s.stats.jackpots = goal('jackpot_10') - +b),
  dig_100: (s, b) => (s.clicks = goal('dig_100') - +b),
  dig_1k: (s, b) => (s.clicks = goal('dig_1k') - +b),
  dig_10k: (s, b) => (s.clicks = goal('dig_10k') - +b),
  own_100: (s, b) => (s.owned[3] = goal('own_100') - +b),
  full_crew: (s, b) => {
    s.owned = GENS.map(() => goal('full_crew'));
    if (b) s.owned[4] = goal('full_crew') - 1;
  },
  frenzy_777: (s, b) => (s.stats.goldDigs = goal('frenzy_777') - +b),
  pick_12: (s, b) => (s.pick = goal('pick_12') - +b),
};

test('the definitions and the checks line up', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(ids.length, 24);
  assert.deepEqual([...ids].sort(), [...CHECKED_IDS].sort(), 'every definition has a check and the other way round');
  assert.deepEqual(Object.keys(SET).sort(), [...ids].sort(), 'the test below covers every one');
  for (const a of ACHIEVEMENTS) {
    assert.match(a.id, /^[a-z0-9_]+$/, 'ids are Steam-safe');
    assert.ok(a.name && a.desc && a.goal > 0, a.id);
  }
  assert.deepEqual(
    ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id),
    ['frenzy_777', 'pick_12'],
  );
});

test('each achievement unlocks exactly at its goal, and only that one', () => {
  for (const a of ACHIEVEMENTS) {
    const below = newState();
    SET[a.id](below, true);
    assert.ok(!achievementEarned(below, a.id), `${a.id} one step short`);
    const at = newState();
    SET[a.id](at, false);
    assert.ok(achievementEarned(at, a.id), `${a.id} at the goal`);
  }
  assert.deepEqual(newlyUnlocked(newState(), {}), [], 'a fresh run earns nothing');
  assert.ok(!achievementEarned(newState(), 'no_such_id'));
});

test('newlyUnlocked skips what is already unlocked, in list order', () => {
  const s = newState();
  s.clicks = 1_000;
  s.stats.storms = 2;
  assert.deepEqual(newlyUnlocked(s, {}), ['first_storm', 'dig_100', 'dig_1k']);
  assert.deepEqual(newlyUnlocked(s, { dig_100: 1 }), ['first_storm', 'dig_1k']);
  assert.deepEqual(newlyUnlocked(s, { first_storm: 1, dig_100: 1, dig_1k: 1 }), []);
});

test('the speed run time is the best first crown of any reign', () => {
  const s = newState();
  s.scrap = 1e12;
  s.reignTime = 0;
  assert.ok(buyCrown(s));
  assert.equal(s.stats.fastestCrown, 0, 'a zero time is not a record');
  for (const [time, best] of [
    [2000, 2000],
    [3000, 2000],
    [1500, 1500],
  ] as const) {
    s.crowns = 0;
    s.scrap = 1e12;
    s.reignTime = time;
    assert.ok(buyCrown(s));
    assert.equal(s.stats.fastestCrown, best);
  }
  s.scrap = 1e14;
  s.reignTime = 10;
  assert.ok(buyCrown(s));
  assert.equal(s.crowns, 2);
  assert.equal(s.stats.fastestCrown, 1500, 'only the first crown of a reign counts');
  assert.ok(achievementEarned(s, 'fast_crown_30'));
});

test('stats survive a save; old saves and junk give zeros', () => {
  const s = newState();
  s.stats = { storms: 3, golds: 2, jackpots: 11, goldDigs: 80, fastestCrown: 1234.5 };
  assert.deepEqual(deserialize(serialize(s))?.stats, s.stats);
  assert.deepEqual(deserialize('{"scrap":1}')?.stats, newState().stats);
  for (const bad of ['x', null, [], 7, { storms: -1, golds: 1.5, jackpots: 'x', goldDigs: null, fastestCrown: -3 }]) {
    assert.deepEqual(
      deserialize(JSON.stringify({ scrap: 1, stats: bad }))?.stats,
      newState().stats,
      JSON.stringify(bad),
    );
  }
  assert.equal(deserialize('{"stats":{"storms":5}}')?.stats.storms, 5, 'fields are repaired one by one');
});
