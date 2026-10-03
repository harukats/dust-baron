# Implementation Plan: ゴールド・キャッシュによる採掘777倍

**Branch**: `main`（現在の Git ブランチ。セットアップが返した機能識別名は `004-add-gold-cache`） | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Input**: `specs/004-add-gold-cache/spec.md`。専用スプライト生成には Phaser Game Agent または関連スキルを使用するというユーザー指定を含む。

## Summary

既存キャッシュの出現機会で10%をゴールドにし、回収時に20秒間の手動採掘777倍を付与する。専用透過PNGは `imagegen` スキルの組み込み画像生成ツールで新規生成し、ローカルの `public/assets/gold-cache.png` に保存する。クロームと異なる絵柄を用意し、種類ラベル・倍率・残り時間で識別可能にする。

種類抽選、報酬算定、倍率の競合・期限判定は純粋関数へ集約する。シーンは入力と表示を担当し、一時倍率は `run` で管理する。保存形式と自動生産は変更しない。計画は Phase 1 設計で終了し、画像生成とコード変更は後続の実装タスクで実行する。

## Technical Context

**Language/Version**: TypeScript `^7.0.2`、明示的な `.ts` import、erasable TypeScript。

**Primary Dependencies**: Phaser `^4.2.1`、Vite `^8.3.1`、pnpm `12.5.1`。新規依存は不要。

**Storage**: 既存 localStorage セーブ `dust-baron-save-v1` と音声設定。倍率と終了時刻はライブ `run` のみで保持する。

**Testing**: Vitest `^5.0.2`、Playwright `^1.63.0`、Biome `2.5.14`。既存のブラウザ・性能検証基盤を拡張する。

**Target Platform**: ブラウザと共通Webビルドを包むTauri 2。論理画面1280×720、Scale.FIT、相対アセットURL。

**Project Type**: ローカルアセットを同梱するアイドル採掘ゲーム。

**Performance Goals**: 通常プレイ60 FPSを目標とする。具体的な測定・退行基準は後述。

**Constraints**: 画面上のキャッシュは最大1個、初回17.5〜35秒・以後35〜70秒、寿命10秒。777倍は手動採掘だけ。専用アセットは色変更のみでは不可。文字・粒子の平滑化とピクセル画像のNEARESTを両立する。

**Scale/Scope**: キャッシュ1種類、PNG1枚、一時倍率1個を追加する。出現・報酬・採掘・HUD・保存初期化と関連テストを変更する。配布設定、Rust、セーブ形式、実績、商品は対象外。

## Constitution Check

*Phase 0 前と Phase 1 後に再評価。以下は設計上の合格であり、実装検証済みという意味ではない。*

| 原則 | 設計の適合 | 判定 |
|---|---|---|
| I 日本語の仕様・意思決定 | 設計文書は日本語。既存ゲーム内英語表記は維持 | 合格 |
| II 純粋なコア | 調整値はconfig、抽選・報酬・倍率はeconomy、ライブ状態はstorage、入力表示はGame | 合格 |
| III リスクに応じた検証 | 境界・競合のVitest、入力・アセット・音声・再起動のPlaywright、ビルドを計画 | 合格 |
| IV 進行保護・一貫性 | run.state継続、セーブ互換、共有dig経路、音声出力、FITと相対URLを維持 | 合格 |
| V 性能・ライフサイクル | 測定条件・合格基準を事前定義。再利用時の全フィールド初期化と破棄を設計 | 合格 |

初期調査と研究で例外を要する違反なし。Phase 1 の状態モデル・UI契約・アセット契約を再確認しても違反なし。未知事項は [research.md](research.md) で解消済み。

## Project Structure

### Documentation (this feature)

```text
specs/004-add-gold-cache/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cache-and-mining.md
│   └── gold-cache-asset.md
└── checklists/requirements.md
```

`tasks.md` は後続の `$speckit-tasks` で生成する。

### Source Code (repository root)

```text
public/assets/gold-cache.png             # 実装時に新規生成
src/config.ts                           # goldキー・確率・倍率・色
src/economy.ts                          # 純粋な抽選・報酬・倍率規則
src/economy.test.ts                      # 経済・倍率テスト
src/storage.ts                          # runの倍率と初期化
src/storage.test.ts                      # 初期化・セーブ互換性
src/scenes/Preloader.ts                  # PNG読み込みとNEAREST
src/scenes/Game.ts                       # 出現・回収・HUD・解除
tests/e2e/gold-cache.spec.ts             # 実装時に追加
tests/e2e/helpers.ts                     # 必要なテスト用型
tests/e2e/ui-check.ts                    # 旧7倍fixtureの調整
tests/e2e/runtime-check.ts               # 旧7倍fixtureの調整
tests/e2e/performance-probe.ts           # ゴールド条件の測定を追加
```

