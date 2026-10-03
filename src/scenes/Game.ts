// The mine. Click the ore deposit to dig scrap, spend it in the Supply Depot on
// crew and machines that dig for you, ride out dust storms (production ×2) and
// grab chrome and gold caches. Buy the crowns in order — the last one wins.
import Phaser from 'phaser';
import { applySoundSettings, ensureMusic, toggleSound } from '../audio.ts';
import * as C from '../config.ts';
import {
  activeDigMultiplier,
  applyDigFrenzy,
  buyCrown,
  buyGen,
  buyPick,
  type CacheKind,
  cacheReward,
  canAscend,
  digGain,
  earn,
  formatNum,
  frenzySeconds,
  genCost,
  genOutput,
  goldChance,
  isRevealed,
  isWon,
  maxAffordable,
  nextCrown,
  nextMilestone,
  perSecond,
  pickCost,
  productionMult,
  type State,
  selectCacheKind,
  shardMult,
  shardsForReign,
  shopWindow,
  stormMult,
} from '../economy.ts';
import { ShopRow } from '../ShopRow.ts';
import { Sfx } from '../sfx.ts';
import { canPlay, grantAchievements, initializeRun, resetRun, run, settleRun, writeSave } from '../storage.ts';
import { AchievementToasts } from '../Toasts.ts';
import { addBackdrop, addTemporaryNotice, css, drawPlate, fitImage, label, plateButton } from '../ui.ts';

const { COLOR, WIDTH, HEIGHT } = C;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

