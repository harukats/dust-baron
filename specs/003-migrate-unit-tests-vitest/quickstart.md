# 検証手順: ユニットテストを Vitest へ移行

## 前提

- Node.js 26 と `package.json` 指定の pnpm を利用する。
- 依存を `pnpm install --frozen-lockfile` で導入できる。
- 実施前に既存の3テストファイルの件数と結果を記録し、移行後との比較基準にする。

## 全件と対象範囲

```sh
pnpm test
pnpm test src/economy.test.ts
pnpm test src/economy.test.ts -t costs
```

期待結果: 全件実行は1回で終了し、既存の3ファイルの全テストが合格する。絞り込みでは指定した対象だけが実行される。`pnpm test` は `tests/e2e/*.spec.ts` を実行しない。対象の意味は [コマンド契約](contracts/test-commands.md)を参照する。

## 失敗と対象0件の扱い

```sh
pnpm test src/economy.test.ts -t __存在しないテスト名__
```

期待結果: 一致0件を成功扱いにせず、失敗で終了する。

テスト失敗の伝播は、一時的に `src/` に必ず失敗するテストを追加して `pnpm test` と `pnpm build` を実行し、両方の失敗終了とテスト名・理由の表示を確認する。確認後、その一時テストを削除して全件を再実行する。実装本体と既存テストの期待値は変更しない。

## ゲートと回帰

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

期待結果: 全コマンドが成功し、ビルド内でも全ユニットテストが実行される。CI の lint/test ジョブと Release の `pnpm build` が同じゲートを通ることを設定から確認する。Playwright の既存コマンドが変わっていないことも確認する。憲章・AGENTS・README の現行手順に旧テスト実行基盤の指示が残らないことを確認する。
