# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dust Baron: a post-apocalyptic desert idle/incremental miner built with Phaser 4 (4.2.x), Vite 8 and TypeScript 7. Package manager is pnpm (pinned via `packageManager`).

## Commands

- `pnpm dev` — Vite dev server on http://localhost:8080 (HMR; the old `Phaser.Game` is destroyed on reload)
- `pnpm build` — typecheck → tests → `vite build` into `dist/` (tests gate the build)
- `pnpm test` — economy tests via Node's built-in `node:test`, running the `.ts` files directly (no test framework, no transpile step)
- Single test: `node --test --test-name-pattern="costs" src/economy.test.ts`
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — Biome check (format + lint + import order), read-only; `pnpm lint:fix` applies safe fixes
- `pnpm tauri dev` / `pnpm tauri build` — desktop app via Tauri 2 (needs Rust + OS webview deps; see below)

## Architecture

**Pure core vs. Phaser shell.** `src/config.ts`, `src/economy.ts` and `src/storage.ts` must not import Phaser or touch the DOM at module load. `pnpm test` runs them directly under Node, so importing Phaser there would break the tests. All tuning numbers (costs, rates, event timings, colours, asset keys) live in `config.ts`. All game rules (costs, production, milestones, save parsing, number formatting) live in `economy.ts` as pure functions over a `State` object.

**Imports use explicit `.ts` extensions** (`allowImportingTsExtensions` + `erasableSyntaxOnly`). This is what lets Node strip types and run the tests without a build. Keep it: no enums, namespaces or constructor parameter properties.

**Run state outlives scenes.** The live `State` is held in `run.state` (module-level, `storage.ts`), not on a scene. `Game.create()` loads the save (adding offline earnings) only when `run.state` is null. Title → Game → Victory → Game keeps the same run.

**Phaser reuses scene instances on restart.** Class field initialisers do not run again, so `Game.create()` resets every per-run field by hand. Also never name a scene field after a built-in `Phaser.Scene` property. `cache` is the known trap: it shadows the CacheManager, which is why the chrome-cache pickup field is called `chromeCache`.

**Scene flow:** `Boot` (generates the `spark`/`streak` textures) → `Preloader` (loads `public/assets/`, then switches the pixel-art textures listed in `PIXEL_TEXTURES` to NEAREST filtering) → `Title` → `Game` → `Victory`. The game renders at a fixed 1280×720 and scales with `Scale.FIT`. Global `pixelArt` is off on purpose, so text and particles stay smooth while the sprites stay crisp.

**UI is built from Graphics + Text, not Phaser widgets.** `ui.ts` has `drawPlate`/`label`/`plateButton`. `ShopRow.ts` wraps one shop row and redraws only when its view signature changes. `Game.update()` pushes fresh views into it every frame, so keep `set()` cheap.

**SFX are synthesised** in `sfx.ts` (Phaser 4 has no synth). They are routed into the Phaser sound manager's `destination` node, so `this.sound.mute` and the master volume apply to them. The music is a real file (`music.mp3`), started once from Title and looked up with `this.sound.get(MUSIC)` to avoid playing it twice.

**Dev hook:** in dev builds `window.game` exposes the `Phaser.Game`. Automated browser checks use it to reach scenes, e.g. `game.scene.getScene('Game').s` is the live `State`.

**Desktop shell (Tauri 2).** `src-tauri/` wraps the unchanged web build. `tauri dev` runs `pnpm dev` and loads `http://localhost:8080` (hence `strictPort`), and `tauri build` runs `pnpm build` and bundles `dist/`. `vite.config.ts` checks `TAURI_ENV_PLATFORM` so it doesn't also open a browser tab. The game uses no Tauri APIs, so `capabilities/default.json` only grants `core:default`. Icons in `src-tauri/icons/` are generated from `src-tauri/app-icon.png` (the Rust Drill sprite, padded and scaled 8× nearest) with `pnpm tauri icon src-tauri/app-icon.png`. This WSL box has no Rust and no webkit2gtk, so desktop builds are verified by the `Desktop` workflow in `.github/workflows/desktop.yml`, which is manual or runs on `v*` tags.

## Phaser 4 notes

Phaser's own agent skills are linked into `.claude/skills/phaser-*`. They are symlinks into `node_modules`, so run `pnpm install` first. Check them (especially `phaser-v3-to-v4-migration`) before assuming a Phaser 3 API still exists. Examples of removed APIs: `setTintFill` (use `setTint(c).setTintMode(Phaser.TintModes.FILL)`), `Geom.Point` (use `Vector2`), and FX/BitmapMask (replaced by Filters).

## Conventions

- Biome config: 2-space indent, single quotes, 120 columns. `noUncheckedIndexedAccess` is off, so array indexing doesn't need `!`.
- Game art and audio are local files in `public/assets/`, loaded by key.
