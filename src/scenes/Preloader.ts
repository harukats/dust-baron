import Phaser from 'phaser';
import { COLOR, GENS, HEIGHT, MUSIC, PIXEL_TEXTURES, TEX, WIDTH } from '../config.ts';
import { label } from '../ui.ts';

/** Preloader: load every asset in public/assets/ behind a progress bar. */
export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  init(): void {
    const barW = 480;
    label(this, WIDTH / 2, HEIGHT / 2 - 50, 'HAULING SCRAP...', 26, COLOR.sand, 0.5, 0.5);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, barW + 8, 36).setStrokeStyle(2, COLOR.chrome);
    const bar = this.add.rectangle(WIDTH / 2 - barW / 2, HEIGHT / 2, 0, 28, COLOR.hazard).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.width = barW * p;
    });
  }

  preload(): void {
    this.load.setPath('assets');
    this.load.image(TEX.background, 'background.png');
    this.load.image(TEX.logo, 'logo.png');
    this.load.image(TEX.deposit, 'deposit.png');
    this.load.image(TEX.cache, 'chrome-cache.png');
    this.load.image(TEX.pick, 'forge-pick.png');
    for (const g of GENS) this.load.image(g.key, `${g.key}.png`);
    this.load.audio(MUSIC, 'music.mp3');
  }

  create(): void {
    // Keep the pixel art crisp while text and particles stay smooth.
    for (const key of PIXEL_TEXTURES) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.start('Title');
  }
}
