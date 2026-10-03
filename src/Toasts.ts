// The "achievement unlocked" pop-up: one slides up from the bottom edge, stays a moment, slides away,
// then the next in the queue. One instance per scene (it is recreated in create(), like everything per-run).
import Phaser from 'phaser';
import { ACHIEVEMENTS, COLOR, HEIGHT } from './config.ts';
import type { Sfx } from './sfx.ts';
import { drawPlate, label } from './ui.ts';

const W = 560;
const H = 46;
const SHOW_MS = 3200;
const MAX_SEPARATE = 3; // more at once (an old save catching up) are announced as one toast

interface Toast {
  name: string;
  desc: string;
}

export class AchievementToasts {
  private scene: Phaser.Scene;
  private sfx: Sfx;
  private cx: number;
  private queue: Toast[] = [];
  private busy = false;
  private alive = true;

  constructor(scene: Phaser.Scene, sfx: Sfx, centerX: number) {
    this.scene = scene;
    this.sfx = sfx;
    this.cx = centerX;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.queue = [];
    });
  }

  push(ids: readonly string[]): void {
    const defs = ACHIEVEMENTS.filter((a) => ids.includes(a.id));
    if (defs.length > MAX_SEPARATE)
      this.queue.push({ name: `${defs.length} ACHIEVEMENTS`, desc: 'Unlocked. See the list on the title screen.' });
    else this.queue.push(...defs);
    this.next();
  }

  private next(): void {
    if (this.busy || !this.alive) return;
    const def = this.queue.shift();
    if (!def) return;
    this.busy = true;
    const x = this.cx - W / 2;
    const g = this.scene.add.graphics();
    drawPlate(g, 0, 0, W, H, COLOR.gold, COLOR.goldRim, 0.97, 2);
    const box = this.scene.add
      .container(x, HEIGHT + 6, [
        g,
        label(this.scene, 16, 5, def.name, 18, COLOR.goldBright),
        label(this.scene, 16, 28, def.desc, 12, COLOR.text),
        label(this.scene, W - 16, 8, 'ACHIEVEMENT', 12, COLOR.sub, 1, 0),
      ])
      .setDepth(60);
    this.sfx.play('chime');
    this.scene.tweens.add({
      targets: box,
      y: HEIGHT - H - 6,
      duration: 350,
      ease: 'Cubic.easeOut',
      yoyo: true,
      hold: SHOW_MS,
      onComplete: () => {
        box.destroy();
        this.busy = false;
        this.next();
      },
    });
  }
}