function updateLabel(text: Phaser.GameObjects.Text, value: string, color?: number): void {
  if (text.text !== value) text.setText(value);
  if (color !== undefined) {
    const nextColor = css(color);
    if (text.style.color !== nextColor) text.setColor(nextColor);
  }
}

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
  private toasts!: AchievementToasts;
  private reignBtn!: ReturnType<typeof plateButton>;
  private shardText!: Phaser.GameObjects.Text;
  private pickRow!: ShopRow;
  private genRows: ShopRow[] = [];
  private shopTiers: number[] = []; // generator index shown in each genRows slot
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
  private cachePickup: Phaser.GameObjects.Image | null = null;
  private cacheKind: CacheKind | null = null;
  private cacheLabel: Phaser.GameObjects.Text | null = null;
  private cacheLife = 0;
  private cacheExpiresAtMs = 0;
  private stormIn = 0;
  private stormLeft = 0;
  private cacheIn = 0;
  private frenzyLeft = 0;
  private tickAcc = 0;
  private qtyMode = 0;

  constructor() {
    super('Game');
  }

  create(data?: { fresh?: boolean; reign?: number }): void {
    // Scene instances are reused on restart: reset every piece of per-run state here.
    this.genRows = [];
    this.shopTiers = [];
    this.crewSig = '';
    this.cachePickup = null;
    this.cacheKind = null;
    this.cacheLabel = null;
    this.cacheLife = 0;
    this.cacheExpiresAtMs = 0;
    this.frenzyLeft = 0;
    this.stormLeft = 0;
    this.tickAcc = 0;
    this.qtyMode = 0;
    this.stormIn = rand(C.STORM_MIN_S, C.STORM_MAX_S);
    this.cacheIn = rand(C.CACHE_MIN_S * 0.5, C.CACHE_MAX_S * 0.5);
    this.sfx = new Sfx(this.sound);

    if (!canPlay()) return;
    applySoundSettings(this);
    ensureMusic(this);
    if (data?.fresh) resetRun();
    const offline = initializeRun(Date.now(), run.now());
    settleRun();
    run.stormEndsAtMs = 0;
    run.frenzyEndsAtMs = 0;
    run.frenzyMult = 1;
    this.s = run.state as State;

    addBackdrop(this, C.TEX.background);
    this.stormOverlay = this.add.rectangle(0, 0, WIDTH, HEIGHT, COLOR.storm, 0).setOrigin(0);

    this.buildMine();
    this.buildStats();
    this.buildShop();
    this.buildEffects();
    this.buildBanner();
    this.toasts = new AchievementToasts(this, this.sfx, MINE_W / 2);
    addTemporaryNotice(this);

    const kb = this.input.keyboard;
    const onDig = (e: KeyboardEvent): void => {
      if (!e.repeat) this.dig(DEP.x + rand(-40, 40), DEP.y + rand(-30, 30));
    };
    const onQty = (): void => this.cycleQty();
    const onMute = (): void => this.toggleMute();
    kb?.on('keydown-SPACE', onDig);
    kb?.on('keydown-Q', onQty);
    kb?.on('keydown-M', onMute);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.save();
      this.removeCache();
      run.frenzyMult = 1;
      run.frenzyEndsAtMs = 0;
      kb?.off('keydown-SPACE', onDig);
      kb?.off('keydown-Q', onQty);
      kb?.off('keydown-M', onMute);
    });
    this.refreshHud(this.ps);
    this.refreshShop();
    this.refreshCrew();
    if (data?.reign)
      this.showBanner(
        `REIGN ${this.s.reigns + 1} BEGINS`,
        `+${data.reign} shards: production x${shardMult(this.s).toFixed(2)}`,
        COLOR.hazard,
        5000,
      );
    else if (offline > 0)
      this.showBanner('WHILE YOU WERE GONE', `your crew dug +${formatNum(offline)} ${C.CURRENCY}`, COLOR.hazard, 5000);
  }

  private save(): void {
    settleRun();
    writeSave(this.s);
  }

  private settle(): void {
    settleRun();
    const now = run.now();
    const wasStorm = this.stormLeft > 0;
    this.stormLeft = Math.max(0, (run.stormEndsAtMs - now) / 1000);
    this.frenzyLeft =
      activeDigMultiplier(run.frenzyMult, run.frenzyEndsAtMs, now) > 1
        ? Math.max(0, (run.frenzyEndsAtMs - now) / 1000)
        : 0;
    if (wasStorm && this.stormLeft === 0) this.endStorm();
    if (this.cachePickup) {
      this.cacheLife = Math.max(0, (this.cacheExpiresAtMs - now) / 1000);
      if (this.cacheLife === 0) this.removeCache();
    }
  }

  // ── building ──────────────────────────────────────────────────────────────
  private buildMine(): void {
    this.frenzyGlow = this.add.circle(DEP.x, DEP.y, DEP.size * 0.55, COLOR.chrome, 0.15).setVisible(false);
    this.add.ellipse(DEP.x, DEP.y + DEP.size * 0.28, DEP.size * 0.85, 48, COLOR.shadow, 0.35);
    this.deposit = fitImage(this.add.image(DEP.x, DEP.y, C.TEX.deposit), DEP.size);
    this.depScale = this.deposit.scaleX;
    // Round hit area in the texture's own pixels, so the empty corners don't count.
    this.deposit.setInteractive(new Phaser.Geom.Circle(64, 60, 60), Phaser.Geom.Circle.Contains);
    if (this.deposit.input) this.deposit.input.cursor = 'pointer';
    this.deposit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.dig(p.worldX, p.worldY),
    );

    this.hintText = label(
      this,
      DEP.x,
      DEP.y - DEP.size * 0.5 - 40,
      'CLICK THE DEPOSIT TO DIG!',
      24,
      COLOR.hazard,
      0.5,
      0.5,
    );
    this.tweens.add({ targets: this.hintText, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });

    this.crew = this.add.container(0, 0);
  }

  private buildStats(): void {
    const x = 24,
      y = 20,
      w = 480,
      h = 128;
    drawPlate(this.add.graphics(), x, y, w, h, COLOR.rustDark, COLOR.chromeDim, 0.85);
    label(this, x + 18, y + 14, C.CURRENCY, 18, COLOR.sub);
    this.scrapText = label(this, x + 18, y + 34, '0', 46, COLOR.hazard);
    this.psText = label(this, x + 18, y + 90, '', 18);
    this.digText = label(this, x + w - 18, y + 14, '', 18, COLOR.sand, 1, 0);
    const mute = plateButton(this, x + w - 116, y + h - 44, 100, 30, '', 14, () => this.toggleMute(), {
      fill: COLOR.rustMid,
      rim: COLOR.chromeDim,
      color: COLOR.text,
    });
    this.muteText = mute.text;

    // Reign: opens the Reign scene (ascend + relics) once there is something to do there.
    this.reignBtn = plateButton(this, x + w + 16, y, 212, 44, '', 18, () => this.openReign(), {
      fill: COLOR.gold,
      rim: COLOR.goldRim,
      color: COLOR.goldBright,
    });
    this.shardText = label(this, x + w + 16 + 106, y + 62, '', 15, COLOR.sub, 0.5, 0);
  }

  private buildShop(): void {
    drawPlate(this.add.graphics(), SHOP.x, SHOP.y, SHOP.w, SHOP.h, COLOR.panel, COLOR.chromeDim, 0.9);
    label(this, SHOP.x + 20, SHOP.y + SHOP.head / 2 + 2, 'SUPPLY DEPOT', 24, COLOR.hazard, 0, 0.5);
    const qty = plateButton(
      this,
      SHOP.x + SHOP.w - 124,
      SHOP.y + 10,
      110,
      SHOP.head - 16,
      '',
      18,
      () => this.cycleQty(),
      { fill: COLOR.rustMid, rim: COLOR.chrome, color: COLOR.text },
    );
    this.qtyText = qty.text;

    const rows = 8,
      gap = 6;
    const top = SHOP.y + SHOP.head;
    const rh = Math.floor((SHOP.h - SHOP.head - 10 - gap * (rows - 1)) / rows);
    const rx = SHOP.x + 10,
      rw = SHOP.w - 20;
    const y = (r: number): number => top + r * (rh + gap);

    this.pickRow = new ShopRow(this, rx, y(0), rw, rh, C.TEX.pick, () => this.buy(() => buyPick(this.s)));
    // One slot per base tier; each slot shows a window of the newest unlocked generators (see shopWindow).
    for (let k = 0; k < C.BASE_TIERS; k++) {
      this.genRows.push(
        new ShopRow(this, rx, y(1 + k), rw, rh, C.GENS[k].key, () =>
          this.buy(() => {
            const i = this.shopTiers[k];
            return i !== undefined && buyGen(this.s, i, C.QTY_MODES[this.qtyMode]) > 0;
          }),
        ),
      );
    }
    this.crownRow = new ShopRow(this, rx, y(7), rw, rh, C.CROWNS[0].key, () => this.buyTheCrown(), true);
  }

  private buildEffects(): void {
    this.sparks = this.add
      .particles(0, 0, C.TEX.spark, {
        speed: { min: 140, max: 380 },
        angle: { min: 200, max: 340 },
        gravityY: 800,
        lifespan: 520,
        scale: { start: 0.7, end: 0 },
        tint: [COLOR.hazard, 0xff9a3c, COLOR.rust],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(8);
    this.dust = this.add
      .particles(0, 0, C.TEX.spark, {
        speed: { min: 20, max: 70 },
        lifespan: 900,
        scale: { start: 1, end: 3 },
        alpha: { start: 0.45, end: 0 },
        tint: [COLOR.sand, COLOR.storm],
        emitting: false,
      })
      .setDepth(7);
    this.glints = this.add
      .particles(0, 0, C.TEX.spark, {
        speed: { min: 60, max: 260 },
        lifespan: 700,
        scale: { start: 0.8, end: 0 },
        tint: [COLOR.chrome, 0xffffff, COLOR.hazard],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(9);
    this.streaks = this.add
      .particles(0, 0, C.TEX.streak, {
        x: -80,
        y: { min: 0, max: HEIGHT },
        speedX: { min: 900, max: 1600 },
        speedY: { min: 40, max: 140 },
        lifespan: 1600,
        scaleX: { min: 1, max: 4 },
        alpha: { start: 0.5, end: 0.15 },
        tint: COLOR.sand,
        frequency: 25,
        emitting: false,
      })
      .setDepth(20);
    this.sand = this.add
      .particles(0, 0, C.TEX.spark, {
        x: -20,
        y: { min: 0, max: HEIGHT },
        speedX: { min: 500, max: 900 },
        speedY: { min: 0, max: 80 },
        lifespan: 2600,
        scale: { min: 0.3, max: 0.8 },
        alpha: 0.6,
        tint: [COLOR.sand, COLOR.storm],
        frequency: 15,
        emitting: false,
      })
      .setDepth(20);
  }

  private buildBanner(): void {
    const w = 580,
      h = 96;
    const g = this.add.graphics();
    g.fillStyle(COLOR.shadow, 0.82).fillRect(-w / 2, -h / 2, w, h);
    this.bannerTitle = label(this, 0, -16, '', 38, COLOR.hazard, 0.5, 0.5);
    this.bannerSub = label(this, 0, 26, '', 20, COLOR.text, 0.5, 0.5);
    this.banner = this.add.container(DEP.x, 200, [g, this.bannerTitle, this.bannerSub]).setDepth(30).setAlpha(0);
    this.banner.setData('g', g);
  }

  private showBanner(title: string, sub: string, color: number, ms = 3000): void {
    const g = this.banner.getData('g') as Phaser.GameObjects.Graphics;
    g.clear()
      .fillStyle(COLOR.shadow, 0.82)
      .fillRect(-290, -48, 580, 96)
      .fillStyle(color, 1)
      .fillRect(-290, -48, 580, 4)
      .fillRect(-290, 44, 580, 4);
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
  private get ps(): number {
    return perSecond(this.s, run.stormEndsAtMs > run.now());
  }
  private get digPower(): number {
    return digGain(this.s, run.frenzyMult, run.frenzyEndsAtMs, run.now());
  }

  private dig(x: number, y: number): void {
    if (!canPlay()) return;
    this.settle();
    const gain = this.digPower;
    if (activeDigMultiplier(run.frenzyMult, run.frenzyEndsAtMs, run.now()) === C.GOLD_FRENZY_MULT)
      this.s.stats.goldDigs++;
    earn(this.s, gain);
    this.s.clicks++;

    this.tweens.killTweensOf(this.deposit);
    this.deposit.setScale(this.depScale * 1.07, this.depScale * 0.93);
    this.tweens.add({
      targets: this.deposit,
      scaleX: this.depScale,
      scaleY: this.depScale,
      duration: 120,
      ease: 'Back.easeOut',
    });

    this.floater(
      x + rand(-20, 20),
      y - 20,
      `+${formatNum(gain)}`,
      this.frenzyLeft > 0 ? this.frenzyColor : COLOR.hazard,
      28,
      -130,
    );
    this.sparks.explode(14, x, y);
    this.dust.explode(6, x, y + 10);
    this.sfx.play('dig');
  }

  private floater(x: number, y: number, str: string, color: number, size: number, dy: number): void {
    const t = label(this, x, y, str, size, color, 0.5, 0.5).setDepth(10);
    this.tweens.add({
      targets: t,
      y: y + dy,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private buy(tryBuy: () => boolean): void {
    if (!canPlay()) return;
    this.settle();
    const ok = tryBuy();
    this.sfx.play(ok ? 'buy' : 'nope');
    if (ok) writeSave(this.s);
  }

  private buyTheCrown(): void {
    if (!canPlay()) return;
    this.settle();
    if (!buyCrown(this.s)) {
      this.sfx.play('nope');
      return;
    }
    const earned = grantAchievements();
    writeSave(this.s);
    const stage = this.s.crowns - 1;
    const crown = C.CROWNS[stage];
    const unlocked = C.GENS[C.BASE_TIERS + stage]?.name;
    // The first and the last crown get the full Victory screen; the ones in between a banner.
    if (stage === 0 || isWon(this.s)) {
      this.scene.start('Victory', {
        time: this.s.reignTime,
        total: this.s.total,
        clicks: this.s.clicks,
        stage,
        final: isWon(this.s),
        unlocked,
        achievements: earned,
      });
      return;
    }
    this.toasts.push(earned);
    this.sfx.play('fanfare');
    this.showBanner(
      crown.name.toUpperCase(),
      `production x${crown.mult}${unlocked ? `  -  ${unlocked} unlocked` : ''}`,
      COLOR.hazard,
      5000,
    );
  }

  private cycleQty(): void {
    this.qtyMode = (this.qtyMode + 1) % C.QTY_MODES.length;
    this.sfx.play('click');
  }

  private openReign(): void {
    if (!canPlay()) return;
    grantAchievements();
    this.save();
    this.scene.start('Reign');
  }

  private toggleMute(): void {
    toggleSound(this);
  }

  private get frenzyColor(): number {
    return activeDigMultiplier(run.frenzyMult, run.frenzyEndsAtMs, run.now()) === C.GOLD_FRENZY_MULT
      ? COLOR.goldBright
      : COLOR.chrome;
  }

  private spawnCache(): void {
    if (!canPlay() || this.cachePickup) return;
    const now = run.now();
    if (!Number.isFinite(now) || !Number.isFinite(now + C.CACHE_LIFE_S * 1000)) return;
    const kind = selectCacheKind(Math.random(), goldChance(this.s));
    const x = Math.random() < 0.5 ? rand(70, 190) : rand(MINE_W - 190, MINE_W - 60);
    const y = rand(300, 520);
    const c = fitImage(this.add.image(x, y, kind === 'gold' ? C.TEX.goldCache : C.TEX.cache), 96).setDepth(6);
    c.setInteractive({ useHandCursor: true, pixelPerfect: true });
    c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.collectCache());
    this.cacheLabel = label(
      this,
      x,
      y + 60,
      kind === 'gold' ? 'GOLD CACHE' : 'CHROME CACHE',
      13,
      kind === 'gold' ? COLOR.goldBright : COLOR.chrome,
      0.5,
      0.5,
    ).setDepth(6);
    this.tweens.add({
      targets: [c, this.cacheLabel],
      y: '-=12',
      duration: 700,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.cachePickup = c;
    this.cacheKind = kind;
    this.cacheLife = C.CACHE_LIFE_S;
    this.cacheExpiresAtMs = now + C.CACHE_LIFE_S * 1000;
    this.sfx.play('chime');
  }

  private removeCache(): void {
    if (this.cachePickup) this.tweens.killTweensOf(this.cachePickup);
    if (this.cacheLabel) this.tweens.killTweensOf(this.cacheLabel);
    this.cachePickup?.destroy();
    this.cacheLabel?.destroy();
    this.cachePickup = null;
    this.cacheLabel = null;
    this.cacheKind = null;
    this.cacheLife = 0;
    this.cacheExpiresAtMs = 0;
    this.cacheIn = rand(C.CACHE_MIN_S, C.CACHE_MAX_S);
  }

  private collectCache(): void {
    if (!canPlay()) return;
    this.settle();
    if (!this.cachePickup || !this.cacheKind) return;
    const reward = cacheReward(this.s, this.cacheKind, this.cacheKind === 'gold' ? 0 : Math.random());
    if (reward.kind === 'none') return;
    this.glints.explode(50, this.cachePickup.x, this.cachePickup.y);
    this.removeCache();
    this.sfx.play('cache');
    if (reward.kind === 'credits') {
      earn(this.s, reward.amount);
      this.s.stats.jackpots++;
      this.showBanner('CHROME JACKPOT!', `+${formatNum(reward.amount)} ${C.CURRENCY}`, COLOR.chrome);
    } else {
      const now = run.now();
      const old = activeDigMultiplier(run.frenzyMult, run.frenzyEndsAtMs, now);
      const effect = applyDigFrenzy(run.frenzyMult, run.frenzyEndsAtMs, reward.mult, now, frenzySeconds(this.s));
      run.frenzyMult = effect.mult;
      run.frenzyEndsAtMs = effect.endsAtMs;
      this.frenzyLeft = Math.max(0, (effect.endsAtMs - now) / 1000);
      const gold = effect.mult === C.GOLD_FRENZY_MULT;
      if (reward.mult === C.GOLD_FRENZY_MULT) this.s.stats.golds++;
      this.showBanner(
        old > reward.mult ? 'GOLD FRENZY CONTINUES!' : gold ? 'GOLD FRENZY!' : 'DIG FRENZY!',
        `digging x${effect.mult} for ${Math.ceil(this.frenzyLeft)}s`,
        this.frenzyColor,
      );
    }
  }

  private startStorm(): void {
    this.settle();
    run.stormEndsAtMs = run.now() + C.STORM_DURATION_S * 1000;
    this.stormLeft = C.STORM_DURATION_S;
    this.s.stats.storms++;
    this.streaks.start();
    this.sand.start();
    this.tweens.add({ targets: this.stormOverlay, fillAlpha: 0.3, duration: 1200 });
    this.cameras.main.shake(600, 0.004);
    this.sfx.play('storm');
    this.showBanner('DUST STORM!', `turbines overcharged: production x${stormMult(this.s)}`, COLOR.storm, 3500);
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
    if (!canPlay()) return;
    this.settle();
    const ps = this.ps;

    // The crew at work: a puff + tally from the deposit once a second.
    this.tickAcc += dt;
    if (this.tickAcc >= 1) {
      this.tickAcc -= 1;
      this.toasts.push(grantAchievements());
      if (ps > 0) {
        this.floater(DEP.x + rand(-60, 60), DEP.y - DEP.size * 0.2, `+${formatNum(ps)}`, COLOR.sand, 20, -70);
        this.dust.explode(5, DEP.x + rand(-60, 60), DEP.y + DEP.size * 0.2);
      }
    }

    if (this.stormLeft === 0) {
      this.stormIn -= dt;
      if (this.stormIn <= 0) this.startStorm();
    }

    if (this.cachePickup) {
      this.cachePickup.setAlpha(this.cacheLife < 3 && Math.sin(this.time.now / 50) < 0 ? 0.35 : 1);
    } else {
      this.cacheIn -= dt;
      if (this.cacheIn <= 0) this.spawnCache();
    }

    if (this.frenzyGlow.fillColor !== this.frenzyColor) this.frenzyGlow.setFillStyle(this.frenzyColor, 0.15);
    this.frenzyGlow.setVisible(this.frenzyLeft > 0).setAlpha(0.5 + 0.5 * Math.sin(this.time.now / 80));
    this.refreshHud(ps);
    this.refreshCrew();
    this.refreshShop();
  }

  private refreshHud(ps: number): void {
    const storm = this.stormLeft > 0;
    updateLabel(this.scrapText, formatNum(this.s.scrap));
    updateLabel(
      this.psText,
      `+${formatNum(ps)} ${C.RATE_LABEL}${storm ? `  STORM x${stormMult(this.s)} ${Math.ceil(this.stormLeft)}s` : ''}`,
      storm ? COLOR.storm : COLOR.text,
    );
    const mult = activeDigMultiplier(run.frenzyMult, run.frenzyEndsAtMs, run.now());
    updateLabel(
      this.digText,
      `DIG +${formatNum(this.digPower)}${mult > 1 ? `  FRENZY x${mult} ${Math.ceil(this.frenzyLeft)}s` : ''}`,
      mult > 1 ? this.frenzyColor : COLOR.sand,
    );
    updateLabel(this.muteText, run.settings.soundEnabled ? 'SOUND:ON' : 'SOUND:OFF');
    const s = this.s;
    const ascendable = canAscend(s);
    const reignOpen = ascendable || s.reigns > 0 || s.shards > 0;
    this.reignBtn.g.setVisible(reignOpen);
    this.reignBtn.text.setVisible(reignOpen);
    if (this.reignBtn.zone.input) this.reignBtn.zone.input.enabled = reignOpen;
    updateLabel(this.reignBtn.text, ascendable ? `REIGN  +${shardsForReign(s.reignTotal)}` : 'RELICS');
    this.shardText.setVisible(s.shardsEarned > 0);
    updateLabel(this.shardText, `${formatNum(s.shards)} shards  +${Math.round((shardMult(s) - 1) * 100)}% output`);
    const q = C.QTY_MODES[this.qtyMode];
    updateLabel(this.qtyText, q < 0 ? 'BUY MAX' : `BUY x${q}`);
    // The tutorial hint sits where banners appear; give way while one is showing.
    this.hintText.setVisible(this.s.clicks < 8 && this.banner.alpha < 0.05);
  }

  /** Every generator type you own, bobbing at work in a row under the deposit. */
  private refreshCrew(): void {
    const owned = C.GENS.map((_, i) => this.s.owned[i] ?? 0);
    const sig = owned.join(',');
    if (sig === this.crewSig) return;
    this.crewSig = sig;
    this.crew.each((child: Phaser.GameObjects.GameObject) => this.tweens.killTweensOf(child));
    this.crew.removeAll(true);
    const types = owned.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    if (types.length === 0) return;
    const gap = Math.min(78, Math.floor((MINE_W - 40) / types.length)),
      icon = Math.min(64, gap - 4),
      y = DEP.y + DEP.size * 0.5 + 72;
    const g = this.add.graphics();
    drawPlate(
      g,
      DEP.x - (types.length * gap) / 2 - 10,
      y - icon / 2 - 12,
      types.length * gap + 20,
      icon + 46,
      COLOR.rustDark,
      COLOR.chromeDim,
      0.7,
      2,
    );
    this.crew.add(g);
    types.forEach((i, k) => {
      const x = DEP.x - ((types.length - 1) * gap) / 2 + k * gap;
      const img = fitImage(this.add.image(x, y, C.GENS[i].key), icon);
      this.tweens.add({
        targets: img,
        y: y - 4,
        duration: 180 + i * 20,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: k * 90,
      });
      this.crew.add([img, label(this, x, y + icon / 2 + 2, `x${owned[i]}`, 16, COLOR.text, 0.5, 0)]);
    });
  }

  private refreshShop(): void {
    const s = this.s;
    const pc = pickCost(s.pick);
    this.pickRow.set({
      title: `FORGE PICK  LV${s.pick}`,
      sub: 'dig x2, +1% of Credits/s per level',
      cost: formatNum(pc),
      affordable: s.scrap >= pc,
    });

    const q = C.QTY_MODES[this.qtyMode];
    this.shopTiers = shopWindow(s, C.BASE_TIERS);
    this.genRows.forEach((row, k) => {
      const i = this.shopTiers[k];
      if (i === undefined) return;
      const g = C.GENS[i];
      row.setIcon(g.key);
      const owned = s.owned[i] ?? 0;
      const qty = q < 0 ? Math.max(1, maxAffordable(i, owned, s.scrap)) : q;
      const cost = genCost(i, owned, qty);
      const revealed = isRevealed(s, i);
      const nm = nextMilestone(owned);
      const sub =
        owned > 0
          ? `x${owned}   +${formatNum(genOutput(s, i))} Credits/s${nm ? `   2x at ${nm}` : ''}`
          : `${g.blurb}  (+${formatNum(g.rate * productionMult(s))} Credits/s)`;
      row.set({
        title: revealed ? `${g.name}${qty > 1 ? ` x${qty}` : ''}` : '??????',
        sub: revealed ? sub : 'keep digging to discover',
        cost: formatNum(cost),
        affordable: revealed && s.scrap >= cost,
        locked: !revealed,
      });
    });

    const crown = nextCrown(s);
    this.crownRow.setIcon((crown ?? C.CROWNS[C.CROWNS.length - 1]).key);
    this.crownRow.set(
      crown
        ? {
            title: crown.name.toUpperCase(),
            sub: '',
            cost: formatNum(crown.cost),
            affordable: s.scrap >= crown.cost,
            progress: Math.min(1, s.scrap / crown.cost),
          }
        : {
            title: `${C.CROWNS[C.CROWNS.length - 1].name.toUpperCase()} - CLAIMED`,
            sub: '',
            cost: '',
            affordable: false,
            done: true,
          },
    );
  }
}
