# 検証ガイド: Settings画面

## 前提と起動

リポジトリルートで実行する。pnpmはpackage.jsonの指定バージョンを使う。

```sh
pnpm install
pnpm dev
```

http://localhost:8080 を開く。ブラウザ版は同じプロファイルの別タブを閉じてownedで検証し、
ephemeralは既存の一時プレイ試験と同じ方法で用意する。
検証データは専用ブラウザプロファイルかPlaywrightの独立contextへ作り、実利用のセーブを消さない。

## 自動チェック

実装後、次を実行する。Settingsの操作・音声はsettings.spec.tsとsound.spec.tsで検証する。

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e tests/e2e/settings.spec.ts tests/e2e/sound.spec.ts
pnpm test:e2e tests/e2e/persistence.spec.ts tests/e2e/reign.spec.ts tests/e2e/achievements.spec.ts tests/e2e/crowns.spec.ts tests/e2e/lifecycle.spec.ts
pnpm build
```

既存E2EのSOUNDボタン・旧設定の前提を更新する。シーン内部の関数呼び出しだけで合格にせず、
通常のクリックとキーボード操作で遮断・復帰を確認する。
fixtureや音声アナライザーは既存`tests/e2e/helpers.ts`と`sound.spec.ts`を再利用する。

## シナリオ

| 検証 | 操作・期待結果 | 対応 |
| --- | --- | --- |
| 全入口 | 5画面それぞれでSETTINGSを1回押し、5項目を確認 | FR-001/002、SC-001 |
| 音声分離 | 4組み合わせでBGM信号と採掘・購入・イベント効果音を別々に測定。表示と再生対象が一致 | FR-003/005/014、SC-002 |
| 即時OFF | stormまたはfanfare再生中にSFXをOFF。残音と予約音が止まり、ONで過去の音が再実行されない | FR-014 |
| 再読込 | 音声を別々に変更し、遷移・再読込後に保持。Mキーの両方切り替えも保存 | FR-003/004/014 |
| 旧形式 | 保存契約の表の入力で起動し初期選択を比較。次の保存では新2項目だけ | FR-004 |
| 解除待ち | 音声解除を遅らせ、SettingsでOFF後に解除してもBGMが鳴らない。ON後の音楽は最大1個 | FR-005 |
| 入力遮断 | 親に資源と王冠条件を用意し、設定背景やSpace/Enter/Q/M/Escapeを操作。採掘・購入・転生・継続を発火しない | FR-008/013、SC-005 |
| 通常終了 | CLOSE/Escapeで元画面へ戻る。storm/frenzy/pickupが開閉だけで消えず、時間は経過する | FR-008 |
| 押下継続 | 設定中からSpace/Enterを押し続けて閉じる。キー解放まで親操作が発火しない | FR-008/013 |
| タイトル復帰 | 対象4画面から戻りCONTINUE。資源・設備・王冠・転生・実績を比較し二重収益なし | FR-009/010、SC-004 |
| タイトル自身 | TitleのSettingsから戻り、勝手にゲームが始まらない | FR-009 |
| 保存不可 | 読取・書込例外、一時プレイでも設定変更・開閉・復帰・継続が可能 | FR-011、SC-006 |
| 連続開閉 | 各画面10回開閉し、音楽数・購読数・Settings数が初回終了後から増えない | FR-013、SC-005 |

## 全画面の実環境確認

```sh
pnpm test:e2e tests/e2e/settings.spec.ts --headed
```

実際のユーザークリックで全画面ON/OFFを10往復し、環境側のEscape解除も確認する。
1280×720、960×540、縦長の各ウィンドウで主要ボタンの欠けと入力位置を確認する。
PlaywrightのEscapeはOS予約キーの全画面解除を再現しないため、アプリへ届くEscapeと環境側解除通知を分けて確認する。物理Escape自体の確認は対応する実機で別途行う。
拒否と非対応は別ケースとして再現し、表示が誤ってONにならず他項目を操作できることを確認する。
要求中に閉じる・タイトルへ戻る操作を行い、古い結果が次の画面に書き込まれないことも確認する。
全画面要求のモックは失敗経路の検証に限り、実際の全画面成功を代替しない。

デスクトップは利用可能なWindows/macOS/Linuxで`pnpm tauri dev`を起動し、
同じ音声と全画面・復帰を確認する。非対応時はUNAVAILABLEと他項目の動作を確認する。
WSLでwebkit2gtk等が不足する場合は、そのOSの実機検証を未実施として明記する。

## 性能と終了処理

実装前に既存測定で基準を保存する。

```sh
PERFORMANCE_OUTPUT=specs/007-add-settings-menu/performance-before.json pnpm test:performance
```

同じ測定環境で実装後の比較結果も保存する。

```sh
PERFORMANCE_OUTPUT=specs/007-add-settings-menu/performance-after.json pnpm test:performance
```

probeはFPS・p95フレーム時間・入力応答を取得する。Settings対応を検出した場合は、通常およびstorm/frenzy条件でSettings表示中・10回開閉後も測定する。共通条件は同じ計測ロジックで変更前後を比較する。
通常・storm/frenzy、設備各25・pick3、DPR1、1280×720、10秒ウォームアップ＋60秒を各3回。
異なる条件同士を比較せず、OS/CPU/GPU/ブラウザ版/コミットを記録する。
目標60 FPS、p95フレーム時間の退行10%以内、設定入力から描画までp95 100ms以下。
基準に存在しないSettings表示中の条件は絶対値と実装後の開閉前後を評価する。
アイドル時の設定由来ストレージアクセス0回、10回開閉後の購読・音楽・Settings数の増加0を確認する。

## 記録

`specs/007-add-settings-menu/validation.md`へ環境、操作、結果、要件番号、未実施事項を日本語で記録する。
自動試験と実音声・実全画面の成功を区別し、証跡を添える。
実施済みの結果と未検証の環境は[validation.md](validation.md)を参照する。
