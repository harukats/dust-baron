// The mine. Click the ore deposit to dig scrap, spend it in the Supply Depot on
// crew and machines that dig for you, ride out dust storms (production ×2) and
// grab chrome caches. Buying the Dust Crown wins.
import Phaser from 'phaser';
import * as C from '../config.ts';
import {
  newState, perSecond, clickPower, earn, genCost, maxAffordable, genRate, nextMilestone,
  pickCost, buyGen, buyPick, buyCrown, isRevealed, offlineGain, formatNum, type State,
} from '../economy.ts';
import { loadSave, writeSave, clearSave, run } from '../storage.ts';
import { Sfx } from '../sfx.ts';
import { ShopRow } from '../ShopRow.ts';
import { addBackdrop, css, drawPlate, fitImage, label, plateButton } from '../ui.ts';

const { COLOR, WIDTH, HEIGHT } = C;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

// Layout (1280×720): mine on the left, Supply Depot on the right.
const MINE_W = 740;
const DEP = { x: MINE_W / 2, y: 390, size: 300 };
const SHOP = { x: 752, y: 16, w: 512, h: HEIGHT - 32, head: 56 };

export class Game extends Phaser.Scene {
  private s!: State;
  private sfx!: Sfx;
  private deposit!: Phaser.GameObjects.Image;
  private depScale = 1;
  private scrapText!: Phaser.GameObjects.Text;
  private psText!: Phaser.GameObjects.Text;
  private digText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
  private qtyText!: Phaser.GameObjects.Text;
  private pickRow!: ShopRow;
  private genRows: ShopRow[] = [];
  private crownRow!: ShopRow;
  private crew!: Phaser.GameObjects.Container;
  private crewSig = '';
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private streaks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sand!: Phaser.GameObjects.Particles.ParticleEmitter;
  private glints!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stormOverlay!: Phaser.GameObjects.Rectangle;
  private frenzyGlow!: Phaser.GameObjects.Arc;
  private banner!: Phaser.GameObjects.Container;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private chromeCache: Phaser.GameObjects.Image | null = null;
  private cacheLife = 0;
  private stormIn = 0;
  private stormLeft = 0;
  private cacheIn = 0;
  private frenzyLeft = 0;
  private tickAcc = 0;
  private qtyMode = 0;

  constructor() {
    super('Game');
  }

  create(data?: { fresh?: boolean }): void {
    // Scene instances are reused on restart: reset every piece of per-run state here.
    this.genRows = [];
    this.crewSig = '';
    this.chromeCache = null;
    this.frenzyLeft = 0;
    this.stormLeft = 0;
    this.tickAcc = 0;
    this.qtyMode = 0;
    this.stormIn = rand(C.STORM_MIN_S, C.STORM_MAX_S);
    this.cacheIn = rand(C.CACHE_MIN_S * 0.5, C.CACHE_MAX_S * 0.5);
    this.sfx = new Sfx(this.sound);

    let offline = 0;
    if (data?.fresh) { clearSave(); run.state = null; }
    if (!run.state) {
      const saved = data?.fresh ? null : loadSave();
      run.state = saved ?? newState();
      if (saved && saved.lastSave > 0) {
        offline = offlineGain(saved, (Date.now() - saved.lastSave) / 1000);
        if (offline > 0) earn(saved, offline);
      }
    }
    this.s = run.state;

    addBackdrop(this, C.TEX.background);
    this.stormOverlay = this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.storm, 0).setOrigin(0);

    this.buildMine();
    this.buildStats();
    this.buildShop();
    this.buildEffects();
    this.buildBanner();

    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', (e: KeyboardEvent) => { if (!e.repeat) this.dig(DEP.x + rand(-40, 40), DEP.y + rand(-30, 30)); });
    kb?.on('keydown-Q', () => this.cycleQty());
    kb?.on('keydown-M', () => this.toggleMute());

