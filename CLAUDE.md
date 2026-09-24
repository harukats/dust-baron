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
- `cargo fmt --manifest-path src-tauri/Cargo.toml` — format the Rust side (2-space indent via `src-tauri/rustfmt.toml`)

## Architecture

**Pure core vs. Phaser shell.** `src/config.ts`, `src/economy.ts` and `src/storage.ts` must not import Phaser or touch the DOM at module load. `pnpm test` runs them directly under Node, so importing Phaser there would break the tests. All tuning numbers (costs, rates, event timings, colours, asset keys) live in `config.ts`. All game rules (costs, production, milestones, save parsing, number formatting) live in `economy.ts` as pure functions over a `State` object.

**Imports use explicit `.ts` extensions** (`allowImportingTsExtensions` + `erasableSyntaxOnly`). This is what lets Node strip types and run the tests without a build. Keep it: no enums, namespaces or constructor parameter properties.

**Run state outlives scenes.** The live `State` is held in `run.state` (module-level, `storage.ts`), not on a scene. `Game.create()` loads the save (adding offline earnings) only when `run.state` is null. Title → Game → Victory → Game keeps the same run.

**Phaser reuses scene instances on restart.** Class field initialisers do not run again, so `Game.create()` resets every per-run field by hand. Also never name a scene field after a built-in `Phaser.Scene` property. `cache` is the known trap: it shadows the CacheManager, which is why the chrome-cache pickup field is called `chromeCache`.

**Scene flow:** `Boot` (generates the `spark`/`streak` textures) → `Preloader` (loads `public/assets/`, then switches the pixel-art textures listed in `PIXEL_TEXTURES` to NEAREST filtering) → `Title` → `Game` → `Victory`. The game renders at a fixed 1280×720 and scales with `Scale.FIT`. Global `pixelArt` is off on purpose, so text and particles stay smooth while the sprites stay crisp.

**UI is built from Graphics + Text, not Phaser widgets.** `ui.ts` has `drawPlate`/`label`/`plateButton`. `ShopRow.ts` wraps one shop row and redraws only when its view signature changes. `Game.update()` pushes fresh views into it every frame, so keep `set()` cheap.

**SFX are synthesised** in `sfx.ts` (Phaser 4 has no synth). They are routed into the Phaser sound manager's `destination` node, so `this.sound.mute` and the master volume apply to them. The music is a real file (`music.mp3`), started once from Title and looked up with `this.sound.get(MUSIC)` to avoid playing it twice.

**Dev hook:** in dev builds `window.game` exposes the `Phaser.Game`. Automated browser checks use it to reach scenes, e.g. `game.scene.getScene('Game').s` is the live `State`.

**Desktop shell (Tauri 2).** `src-tauri/` wraps the unchanged web build. `tauri dev` runs `pnpm dev` and loads `http://localhost:8080` (hence `strictPort`), and `tauri build` runs `pnpm build` and bundles `dist/`. `vite.config.ts` checks `TAURI_ENV_PLATFORM` so it doesn't also open a browser tab. The game uses no Tauri APIs, so `capabilities/default.json` only grants `core:default`. The app icon is the helmet emblem from the title logo: the `logo.png` crop at x 262–378, y 0–120. It sits on a rounded dark plate (`#1a0f0a` with a `#d9822b` border), so it stays legible at 16px. `src-tauri/app-icon.png` is the 1024px master (emblem scaled nearest, about 86% of the width), and `pnpm tauri icon src-tauri/app-icon.png` generates `src-tauri/icons/` from it. Delete the `android/` and `ios/` folders it also creates. The web favicons in `public/` use the same design: `favicon.ico` bundles the 16/32/48px PNGs from Tauri's `icons/icon.ico`. `apple-touch-icon.png` (180px) is a full-bleed square with no rounded corners or border, because iOS applies its own mask. If the logo changes, regenerate all three. The dev WSL box has Rust from mise (global config, not pinned in this repo), so `cargo fmt` and Cargo.lock updates work locally. It lacks the Linux webview system libraries (webkit2gtk-4.1, libdbus and others; installing them needs sudo). As a result `cargo check`, `tauri dev` and `tauri build` fail there in the `*-sys` build scripts. Desktop builds are verified by the `Release` workflow in `.github/workflows/release.yml`, which is manual or runs on `v*` tags. `src-tauri/Cargo.lock` is committed and the workflow builds with `--locked`, so update the lockfile along with any `Cargo.toml` change. A `v*` tag must equal `v` + the `package.json` version (checked before building), and after all three bundles succeed the `release` job publishes them to GitHub Releases. Hyphenated tags become pre-releases. Windows ships both installers on purpose. The NSIS `setup.exe` is pinned to `installMode: currentUser`, so it installs into `%LOCALAPPDATA%` without UAC. The `.msi` is for system-wide installs: Tauri's WiX template hard-codes `InstallScope="perMachine"`, so it always goes to Program Files and needs admin rights.

**Releases and GitHub Pages.** The web build is hosted at https://harukats.github.io/dust-baron/. It works under that sub-path because of `base: './'` and the relative `load.setPath('assets')`, so keep asset URLs relative. Pages is only updated by `release.yml`, never on a plain push to main, so the web and desktop versions ship together. On a `v*` tag, `pages-build`/`pages-deploy` run after `bundle` and `release` succeed; hyphenated pre-release tags skip Pages. A manual run with `pages_tag=vX.Y.Z` skips the bundles and redeploys Pages from that tag's source. The `github-pages` environment allows deployments from `main` and from `v*` tags. That tag rule was added by hand through the API, and without it tag-triggered deploys are rejected.

**Repository rules.** GitHub rulesets protect `main` and the `v*` tags, with no bypass actors. On `main`, every change goes through a PR. The `lint` and `test` checks must pass, history stays linear (rebase or squash merge, no merge commits), and force pushes and deletion are blocked. PRs need 0 approvals, so a solo maintainer can merge. A `v*` tag cannot be deleted or moved once pushed, so a release is fixed to its commit; to fix a bad release, cut the next version. Because of this, bump the `version` on a branch, merge it, then tag `main`.

**Dependabot.** Vulnerability alerts, Dependabot security updates and "Allow auto-merge" are enabled in the repo settings (via the API, not in any file). `.github/dependabot.yml` adds weekly version updates for npm (covers pnpm), Cargo (`src-tauri/`) and GitHub Actions, with minor/patch bumps grouped into one PR per ecosystem and a 3-day cooldown on fresh releases (security updates skip it). `dependabot-auto-merge.yml` turns on squash auto-merge for Dependabot's non-major npm and Actions PRs, so they merge once `lint` and `test` pass. Majors and all Cargo PRs stay manual, because CI never compiles the Rust side; check those with a manual `Release` run before merging. Merges done with `GITHUB_TOKEN` don't trigger other workflows, which is fine since nothing deploys on a push to main.

## Phaser 4 notes

Phaser's own agent skills are linked into `.claude/skills/phaser-*`. They are symlinks into `node_modules`, so run `pnpm install` first. Check them (especially `phaser-v3-to-v4-migration`) before assuming a Phaser 3 API still exists. Examples of removed APIs: `setTintFill` (use `setTint(c).setTintMode(Phaser.TintModes.FILL)`), `Geom.Point` (use `Vector2`), and FX/BitmapMask (replaced by Filters).

## Conventions

- Biome config: 2-space indent, single quotes, 120 columns. `noUncheckedIndexedAccess` is off, so array indexing doesn't need `!`.
- Game art and audio are local files in `public/assets/`, loaded by key.
