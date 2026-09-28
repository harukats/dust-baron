// Pure economy logic — no Phaser, no DOM — tested by economy.test.ts under Node.
import {
  CLICK_PS_FRAC,
  COST_GROWTH,
  CROWN_COST,
  GENS,
  MILESTONES,
  OFFLINE_CAP_S,
  OFFLINE_MIN_S,
  OFFLINE_RATE,
  PICK_BASE_COST,
  PICK_COST_GROWTH,
  STORM_MULT,
} from './config.ts';

export interface State {
  scrap: number; // spendable
  total: number; // lifetime earned
  clicks: number;
  owned: number[]; // per generator
  pick: number; // Forge Pick level
  won: boolean;
  playTime: number; // seconds
  lastSave: number; // epoch ms
}

export function newState(): State {
  return { scrap: 0, total: 0, clicks: 0, owned: GENS.map(() => 0), pick: 0, won: false, playTime: 0, lastSave: 0 };
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

export function perSecond(s: State, storm = false): number {
  let sum = 0;
  for (let i = 0; i < GENS.length; i++) sum += genRate(i, s.owned[i] ?? 0);
  return storm ? sum * STORM_MULT : sum;
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
    !Number.isFinite(s.total + amount)
  )
    return;
  s.scrap += amount;
  s.total += amount;
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

export function buyCrown(s: State): boolean {
  if (s.won || s.scrap < CROWN_COST) return false;
  s.scrap -= CROWN_COST;
  s.won = true;
  return true;
}

/** A generator row is revealed once the previous tier is owned or you're close to affording it. */
export function isRevealed(s: State, i: number): boolean {
  return i === 0 || (s.owned[i - 1] ?? 0) > 0 || s.total >= GENS[i].baseCost * 0.6;
}

/** Scrap earned while away for `secondsAway`. */
export function offlineGain(s: State, secondsAway: number): number {
  if (!(secondsAway >= OFFLINE_MIN_S)) return 0;
  return perSecond(s) * Math.min(secondsAway, OFFLINE_CAP_S) * OFFLINE_RATE;
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
  const amount = perSecond(s) * (elapsedS + stormS * (STORM_MULT - 1));
  const gain =
    Number.isFinite(amount) && Number.isFinite(s.scrap + amount) && Number.isFinite(s.total + amount) ? amount : 0;
  return { gain, elapsedS, accountedAtMs: now };
}

export function hasProgress(s: State): boolean {
  return s.scrap > 0 || s.total > 0 || s.pick > 0 || s.won || s.owned.some((n) => n > 0);
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
    const o = parsed as Partial<State>;
    if (!Object.keys(newState()).some((key) => Object.hasOwn(o, key))) return null;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    const integer = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
    const s = newState();
    s.scrap = num(o.scrap);
    s.total = Math.max(num(o.total), s.scrap);
    s.clicks = integer(o.clicks);
    s.pick = integer(o.pick);
    s.won = o.won === true;
    s.playTime = num(o.playTime);
    s.lastSave = num(o.lastSave);
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
