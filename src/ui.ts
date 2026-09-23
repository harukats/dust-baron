// Shared drawing helpers: riveted rust-metal plates, styled text, image fitting.
import Phaser from 'phaser';
import { COLOR } from './config.ts';

export const FONT = '"Courier New", Courier, monospace';

export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Bold monospace text with a dark outline; sized in game pixels. */
export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size: number,
  color: number = COLOR.text,
  originX = 0,
  originY = 0,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color: css(color),
      stroke: css(COLOR.shadow),
      strokeThickness: Math.max(3, Math.round(size / 7)),
      resolution: 2,
    })
    .setOrigin(originX, originY);
}

/** A riveted rust-metal plate. */
export function drawPlate(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number = COLOR.rustDark,
  rim: number = COLOR.chromeDim,
  alpha = 0.92,
  rimW = 3,
): void {
  g.fillStyle(COLOR.shadow, 0.45).fillRect(x + 4, y + 5, w, h);
  g.fillStyle(fill, alpha).fillRect(x, y, w, h);
  g.lineStyle(rimW, rim, 1).strokeRect(x + rimW / 2, y + rimW / 2, w - rimW, h - rimW);
  const r = Math.max(2, Math.min(4, h * 0.06));
  const o = rimW + r + 2;
  g.fillStyle(COLOR.chrome, 1);
  for (const [px, py] of [
    [x + o, y + o],
    [x + w - o, y + o],
    [x + o, y + h - o],
    [x + w - o, y + h - o],
  ] as const) {
    g.fillCircle(px, py, r);
  }
}

/** Scale an image so its longest side is `box`. */
export function fitImage<T extends Phaser.GameObjects.Image>(img: T, box: number): T {
  return img.setScale(box / Math.max(img.width, img.height));
}

/** Add the desert backdrop, cover-fitted to the canvas. */
export function addBackdrop(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  const { width, height } = scene.scale;
  const bg = scene.add.image(width / 2, height / 2, key);
  return bg.setScale(Math.max(width / bg.width, height / bg.height));
}

/** A plate-style button. Returns the zone so callers can wire/hide it. */
export function plateButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  size: number,
  onClick: () => void,
  opts: { fill?: number; rim?: number; color?: number } = {},
): {
  g: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  redraw: (rim: number) => void;
} {
  const g = scene.add.graphics();
  const redraw = (rim: number): void => {
    g.clear();
    drawPlate(g, x, y, w, h, opts.fill ?? COLOR.rustMid, rim, 1, 3);
  };
  redraw(opts.rim ?? COLOR.chrome);
  const t = label(scene, x + w / 2, y + h / 2, text, size, opts.color ?? COLOR.hazard, 0.5, 0.5);
  const zone = scene.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
  zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
  return { g, text: t, zone, redraw };
}
