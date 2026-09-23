import Phaser from 'phaser';
import { TEX } from '../config.ts';

/** Boot: generate the small procedural textures, then hand over to the Preloader. */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({}, false);

    // Soft round spark for particles (tinted per emitter).
    for (let r = 8; r > 0; r--) g.fillStyle(0xffffff, (1 - r / 8) * 0.35 + 0.1).fillCircle(8, 8, r);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 3);
    g.generateTexture(TEX.spark, 16, 16);
    g.clear();

    // A thin dust-storm streak.
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 64, 2);
    g.generateTexture(TEX.streak, 64, 2);
    g.destroy();

    this.scene.start('Preloader');
  }
}
