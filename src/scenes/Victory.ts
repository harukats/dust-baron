import Phaser from 'phaser';
import { COLOR, HEIGHT, TEX, WIDTH } from '../config.ts';
import { formatNum, formatTime } from '../economy.ts';
import { Sfx } from '../sfx.ts';
import { addBackdrop, drawPlate, fitImage, label } from '../ui.ts';

export interface VictoryData {
  time: number;
  total: number;
  clicks: number;
}

/** Victory: you bought the Dust Crown. Tap to keep digging — the run continues. */
export class Victory extends Phaser.Scene {
  constructor() {
    super('Victory');
  }

  create(data: VictoryData): void {
    addBackdrop(this, TEX.background);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.shadow, 0.45).setOrigin(0);
    fitImage(this.add.image(WIDTH / 2, HEIGHT * 0.2, TEX.logo), 360);
    label(this, WIDTH / 2, HEIGHT * 0.42, 'THE WASTES ARE YOURS', 44, COLOR.hazard, 0.5, 0.5);
    label(this, WIDTH / 2, HEIGHT * 0.42 + 46, 'You claimed the Dust Crown.', 22, COLOR.sand, 0.5, 0.5);

    const pw = 480,
      ph = 150,
      px = WIDTH / 2 - pw / 2,
      py = HEIGHT * 0.56;
    drawPlate(this.add.graphics(), px, py, pw, ph);
    const rows: [string, string][] = [
      ['TIME TO THE CROWN', formatTime(data.time ?? 0)],
      ['SCRAP DUG (LIFETIME)', formatNum(data.total ?? 0)],
      ['DIGS BY HAND', formatNum(data.clicks ?? 0)],
    ];
    rows.forEach(([k, v], i) => {
      label(this, px + 24, py + 22 + i * 40, k, 20, COLOR.sub);
      label(this, px + pw - 24, py + 22 + i * 40, v, 20, COLOR.text, 1, 0);
    });

    const fireworks = this.add.particles(0, 0, TEX.spark, {
      speed: { min: 80, max: 320 },
      lifespan: 1300,
      gravityY: 140,
      scale: { start: 0.8, end: 0 },
      tint: [COLOR.hazard, COLOR.chrome, COLOR.rust],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.time.addEvent({
      delay: 400,
      repeat: 7,
      callback: () =>
        fireworks.explode(
          60,
          Phaser.Math.Between(WIDTH * 0.2, WIDTH * 0.8),
          Phaser.Math.Between(HEIGHT * 0.15, HEIGHT * 0.45),
        ),
    });
    new Sfx(this.sound).play('fanfare');

    const hint = label(this, WIDTH / 2, HEIGHT - 50, 'TAP TO KEEP DIGGING', 24, COLOR.text, 0.5, 0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    // A short grace period so the click that bought the crown doesn't skip this screen.
    this.time.delayedCall(800, () => {
      this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start('Game'));
      this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('Game'));
    });
  }
}
