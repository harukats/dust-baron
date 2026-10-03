import Phaser from 'phaser';
import { applySoundSettings, ensureMusic } from '../audio.ts';
import { COLOR, CROWNS, HEIGHT, TEX, WIDTH } from '../config.ts';
import { formatNum, formatTime } from '../economy.ts';
import { Sfx } from '../sfx.ts';
import { canPlay, run, settleRun, writeSave } from '../storage.ts';
import { addBackdrop, addSoundControl, addTemporaryNotice, drawPlate, fitImage, label } from '../ui.ts';

export interface VictoryData {
  time: number;
  total: number;
  clicks: number;
  /** Index into CROWNS of the crown just bought. */
  stage?: number;
  /** The last crown: the chain is complete. */
  final?: boolean;
  /** Name of the generator tier this crown unlocked, if any. */
  unlocked?: string;
}

/** Victory: you bought the first or the last crown. Tap to keep digging — the run continues. */
export class Victory extends Phaser.Scene {
  constructor() {
    super('Victory');
  }

  create(data: VictoryData): void {
    if (!canPlay()) return;
    applySoundSettings(this);
    ensureMusic(this);
    settleRun();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      settleRun();
      if (run.state) writeSave(run.state);
    });
    addBackdrop(this, TEX.background);
    addSoundControl(this);
    addTemporaryNotice(this);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.shadow, 0.45).setOrigin(0);
    fitImage(this.add.image(WIDTH / 2, HEIGHT * 0.2, TEX.logo), 360);
    const crown = CROWNS[data.stage ?? 0] ?? CROWNS[0];
    const final = data.final === true;
    label(
      this,
      WIDTH / 2,
      HEIGHT * 0.42,
      final ? 'THE WASTES ARE ETERNAL' : 'THE WASTES ARE YOURS',
      44,
      COLOR.hazard,
      0.5,
      0.5,
    );
    label(this, WIDTH / 2, HEIGHT * 0.42 + 46, `You claimed the ${crown.name}.`, 22, COLOR.sand, 0.5, 0.5);
    if (data.unlocked)
      label(
        this,
        WIDTH / 2,
        HEIGHT * 0.42 + 76,
        `Production x${crown.mult}. ${data.unlocked} unlocked - your oldest crews keep working.`,
        18,
        COLOR.sub,
        0.5,
        0.5,
      );

    const pw = 480,
      ph = 150,
      px = WIDTH / 2 - pw / 2,
      py = HEIGHT * 0.56;
    drawPlate(this.add.graphics(), px, py, pw, ph);
    const rows: [string, string][] = [
      [`TIME TO THE ${crown.name.toUpperCase()}`, formatTime(data.time ?? 0)],
      ['CREDITS EARNED (LIFETIME)', formatNum(data.total ?? 0)],
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

    const hint = label(
      this,
      WIDTH / 2,
      HEIGHT - (run.mode === 'ephemeral' ? 86 : 50),
      'TAP TO KEEP DIGGING',
      24,
      COLOR.text,
      0.5,
      0.5,
    );
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    // A short grace period so the click that bought the crown doesn't skip this screen.
    this.time.delayedCall(800, () => {
      const onSpace = () => {
        if (!canPlay()) return;
        this.input.off(Phaser.Input.Events.POINTER_DOWN, onPointerDown);
        this.input.keyboard?.off('keydown-SPACE', onSpace);
        this.scene.start('Game');
      };
      const onPointerDown = (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length === 0) onSpace();
      };
      this.input.on(Phaser.Input.Events.POINTER_DOWN, onPointerDown);
      this.input.keyboard?.on('keydown-SPACE', onSpace);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.off(Phaser.Input.Events.POINTER_DOWN, onPointerDown);
        this.input.keyboard?.off('keydown-SPACE', onSpace);
      });
    });
  }
}
