import Phaser from 'phaser';
import { applySoundSettings, ensureMusic } from '../audio.ts';
import { COLOR, HEIGHT, RELICS, SHARD_BONUS, TEX, WIDTH } from '../config.ts';
import {
  ascend,
  buyRelic,
  canAscend,
  formatNum,
  formatTime,
  relicCost,
  shardMult,
  shardsForReign,
} from '../economy.ts';
import { Sfx } from '../sfx.ts';
import { canPlay, run, settleRun, writeSave } from '../storage.ts';
import { addBackdrop, addSoundControl, addTemporaryNotice, drawPlate, label, plateButton } from '../ui.ts';

/** Reign: spend shards on relics, or give up the run for a new reign (and more shards). */
export class Reign extends Phaser.Scene {
  private sfx!: Sfx;
  private relicLayer!: Phaser.GameObjects.Container;
  private ascendArmed = false;

  constructor() {
    super('Reign');
  }

  create(): void {
    this.ascendArmed = false;
    if (!canPlay() || !run.state) return;
    this.sfx = new Sfx(this.sound);
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
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.shadow, 0.55).setOrigin(0);
    label(this, WIDTH / 2, 50, 'THE NEXT REIGN', 40, COLOR.hazard, 0.5, 0.5);

    this.buildReignPanel();
    this.relicLayer = this.add.container(0, 0);
    this.buildRelics();
  }

  private get s() {
    return run.state as NonNullable<typeof run.state>;
  }

  // ── left: what ascending does ─────────────────────────────────────────────
  private buildReignPanel(): void {
    const s = this.s;
    const x = 40,
      y = 100,
      w = 520,
      h = 560;
    drawPlate(this.add.graphics(), x, y, w, h, COLOR.panel, COLOR.chromeDim, 0.92);
    label(this, x + 24, y + 20, `REIGN ${s.reigns + 1}`, 28, COLOR.sand);

    const rows: [string, string][] = [
      ['CROWNS', `${s.crowns}`],
      ['CREDITS THIS REIGN', formatNum(s.reignTotal)],
      ['TIME THIS REIGN', formatTime(s.reignTime)],
      ['REIGNS SO FAR', `${s.reigns}`],
    ];
    rows.forEach(([k, v], i) => {
      label(this, x + 24, y + 80 + i * 36, k, 18, COLOR.sub);
      label(this, x + w - 24, y + 80 + i * 36, v, 18, COLOR.text, 1, 0);
    });

    const gain = shardsForReign(s.reignTotal);
    const ok = canAscend(s);
    label(
      this,
      x + 24,
      y + 250,
      ok ? `ASCEND FOR  +${gain} SHARDS` : 'NO SHARDS TO CLAIM YET',
      26,
      ok ? COLOR.hazard : COLOR.dim,
    );
    const pct = (n: number): string => `+${Math.round((shardMult({ ...s, shardsEarned: n }) - 1) * 100)}%`;
    label(
      this,
      x + 24,
      y + 290,
      ok
        ? `Shard bonus  ${pct(s.shardsEarned)}  >  ${pct(s.shardsEarned + gain)} output (each shard +${SHARD_BONUS * 100}%)`
        : s.crowns < 1
          ? 'Buy a crown first. Every reign pays shards by the\nCredits it earned.'
          : 'This reign has not earned enough Credits yet.',
      15,
      COLOR.text,
      0,
      0,
      w - 48,
    );
    label(
      this,
      x + 24,
      y + 340,
      'Ascending resets Credits, crews, the Forge Pick and your crowns. Shards and relics stay.',
      15,
      COLOR.sub,
      0,
      0,
      w - 48,
    );

    const go = plateButton(
      this,
      x + 24,
      y + h - 130,
      w - 48,
      52,
      'ASCEND',
      22,
      () => {
        if (!ok) {
          this.sfx.play('nope');
          return;
        }
        if (this.ascendArmed) {
          this.doAscend();
          return;
        }
        this.ascendArmed = true;
        go.text.setText('TAP AGAIN TO ASCEND').setColor('#ff8a6a');
        go.redraw(COLOR.danger);
        this.sfx.play('click');
        this.time.delayedCall(3000, () => {
          this.ascendArmed = false;
          go.text.setText('ASCEND').setColor('#f2c230');
          go.redraw(COLOR.chrome);
        });
      },
      {
        fill: ok ? COLOR.gold : COLOR.rustDark,
        rim: ok ? COLOR.goldRim : COLOR.chromeDim,
        color: ok ? COLOR.hazard : COLOR.dim,
      },
    );
    plateButton(this, x + 24, y + h - 62, w - 48, 40, 'BACK TO THE MINE', 18, () => this.back(), {
      fill: COLOR.rustMid,
      rim: COLOR.chromeDim,
      color: COLOR.text,
    });
  }

  private doAscend(): void {
    if (!canPlay()) return;
    settleRun();
    const gain = ascend(this.s);
    if (gain <= 0) {
      this.sfx.play('nope');
      return;
    }
    writeSave(this.s);
    this.sfx.play('fanfare');
    this.scene.start('Game', { reign: gain });
  }

  private back(): void {
    if (!canPlay()) return;
    this.sfx.play('click');
    this.scene.start('Game');
  }

  // ── right: relics ─────────────────────────────────────────────────────────
  private buildRelics(): void {
    const s = this.s;
    const x = 600,
      y = 100,
      w = 640,
      h = 560;
    const layer = this.relicLayer;
    layer.removeAll(true);
    const g = this.add.graphics();
    drawPlate(g, x, y, w, h, COLOR.panel, COLOR.chromeDim, 0.92);
    layer.add([
      g,
      label(this, x + 24, y + 20, 'RELICS', 28, COLOR.sand),
      label(this, x + w - 24, y + 24, `${formatNum(s.shards)} SHARDS`, 24, COLOR.hazard, 1, 0),
    ]);

    const rh = 70,
      gap = 8,
      top = y + 72;
    RELICS.forEach((r, i) => {
      const ry = top + i * (rh + gap);
      const level = s.relics[i] ?? 0;
      const cost = relicCost(s, i);
      const affordable = cost !== null && s.shards >= cost;
      const rg = this.add.graphics();
      drawPlate(
        rg,
        x + 12,
        ry,
        w - 24,
        rh,
        affordable ? COLOR.rustMid : COLOR.rustDark,
        affordable ? COLOR.hazard : COLOR.chromeDim,
        0.95,
        2,
      );
      const zone = this.add
        .zone(x + 12, ry, w - 24, rh)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.buy(i));
      layer.add([
        rg,
        label(
          this,
          x + 32,
          ry + 10,
          `${r.name}  LV${level}/${r.costs.length}`,
          20,
          level >= r.costs.length ? COLOR.hazard : COLOR.text,
        ),
        label(this, x + 32, ry + 40, r.blurb, 14, COLOR.sub, 0, 0, w - 220),
        label(
          this,
          x + w - 32,
          ry + 22,
          cost === null ? 'MAXED' : `${cost} SHARDS`,
          20,
          affordable ? COLOR.hazard : COLOR.dim,
          1,
          0,
        ),
        zone,
      ]);
    });
  }

  private buy(i: number): void {
    if (!canPlay()) return;
    const ok = buyRelic(this.s, i);
    this.sfx.play(ok ? 'buy' : 'nope');
    if (!ok) return;
    writeSave(this.s);
    this.buildRelics();
  }
}
