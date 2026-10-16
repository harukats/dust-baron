# Settings実装の検証記録

## 変更前

- 日付: 2026-10-15
- pnpm lint: 成功。既存のBiomeスキーマ2.5.14とCLI 2.5.15の情報メッセージあり。
- pnpm typecheck: 成功。
- pnpm test: 4ファイル55件成功。
- ignore: node_modules/dist/build/ログ/環境変数/Playwright出力を既存設定が保護。privateパッケージにつきnpmignore不要。
- 性能: performance-probeにp95フレーム時間を追加。変更前15条件の測定を完了。performance-before.jsonを参照。

## 実装後

検証完了時に追記する。

## 実装前のテスト準備

- storage設定移行・個別setter・タイトル復帰精算のテストを先行作成し、未実装を理由とする18件の失敗を確認（27件中9件成功）。
- Playwrightの新設定・音声テスト34件が正常に収集されることを確認。
- Tauri環境情報: Ubuntu 24.04 x86_64、Node 26.12.0、pnpm 12.5.1、Rust 1.99.0。webkit2gtk-4.1とrsvg2が未導入。
- Windows/macOSの実WebViewはこの環境では利用不可。Linuxの実WebViewも依存不足で未検証。

## 静的検査と単体試験

- 実装後pnpm typecheck: 成功。PhaserのBaseSound型にはmute APIが含まれないため、実際の音声実装の共用型で扱う。
- pnpm test: 4ファイル66件成功（storage 27件、economy 31件、production 3件、achievements 5件）。
- 新規設定移行は項目別boolean優先、旧soundEnabled、既定ON、不正入力、モード別保存制限を検証。
- タイトル復帰相当の精算・保存・継続で、owned/ephemeralとも同じrun.stateと実績を保持し収益を重複加算しないことを検証。
- 変更したソース・テストのBiome整形とimport順を適用済み。

## ブラウザの機能検証

- Settings/音声: 初回34ケース中32件成功、2件はテスト条件の誤りを修正しheadedで再実行して成功。追加のEscape経路も成功し、計35ケースを確認。
- 修正した試験条件: Victoryの遅延入力登録は固定待機ではなく登録完了を待つ。既定ON/ONの永続化確認は一度設定を変更してから行う（未変更時は保存しない設計）。
- 5画面で各10回の開閉、親の入力遮断、Space/Enterの押下継続、購読数と音楽数の維持、設定由来ストレージアクセスが開閉・アイドル中0回を確認。
- BGM/SFXをそれぞれ10往復、4組み合わせ、5画面巡回で表示と選択が一致。4組み合わせの実音声信号と再読込後の選択、再生中のstorm/fanfareの即時OFFと再実行防止も確認。
- 旧OFF移行、Mキー、音声解除待ち、blur/focus、owned/ephemeralのpagehide/pageshowを確認。
- 5画面からのタイトル復帰、CONTINUEで同じrun.state、保存不可でも進行と音声設定を保持することを確認。
- 全画面: Chromium headedで実クリックによる10往復と縮小・縦長表示を確認。非対応・同期例外・Promise拒否・要求中の閉じる/タイトル復帰・古い結果の無視も成功。
- PlaywrightのEscapeはOS予約キーの全画面解除を再現しないため、アプリへ届くEscapeでSettingsが閉じる経路とdocument.exitFullscreenによる環境側解除通知・状態同期を分けて確認。OSによる物理Escapeの予約処理自体は未検証。
- 画面確認: settings.png。1280×720で5項目が収まり、文字や操作部の欠けがない。
- pnpm lintとpnpm build: 成功。既存のBiomeスキーマ情報メッセージのみ。

## 既存機能の回帰検証

- 保存・転生・実績・王冠・ライフサイクルの19ケースを検証。初回18件成功、王冠1件はVictoryの遅延入力登録前にSpaceを送っていたため、登録完了を待つ条件へ修正して再実行成功。
- HMR後はキャンバスとセッションロックが各1つ、独立音声設定を保持することを確認。
- 関連テスト合計54ケース（Settings/音声35＋回帰19）は修正分の再実行を含め成功。
- OS予約キーによる物理Escapeの経路と各OSの実WebViewは、上記の環境制約どおり未検証。

## 要件との対応

| 要件 | 結果と確認先 |
| --- | --- |
| FR-001/002、SC-001 | 5画面から同じ5項目へアクセス。settings.spec.tsの各画面開閉・復帰ケース。 |
| FR-003/004/005/014、SC-002 | storage.test.tsの移行表とsound.spec.tsの10往復、4組み合わせ、音声信号、解除待ち、再読込。 |
| FR-006/007/012、SC-003 | headed Chromiumの10往復、3画面寸法、非対応/例外/拒否と状態同期。物理Escapeは未検証。 |
| FR-008/013、SC-005 | 各画面10回開閉、背景入力・押下継続の遮断、購読・音楽数の維持、破棄後の再起動。 |
| FR-009/010、SC-004 | 各画面からタイトル復帰・同じランのCONTINUE。収益の二重加算はstorage単体試験も併用。 |
| FR-011、SC-006 | ストレージ読取/書込失敗と一時プレイで、独立設定・復帰・継続を確認。 |

- `source-hashes.json`は未追跡の新規ファイルを含むソース全体のSHA-256。測定対象のコードを特定する補助資料。

## 性能比較

測定条件はplan.md/quickstart.mdどおり。各条件3回の中央値で比較し、個別試行はJSONに保持する。
同じWSL2・CPU・Chromium・DPR・ウィンドウサイズ・測定時間で実行し、描画はSwiftShader。
基準から60 FPS未満のソフトウェア描画環境であり、絶対FPS目標の達成は主張しない。

| 条件 | FPS中央値 | p95フレーム時間(ms) | 基準比 | 入力応答p95(ms) | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| normal | 45.3 | 25.1 | -7.4% (変更前) | 5.4 | 合格 |
| chrome | 36.7 | 31.5 | -13.5% (変更前) | 5.9 | 合格 |
| chrome-pickup | 35.0 | 34.9 | -7.7% (変更前) | 5.0 | 合格 |
| gold | 36.5 | 31.3 | -16.5% (変更前) | 5.4 | 合格 |
| gold-pickup | 35.8 | 31.8 | -3.6% (変更前) | 5.1 | 合格 |
| normal:settings | 35.0 | 32.0 | 新規条件 | 2.9 | 合格 |
| chrome:settings | 31.6 | 35.7 | 新規条件 | 3.2 | 合格 |
| normal:after10 | 43.5 | 26.5 | +5.6% (変更後の開閉前) | 5.6 | 合格 |
| chrome:after10 | 37.2 | 30.2 | -4.1% (変更後の開閉前) | 5.5 | 合格 |

- 性能結果: performance-before.json、performance-after.json、performance-summary.json。
- Settings表示中は入力によって実際にBGM設定が変わった回数も記録し、応答計測が無操作になっていないことを確認。
- OSの実WebViewおよび物理Escapeキーは未検証。

## 最終状態

- 32タスク中31件完了。T031の各OS実WebView確認は未完了として残す。Linuxはwebkit2gtk-4.1/rsvg2不足、Windows/macOSは実行環境なし。
- 変更前15試行・変更後27試行を実測。共通5条件のp95フレーム時間中央値の退行は10%以内。
- 開閉後の通常・負荷条件も開閉前から10%以内。Settings操作の入力応答p95は全試行3.4ms以下、各119回の切り替えを確認。
- ソフトウェア描画環境のため60 FPSという絶対目標は未達。性能結果の合格は相対退行と入力応答基準に限る。
- before_implement/after_implementの拡張フック設定は存在しない。
