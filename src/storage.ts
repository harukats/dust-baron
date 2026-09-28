import { DEFAULT_SOUND_ENABLED, SAVE_KEY, SETTINGS_KEY } from './config.ts';
import { deserialize, earn, newState, offlineGain, type State, serialize, settleProduction } from './economy.ts';
import type { SessionMode } from './session.ts';

export interface SoundSettings {
  soundEnabled: boolean;
}

/** ライブ進行はシーンから独立する。副作用は呼び出し時にだけ実行する。 */
export const run: {
  state: State | null;
  settings: SoundSettings;
  mode: SessionMode;
  accountedAtMs: number;
  stormEndsAtMs: number;
  frenzyEndsAtMs: number;
  offline: number;
  now: () => number;
} = {
  state: null,
  settings: { soundEnabled: DEFAULT_SOUND_ENABLED },
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

export function initializeSoundSettings(): void {
  // 一時プレイの同一ページ内再起動ではライブ値を保持する。
  if (run.mode !== 'owned') return;
  run.settings.soundEnabled = DEFAULT_SOUND_ENABLED;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (value && typeof value === 'object' && !Array.isArray(value) && 'soundEnabled' in value) {
      if (typeof value.soundEnabled === 'boolean') run.settings.soundEnabled = value.soundEnabled;
    }
  } catch {
    // 読み取り不能・不正設定でも既定値でプレイを続ける。
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (canPlay()) run.settings.soundEnabled = enabled;
}

export function writeSoundSettings(): boolean {
  if (run.mode !== 'owned') return false;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(run.settings));
    return true;
  } catch {
    return false;
  }
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
