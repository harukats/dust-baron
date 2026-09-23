// One Supply Depot row: plate, icon, title, subtitle, cost and a click zone.
// set() redraws only when what it shows actually changed.
import Phaser from 'phaser';
import { COLOR } from './config.ts';
import { drawPlate, fitImage, label } from './ui.ts';

export interface RowView {
  title: string;
  sub: string;
  cost: string;
  affordable: boolean;
  locked?: boolean;
  /** Crown row: 0..1 progress bar in place of the subtitle. */
  progress?: number;
  done?: boolean;
}

export class ShopRow {
  private g: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private cost: Phaser.GameObjects.Text;
  private box: { x: number; y: number; w: number; h: number };
  private crown: boolean;
  private hover = false;
  private sig = '';
  private last: RowView | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    iconKey: string,
    onClick: () => void,
    crown = false,
  ) {
    this.box = { x, y, w, h };
    this.crown = crown;
    this.g = scene.add.graphics();
    const ic = crown ? h * 1.3 : h - 10;
    this.icon = fitImage(scene.add.image(x + 8 + (crown ? ic * 0.5 : ic / 2), y + h / 2, iconKey), ic);
    const tx = x + 16 + (crown ? this.icon.displayWidth : ic);
    this.title = label(scene, tx, y + h * 0.13, '', 22);
    this.sub = label(scene, tx, y + h * 0.58, '', 15, COLOR.sub);
    this.cost = label(scene, x + w - 14, y + h * 0.13, '', 22, COLOR.hazard, 1, 0);

    const zone = scene.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.hover = true;
      this.redraw();
    });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.hover = false;
      this.redraw();
    });
  }

  set(v: RowView): void {
    const sig = `${v.title}|${v.sub}|${v.cost}|${v.affordable}|${v.locked}|${v.done}|${v.progress?.toFixed(3)}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.last = v;
    this.title.setText(v.title).setColor(v.locked ? '#7d6a58' : v.done || this.crown ? '#f2c230' : '#f3e1c0');
    this.sub.setText(v.progress === undefined ? v.sub : '').setVisible(v.progress === undefined);
    this.cost.setText(v.cost).setColor(v.affordable ? '#f2c230' : '#7d6a58');
    if (v.locked) this.icon.setTint(0x000000).setTintMode(Phaser.TintModes.FILL).setAlpha(0.7);
    else this.icon.clearTint().setTintMode(Phaser.TintModes.MULTIPLY).setAlpha(1);
    this.redraw();
  }

  private redraw(): void {
    const v = this.last;
    if (!v) return;
    const { x, y, w, h } = this.box;
    const g = this.g.clear();
    if (this.crown) {
      drawPlate(g, x, y, w, h, v.done ? COLOR.win : COLOR.gold, v.affordable ? COLOR.hazard : COLOR.goldRim, 0.95, 2);
      if (v.progress !== undefined) {
        const bx = this.title.x,
          by = y + h * 0.62,
          bw = x + w - 14 - bx,
          bh = Math.max(8, h * 0.2);
        g.fillStyle(COLOR.shadow, 0.9).fillRect(bx, by, bw, bh);
        g.fillStyle(COLOR.hazard, 1).fillRect(bx, by, bw * Math.min(1, v.progress), bh);
      }
      return;
    }
    const fill = this.hover && v.affordable ? COLOR.rustMid : COLOR.rustDark;
    drawPlate(g, x, y, w, h, fill, v.affordable ? COLOR.hazard : COLOR.chromeDim, 0.95, 2);
  }
}
