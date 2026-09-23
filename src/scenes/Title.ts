import Phaser from 'phaser';
import { COLOR, MUSIC, MUSIC_VOLUME, TEX, WIDTH, HEIGHT } from '../config.ts';
import { formatNum } from '../economy.ts';
import { clearSave, loadSave, run } from '../storage.ts';
import { Sfx } from '../sfx.ts';
import { addBackdrop, fitImage, label, plateButton } from '../ui.ts';

/** Title: the logo over the wasteland. CONTINUE a save, or wipe it with a confirmed NEW RUN. */
export class Title extends Phaser.Scene {
  private sfx!: Sfx;
  private wipeArmed = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.sfx = new Sfx(this.sound);
    this.wipeArmed = false;
    const saved = run.state ?? loadSave();
    const hasSave = !!saved && saved.total > 0;

    addBackdrop(this, TEX.background);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.shadow, 0.25).setOrigin(0);

    // Dust drifting across the title.
    this.add.particles(0, 0, TEX.spark, {
      x: -20, y: { min: HEIGHT * 0.3, max: HEIGHT },
      speedX: { min: 100, max: 260 }, speedY: { min: -10, max: 20 },
      lifespan: 7000, scale: { min: 0.2, max: 0.6 }, alpha: 0.5,
      tint: [COLOR.sand, COLOR.storm], frequency: 60,
    });

    const logo = fitImage(this.add.image(WIDTH / 2, HEIGHT * 0.3, TEX.logo), 520);
    this.tweens.add({ targets: logo, y: logo.y + 8, duration: 2000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });

    label(this, WIDTH / 2, HEIGHT * 0.6, 'DIG. HIRE. AUTOMATE. RULE THE WASTES.', 24, COLOR.sand, 0.5, 0.5);

    const bw = 360, bh = 64, bx = WIDTH / 2 - bw / 2, by = HEIGHT * 0.67;
    const go = plateButton(this, bx, by, bw, bh, hasSave ? 'CONTINUE' : 'START DIGGING', 34, () => this.start(false));
    let hot = false;
    this.time.addEvent({ delay: 450, loop: true, callback: () => go.redraw((hot = !hot) ? COLOR.hazard : COLOR.chrome) });

    if (hasSave) {
      label(this, WIDTH / 2, by + bh + 20, `lifetime scrap: ${formatNum(saved.total)}`, 18, COLOR.sub, 0.5, 0.5);
      const nb = plateButton(this, bx + 50, by + bh + 40, bw - 100, 44, 'NEW RUN', 20, () => {
        if (this.wipeArmed) { this.start(true); return; }
        this.wipeArmed = true;
        nb.text.setText('TAP AGAIN TO WIPE SAVE').setColor('#ff8a6a');
        nb.redraw(COLOR.danger);
        this.sfx.play('nope');
        this.time.delayedCall(3000, () => {
          this.wipeArmed = false;
          nb.text.setText('NEW RUN').setColor('#f3e1c0');
          nb.redraw(COLOR.chromeDim);
        });
      }, { fill: COLOR.rustDark, rim: COLOR.chromeDim, color: COLOR.text });
    }

    const hint = label(this, WIDTH / 2, HEIGHT - 36, 'CLICK OR PRESS SPACE', 20, COLOR.text, 0.5, 0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    this.input.keyboard?.once('keydown-SPACE', () => this.start(false));
    this.input.keyboard?.once('keydown-ENTER', () => this.start(false));
  }

  private start(fresh: boolean): void {
    if (fresh) { clearSave(); run.state = null; }
    // The first click unlocks audio; start the soundtrack once and let it run across scenes.
    if (!this.sound.get(MUSIC)) this.sound.add(MUSIC, { loop: true, volume: MUSIC_VOLUME }).play();
    this.sfx.play('start');
    this.scene.start('Game', { fresh });
  }
}
