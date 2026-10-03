// Where the game talks to the platform it runs on. The web build has nobody to tell; the desktop
// build can swap in an implementation that reports to Steam. Nothing else should care.
export interface Platform {
  /** An achievement was unlocked for the first time on this device. Must be safe to call again with the same id. */
  unlockAchievement(id: string): void;
}

export const platform: Platform = {
  unlockAchievement() {},
};
