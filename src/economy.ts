// Pure economy logic — no Phaser, no DOM — tested by economy.test.ts under Node.
import {
  BASE_TIERS,
  CACHE_JACKPOT_CLICKS,
  CACHE_JACKPOT_S,
  CLICK_PS_FRAC,
  COST_GROWTH,
  CROWNS,
  FRENZY_MULT,
  FRENZY_S,
  GENS,
  GOLD_CACHE_CHANCE,
  GOLD_FRENZY_MULT,
  MILESTONES,
  OFFLINE_CAP_S,
  OFFLINE_MIN_S,
  OFFLINE_RATE,
  PICK_BASE_COST,
  PICK_COST_GROWTH,
  RELIC_FRENZY_S,
  RELIC_GOLD_PER,
  RELIC_HEAD_START,
  RELIC_OFFLINE_S,
  RELIC_STORM_PER,
  RELICS,
  SHARD_BONUS,
  SHARD_DIVISOR,
  STORM_MULT,
} from './config.ts';

export interface State {
  scrap: number; // spendable
  total: number; // lifetime earned
  clicks: number;
  owned: number[]; // per generator
  pick: number; // Forge Pick level
  crowns: number; // crowns bought, in order (see CROWNS)
  playTime: number; // seconds, all reigns
  lastSave: number; // epoch ms
  // Reign (prestige): scrap, crews, pick, crowns and the two reign counters reset on ascend; the rest is kept.
  reigns: number; // times ascended
  shards: number; // unspent
  shardsEarned: number; // ever earned; each adds SHARD_BONUS to all production
  relics: number[]; // level of each of RELICS
  reignTime: number; // seconds since this reign began
  reignTotal: number; // scrap earned this reign
}

export function newState(): State {
  return {
    scrap: 0,
    total: 0,
    clicks: 0,
    owned: GENS.map(() => 0),
    pick: 0,
    crowns: 0,
    playTime: 0,
    lastSave: 0,
    reigns: 0,
    shards: 0,
    shardsEarned: 0,
    relics: RELICS.map(() => 0),
    reignTime: 0,
    reignTotal: 0,
  };
}

/** Cost of buying `qty` more of generator `i` when `owned` are already owned. */
export function genCost(i: number, owned: number, qty = 1): number {
  if (!GENS[i] || !Number.isSafeInteger(owned) || owned < 0 || !Number.isSafeInteger(qty) || qty < 0) return Infinity;
  if (qty === 0) return 0;
  const g = COST_GROWTH;
  if (qty === 1) return Math.ceil(GENS[i].baseCost * g ** owned);
  return Math.ceil((GENS[i].baseCost * g ** owned * (g ** qty - 1)) / (g - 1));
}

/** How many of generator `i` `scrap` can buy right now (0 if none). */
export function maxAffordable(i: number, owned: number, scrap: number): number {
  if (!GENS[i] || !Number.isSafeInteger(owned) || owned < 0 || !Number.isFinite(scrap) || scrap < 0) return 0;
  const g = COST_GROWTH;
  const first = GENS[i].baseCost * g ** owned;
  let k = Math.floor(Math.log((scrap * (g - 1)) / first + 1) / Math.log(g));
  if (!Number.isFinite(k) || k < 0) k = 0;
  while (k > 0 && genCost(i, owned, k) > scrap) k--;
  while (genCost(i, owned, k + 1) <= scrap) k++;
  return k;
}

/** Output multiplier from milestones reached (×2 each). */
export function milestoneMult(owned: number): number {
  let m = 1;
  for (const t of MILESTONES) if (owned >= t) m *= 2;
  return m;
}

/** The next milestone above `owned`, or null. */
export function nextMilestone(owned: number): number | null {
  for (const t of MILESTONES) if (owned < t) return t;
  return null;
}

export function genRate(i: number, owned: number): number {
  return GENS[i].rate * owned * milestoneMult(owned);
}

/** Permanent production multiplier from the crowns bought so far. */
export function crownMult(crowns: number): number {
  let m = 1;
  for (let i = 0; i < Math.min(crowns, CROWNS.length); i++) m *= CROWNS[i].mult;
  return m;
}

