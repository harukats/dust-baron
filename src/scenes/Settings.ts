import Phaser from 'phaser';
import { applySoundSettings, ensureMusic, toggleBgm, toggleSfx } from '../audio.ts';
import { COLOR, HEIGHT, SETTINGS_UI, WIDTH } from '../config.ts';
import { fullscreenState, toggleFullscreen } from '../fullscreen.ts';
import { finishSettings, releaseSettings, type SettingsSession } from '../settings.ts';
import { run } from '../storage.ts';
import { drawPlate, label, plateButton } from '../ui.ts';

export class Settings extends Phaser.Scene {
  private session!: SettingsSession;
  private generation = 0;

  constructor() {
    super('Settings');
  }

  create(session: SettingsSession): void {
    this.session = session;
    const generation = ++this.generation;
    let pending = false;
    this.scene.bringToTop();
    applySoundSettings(this);
    ensureMusic(this);
    const shield = this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.shadow, 0.8).setOrigin(0);
    shield.setInteractive();
    const { x, y, width, height, buttonX, buttonWidth, buttonHeight, firstButtonY, buttonGap } = SETTINGS_UI;
    drawPlate(this.add.graphics(), x, y, width, height, COLOR.panel, COLOR.chrome);
    label(this, WIDTH / 2, y + 32, SETTINGS_UI.title, 34, COLOR.hazard, 0.5, 0.5);
    const makeButton = (index: number, text: string, action: () => void) =>
      plateButton(this, buttonX, firstButtonY + index * buttonGap, buttonWidth, buttonHeight, text, 22, action);
    const bgmText = () => `BGM: ${run.settings.bgmEnabled ? 'ON' : 'OFF'}`;
    const sfxText = () => `SFX: ${run.settings.sfxEnabled ? 'ON' : 'OFF'}`;
    const bgm = makeButton(0, bgmText(), () => {
      toggleBgm(this);
      bgm.text.setText(bgmText());
    });
    const sfx = makeButton(1, sfxText(), () => {
      toggleSfx(this);
      sfx.text.setText(sfxText());
    });
    const full = makeButton(2, '', () => {});
    const message = label(this, WIDTH / 2, firstButtonY + 3 * buttonGap - 14, '', 14, COLOR.sub, 0.5, 0.5);
    const refreshFullscreen = (): void => {
      const state = fullscreenState();
      full.text.setText(!state.available ? SETTINGS_UI.unavailable : `FULLSCREEN: ${state.active ? 'ON' : 'OFF'}`);
      if (full.zone.input) full.zone.input.enabled = state.available && !pending;
    };
    full.zone.off(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN);
    full.zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (pending || !fullscreenState().available) return;
      pending = true;
      message.setText('');
      const request = toggleFullscreen();
      refreshFullscreen();
      void request
        .catch(() => {
          if (this.generation === generation && this.sys.isActive()) message.setText(SETTINGS_UI.failed);
        })
        .finally(() => {
          if (this.generation !== generation || !this.sys.isActive()) return;
          pending = false;
          refreshFullscreen();
        });
    });
    refreshFullscreen();
    makeButton(3, SETTINGS_UI.returnTitle, () => finishSettings(this.session, true));
    makeButton(4, SETTINGS_UI.close, () => finishSettings(this.session));
    const onEscape = (event: KeyboardEvent): void => {
      if (!event.repeat) finishSettings(this.session);
    };
    this.input.keyboard?.on('keydown-ESC', onEscape);
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, refreshFullscreen);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, refreshFullscreen);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ++this.generation;
      this.input.keyboard?.off('keydown-ESC', onEscape);
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, refreshFullscreen);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, refreshFullscreen);
      releaseSettings(session);
    });
  }
}
