// Achievement checks: pure functions over a State, so they run under Node. The definitions
// (names, descriptions, goals) are in config.ts; this file says how to measure each one.
import { ACHIEVEMENTS } from './config.ts';
import type { State } from './economy.ts';

const goalOf = (id: string): number => ACHIEVEMENTS.find((a) => a.id === id)?.goal ?? Number.POSITIVE_INFINITY;

/** At least `goal` of whatever `value` counts. */
const atLeast =
  (id: string, value: (s: State) => number) =>
  (s: State): boolean =>
    value(s) >= goalOf(id);
/** Own one or more of generator `i` (0-based). */
const owns = (id: string, i: number) => atLeast(id, (s) => s.owned[i] ?? 0);
/** The fastest reign to a first crown, in seconds, was within the goal. */
const withinTime =
  (id: string) =>
  (s: State): boolean =>
    s.stats.fastestCrown > 0 && s.stats.fastestCrown <= goalOf(id);

const CHECKS: Record<string, (s: State) => boolean> = {
  crown_1: atLeast('crown_1', (s) => s.crowns),
  crown_2: atLeast('crown_2', (s) => s.crowns),
  crown_3: atLeast('crown_3', (s) => s.crowns),
  crown_4: atLeast('crown_4', (s) => s.crowns),
  crown_5: atLeast('crown_5', (s) => s.crowns),
  tier_7: owns('tier_7', 6),
  tier_8: owns('tier_8', 7),
  tier_9: owns('tier_9', 8),
  tier_10: owns('tier_10', 9),
  reign_1: atLeast('reign_1', (s) => s.reigns),
  reign_5: atLeast('reign_5', (s) => s.reigns),
  shards_100: atLeast('shards_100', (s) => s.shardsEarned),
  fast_crown_60: withinTime('fast_crown_60'),
  fast_crown_30: withinTime('fast_crown_30'),
  first_storm: atLeast('first_storm', (s) => s.stats.storms),
  first_gold: atLeast('first_gold', (s) => s.stats.golds),
  jackpot_10: atLeast('jackpot_10', (s) => s.stats.jackpots),
  dig_100: atLeast('dig_100', (s) => s.clicks),
  dig_1k: atLeast('dig_1k', (s) => s.clicks),
  dig_10k: atLeast('dig_10k', (s) => s.clicks),
  own_100: atLeast('own_100', (s) => Math.max(0, ...s.owned)),
  full_crew: atLeast('full_crew', (s) => Math.min(...s.owned)),
  frenzy_777: atLeast('frenzy_777', (s) => s.stats.goldDigs),
  pick_12: atLeast('pick_12', (s) => s.pick),
};

export function achievementEarned(s: State, id: string): boolean {
  return CHECKS[id]?.(s) ?? false;
}

/** Ids of the achievements `s` has earned that are not in `unlocked` yet, in list order. */
export function newlyUnlocked(s: State, unlocked: Readonly<Record<string, number>>): string[] {
  return ACHIEVEMENTS.filter((a) => !Object.hasOwn(unlocked, a.id) && achievementEarned(s, a.id)).map((a) => a.id);
}

/** Ids that have a check (for the tests: every definition needs one). */
export const CHECKED_IDS: readonly string[] = Object.keys(CHECKS);