/** Level of the relic with this id (0 if unknown or not bought). */
export function relicLevel(s: State, id: string): number {
  const i = RELICS.findIndex((r) => r.id === id);
  return i < 0 ? 0 : (s.relics[i] ?? 0);
}

/** Production multiplier from the shards ever earned. */
export function shardMult(s: State): number {
  return 1 + SHARD_BONUS * s.shardsEarned;
}

/** Everything that multiplies all production on top of the generators' own rates: crowns and shards. */
export function productionMult(s: State): number {
  return crownMult(s.crowns) * shardMult(s);
}

export function stormMult(s: State): number {
  return STORM_MULT + RELIC_STORM_PER * relicLevel(s, 'storm_caller');
}
export function goldChance(s: State): number {
  return GOLD_CACHE_CHANCE + RELIC_GOLD_PER * relicLevel(s, 'gold_rush');
}
export function frenzySeconds(s: State): number {
  return FRENZY_S + RELIC_FRENZY_S * relicLevel(s, 'frenzy_lord');
}
export function offlineCapS(s: State): number {
  return OFFLINE_CAP_S + RELIC_OFFLINE_S * relicLevel(s, 'long_shift');
}

/** What generator `i` really produces per second for this run (crown and shard multipliers included). */
export function genOutput(s: State, i: number): number {
  return genRate(i, s.owned[i] ?? 0) * productionMult(s);
}

export function perSecond(s: State, storm = false): number {
  let sum = 0;
  for (let i = 0; i < GENS.length; i++) sum += genRate(i, s.owned[i] ?? 0);
  sum *= productionMult(s);
  return storm ? sum * stormMult(s) : sum;
}

export function clickPower(s: State, ps: number): number {
  return 2 ** s.pick + ps * CLICK_PS_FRAC * s.pick;
}

export function pickCost(level: number): number {
  return Math.ceil(PICK_BASE_COST * PICK_COST_GROWTH ** level);
}

export function earn(s: State, amount: number): void {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isFinite(s.scrap + amount) ||
    !Number.isFinite(s.total + amount) ||
    !Number.isFinite(s.reignTotal + amount)
  )
    return;
  s.scrap += amount;
  s.total += amount;
  s.reignTotal += amount;
}

/** Buy `qty` of generator i (qty -1 = as many as affordable). Returns the number bought. */
export function buyGen(s: State, i: number, qty: number): number {
  if (!GENS[i] || !Number.isSafeInteger(qty) || (qty !== -1 && qty <= 0)) return 0;
  const owned = s.owned[i] ?? 0;
  const n = qty < 0 ? maxAffordable(i, owned, s.scrap) : qty;
  if (n <= 0) return 0;
  const cost = genCost(i, owned, n);
  if (
    !Number.isFinite(cost) ||
    cost > s.scrap ||
    !Number.isSafeInteger(owned + n) ||
    !Number.isFinite(genRate(i, owned + n))
  )
    return 0;
  s.scrap -= cost;
  s.owned[i] = owned + n;
  return n;
}

export function buyPick(s: State): boolean {
  const c = pickCost(s.pick);
  if (!Number.isFinite(c) || c > s.scrap || !Number.isFinite(2 ** (s.pick + 1))) return false;
  s.scrap -= c;
  s.pick++;
  return true;
}

/** True once the last crown is bought. */
export function isWon(s: State): boolean {
  return s.crowns >= CROWNS.length;
}

/** The next crown to buy, or null when the chain is complete. */
export function nextCrown(s: State): (typeof CROWNS)[number] | null {
  return CROWNS[s.crowns] ?? null;
}

/** Buy the next crown in the chain. */
export function buyCrown(s: State): boolean {
  const c = nextCrown(s);
  if (!c || s.scrap < c.cost) return false;
  s.scrap -= c.cost;
  s.crowns++;
  return true;
}

/** Shards a reign earns from the scrap it made: floor(cbrt(earned / SHARD_DIVISOR)). */
export function shardsForReign(reignTotal: number): number {
  if (!Number.isFinite(reignTotal) || reignTotal <= 0) return 0;
  return Math.floor(Math.cbrt(reignTotal / SHARD_DIVISOR));
}

