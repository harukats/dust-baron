// Save/load through localStorage. Every access is guarded — private windows and
// sandboxed frames can throw, and the game must still run without a save.
import { SAVE_KEY } from './config.ts';
import { deserialize, serialize, type State } from './economy.ts';

export function loadSave(): State | null {
  try { return deserialize(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}

export function writeSave(s: State): void {
  s.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, serialize(s)); } catch { /* no storage: play on */ }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

/** The live run — module-level so it outlives scene transitions. */
export const run: { state: State | null } = { state: null };
