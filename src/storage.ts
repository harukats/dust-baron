import { newlyUnlocked } from './achievements.ts';
import { ACHIEVEMENTS, ACHIEVEMENTS_KEY, DEFAULT_SOUND_ENABLED, SAVE_KEY, SETTINGS_KEY } from './config.ts';
import {
  type DigMultiplier,
  deserialize,
  earn,
  newState,
  offlineGain,
  type State,
  serialize,
  settleProduction,
} from './economy.ts';
import { platform } from './platform.ts';
import type { SessionMode } from './session.ts';

export interface SoundSettings {
  soundEnabled: boolean;
}

/** ライブ進行はシーンから独立する。副作用は呼び出し時にだけ実行する。 */
export const run: {
  state: State | null;
  settings: SoundSettings;
  achievements: Record<string, number>; // id -> unlocked at (epoch ms)
  mode: SessionMode;
  accountedAtMs: number;
  stormEndsAtMs: number;
  frenzyEndsAtMs: number;
  frenzyMult: DigMultiplier;
  offline: number;
  now: () => number;
} = {
  state: null,
  settings: { soundEnabled: DEFAULT_SOUND_ENABLED },
  achievements: {},
  mode: 'acquiring',
  accountedAtMs: 0,
  stormEndsAtMs: 0,
  frenzyEndsAtMs: 0,
  frenzyMult: 1,
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
/** Achievements live under their own key, so NEW RUN (which clears the save) never takes them away. */
export function initializeAchievements(): void {
  // 一時プレイの同一ページ内再起動ではライブ値を保持する。
  if (run.mode !== 'owned') return;
  run.achievements = {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const a of ACHIEVEMENTS) {
      const at = (value as Record<string, unknown>)[a.id];
      if (typeof at === 'number' && Number.isFinite(at) && at > 0) run.achievements[a.id] = at;
    }
  } catch {
    // 読み取り不能でも実績なしでプレイを続ける。
  }
}

export function writeAchievements(): boolean {
  if (run.mode !== 'owned') return false;
  try {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(run.achievements));
    return true;
  } catch {
    return false;
  }
}

/** Unlock whatever the live run has earned: record it, save it, tell the platform. Returns the new ids. */
export function grantAchievements(now = Date.now()): string[] {
  if (!run.state || !canPlay()) return [];
  const ids = newlyUnlocked(run.state, run.achievements);
  if (ids.length === 0) return ids;
  for (const id of ids) run.achievements[id] = now;
  writeAchievements();
  for (const id of ids) platform.unlockAchievement(id);
  return ids;
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
  const nextReign = run.state.reignTime + result.elapsedS;
  if (Number.isFinite(nextReign)) run.state.reignTime = nextReign;
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
  run.frenzyMult = 1;
  const gain = saved && saved.lastSave > 0 ? offlineGain(saved, (now - saved.lastSave) / 1000) : 0;
  earn(run.state, gain);
  // Time away counts as play time (the full wall-clock gap, not just the part the offline cap pays for),
  // otherwise closing the game would freeze the reign clock that the speed achievements read.
  if (saved && saved.lastSave > 0) {
    const awayS = (now - saved.lastSave) / 1000;
    if (Number.isFinite(awayS) && awayS > 0) {
      const nextPlayTime = run.state.playTime + awayS;
      if (Number.isFinite(nextPlayTime)) run.state.playTime = nextPlayTime;
      const nextReignTime = run.state.reignTime + awayS;
      if (Number.isFinite(nextReignTime)) run.state.reignTime = nextReignTime;
    }
  }
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
  run.frenzyMult = 1;
  run.offline = 0;
  if (run.mode === 'owned') writeSave(run.state);
}
