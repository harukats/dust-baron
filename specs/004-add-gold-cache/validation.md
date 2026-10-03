# ゴールド・キャッシュ実装検証

## 環境と進行

- 実装開始日: 2026-10-03。ブランチ: `004-add-gold-cache`。
- 開始時のゲームコード差分なし。既存の未追跡ファイルは本機能の仕様文書のみ。
- Node v26.10.0、pnpm12.5.1。既存lockfileに合わせてpnpmが依存を同期。新規依存追加なし。
- headed Chromium起動を確認。GUIとサーバー起動は通常環境で実施。
- `.gitignore` のnode_modules/dist/build/環境ファイル/試験成果物を確認済み。非公開npmプロジェクトのため.npmignoreは不要。
- 仕様品質チェックリスト16/16合格。マーカーは変更していない。前後の拡張フックなし。
- T001完了。T002変更前性能測定中。T003試験用補助を追加。

## 実装前の回帰テスト

- `pnpm test src/economy.test.ts`: 既存14件成功、新規4件が未実装関数で失敗。倍率・種類抽選・採掘量のTDD開始点を確認。
- `pnpm test src/storage.test.ts`: 既存12件成功、新規1件だけ倍率解除が未実装で失敗。保存形式を変えないことを先に検証定義。
- ブラウザ試験は専用画像、両入力、期限境界、競合、保存、音声、20回再入場を先に定義。

## アセット

- 使用スキル: `imagegen`、Phaser loading-assets / sprites-and-images。生成ツール: 組み込み `image_gen.imagegen`、実アルファ透過を指定。
- 採用元: `/home/harukats/.codex/generated_images/01a10003-270c-7e20-af7f-dc83e8ca2ae0/exec-e054b286-7624-4da7-b371-4e48dfcec0f9.png`。既存chrome・背景・設備を参照確認後に新規生成し、尖った蓋と大きな金属留め具を持つ単体の金色強箱を採用。
- 生成プロンプト: Dust Baronの終末後の砂漠に合う粗いピクセルアート。クロームの物資集合とは異なる輪郭の、尖った装飾蓋を持つ豪華な金色回収容器。濃茶の輪郭、橙色の反射、機械的留め具、角張った装飾。96pxで読める大形状と明確な陰影。中央単体、全体を切らず透明余白。背景は実透明。文字・数字・ロゴ・地面・枠・複数案・スプライトシート・ぼかし・写実的表面なし。
- 2回目の最終編集プロンプト: “Edit this gold strongbox game sprite into a MUCH SMALLER low-resolution game asset. Preserve the gold strongbox silhouette, peaked ornate lid, dark brown outlines, chunky hard pixel blocks, orange metal highlights, mechanical latches and single-object transparent composition. Output EXACTLY 128x128 pixels or at most 512x512 pixels, with minimal transparent margins, suitable for displaying at 96px. Keep actual transparent alpha background. No text, numbers, logos, ground, border or spritesheet. Keep the complete chest in frame. The saved PNG must be below 1 MiB.”
- 生成ツールは寸法指定を2回とも反映せず1254×1254で出力。ユーザーが「128pxへ縮小して採用する」と明示承認したため、Pillow NEARESTで128×128へ縮小。透明化・手描き代替は行わず生成済みアルファを保持。
- 最終保存: `public/assets/gold-cache.png`、128×128、24,772 bytes、RGBA、アルファ範囲0〜255、主役境界(6,9)〜(125,126)。1024px以下・1 MiB以下を満たす。

## 共通基盤・コア

- 経済・保存の31件成功。型チェック成功。
- 金10%/銀90%、最大1個、10秒消滅、20秒777倍、7倍との非積算を共通純粋関数へ統一。
- Stateと保存キー・保存形式は不変。runだけに一時倍率を追加し、create/shutdown/初期化で解除。
- 出現と回収音は既存Sfxを利用。毎フレーム新しい画像・テキスト・Tween・同期保存を追加せず、HUDは文字・色変更時だけ更新。

## ブラウザと配布確認

- gold専用ブラウザ検証8件成功（初回の2件はPhaserのフィルタ参照を誤っていたため失敗。`texture.source[0].scaleMode`へ直して対象2件を再実行し成功）。
- 1280×720と960×540のPNG: `test-results/gold-cache-{1280,960}.png` と `gold-frenzy-{1280,960}.png`。縮小画面も確認し、専用の尖った金庫と種類ラベル、倍率・秒数、ショップが欠けない。透明な角へのクリックでは回収されず、中央では回収成功。
- 効果音検証: ミュート中のOscillator生成数増加0、ミュート解除後に増加、マスター音量0.25への接続、BGM1件を確認。聴覚による人間の試聴は未実施であり、Web Audio経路を自動確認した。
- headed実タブ切替: gold回収後に別gold出現・砂嵐開始、25秒非表示。復帰時の自動獲得80.300（期待80±2）で、777倍の混入なし。画像・ラベルはnull、手動採掘1へ復帰。`pnpm exec node tests/e2e/gold-runtime.ts` 成功。
- 20回のTitle/Victory→Game再入場成功。子要素・SPACE購読は開始時と一致、Tweenは2個以下、未回収画像/ラベルと倍率期限は解除、既得資源は維持。
- `pnpm lint` / `pnpm typecheck` / `pnpm build` 成功。ビルドに含まれる全単体テスト34件成功。

