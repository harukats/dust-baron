# 検証記録: ユニットテストを Vitest へ移行

## 移行前の基準（2026-10-01）

- Node.js 26.10.0。既存の pnpm ロックファイルを凍結モードで導入した。
- 既存テストは `src/economy.test.ts` が14件、`src/production.test.ts` が3件、`src/storage.test.ts` が12件、合計29件。`storage.test.ts` の例外検証は2種類を動的に生成する。
- `pnpm test`: 成功。元の `node:test` はファイル単位で `tests 3`、`pass 3` と表示する。29件という件数はテスト定義と動的生成を数えた値。
- `pnpm typecheck`: 成功。
- `pnpm lint`: 成功（48ファイル）。
- この環境には指定の pnpm 12.5.1 がなく、実行にはインストール済みの pnpm 12.6.0 を使用した。`packageManager` の指定は変更しない。

## 移行後の検証

- `pnpm test`: Vitest 5.0.2 で3ファイル29件が成功。探索設定は `src/**/*.test.ts` のため、`tests/e2e/*.spec.ts` の8ファイルは実行0件。
- `package.json` に `pnpm test:e2e` が残り、`playwright.config.ts` の `testDir: './tests/e2e'` は変更していない。
- `src/vitest-failure-probe.test.ts` に一時的な失敗を追加すると、`pnpm test` と `pnpm build` はともに終了コード1。両方の出力にテスト名 `Vitest failure propagation probe` と理由 `intentional failure probe` が現れた。ファイルを削除し、再実行で3ファイル29件が再び合格した。
- `pnpm test src/economy.test.ts`: 指定した1ファイルの14件だけ合格。
- `pnpm test src/economy.test.ts -t costs`: 1件合格、対象外の13件は skipped。
- 存在しないファイル指定: 終了コード1。存在しない名前指定: 14件すべて skipped になり、追加レポーターが実行0件を表示して終了コード1。

## 憲章と CI / Release

- 憲章は `2.0.0`、制定日 `2026-09-28`、最終改定日 `2026-10-01`。原則 III は Vitest を指定し、冒頭の一時的な同期影響レポートは削除済み。
- 改定理由: 旧テスト基盤の指定が Issue #7 の移行と衝突するため。影響する原則は III。既存仕様の検証条件とゲーム実装・保存形式は変えず、テスト登録 API、依存、実行設定、開発手順を移行する。過去の仕様にある旧方式の記述は当時の記録として維持する。
- `.github/workflows/ci.yml` は凍結インストール後に `pnpm typecheck` と `pnpm test` を実行する。`.github/workflows/release.yml` は凍結インストールと `pnpm build` を維持する。ワークフローの変更は不要。

## 最終ゲート（pnpm 12.5.1）

- `pnpm install --frozen-lockfile`: 成功。ロックファイルは package.json と整合。
- `pnpm lint`: 成功（49ファイル、修正なし）。
- `pnpm typecheck`: 成功。`vitest.config.ts` も検査対象。
- `pnpm test`: 成功（3ファイル29件）。
- `pnpm build`: 成功。内部の Vitest も3ファイル29件が合格し、Vite が `dist/` を生成。
- ゲーム実装と保存形式の変更は0件。変更はテスト実行基盤、設定、開発者向け文書、仕様記録、憲章に限定した。
- `AGENTS.md`、`README.md`、`.specify/memory/constitution.md`、`src/economy.test.ts` を検索し、旧テスト実行基盤を現在の手順として指示する箇所は0件。過去の仕様書にある記述は履歴として保持。

## 要件と成功基準の確認

| ID | 状態 | 根拠 |
|----|------|------|
| FR-001 / SC-001 | 達成 | Vitest で既存3ファイル29件が合格。 |
| FR-002 | 達成 | `vitest run` が単発で終了し、意図的な失敗が終了コード1。 |
| FR-003 / SC-003 | 達成 | ファイル指定は14件、名前指定は1件。対象外は実行0件。 |
| FR-004 | 達成 | ローカルのビルドがテストを実行。CI と Release のゲートも設定で確認。 |
| FR-005 / SC-006 | 達成 | AGENTS、README、憲章、テスト冒頭の現行手順に旧ランナーの指示なし。 |
| FR-006 / SC-004 | 達成 | テスト定義・アサーションの検証内容を保持し、29件から減少なし。ゲーム本体・保存形式は無変更。 |
| FR-007 | 達成 | ユニット探索は `src/**/*.test.ts`。E2E のコマンドと設定を維持。 |
| FR-008 | 達成 | 憲章 2.0.0 の原則 III が Vitest を指定。 |
| SC-002 / SC-005 | 達成 | 一時失敗テストで `pnpm test` と `pnpm build` が失敗し、名前と理由を表示。 |

未実施の検証: リモート CI / Release と Playwright E2E の実行。CI / Release は設定を確認し、E2E は移行対象外で変更していない。
