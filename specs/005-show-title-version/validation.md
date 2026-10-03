# 検証結果: タイトル画面のバージョン表示

## 準備（T001）

- 2026-10-03、WSL Linux、Node v26.10.0、Playwright Chromium headless。
- 作業開始時は main。未追跡の本機能文書のみ。仕様と計画のブランチ記録は作成時点の情報。
- .gitignore は node_modules、dist、build、ログ、環境変数ファイルと一時ファイルを除外済み。src-tauri/.gitignore は target を除外済み。パッケージは private で npm 公開なし。
- Phaser Text/Scene スキル、既存 label、Title.create、JSON 設定を確認。チェックリストは16/16合格。チェックリストの印は変更していない。
- 実装前の測定は frame-probe.js で実行。Chromium はサンドボックス内で起動できず、承認されたサンドボックス外実行を使用。

## 実装（T003〜T005）

- tsconfig.json に resolveJsonModule を追加。Title が package.json の version を直接読み込み、label で1つ表示する。
- config.ts に右余白20、下余白16、16px、COLOR.sub、確認用最大幅480を定義。
- Text の独自縮小・インタラクティブ化・購読・毎フレーム更新は追加していない。
- 実装差分は上記3ファイル。セーブ・進行状態・配布設定・package.json の版番号は変更していない。

## ブラウザ表示と操作（T006〜T008）

- Chromium の隔離されたコンテキストでセーブなし・セーブあり・一時プレイを確認。1280×720、960×540、720×960の9条件で重なり0件、範囲内配置、Text scale=1、16px、非インタラクティブを確認。
- 通常版の右下は (1260,704)、幅61px。通常プレリリースの幅292px、40文字の境界値は398pxで、480px以内。
- 40文字の境界値は `0.2.1-beta.1+build.123456789012345678901`。通常版・プレリリース版・境界値の全文一致を確認。縮小・縦長画面と一時プレイ通知の共存も画像で確認した。
- クリック、Space、Enter の開始、Mキー、音声ボタンによる切り替えがすべて成功。
- 各保存モードでTitleを10回再起動し、毎回表示は1つ、DisplayList要素数は各モードの初回と一致（セーブなし13、あり17、一時プレイ16）。
- ui-results-6.json、ui-results-prerelease.json、ui-results-41.json に位置・幅・重なり・要素数の確認結果を保存。
- 通常版、通常プレリリース、40文字版をビルドして preview で表示確認。番号取得の追加通信0件。build-normal-requests.json と build-boundary-requests.json は全通信の記録。
- 番号変更は /tmp/title-version-validation の専用コピーで実施。元の package.json は変更なし。
- title-normal.png と title-boundary-ephemeral.png に代表画面を保存。

## デスクトップ（T009: 未完了）

pkg-config で webkit2gtk-4.1 と dbus-1 が存在しないことを確認した。Tauri のローカル実行・配布物の操作確認は実施できない。共通 Web ビルドの成功をデスクトップ検証の代替とはしていない。対応する環境で quickstart.md の基本確認を実施するまで、T009 と FR-006 のデスクトップ受け入れ確認は未完了。

## コマンド確認（最終結果は下記追記）

- pnpm typecheck: 合格。
- pnpm build: 合格。既存 Vitest は3ファイル・29件すべて合格。通常版と検証専用の2種類の番号でビルド成功。
- 初回 lint は frame-before.json の配列整形を指摘。内容を維持して Biome で整形した。
- 測定スクリプトは実装前測定後にBiomeで書式だけ整えた。取得・集計処理は変更せず、実装後も同じ処理を使用している。

## 性能比較（T002・T010）

- Chromium 153.0.8010.12、AMD RYZEN AI MAX+ 395 w/ Radeon 8060S、6.18.40.1-microsoft-standard-WSL2。
- 実装前p95（ms）: [16.8, 16.7, 16.8]、中央値 16.8000。
- 実装後p95（ms）: [16.8, 16.8, 16.8]、中央値 16.8000。
- 差分 0.0000ms。増加2ms以内の基準に合格。生データは frame-before.json / frame-after.json。60 FPSの実機保証ではなく、同条件の比較結果。

## 最終確認（T011）

- pnpm lint: 合格（57ファイル）。
- pnpm typecheck: 合格。
- pnpm build: 合格（既存テスト29件すべて合格、通常版の配布物を再生成）。
- git diff --check: 合格。最終ビルドのファイル名は画面確認した通常版と同じ index-BYm7aY4h.js。
- package.json・セーブ処理・進行計算・相対URL・配布設定に差分なし。config.tsにPhaser/DOM依存の追加なし。
- extensions.yml は存在せず、前後フックなし。
- タスクは10/11完了。T009だけが対応環境待ち。