/** You can ascend once you own a crown and the reign has earned at least one shard. */
export function canAscend(s: State): boolean {
  return s.crowns >= 1 && shardsForReign(s.reignTotal) >= 1;
}

/** Start a new reign: bank the shards, reset the run, apply the starting relics. Returns the shards gained (0 if not allowed). */
export function ascend(s: State): number {
  if (!canAscend(s)) return 0;
  const gain = shardsForReign(s.reignTotal);
  s.shards += gain;
  s.shardsEarned += gain;
  s.reigns++;
  s.scrap = 0;
  s.owned = GENS.map(() => 0);
  s.owned[0] = RELIC_HEAD_START * relicLevel(s, 'head_start');
  s.pick = relicLevel(s, 'forge_memory');
  s.crowns = 0;
  s.reignTotal = 0;
  s.reignTime = 0;
  return gain;
}

/** Shard cost of the next level of relic `i`, or null when it is maxed (or unknown). */
export function relicCost(s: State, i: number): number | null {
  return RELICS[i]?.costs[s.relics[i] ?? 0] ?? null;
}

export function buyRelic(s: State, i: number): boolean {
  const cost = relicCost(s, i);
  if (cost === null || s.shards < cost) return false;
  s.shards -= cost;
  s.relics[i] = (s.relics[i] ?? 0) + 1;
  return true;
}

/** Tiers past BASE_TIERS are unlocked one per crown. */
export function isUnlocked(s: State, i: number): boolean {
  return i < BASE_TIERS || s.crowns >= i - BASE_TIERS + 1;
}

/** A generator row is revealed once it is unlocked and the previous tier is owned or you're close to affording it. */
export function isRevealed(s: State, i: number): boolean {
  if (!isUnlocked(s, i)) return false;
  return i === 0 || (s.owned[i - 1] ?? 0) > 0 || s.total >= GENS[i].baseCost * 0.6;
}

/** Generator indices shown in the shop: the newest `rows` unlocked tiers. Older ones keep producing. */
export function shopWindow(s: State, rows = BASE_TIERS): number[] {
  let unlocked = 0;
  while (unlocked < GENS.length && isUnlocked(s, unlocked)) unlocked++;
  const start = Math.max(0, unlocked - rows);
  return Array.from({ length: unlocked - start }, (_, k) => start + k);
}

/** Scrap earned while away for `secondsAway`. */
export function offlineGain(s: State, secondsAway: number): number {
  if (!(secondsAway >= OFFLINE_MIN_S)) return 0;
  return perSecond(s) * Math.min(secondsAway, offlineCapS(s)) * OFFLINE_RATE;
}

/** 収入と次のカーソルを返す。入力Stateと外部時刻を変更しない。 */
export function settleProduction(
  s: State,
  accountedAtMs: number,
  now: number,
  stormEndsAtMs: number,
): {
  gain: number;
  elapsedS: number;
  accountedAtMs: number;
} {
  if (!Number.isFinite(now) || now <= accountedAtMs) return { gain: 0, elapsedS: 0, accountedAtMs };
  const elapsedS = (now - accountedAtMs) / 1000;
  const stormS = Math.max(0, Math.min(now, stormEndsAtMs) - accountedAtMs) / 1000;
  const amount = perSecond(s) * (elapsedS + stormS * (stormMult(s) - 1));
  const gain =
    Number.isFinite(amount) && Number.isFinite(s.scrap + amount) && Number.isFinite(s.total + amount) ? amount : 0;
  return { gain, elapsedS, accountedAtMs: now };
}

export function hasProgress(s: State): boolean {
  return (
    s.scrap > 0 ||
    s.total > 0 ||
    s.pick > 0 ||
    s.crowns > 0 ||
    s.reigns > 0 ||
    s.shardsEarned > 0 ||
    s.owned.some((n) => n > 0)
  );
}

export function serialize(s: State): string {
  return JSON.stringify(s);
}

