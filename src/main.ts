import Phaser from 'phaser';
import { HEIGHT, WIDTH } from './config.ts';
import { Boot } from './scenes/Boot.ts';
import { Game } from './scenes/Game.ts';
import { Preloader } from './scenes/Preloader.ts';
import { Title } from './scenes/Title.ts';
import { Victory } from './scenes/Victory.ts';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  title: 'Dust Baron',
  backgroundColor: '#1a0f0a',
  // Pixel-art textures are switched to NEAREST individually in the Preloader,
  // so text and particles keep smooth (LINEAR) sampling.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game-container',
    width: WIDTH,
    height: HEIGHT,
  },
  scene: [Boot, Preloader, Title, Game, Victory],
};

const game = new Phaser.Game(config);

// Dev-only handle for debugging from the console / automated browser checks.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;

// Tear the old instance down on hot reload so edits don't stack canvases.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