**Structure Decision**: 既存の純粋コアとシーンの責務を拡張し、新しいレイヤーや外部APIは追加しない。`src/session.ts` の所有権・Web Locksは既存の `canPlay()` を利用する。

## 実装設計

1. `config.ts` に `TEX.goldCache`、`PIXEL_TEXTURES` のgoldキー、選択確率0.1、倍率777、必要な明るい金色を追加する。既存 `FRENZY_S=20` は共有する。
2. `economy.ts` にキャッシュ種類、報酬種別と算定、現在倍率、倍率取得時の遷移、最終採掘量の純粋関数を定義する。詳細は [data-model.md](data-model.md)。ランダム値・現在時刻は引数で渡す。
3. `storage.ts` の `run` に `frenzyMult` を追加し、既存 `frenzyEndsAtMs` と対で初期化する。`Game.create()` でも明示的に解除する。終了時刻のみでは有効か判別できないため、旧ブラウザ検証fixtureにも7倍の設定を追加する。
4. `Game.ts` の `chromeCache` を `cachePickup` に一般化し、`cacheKind` と `cacheLabel` を追加する。Scene組み込みの `cache` は使わない。出現時に1回抽選し、その種類を画像・ラベル・回収に共有する。
5. 回収時は `canPlay()` と `settle()` の期限確認を通し、種類を取り出して画像・ラベル・Tweenを破棄してから報酬を1回付与する。クロームの即時報酬は倍率なしの従来式を維持する。不正な種類抽選値はchrome、不正なchrome報酬抽選値は報酬なしとして資源・倍率・期限を維持する。goldでは報酬抽選を行わない。
6. `digPower` とHUDは同じ純粋倍率関数を使う。マウスとSPACEの既存 `dig()` を共有する。777倍中に7倍を得ても、7倍開始という誤った通知は表示しない。
7. 画像生成は [アセット契約](contracts/gold-cache-asset.md) に従う。Preloaderで先に読み込み、96pxの既存枠で表示する。静止画は `Image` とし、既存の上下Tweenを再利用する。スプライトという要望は専用画像アセットとして満たし、フレームアニメーションは追加しない。

## 性能の測定と合格基準

- 変更前に現在のcommit・作業差分・OS・CPU・Chromium版・GPU・DPRを記録し、同じ機器・headed Chromium・1280×720・DPR1で変更後と比較する。
- 状態は全設備25台ずつ、pick3。10秒ウォームアップ後60秒測定を各3回。通常条件と砂嵐・既存7倍・2回/秒の採掘を同時に行う条件を変更前後で測る。変更後は同負荷の777倍条件も測る。
- 負荷条件ではウォームアップ開始時に砂嵐と採掘効果を付与し、砂嵐を15秒ごと、採掘効果を20秒ごとに再付与する。周期は測定開始時に再同期し、測定中も維持する。DEVの試験制御を使い、ゲーム本来の出現待ち時間には依存しない。変更前後で再付与の操作回数・タイミングと採掘頻度を揃え、背景のランダム出現を抑える。通常条件は砂嵐・採掘効果なしとする。
- 比較対象は、変更後通常→変更前通常、変更後7倍→変更前7倍、変更後777倍→変更前7倍とする。画像・ラベル・回収演出の追加条件は、変更前後とも測定開始から10秒周期で出現させて5秒後に回収する。変更前と変更後chromeで同じクローム7倍報酬を固定し、変更後goldとも同じ出現・回収周期で比較する。背景の砂嵐と倍率の再付与を含め、比較する操作スケジュールを記録する。
- 目標60 FPS。変更前後それぞれ3試行の中央値で平均FPS退行5%以内、入力から次の描画までのp95は100ms以内かつ基準からの増加20ms以内を合格基準とする。環境が目標FPSに達しない場合も実測値と比較結果を分けて記録する。
- Game→Title→Gameを20回繰り返し、キャッシュ画像・ラベルの残存、入力購読、キャッシュTweenの増加が0件であること。新PNGは1 MiB以下、長辺1024px以下とし、透明余白が操作を広げないことを確認する。
- 毎フレームに効果オブジェクト・種類ラベルを生成しない。ラベルは出現時だけ作成し、HUD文字は表示内容が変わる場合だけ更新する。同期ストレージ操作の頻度は既存を維持する。
- 環境・手順・変更前後の結果を `validation.md` に記録する。未実施は未実施と明記し、性能改善を推測で断定しない。

## 検証と完了条件

FR-001〜005・008は純粋関数と境界テスト、FR-007・009は単体とブラウザ、FR-006・010は実画像・音声・縮小表示で検証する。`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` と対象E2Eを通し、既存採掘・保存・ライフサイクルを回帰確認する。アセット・相対URLはビルド成果物でも確認する。ネイティブAPI変更がないためRustビルドは本機能の必須検証に追加しない。
