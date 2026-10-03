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
  goldCache: 'gold-cache',
  pick: 'forge-pick',
  spark: 'spark', // generated in Boot
  streak: 'streak', // generated in Boot
} as const;
export const MUSIC = 'music';

/** Pixel-art textures that should be sampled NEAREST (text/particles stay smooth). */
export const PIXEL_TEXTURES: readonly string[] = [
  'background',
  'logo',
  'deposit',
  'chrome-cache',
  'gold-cache',
  'forge-pick',
  'scavenger',
  'dune-miner',
  'rust-drill',
  'sandcrawler',
  'salvage-yard',
  'storm-refinery',
  'hover-hauler',
  'dune-leviathan',
  'sky-dredger',
  'orbital-scrapper',
  'crown-1',
  'crown-2',
  'crown-3',
  'crown-4',
  'crown-5',
];

// ── ECONOMY ─────────────────────────────────────────────────────────────────
export interface GenDef {
  key: string;
  name: string;
  blurb: string;
  baseCost: number;
  rate: number;
}
export const GENS: readonly GenDef[] = [
  { key: 'scavenger', name: 'SCAVENGER', blurb: 'Picks the dunes clean', baseCost: 15, rate: 0.5 },
  { key: 'dune-miner', name: 'DUNE MINER', blurb: 'Jackhammer, gas mask, no fear', baseCost: 120, rate: 4 },
  { key: 'rust-drill', name: 'RUST DRILL', blurb: 'Oil-drum rig, mostly safe', baseCost: 1_300, rate: 25 },
  { key: 'sandcrawler', name: 'SANDCRAWLER', blurb: 'Scoops whole wrecks', baseCost: 14_000, rate: 150 },
  { key: 'salvage-yard', name: 'SALVAGE YARD', blurb: 'A mountain of good junk', baseCost: 160_000, rate: 1_000 },
  {
    key: 'storm-refinery',
    name: 'STORM REFINERY',
    blurb: 'Turns dust storms to scrap',
    baseCost: 2_000_000,
    rate: 8_000,
  },
  // Tiers 7+ are unlocked by the crowns (see CROWNS).
  { key: 'hover-hauler', name: 'HOVER HAULER', blurb: 'Skims the dunes at speed', baseCost: 30_000_000, rate: 60_000 },
  {
    key: 'dune-leviathan',
    name: 'DUNE LEVIATHAN',
    blurb: 'Swallows whole ridges',
    baseCost: 400_000_000,
    rate: 480_000,
  },
  {
    key: 'sky-dredger',
    name: 'SKY DREDGER',
    blurb: 'Fishes junk out of the clouds',
    baseCost: 6_000_000_000,
    rate: 4_000_000,
  },
  {
    key: 'orbital-scrapper',
    name: 'ORBITAL SCRAPPER',
    blurb: 'Strips the old satellites',
    baseCost: 90_000_000_000,
    rate: 35_000_000,
  },
];
export const BASE_TIERS = 6; // generators available from the start; tier i >= 6 needs i - 5 crowns
export const COST_GROWTH = 1.15; // each copy costs 15% more
export const MILESTONES: readonly number[] = [25, 50, 100, 200, 300, 400, 500]; // each doubles that tier
export const PICK_BASE_COST = 50; // Forge Pick upgrade
export const PICK_COST_GROWTH = 8;
export const CLICK_PS_FRAC = 0.01; // each pick level adds 1% of scrap/s to a dig
export interface CrownDef {
  name: string;
  key: string; // icon texture (public/assets/<key>.png)
  cost: number;
  mult: number; // permanent multiplier on all production
}
/** The crown chain: buy them in order. Each multiplies production; crowns 1–4 also unlock the next tier; the last one ends the game. */
export const CROWNS: readonly CrownDef[] = [
  { name: 'Dust Crown', key: 'crown-1', cost: 250_000_000, mult: 2 },
  { name: 'Sandstorm Throne', key: 'crown-2', cost: 2_500_000_000, mult: 2 },
  { name: 'Wasteland Citadel', key: 'crown-3', cost: 40_000_000_000, mult: 2 },
  { name: 'Orbital Scrapyard', key: 'crown-4', cost: 700_000_000_000, mult: 2 },
  { name: 'Crown of Ages', key: 'crown-5', cost: 30_000_000_000_000, mult: 2 },
];
export const QTY_MODES: readonly number[] = [1, 10, -1]; // -1 = MAX

// ── EVENTS ──────────────────────────────────────────────────────────────────
export const STORM_MIN_S = 70;
export const STORM_MAX_S = 110;
export const STORM_DURATION_S = 15;
export const STORM_MULT = 2;
export const CACHE_MIN_S = 35;
export const CACHE_MAX_S = 70;
export const CACHE_LIFE_S = 10;
export const CACHE_JACKPOT_S = 60; // jackpot = 60 s of production…
export const CACHE_JACKPOT_CLICKS = 30; // …or 30 digs, whichever is bigger
export const FRENZY_S = 20;
export const FRENZY_MULT = 7;
export const GOLD_CACHE_CHANCE = 0.1;
export const GOLD_FRENZY_MULT = 777;

// ── SAVE ────────────────────────────────────────────────────────────────────
export const SAVE_KEY = 'dust-baron-save-v1';
export const SETTINGS_KEY = 'dust-baron-settings-v1';
export const DEFAULT_SOUND_ENABLED = true;
export const PLAY_LOCK = `${SAVE_KEY}:play`;
export const CURRENCY = 'Credits';
export const RATE_LABEL = 'Credits/s';
export const SESSION_UI = {
  blockedTitle: 'GAME ALREADY OPEN',
  blockedBody:
    'This save is already in use in another tab or window. Close the other game, then reload this page to continue.',
  temporaryTitle: 'TEMPORARY PLAY — NOT SAVED',
  temporaryBody: 'Saving is unavailable. You can play, but progress will be lost when you reload or close this page.',
} as const;
export const AUTOSAVE_MS = 5000;
export const OFFLINE_MIN_S = 30;
export const OFFLINE_CAP_S = 2 * 60 * 60;
export const OFFLINE_RATE = 0.5;

// ── FEEL ────────────────────────────────────────────────────────────────────
export const MUSIC_VOLUME = 0.45;

export const COLOR = {
  rust: 0xc4622d,
  rustDark: 0x3a2016,
  rustMid: 0x5a3220,
  panel: 0x24140e,
  sand: 0xe8c690,
  chrome: 0xb8c4cc,
  chromeDim: 0x6d7b82,
  hazard: 0xf2c230,
  text: 0xf3e1c0,
  sub: 0xc9a57a,
  dim: 0x7d6a58,
  storm: 0xd9a05b,
  shadow: 0x120a08,
  danger: 0xe0432f,
  win: 0x2c3a2a,
  gold: 0x3b2a10,
  goldRim: 0x9a7a2a,
  goldBright: 0xffd45c,
} as const;

export const TITLE_VERSION_UI = {
  rightMargin: 20,
  bottomMargin: 16,
  fontSize: 16,
  color: COLOR.sub,
  maxWidth: 480,
} as const;
