export interface FullscreenState {
  available: boolean;
  active: boolean;
}

export function fullscreenState(): FullscreenState {
  const target = document.getElementById('game-container');
  return {
    available: !!(
      document.fullscreenEnabled &&
      typeof target?.requestFullscreen === 'function' &&
      typeof document.exitFullscreen === 'function'
    ),
    active: !!target && document.fullscreenElement === target,
  };
}

/** ユーザーのpointerup内で同期的に要求し、非同期の拒否も呼出元へ返す。 */
export function toggleFullscreen(): Promise<void> {
  try {
    if (!fullscreenState().available) return Promise.reject(new Error('Fullscreen unavailable'));
    if (fullscreenState().active) return document.exitFullscreen();
    const target = document.getElementById('game-container');
    if (!target) return Promise.reject(new Error('Game container missing'));
    return target.requestFullscreen();
  } catch (error) {
    return Promise.reject(error);
  }
}