/** Parse a save, tolerating junk. Returns null when unusable. */
export function deserialize(json: string | null): State | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = parsed as Partial<State> & { won?: unknown };
    // `won` is the pre-crown-chain spelling of `crowns`.
    if (![...Object.keys(newState()), 'won'].some((key) => Object.hasOwn(o, key))) return null;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    const integer = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
    const s = newState();
    s.scrap = num(o.scrap);
    s.total = Math.max(num(o.total), s.scrap);
    s.clicks = integer(o.clicks);
    s.pick = integer(o.pick);
    // Saves from before the crown chain only have a boolean `won`.
    s.crowns = Math.min(integer(o.crowns) || (o.won === true ? 1 : 0), CROWNS.length);
    s.playTime = num(o.playTime);
    s.lastSave = num(o.lastSave);
    s.reigns = integer(o.reigns);
    s.shards = integer(o.shards);
    s.shardsEarned = Math.max(integer(o.shardsEarned), s.shards);
    // Saves from before reigns have no reign counters: the whole save is the first reign.
    s.reignTotal = Object.hasOwn(o, 'reignTotal') ? Math.min(num(o.reignTotal), s.total) : s.total;
    s.reignTime = Object.hasOwn(o, 'reignTime') ? num(o.reignTime) : s.playTime;
    if (Array.isArray(o.relics))
      RELICS.forEach((r, i) => {
        s.relics[i] = Math.min(integer(o.relics?.[i]), r.costs.length);
      });
    if (Array.isArray(o.owned))
      for (let i = 0; i < GENS.length; i++) {
        const owned = integer(o.owned[i]);
        s.owned[i] = Number.isFinite(genRate(i, owned)) ? owned : 0;
      }
    if (!Number.isFinite(clickPower(s, perSecond(s)))) s.pick = 0;
    return s;
  } catch {
    return null;
  }
}

const UNITS = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
/** 1234 → "1.23K", 5.5 → "5.5". */
export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return 'INF';
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  let u = -1;
  while (n >= 1000 && u < UNITS.length - 1) {
    n /= 1000;
    u++;
  }
  const s = n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n).toString();
  return s + UNITS[u];
}

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = Math.floor(sec % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export type CacheKind = 'chrome' | 'gold';
export type DigMultiplier = 1 | 7 | 777;
export type CacheReward = { kind: 'none' } | { kind: 'credits'; amount: number } | { kind: 'frenzy'; mult: 7 | 777 };

export function selectCacheKind(roll: number, goldChance = GOLD_CACHE_CHANCE): CacheKind {
  return Number.isFinite(roll) && roll >= 0 && roll < goldChance ? 'gold' : 'chrome';
}

export function cacheReward(s: State, kind: CacheKind, roll: number): CacheReward {
  if (kind === 'gold') return { kind: 'frenzy', mult: GOLD_FRENZY_MULT };
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return { kind: 'none' };
  if (roll >= 0.5) return { kind: 'frenzy', mult: FRENZY_MULT };
  const base = perSecond(s);
  return { kind: 'credits', amount: Math.max(base * CACHE_JACKPOT_S, clickPower(s, base) * CACHE_JACKPOT_CLICKS) };
}

export function activeDigMultiplier(mult: number, endsAtMs: number, nowMs: number): DigMultiplier {
  return Number.isFinite(nowMs) && Number.isFinite(endsAtMs) && nowMs < endsAtMs && (mult === 7 || mult === 777)
    ? mult
    : 1;
}

export function applyDigFrenzy(
  mult: number,
  endsAtMs: number,
  incoming: number,
  nowMs: number,
  durationS = FRENZY_S,
): { mult: DigMultiplier; endsAtMs: number } {
  const validMult = mult === 7 || mult === 777 ? mult : 1;
  if (!Number.isFinite(nowMs) || !Number.isFinite(nowMs + durationS * 1000))
    return { mult: validMult, endsAtMs: Number.isFinite(endsAtMs) ? endsAtMs : 0 };
  const active = activeDigMultiplier(mult, endsAtMs, nowMs);
  if (incoming !== 7 && incoming !== 777) return { mult: active, endsAtMs: active === 1 ? 0 : endsAtMs };
  if (active > incoming) return { mult: active, endsAtMs };
  return { mult: incoming, endsAtMs: nowMs + durationS * 1000 };
}

export function digGain(s: State, mult: number, endsAtMs: number, nowMs: number): number {
  return clickPower(s, perSecond(s)) * activeDigMultiplier(mult, endsAtMs, nowMs);
}