## 要件の追跡

| 要件 | 実装 | 検証 |
|---|---|---|
| FR-001〜002 出現抽選・単一対象・待機と消滅 | T004/T011/T013 | T008/T009、gold-cacheの待機・最大1個・10秒境界 |
| FR-003〜004 手動777倍・生産不変 | T005/T011/T014 | 経済テスト、クリック/SPACE、装備変更、実非表示25秒 |
| FR-005 倍率競合と更新 | T005/T024 | 純粋関数の全取得順、gold-cacheの7→777・777→7・再取得 |
| FR-006 専用絵柄・種類・通知・時間 | T010/T012/T013/T017/T018 | PNG透過・サイズ検査、1280/960画像、NEAREST・HUD・終了 |
| FR-007 二重回収・期限・復帰 | T013/T014 | 同対象再操作、10秒/20秒境界、実タブ切替 |
| FR-008 クローム報酬 | T011/T024 | 単体の0.499999/0.5、gold中jackpot30、ui-check両報酬 |
| FR-009 進行・保存・再入場 | T006/T025 | storage新規試験、reload、新規ラン、20回Title/Victory継続 |
| FR-010 音声 | T019 | ミュート時生成0、音量0.25、BGM1件、視覚通知維持 |
| SC-001 採掘入力・期限 | T015 | 1280/960で1→777→1、クリック/SPACE一致 |
| SC-002 競合・重複0 | T015/T026 | 全倍率遷移・再回収・保存解除 |
| SC-003 生産差・進行欠落0 | T026 | 経済/保存テスト、実非表示生産80±2、継続時の既得資源一致 |
| SC-004 種類・時間の識別 | T020 | 専用尖形金庫とラベル、x777/秒数、終了後HUD解除 |

## 変更前性能

`performance-before.json` に通常・砂嵐+7倍・chrome出現回収の各3試行を保存。10秒準備・60秒測定、1280×720・DPR1、全設備25・pick3、採掘2回/秒。効果条件の計数は各試行で砂嵐5回/採掘効果4回、出現回収条件は出現7回/回収6回（測定終了境界の7回目は未回収）。GPUはSwiftShader、実ハードウェアGPU性能の検証ではない。変更前sourceDiffは先行追加したテスト差分を含み、製品コードは元HEADのまま測定した。

- 通常中央値: 37.691 FPS、入力p95中央値6.3ms。
- 7倍中央値: 33.684 FPS、入力p95中央値6.7ms。
- chrome出現回収中央値: 34.862 FPS、入力p95中央値6.1ms。
- 変更前FPSは通常29.979〜42.276とばらつきがあるため、比較は指定どおり3試行の中央値で行う。

- 既存回帰とgoldを合わせた50件中49件成功。最初の60秒自動生産試験は試験中にGame.tsのコメントを編集したHMRでGameが再起動し失敗したため、製品不具合として扱わず、ソース更新を止めて再実行する。
- `ui-check.ts` は出現をchrome、回収をjackpot/7倍へ固定し、種類と通知結果の確認後に1280/960画像を記録。成功。
- `gold-build.ts` によるビルド済み `/dust-baron/` 起動成功。gold-cache.pngはHTTP200・128×128、canvas1個、読み込み/JSエラー0。
- HUD全体はテキストと色の一致判定後にだけPhaserの更新APIを呼ぶ。変更前から存在した生産HUDの毎フレーム同色再描画も除去。

- 中断したautomationを含む9件を再実行してすべて成功。goldの1280/960表示もHUD更新後に成功。既存回帰を含む全53項目は分割実行で成功した。
- ビルド済みサブパス検証を最終HUD更新後にも再実行し成功。
- 最終ソースでlint/typecheck/buildと単体34件が成功。

## 変更後性能と判定

`performance-after.json` の15試行を `performance-comparison.json` で変更前と比較。全5条件でFPS退行5%以内、入力p95が100ms以内・増加20ms以内に合格。描画はSwiftShaderであり、実GPU・Tauri実機の測定は対象外。

| 条件 | 変更前FPS | 変更後FPS | FPS変化 | 変更後入力p95 | 判定 |
|---|---:|---:|---:|---:|---|
| normal | 37.691 | 42.114 | +11.73% | 6.1ms | PASS |
| chrome | 33.684 | 35.269 | +4.71% | 6.3ms | PASS |
| chrome-pickup | 34.862 | 34.829 | -0.09% | 6.0ms | PASS |
| gold | 33.684 | 35.452 | +5.25% | 6.4ms | PASS |
| gold-pickup | 34.862 | 35.008 | +0.42% | 5.5ms | PASS |

## 完了状態と範囲

T001〜T030完了。全FR-001〜010・SC-001〜004を上記試験で確認し、専用PNGと相対ロードを含むビルドを作成。生成・機能・性能の未実施タスクはない。公開・リリースは本作業の対象外。人間による聴覚試聴と実ハードウェアGPU/デスクトップ実機の性能は未実施であり、自動音声経路とSwiftShader比較の範囲で判定した。

実装前後フック設定 `.specify/extensions.yml` は存在せず、実行対象フックなし。仕様品質チェックリストは16/16のまま変更していない。既存の `specs/005-show-title-version/` は本作業の対象外として変更していない。
