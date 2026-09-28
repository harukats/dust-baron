import Phaser from 'phaser';
import { MUSIC, MUSIC_VOLUME } from './config.ts';
import { canPlay, run, setSoundEnabled, writeSoundSettings } from './storage.ts';

// 解除待ちはシーン終了時に取り除き、次のシーンが引き継ぐ。
const unlockWaits = new WeakMap<Phaser.Scene, () => void>();

export function applySoundSettings(scene: Phaser.Scene): void {
  scene.sound.mute = !run.settings.soundEnabled;
}

export function ensureMusic(scene: Phaser.Scene): void {
  if (!canPlay()) return;
  const manager = scene.sound;
  if (manager.locked) {
    if (unlockWaits.has(scene)) return;
    const unlocked = (): void => {
      unlockWaits.delete(scene);
      ensureMusic(scene);
    };
    unlockWaits.set(scene, unlocked);
    manager.once(Phaser.Sound.Events.UNLOCKED, unlocked);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      manager.off(Phaser.Sound.Events.UNLOCKED, unlocked);
      unlockWaits.delete(scene);
    });
    return;
  }
  if (!run.settings.soundEnabled) return;
  const music = manager.get(MUSIC) ?? manager.add(MUSIC, { loop: true, volume: MUSIC_VOLUME });
  if (!music.isPlaying && !music.isPaused) music.play();
}

export function toggleSound(scene: Phaser.Scene): void {
  if (!canPlay()) return;
  setSoundEnabled(!run.settings.soundEnabled);
  // 保存や解除コールバックより先に出力へ反映する。
  applySoundSettings(scene);
  ensureMusic(scene);
  writeSoundSettings();
}
