import Phaser from 'phaser';
import { MUSIC, MUSIC_VOLUME } from './config.ts';
import { applySfxSettings } from './sfx.ts';
import { canPlay, run, setBgmEnabled, setSfxEnabled, setSoundEnabled, writeSoundSettings } from './storage.ts';

type MusicSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

// 解除待ちはシーン終了時に取り除き、次のシーンが引き継ぐ。
const unlockWaits = new WeakMap<Phaser.Scene, () => void>();

export function applySoundSettings(scene: Phaser.Scene): void {
  scene.sound.mute = !run.settings.bgmEnabled && !run.settings.sfxEnabled;
  (scene.sound.get(MUSIC) as MusicSound | null)?.setMute(!run.settings.bgmEnabled);
  applySfxSettings(scene.sound);
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
  if (!run.settings.bgmEnabled) return;
  const music = (manager.get(MUSIC) ?? manager.add(MUSIC, { loop: true, volume: MUSIC_VOLUME })) as MusicSound;
  music.setMute(false);
  if (!music.isPlaying && !music.isPaused) music.play();
}

export function toggleSound(scene: Phaser.Scene): void {
  if (!canPlay()) return;
  setSoundEnabled(!(run.settings.bgmEnabled && run.settings.sfxEnabled));
  // 保存や解除コールバックより先に出力へ反映する。
  applySoundSettings(scene);
  ensureMusic(scene);
  writeSoundSettings();
}

export function toggleBgm(scene: Phaser.Scene): void {
  if (!canPlay()) return;
  setBgmEnabled(!run.settings.bgmEnabled);
  applySoundSettings(scene);
  ensureMusic(scene);
  writeSoundSettings();
}

export function toggleSfx(scene: Phaser.Scene): void {
  if (!canPlay()) return;
  setSfxEnabled(!run.settings.sfxEnabled);
  applySoundSettings(scene);
  writeSoundSettings();
}
