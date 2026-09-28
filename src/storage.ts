import { SAVE_KEY } from './config.ts';
import { deserialize, earn, newState, offlineGain, type State, serialize, settleProduction } from './economy.ts';
import type { SessionMode } from './session.ts';

/** ライブ進行はシーンから独立する。副作用は呼び出し時にだけ実行する。 */
export const run: {
  state: State | null;
  mode: SessionMode;
  accountedAtMs: number;
  stormEndsAtMs: number;
  frenzyEndsAtMs: number;
  offline: number;
  now: () => number;
} = {
  state: null,
  mode: 'acquiring',
  accountedAtMs: 0,
  stormEndsAtMs: 0,
  frenzyEndsAtMs: 0,
  offline: 0,
  now: () => Date.now(),
};

export function canPlay(): boolean {
  return run.mode === 'owned' || run.mode === 'ephemeral';
}
export function loadSave(): State | null {
  if (run.mode !== 'owned') return null;
  try {
    return deserialize(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}
export function settleRun(now = run.now()): void {
  if (!run.state || !canPlay()) return;
  const result = settleProduction(run.state, run.accountedAtMs, now, run.stormEndsAtMs);
  earn(run.state, result.gain);
  const nextTime = run.state.playTime + result.elapsedS;
  if (Number.isFinite(nextTime)) run.state.playTime = nextTime;
  run.accountedAtMs = result.accountedAtMs;
}
export function writeSave(s: State, now = Date.now(), accountAt = run.now()): boolean {
  if (run.mode !== 'owned') return false;
  if (s === run.state) settleRun(accountAt);
  try {
    localStorage.setItem(SAVE_KEY, serialize({ ...s, lastSave: now }));
    s.lastSave = now;
    return true;
  } catch {
    return false;
  }
}
export function clearSave(): boolean {
  if (run.mode !== 'owned') return false;
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
export function initializeRun(now = Date.now(), liveAt = now): number {
  if (!canPlay() || run.state) return 0;
  const saved = loadSave();
  run.state = saved ?? newState();
  run.accountedAtMs = liveAt;
  run.stormEndsAtMs = 0;
  run.frenzyEndsAtMs = 0;
  const gain = saved && saved.lastSave > 0 ? offlineGain(saved, (now - saved.lastSave) / 1000) : 0;
  earn(run.state, gain);
  run.offline = gain;
  if (run.mode === 'owned') writeSave(run.state, now, liveAt);
  return gain;
}
export function resetRun(now = run.now()): void {
  if (!canPlay()) return;
  clearSave();
  run.state = newState();
  run.accountedAtMs = now;
  run.stormEndsAtMs = 0;
  run.frenzyEndsAtMs = 0;
  run.offline = 0;
  if (run.mode === 'owned') writeSave(run.state);
}
