# 調査: ユニットテストを Vitest へ移行

**調査日**: 2026-10-01

## バージョンと互換性

**決定**: `vitest@^5.0.2` を開発依存へ追加し、pnpm ロックファイルで解決版を固定する。

**理由**: [Vitest 5.0.2 のリリース](https://github.com/vitest-dev/vitest/releases/tag/v5.0.2)は現行の安定版。公式の[パッケージ定義](https://raw.githubusercontent.com/vitest-dev/vitest/v5.0.2/packages/vitest/package.json)は Node 26 と Vite 8 を許容し、[Vitest 5 の告知](https://vitest.dev/blog/vitest-5)も最低要件を示す。リポジトリは Node 26 の CI と Vite 8.3.0 を使う。

**比較した案**: 旧版は Vite 8・Node 26 との互換性を別途検証する必要がある。実装時に依存解決結果と型検査を再確認する。

## テスト探索の境界

**決定**: 専用 `vitest.config.ts` に `test.include: ['src/**/*.test.ts']` と Node 環境を指定する。

**理由**: 現行の3ユニットファイルは `src/`、Playwright の8ファイルは `tests/e2e/*.spec.ts` にある。Vitest の既定探索は `.test` と `.spec` の両方を拾うため、設定なしでは Playwright が誤って読み込まれる。[include 設定](https://vitest.dev/config/include)で探索対象を指定できる。以前の試行でも既定探索が E2E を拾い、Playwright の登録エラーで `pnpm test` が失敗した。

**比較した案**: `exclude` だけでは新しい E2E 配置への追従が必要。コマンド引数だけでは直接実行時に混在する。既存 `vite.config.ts` への統合はゲーム用設定との責務を増やす。

## テスト API とアサーション

**決定**: 3ファイルの `test` と `beforeEach`/`afterEach` を `vitest` から import し、`node:assert/strict` は維持する。

**理由**: テスト登録とフックを移行すれば Vitest が全件を管理できる。既存アサーションの厳密比較を別の API へ一括変換すると評価の意味や失敗文言が変わりうる。`storage.test.ts` の `run` と `localStorage` の初期化・後片付けも維持する。ゲーム実装の変更は不要。

**比較した案**: `expect` への一括変換は本 Issue に必須でなく、回帰リスクとレビュー量を増やす。

## コマンドと失敗判定

**決定**: `pnpm test` は `vitest run` とする。ファイル絞り込みは `pnpm test src/economy.test.ts`、名前絞り込みは `pnpm test src/economy.test.ts -t costs` とする。`--passWithNoTests` は指定しない。標準レポーターと併用する小さな追加レポーターで、実行済みテスト0件を失敗終了にする。

**理由**: [公式 CLI](https://vitest.dev/guide/cli.html)の `run` は1回で終了する。[絞り込みガイド](https://vitest.dev/guide/filtering.html)はファイルパスと `-t` を案内する。[passWithNoTests 設定](https://vitest.dev/config/passwithnotests)の既定値は false。実測では Vitest 5.0.2 の `-t` に一致するテストがない場合、1件 skipped で終了コード0だった。ファイルが存在しない場合と異なり、名前だけの0件は追加判定が必要。[公式レポーター API](https://vitest.dev/api/advanced/reporters)の `onTestRunEnd` と `testModule.children.allTests()` で実行結果を数えられる。既存の `build` と CI は `pnpm test` を呼ぶため、この判定を共通で使える。

**比較した案**: `vitest` 単独はローカルで監視モードになる。`--passWithNoTests` は仕様の失敗判定と衝突する。名前指定の0件を許容する案は仕様のエッジケースを満たさない。

## 憲章と開発者向け文書

**決定**: 別の明示的な憲章更新で原則 III の指定は Vitest に改定済み。実装時は憲章 2.0.0 と AGENTS、README、テスト内の実行説明を整合させ、改定理由・影響を PR で示す。

**理由**: 確認回答は憲章改定を選択した。必須テスト基盤の変更は従来の準拠条件を変えるため、憲章は `2.0.0` に更新された。ゲームコア分離と厳密な検証条件は継続する。履歴仕様内の `node:test` 記述は当時の判断記録として残す。

**比較した案**: 例外記録だけでは開発手順と憲章の衝突が続く。過去仕様の一括書き換えは履歴の正確性を損なう。
