# タスク: ユニットテストを Vitest へ移行

**入力**: `specs/003-migrate-unit-tests-vitest/` の [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[コマンド契約](contracts/test-commands.md)、[quickstart.md](quickstart.md)

**検証方針**: 既存29件の検証内容を維持し、コマンド契約の正常系・失敗系を実行して確認する。新しい永続的なテストは必要な場合に限る。

**構成**: P1 は全ユニットテストの移行、P2 は対象を絞った実行。`[P]` は異なるファイルで未完了タスクに依存せず並行可能な作業だけに付ける。

## フェーズ1: セットアップ

**目的**: 変更前の基準を残し、依存を導入する。

- [X] T001 `src/economy.test.ts`、`src/production.test.ts`、`src/storage.test.ts` の実行件数と `pnpm test`・`pnpm typecheck`・`pnpm lint` の変更前結果を `specs/003-migrate-unit-tests-vitest/validation.md` に日本語で記録する。動的生成を含む29件を基準とする。
- [X] T002 `package.json` に互換性を確認した Vitest 5 を開発依存として追加し、指定の pnpm で `pnpm-lock.yaml` を更新する。`packageManager` の指定と `pnpm install --frozen-lockfile` の整合を確認する。

---

## フェーズ2: 基盤

**目的**: ユニットテストの探索範囲と型検査を共有設定にする。US1 と US2 の前提。

- [X] T003 `vitest.config.ts` を作成し、Node 環境と `test.include: ['src/**/*.test.ts']` を指定する。`tests/e2e/*.spec.ts` が探索対象にならず、ゲーム用 `vite.config.ts` と `playwright.config.ts` の設定を変えないことを確認する。
- [X] T004 `tsconfig.json` の `include` に `vitest.config.ts` を加え、設定ファイルも `pnpm typecheck` の対象になるようにする。既存の厳格設定と `.ts` import の許可を維持する。

**チェックポイント**: Vitest の対象は既存の3ユニットファイルに限定され、設定も型検査対象になる。

---

## フェーズ3: ユーザーストーリー1 — 既存のユニットテストを実行する（優先度: P1、MVP）

**目標**: 標準コマンド、ビルド、CI から既存のユニットテスト全件を一度だけ実行し、失敗を伝播させる。

**独立した検証**: `pnpm test` で3ファイル29件が合格して終了し、E2E が含まれない。意図的なテスト失敗時は `pnpm test` と `pnpm build` が失敗し、テスト名と理由を示す。

### 実装

- [X] T005 [P] [US1] `src/economy.test.ts` の `node:test` import を `vitest` に変更し、既存14件の名前・期待値・`node:assert/strict` による厳密比較を維持する。冒頭の実行説明も更新する。
- [X] T006 [P] [US1] `src/production.test.ts` の `node:test` import を `vitest` に変更し、既存3件の名前・期待値・厳密比較を維持する。
- [X] T007 [P] [US1] `src/storage.test.ts` の `test`・`beforeEach`・`afterEach` を `vitest` から import し、動的生成を含む既存12件と `run`・`localStorage` のテストごとの初期化・後片付けを維持する。
- [X] T008 [US1] `package.json` の `test` スクリプトを単発実行の `vitest run` に変更し、`build` の `pnpm test` 呼び出しを維持する。監視モードと `--passWithNoTests` を標準実行に入れない。

### 受け入れ検証

- [X] T009 [US1] `pnpm test` で3ファイル29件が合格し、`tests/e2e/*.spec.ts` の実行件数が0件であることを `specs/003-migrate-unit-tests-vitest/validation.md` に記録する。既存の `pnpm test:e2e` コマンドが残ることも `package.json` と `playwright.config.ts` で確認する。
- [X] T010 [US1] `src/` に一時的な失敗テストを置き、`pnpm test` と `pnpm build` がともに失敗してテスト名・理由を表示することを確認する。一時テストを削除して再び全件合格を確認し、手順と結果を `specs/003-migrate-unit-tests-vitest/validation.md` に記録する。

**チェックポイント**: P1 は単独で全件実行とビルドゲートの失敗伝播を証明できる。

---

## フェーズ4: ユーザーストーリー2 — 対象を絞って確認する（優先度: P2）

**目標**: ファイルとテスト名で対象を絞り、実行件数0件を成功扱いにしない。

**独立した検証**: 指定ファイルだけ、指定名だけが実行される。存在しないファイルと名前の両方で失敗終了する。

### 実装

- [X] T011 [US2] `vitest.config.ts` に標準レポーターと併用する小さなレポーターを追加する。`onTestRunEnd` で全ファイルの実行済みテストを数え、全件 skipped を含む0件なら理由を表示して失敗終了にする。既存テストがある通常実行の出力と終了コードを維持する。
- [X] T012 [P] [US2] `AGENTS.md` の `pnpm test`、単一ファイル・名前指定、Node 環境での純粋コアの説明を Vitest の実際のコマンドと一致させる。
- [X] T013 [P] [US2] `README.md` のユニットテスト説明を Vitest に更新し、`pnpm test:e2e` が別コマンドであることを維持する。

### 受け入れ検証

- [X] T014 [US2] `pnpm test src/economy.test.ts` と `pnpm test src/economy.test.ts -t costs` が対象外テストを実行せず成功することを確認し、存在しないファイル指定と名前指定が失敗することを `specs/003-migrate-unit-tests-vitest/validation.md` に記録する。

**チェックポイント**: P2 はファイル・名前による絞り込みと対象0件の扱いを独立に確認できる。

---

## フェーズ5: 仕上げと横断的な確認

**目的**: 憲章・開発手順・CI・配布の整合を確認する。

- [X] T015 `.specify/memory/constitution.md` が制定日を維持した `2.0.0` で、原則 III が Vitest を指定し、冒頭の同期影響レポートが削除済みであることをコミット前に確認する。改定理由、原則への影響、既存仕様・実装への影響、移行作業を `specs/003-migrate-unit-tests-vitest/validation.md` に日本語で記録する。
- [X] T016 `.github/workflows/ci.yml` と `.github/workflows/release.yml` を確認し、凍結ロックファイル導入後も CI の `pnpm typecheck`・`pnpm test` と Release の `pnpm build` が維持されることを `specs/003-migrate-unit-tests-vitest/validation.md` に記録する。変更はゲートが欠ける場合だけ行う。
- [X] T017 `specs/003-migrate-unit-tests-vitest/quickstart.md` に従い、`pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` を実行する。3ファイル29件、失敗終了、ビルド完了、ゲーム実装・保存形式の変更0件を `specs/003-migrate-unit-tests-vitest/validation.md` に記録する。
- [X] T018 `AGENTS.md`、`README.md`、`.specify/memory/constitution.md`、`src/economy.test.ts` の現行手順に旧テスト実行基盤の指示が0件であることを確認し、`specs/003-migrate-unit-tests-vitest/validation.md` に FR-001〜008 と SC-001〜006 の達成状況・未実施検証をまとめる。

---

## 依存関係と実行順

- セットアップ: T001 → T002。変更前の基準は依存導入より先に記録する。
- 基盤: T002 → T003 → T004。基盤は全ストーリーをブロックする。
- US1: T004 → T005・T006・T007・T008 → T009 → T010。T005〜T007 は別ファイルなので並行可能。
- US2: T009 → T011・T012・T013 → T014。US2 は標準コマンドを使うため US1 の実行基盤に依存するが、絞り込みの受け入れ判定は単独で行える。
- 仕上げ: T010 と T014 → T015・T016 → T017 → T018。T015 と T016 は異なるファイルの確認・更新で並行可能。

## 並行作業の例

- **US1**: T005 `src/economy.test.ts`、T006 `src/production.test.ts`、T007 `src/storage.test.ts` の import 移行を並行して行い、T009 でまとめて29件を確認する。
- **US2**: T011 `vitest.config.ts` の0件判定、T012 `AGENTS.md`、T013 `README.md` の更新を並行し、T014 でコマンド契約をまとめて検証する。
- **仕上げ**: T015 憲章 2.0.0 と同期影響レポート削除の確認、T016 CI/Release 設定確認を並行し、T017 で最終ゲートを通す。

## 実装戦略

1. T001〜T004 で基準と共有設定を準備する。
2. MVP として US1 の T005〜T010 を完了し、既存全件と失敗伝播を確認する。
3. US2 の T011〜T014 を追加し、対象の絞り込みと0件失敗を確認する。
4. T015〜T018 で憲章・現行文書・CI・ビルドを整合させ、仕様の全要件を確認する。