    this.time.addEvent({ delay: C.AUTOSAVE_MS, loop: true, callback: () => writeSave(this.s) });
    // Save when the tab is hidden too, so offline earnings start from the right moment.
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.save, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.HIDDEN, this.save, this));

    if (offline > 0) this.showBanner('WHILE YOU WERE GONE', `your crew dug +${formatNum(offline)} scrap`, COLOR.hazard, 5000);
  }

  private save(): void { writeSave(this.s); }

  // ── building ──────────────────────────────────────────────────────────────
  private buildMine(): void {
    this.frenzyGlow = this.add.circle(DEP.x, DEP.y, DEP.size * 0.55, COLOR.chrome, 0.15).setVisible(false);
    this.add.ellipse(DEP.x, DEP.y + DEP.size * 0.28, DEP.size * 0.85, 48, COLOR.shadow, 0.35);
    this.deposit = fitImage(this.add.image(DEP.x, DEP.y, C.TEX.deposit), DEP.size);
    this.depScale = this.deposit.scaleX;
    // Round hit area in the texture's own pixels, so the empty corners don't count.
    this.deposit.setInteractive(new Phaser.Geom.Circle(64, 60, 60), Phaser.Geom.Circle.Contains);
    if (this.deposit.input) this.deposit.input.cursor = 'pointer';
    this.deposit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => this.dig(p.worldX, p.worldY));

    this.hintText = label(this, DEP.x, DEP.y - DEP.size * 0.5 - 40, 'CLICK THE DEPOSIT TO DIG!', 24, COLOR.hazard, 0.5, 0.5);
    this.tweens.add({ targets: this.hintText, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });

    this.crew = this.add.container(0, 0);
  }

  private buildStats(): void {
    const x = 24, y = 20, w = 440, h = 122;
    drawPlate(this.add.graphics(), x, y, w, h, COLOR.rustDark, COLOR.chromeDim, 0.85);
    label(this, x + 18, y + 14, 'SCRAP', 18, COLOR.sub);
    this.scrapText = label(this, x + 18, y + 34, '0', 46, COLOR.hazard);
    this.psText = label(this, x + 18, y + 90, '', 18);
    this.digText = label(this, x + w - 18, y + 14, '', 18, COLOR.sand, 1, 0);
    const mute = plateButton(this, x + w - 116, y + h - 44, 100, 30, '', 14, () => this.toggleMute(),
      { fill: COLOR.rustMid, rim: COLOR.chromeDim, color: COLOR.text });
    this.muteText = mute.text;
  }

  private buildShop(): void {
    drawPlate(this.add.graphics(), SHOP.x, SHOP.y, SHOP.w, SHOP.h, COLOR.panel, COLOR.chromeDim, 0.9);
    label(this, SHOP.x + 20, SHOP.y + SHOP.head / 2 + 2, 'SUPPLY DEPOT', 24, COLOR.hazard, 0, 0.5);
    const qty = plateButton(this, SHOP.x + SHOP.w - 124, SHOP.y + 10, 110, SHOP.head - 16, '', 18, () => this.cycleQty(),
      { fill: COLOR.rustMid, rim: COLOR.chrome, color: COLOR.text });
    this.qtyText = qty.text;

    const rows = 8, gap = 6;
    const top = SHOP.y + SHOP.head;
    const rh = Math.floor((SHOP.h - SHOP.head - 10 - gap * (rows - 1)) / rows);
    const rx = SHOP.x + 10, rw = SHOP.w - 20;
    const y = (r: number): number => top + r * (rh + gap);

    this.pickRow = new ShopRow(this, rx, y(0), rw, rh, C.TEX.pick, () => this.buy(() => buyPick(this.s)));
    C.GENS.forEach((g, i) => {
      this.genRows.push(new ShopRow(this, rx, y(1 + i), rw, rh, g.key, () => this.buy(() => buyGen(this.s, i, C.QTY_MODES[this.qtyMode]!) > 0)));
    });
    this.crownRow = new ShopRow(this, rx, y(7), rw, rh, C.TEX.logo, () => this.buyTheCrown(), true);
  }

  private buildEffects(): void {
    this.sparks = this.add.particles(0, 0, C.TEX.spark, {
      speed: { min: 140, max: 380 }, angle: { min: 200, max: 340 }, gravityY: 800,
      lifespan: 520, scale: { start: 0.7, end: 0 }, tint: [COLOR.hazard, 0xff9a3c, COLOR.rust],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(8);
    this.dust = this.add.particles(0, 0, C.TEX.spark, {
      speed: { min: 20, max: 70 }, lifespan: 900, scale: { start: 1, end: 3 }, alpha: { start: 0.45, end: 0 },
      tint: [COLOR.sand, COLOR.storm], emitting: false,
    }).setDepth(7);
    this.glints = this.add.particles(0, 0, C.TEX.spark, {
      speed: { min: 60, max: 260 }, lifespan: 700, scale: { start: 0.8, end: 0 },
      tint: [COLOR.chrome, 0xffffff, COLOR.hazard], blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(9);
    this.streaks = this.add.particles(0, 0, C.TEX.streak, {
      x: -80, y: { min: 0, max: HEIGHT }, speedX: { min: 900, max: 1600 }, speedY: { min: 40, max: 140 },
      lifespan: 1600, scaleX: { min: 1, max: 4 }, alpha: { start: 0.5, end: 0.15 }, tint: COLOR.sand,
      frequency: 25, emitting: false,
    }).setDepth(20);
    this.sand = this.add.particles(0, 0, C.TEX.spark, {
      x: -20, y: { min: 0, max: HEIGHT }, speedX: { min: 500, max: 900 }, speedY: { min: 0, max: 80 },
      lifespan: 2600, scale: { min: 0.3, max: 0.8 }, alpha: 0.6, tint: [COLOR.sand, COLOR.storm],
      frequency: 15, emitting: false,
    }).setDepth(20);
  }

  private buildBanner(): void {
    const w = 580, h = 96;
    const g = this.add.graphics();
    g.fillStyle(COLOR.shadow, 0.82).fillRect(-w / 2, -h / 2, w, h);
    this.bannerTitle = label(this, 0, -16, '', 38, COLOR.hazard, 0.5, 0.5);
    this.bannerSub = label(this, 0, 26, '', 20, COLOR.text, 0.5, 0.5);
    this.banner = this.add.container(DEP.x, 200, [g, this.bannerTitle, this.bannerSub]).setDepth(30).setAlpha(0);
    this.banner.setData('g', g);
  }

  private showBanner(title: string, sub: string, color: number, ms = 3000): void {
    const g = this.banner.getData('g') as Phaser.GameObjects.Graphics;
    g.clear().fillStyle(COLOR.shadow, 0.82).fillRect(-290, -48, 580, 96)
      .fillStyle(color, 1).fillRect(-290, -48, 580, 4).fillRect(-290, 44, 580, 4);
    this.bannerTitle.setText(title).setColor(css(color));
    this.bannerSub.setText(sub);
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0).setScale(0.9);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut' },
        { alpha: 0, duration: 400, delay: ms },
      ],
    });
  }

  // ── actions ───────────────────────────────────────────────────────────────
  private get ps(): number { return perSecond(this.s, this.stormLeft > 0); }
  private get digPower(): number { return clickPower(this.s, this.ps) * (this.frenzyLeft > 0 ? C.FRENZY_MULT : 1); }

  private dig(x: number, y: number): void {
    const gain = this.digPower;
    earn(this.s, gain);
    this.s.clicks++;

    this.tweens.killTweensOf(this.deposit);
    this.deposit.setScale(this.depScale * 1.07, this.depScale * 0.93);
    this.tweens.add({ targets: this.deposit, scaleX: this.depScale, scaleY: this.depScale, duration: 120, ease: 'Back.easeOut' });

    this.floater(x + rand(-20, 20), y - 20, `+${formatNum(gain)}`, this.frenzyLeft > 0 ? COLOR.chrome : COLOR.hazard, 28, -130);
    this.sparks.explode(14, x, y);
    this.dust.explode(6, x, y + 10);
    this.sfx.play('dig');
  }

  private floater(x: number, y: number, str: string, color: number, size: number, dy: number): void {
    const t = label(this, x, y, str, size, color, 0.5, 0.5).setDepth(10);
    this.tweens.add({ targets: t, y: y + dy, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private buy(tryBuy: () => boolean): void {
    const ok = tryBuy();
    this.sfx.play(ok ? 'buy' : 'nope');
    if (ok) writeSave(this.s);
  }

  private buyTheCrown(): void {
    if (!buyCrown(this.s)) { this.sfx.play('nope'); return; }
    writeSave(this.s);
    this.scene.start('Victory', { time: this.s.playTime, total: this.s.total, clicks: this.s.clicks });
  }

  private cycleQty(): void {
    this.qtyMode = (this.qtyMode + 1) % C.QTY_MODES.length;
    this.sfx.play('click');
  }

  private toggleMute(): void {
    this.sound.mute = !this.sound.mute;
  }

  private spawnCache(): void {
    // Spawn in the open ground either side of the deposit, clear of the stats plate and crew row.
    const x = Math.random() < 0.5 ? rand(70, 190) : rand(MINE_W - 190, MINE_W - 60);
    const y = rand(300, 520);
    const c = fitImage(this.add.image(x, y, C.TEX.cache), 96).setDepth(6);
    c.setInteractive({ useHandCursor: true });
    c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.collectCache());
    this.tweens.add({ targets: c, y: y - 12, duration: 700, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    this.chromeCache = c;
    this.cacheLife = C.CACHE_LIFE_S;
    this.sfx.play('chime');
  }

  private removeCache(): void {
    this.chromeCache?.destroy();
    this.chromeCache = null;
    this.cacheIn = rand(C.CACHE_MIN_S, C.CACHE_MAX_S);
  }

  private collectCache(): void {
    if (!this.chromeCache) return;
    this.glints.explode(50, this.chromeCache.x, this.chromeCache.y);
    this.removeCache();
    this.sfx.play('cache');
    if (Math.random() < 0.5) {
      const base = perSecond(this.s);
      const gain = Math.max(base * C.CACHE_JACKPOT_S, clickPower(this.s, base) * C.CACHE_JACKPOT_CLICKS);
      earn(this.s, gain);
      this.showBanner('CHROME JACKPOT!', `+${formatNum(gain)} scrap`, COLOR.chrome);
    } else {
      this.frenzyLeft = C.FRENZY_S;
      this.showBanner('DIG FRENZY!', `digging x${C.FRENZY_MULT} for ${C.FRENZY_S}s`, COLOR.chrome);
    }
  }

  private startStorm(): void {
    this.stormLeft = C.STORM_DURATION_S;
    this.streaks.start();
    this.sand.start();
    this.tweens.add({ targets: this.stormOverlay, fillAlpha: 0.3, duration: 1200 });
    this.cameras.main.shake(600, 0.004);
    this.sfx.play('storm');
    this.showBanner('DUST STORM!', `turbines overcharged: production x${C.STORM_MULT}`, COLOR.storm, 3500);
  }

  private endStorm(): void {
    this.stormIn = rand(C.STORM_MIN_S, C.STORM_MAX_S);
    this.streaks.stop();
    this.sand.stop();
    this.tweens.add({ targets: this.stormOverlay, fillAlpha: 0, duration: 1500 });
  }

  // ── frame ─────────────────────────────────────────────────────────────────
  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 250) / 1000;
    const s = this.s;
    s.playTime += dt;
    const ps = this.ps;
    earn(s, ps * dt);
    this.frenzyLeft = Math.max(0, this.frenzyLeft - dt);

    // The crew at work: a puff + tally from the deposit once a second.
    this.tickAcc += dt;
    if (this.tickAcc >= 1) {
      this.tickAcc -= 1;
      if (ps > 0) {
        this.floater(DEP.x + rand(-60, 60), DEP.y - DEP.size * 0.2, `+${formatNum(ps)}`, COLOR.sand, 20, -70);
        this.dust.explode(5, DEP.x + rand(-60, 60), DEP.y + DEP.size * 0.2);
      }
    }

    if (this.stormLeft > 0) {
      this.stormLeft -= dt;
      if (this.stormLeft <= 0) this.endStorm();
    } else if ((this.stormIn -= dt) <= 0) {
      this.startStorm();
    }

    if (this.chromeCache) {
      this.cacheLife -= dt;
      if (this.cacheLife <= 0) this.removeCache();
      else this.chromeCache.setAlpha(this.cacheLife < 3 && Math.sin(this.time.now / 50) < 0 ? 0.35 : 1);
    } else if ((this.cacheIn -= dt) <= 0) {
      this.spawnCache();
    }

    this.frenzyGlow.setVisible(this.frenzyLeft > 0).setAlpha(0.5 + 0.5 * Math.sin(this.time.now / 80));
    this.refreshHud(ps);
    this.refreshCrew();
    this.refreshShop();
  }

  private refreshHud(ps: number): void {
    const storm = this.stormLeft > 0;
    this.scrapText.setText(formatNum(this.s.scrap));
    this.psText.setText(`+${formatNum(ps)}/s${storm ? `  STORM x${C.STORM_MULT} ${Math.ceil(this.stormLeft)}s` : ''}`)
      .setColor(css(storm ? COLOR.storm : COLOR.text));
    this.digText.setText(`DIG +${formatNum(this.digPower)}${this.frenzyLeft > 0 ? `  FRENZY ${Math.ceil(this.frenzyLeft)}s` : ''}`)
      .setColor(css(this.frenzyLeft > 0 ? COLOR.chrome : COLOR.sand));
    this.muteText.setText(this.sound.mute ? 'SOUND:OFF' : 'SOUND:ON');
    const q = C.QTY_MODES[this.qtyMode]!;
    this.qtyText.setText(q < 0 ? 'BUY MAX' : `BUY x${q}`);
    // The tutorial hint sits where banners appear; give way while one is showing.
    this.hintText.setVisible(this.s.clicks < 8 && this.banner.alpha < 0.05);
  }

  /** Every generator type you own, bobbing at work in a row under the deposit. */
  private refreshCrew(): void {
    const owned = C.GENS.map((_, i) => this.s.owned[i] ?? 0);
    const sig = owned.join(',');
    if (sig === this.crewSig) return;
    this.crewSig = sig;
    this.crew.removeAll(true);
    const types = owned.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    if (types.length === 0) return;
    const icon = 64, gap = 78, y = DEP.y + DEP.size * 0.5 + 72;
    const g = this.add.graphics();
    drawPlate(g, DEP.x - (types.length * gap) / 2 - 10, y - icon / 2 - 12, types.length * gap + 20, icon + 46, COLOR.rustDark, COLOR.chromeDim, 0.7, 2);
    this.crew.add(g);
    types.forEach((i, k) => {
      const x = DEP.x - ((types.length - 1) * gap) / 2 + k * gap;
      const img = fitImage(this.add.image(x, y, C.GENS[i]!.key), icon);
      this.tweens.add({ targets: img, y: y - 4, duration: 180 + i * 20, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, delay: k * 90 });
      this.crew.add([img, label(this, x, y + icon / 2 + 2, `x${owned[i]}`, 16, COLOR.text, 0.5, 0)]);
    });
  }

  private refreshShop(): void {
    const s = this.s;
    const pc = pickCost(s.pick);
    this.pickRow.set({ title: `FORGE PICK  LV${s.pick}`, sub: 'dig x2, +1% of scrap/s per dig', cost: formatNum(pc), affordable: s.scrap >= pc });

    const q = C.QTY_MODES[this.qtyMode]!;
    C.GENS.forEach((g, i) => {
      const owned = s.owned[i] ?? 0;
      const qty = q < 0 ? Math.max(1, maxAffordable(i, owned, s.scrap)) : q;
      const cost = genCost(i, owned, qty);
      const revealed = isRevealed(s, i);
      const nm = nextMilestone(owned);
      const sub = owned > 0
        ? `x${owned}   +${formatNum(genRate(i, owned))}/s${nm ? `   2x at ${nm}` : ''}`
        : `${g.blurb}  (+${formatNum(g.rate)}/s)`;
      this.genRows[i]!.set({
        title: revealed ? `${g.name}${qty > 1 ? ` x${qty}` : ''}` : '??????',
        sub: revealed ? sub : 'keep digging to discover',
        cost: formatNum(cost),
        affordable: revealed && s.scrap >= cost,
        locked: !revealed,
      });
    });

    this.crownRow.set(s.won
      ? { title: 'DUST CROWN - CLAIMED', sub: '', cost: '', affordable: false, done: true }
      : { title: 'DUST CROWN', sub: '', cost: formatNum(C.CROWN_COST), affordable: s.scrap >= C.CROWN_COST, progress: Math.min(1, s.scrap / C.CROWN_COST) });
  }
}
