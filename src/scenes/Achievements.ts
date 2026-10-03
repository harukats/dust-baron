import Phaser from 'phaser';
import { ACHIEVEMENTS, COLOR, HEIGHT, TEX, WIDTH } from '../config.ts';
import { run } from '../storage.ts';
import { addBackdrop, addSoundControl, addTemporaryNotice, drawPlate, label, plateButton } from '../ui.ts';

const COLS = 3;
const ROWS = Math.ceil(ACHIEVEMENTS.length / COLS);

/** Achievements: every one with its goal; hidden ones stay secret until unlocked. Back to the title. */
export class Achievements extends Phaser.Scene {
  constructor() {
    super('Achievements');
  }

  create(): void {
    addBackdrop(this, TEX.background);
    addSoundControl(this);
    addTemporaryNotice(this);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.shadow, 0.6).setOrigin(0);

    const done = ACHIEVEMENTS.filter((a) => run.achievements[a.id]).length;
    label(this, WIDTH / 2, 36, 'ACHIEVEMENTS', 36, COLOR.hazard, 0.5, 0.5);
    label(this, WIDTH / 2, 80, `${done} / ${ACHIEVEMENTS.length} UNLOCKED`, 18, COLOR.sub, 0.5, 0.5);

    const cw = 392,
      ch = 62,
      gx = 12,
      gy = 8,
      x0 = (WIDTH - (COLS * cw + (COLS - 1) * gx)) / 2,
      y0 = 112;
    ACHIEVEMENTS.forEach((a, i) => {
      // Column by column, so each category stays together.
      const col = Math.floor(i / ROWS),
        row = i % ROWS;
      const x = x0 + col * (cw + gx),
        y = y0 + row * (ch + gy);
      const got = !!run.achievements[a.id];
      const secret = a.hidden && !got;
      drawPlate(
        this.add.graphics(),
        x,
        y,
        cw,
        ch,
        got ? COLOR.gold : COLOR.rustDark,
        got ? COLOR.goldRim : COLOR.chromeDim,
        0.95,
        2,
      );
      label(this, x + 14, y + 8, secret ? '??????' : a.name, 18, got ? COLOR.goldBright : COLOR.text, 0, 0, cw - 110);
      label(
        this,
        x + 14,
        y + 34,
        secret ? 'Hidden achievement' : a.desc,
        13,
        got ? COLOR.text : COLOR.sub,
        0,
        0,
        cw - 28,
      );
      label(this, x + cw - 12, y + 10, got ? 'DONE' : 'LOCKED', 13, got ? COLOR.hazard : COLOR.dim, 1, 0);
    });

    const back = (): void => {
      this.scene.start('Title');
    };
    plateButton(this, WIDTH - 240, HEIGHT - 44, 200, 34, 'BACK', 18, back, {
      fill: COLOR.rustMid,
      rim: COLOR.chromeDim,
      color: COLOR.text,
    });
    this.input.keyboard?.once('keydown-ESC', back);
  }
}
