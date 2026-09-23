// Tuning, asset keys and palette. Pure data — no Phaser import — so the
// economy tests can load it under plain Node.

export const WIDTH = 1280;
export const HEIGHT = 720;

// ── ASSETS (files in public/assets/) ────────────────────────────────────────
export const TEX = {
  background: 'background',
  logo: 'logo',
  deposit: 'deposit',
  cache: 'chrome-cache',
  pick: 'forge-pick',
  spark: 'spark',   // generated in Boot
  streak: 'streak', // generated in Boot
} as const;
export const MUSIC = 'music';

/** Pixel-art textures that should be sampled NEAREST (text/particles stay smooth). */
export const PIXEL_TEXTURES: readonly string[] = [
  'background', 'logo', 'deposit', 'chrome-cache', 'forge-pick',
  'scavenger', 'dune-miner', 'rust-drill', 'sandcrawler', 'salvage-yard', 'storm-refinery',
];

// ── ECONOMY ─────────────────────────────────────────────────────────────────
export interface GenDef { key: string; name: string; blurb: string; baseCost: number; rate: number }
export const GENS: readonly GenDef[] = [
  { key: 'scavenger', name: 'SCAVENGER', blurb: 'Picks the dunes clean', baseCost: 15, rate: 0.5 },
  { key: 'dune-miner', name: 'DUNE MINER', blurb: 'Jackhammer, gas mask, no fear', baseCost: 120, rate: 4 },
  { key: 'rust-drill', name: 'RUST DRILL', blurb: 'Oil-drum rig, mostly safe', baseCost: 1_300, rate: 25 },
  { key: 'sandcrawler', name: 'SANDCRAWLER', blurb: 'Scoops whole wrecks', baseCost: 14_000, rate: 150 },
  { key: 'salvage-yard', name: 'SALVAGE YARD', blurb: 'A mountain of good junk', baseCost: 160_000, rate: 1_000 },
  { key: 'storm-refinery', name: 'STORM REFINERY', blurb: 'Turns dust storms to scrap', baseCost: 2_000_000, rate: 8_000 },
];
export const COST_GROWTH = 1.15;               // each copy costs 15% more
export const MILESTONES: readonly number[] = [25, 50, 100, 200, 300, 400, 500]; // each doubles that tier
export const PICK_BASE_COST = 50;              // Forge Pick upgrade
export const PICK_COST_GROWTH = 8;
export const CLICK_PS_FRAC = 0.01;             // each pick level adds 1% of scrap/s to a dig
export const CROWN_COST = 250_000_000;         // the Dust Crown — the win purchase
export const QTY_MODES: readonly number[] = [1, 10, -1]; // -1 = MAX

// ── EVENTS ──────────────────────────────────────────────────────────────────
export const STORM_MIN_S = 70;
export const STORM_MAX_S = 110;
export const STORM_DURATION_S = 15;
export const STORM_MULT = 2;
export const CACHE_MIN_S = 35;
export const CACHE_MAX_S = 70;
export const CACHE_LIFE_S = 10;
export const CACHE_JACKPOT_S = 60;             // jackpot = 60 s of production…
export const CACHE_JACKPOT_CLICKS = 30;        // …or 30 digs, whichever is bigger
export const FRENZY_S = 20;
export const FRENZY_MULT = 7;

// ── SAVE ────────────────────────────────────────────────────────────────────
export const SAVE_KEY = 'dust-baron-save-v1';
export const AUTOSAVE_MS = 5000;
export const OFFLINE_MIN_S = 30;
export const OFFLINE_CAP_S = 2 * 60 * 60;
export const OFFLINE_RATE = 0.5;

// ── FEEL ────────────────────────────────────────────────────────────────────
export const MUSIC_VOLUME = 0.45;

export const COLOR = {
  rust: 0xc4622d, rustDark: 0x3a2016, rustMid: 0x5a3220, panel: 0x24140e,
  sand: 0xe8c690, chrome: 0xb8c4cc, chromeDim: 0x6d7b82, hazard: 0xf2c230,
  text: 0xf3e1c0, sub: 0xc9a57a, dim: 0x7d6a58, storm: 0xd9a05b, shadow: 0x120a08,
  danger: 0xe0432f, win: 0x2c3a2a, gold: 0x3b2a10, goldRim: 0x9a7a2a,
} as const;
