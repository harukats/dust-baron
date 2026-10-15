# 実装計画: Settings画面の追加

**ブランチ**: `007-add-settings-menu` | **日付**: 2026-10-15 | **仕様**: [spec.md](spec.md)

**入力**: `specs/007-add-settings-menu/spec.md`

## 概要

既存5画面のSOUNDボタンをSETTINGSに置き換え、共通のSettingsシーンを重ねて表示する。
BGMと効果音を独立して切り替え、全画面表示の変更、進行を保持したタイトル復帰を提供する。
親シーンの更新と放置収益を継続し、ポインターとキーボード入力だけを遮断する。
音声設定は同じ保存キーで旧形式を読み取り、新形式の2項目へ移行する。
全画面は標準のFullscreen APIと既存ScaleManagerのサイズ追従を使用し、ネイティブ権限を増やさない。

## 技術的背景

| 項目 | 採用・制約 |
| --- | --- |
| 言語・バージョン | TypeScript 7.0.2系、明示的な`.ts` import、erasable構文 |
| 主要依存 | Phaser 4.2.1系、Vite 8.3.2系、既存のTauri 2。新規依存なし |
| 保存 | 既存localStorageの`dust-baron-settings-v1`。ランと実績は既存キー・形式を維持 |
| テスト | Vitest 5系のNode単体試験、Playwright 1.63系、ブラウザとデスクトップ実機の画面・音声確認 |
| 対象環境 | ブラウザ版およびWindows/macOS/LinuxのTauri WebView。標準全画面非対応時は操作不可を表示 |
| 種別・規模 | 単一プレイヤーのクライアントゲーム。既存5画面＋設定1画面 |
| 性能目標 | 通常60 FPS。入力から描画までp95 100ms以下。変更前後のp95フレーム時間退行10%以内 |
| 制約 | 1280×720、Scale.FIT、相対アセットURL、既存ピクセルフィルタ、所有モード別保存を維持 |

## 憲章適合確認

研究前と設計後の両方で以下を確認した。未解決の違反・例外要求はない。

| 原則 | 研究前の確認 | 設計後の確認 |
| --- | --- | --- |
| I 日本語の仕様・判断 | 仕様を日本語で参照 | 全設計資料を日本語で作成。ゲームの表示は英語を維持 |
| II 純粋なコアと保守性 | storageはPhaser・DOMの読み込み時依存なし | 設定解析・保存をstorage、音声をaudio/sfx、DOM全画面をfullscreen、表示をSettingsへ分離 |
| III 振る舞いの検証 | 保存とUIの既存試験を確認 | 移行単体試験、音声出力・入力遮断・復帰のE2E、実機全画面をquickstartに規定 |
| IV 進行と体験の保護 | run.stateと単調時計の精算を確認 | Settings開閉で親を再作成しない。復帰でrun.stateを破棄しない。収益は既存settleRunのみ |
| V 性能・ライフサイクル | 毎フレーム保存を追加しない | イベント駆動で設定表示を更新。購読解除と音声ノード破棄、変更前後の測定条件を定義 |
| 配布上の制約 | 既存WebビルドをTauriで共有 | Rust、capabilities、Cargo、アセット、リリース設定の変更なし |

## プロジェクト構成

### 設計資料

```text
specs/007-add-settings-menu/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── settings-ui.md
│   └── settings-persistence.md
└── checklists/requirements.md
```

[tasks.md](tasks.md)に実行順と完了状態、[validation.md](validation.md)に実施結果を記録する。

### ソースコード

```text
src/
├── config.ts                 # Settingsの配置・文言・既定値
├── storage.ts                # 独立音声設定の読取・変更・保存
├── storage.test.ts           # 移行と保存モードの検証
├── audio.ts                  # BGM個別制御、設定反映、一括切り替え
├── sfx.ts                    # 効果音専用出力と再生中の停止
├── fullscreen.ts             # 新規: 標準全画面の可否・要求・失敗処理
├── settings.ts               # 新規: 開閉・親の入力遮断と復元
├── ui.ts                     # addSettingsControlと既存plateButton再利用
├── main.ts                   # Settings登録、全画面対象の指定
└── scenes/
    ├── Settings.ts           # 新規: 共通設定画面
    ├── Game.ts               # 採掘画面の入口と旧ミュート表示の置換
    ├── Title.ts
    ├── Reign.ts
    ├── Achievements.ts
    └── Victory.ts            # 他4画面の共通入口への置換

tests/e2e/
├── settings.spec.ts          # 新規: 全画面・開閉・復帰・入力遮断
├── sound.spec.ts             # 独立音声設定に合わせて更新
├── helpers.ts               # 既存ランfixtureとdev hookの再利用
└── performance-probe.ts      # 既存測定を基準に追加条件を検証
```

既存の描画ヘルパーとテスト環境を拡張する。汎用設定フレームワークや別UIライブラリは追加しない。

## Phase 0: 調査結果

[research.md](research.md)に判断、根拠、代替案を記録した。未解決の技術確認事項はない。
主な判断は、親の更新を止めないオーバーレイ、2項目の後方互換読み取り、音声別出力、
Promiseの失敗を捕捉する標準全画面アダプターである。

## Phase 1: 設計

### 音声と保存

`SoundSettings`を`bgmEnabled`と`sfxEnabled`へ変更する。新しい値を各フィールドごとに検証し、
不正・欠落時は旧`soundEnabled`、最後に既定ONへ戻す。書き込みは新しい2項目だけとする。
既存のinitializeSoundSettings/writeSoundSettingsは役割を拡張して維持し、個別setterを追加する。
setSoundEnabledはMキー用に両項目を同じ値へ変更する操作として維持する。

`audio.ts`はBGMインスタンスの個別muteを使い、ON時だけ必要な再生を開始する。
共通マスターmuteをBGM設定に使わず、既存のマスター音量・mute経路は維持する。
効果音はSoundManagerごとの共有GainNodeを経由してPhaserのdestinationへ接続する。
OFFは新規再生を抑止し、既存の共有出力を消音し、追跡する再生中・予約済みsourceを終了する。
ノード終了時に接続と参照を解放し、manager破棄時に共有出力を切断する。
音声非対応環境は既存と同様に無音で継続する。設定反映は保存より先に実行する。

### オーバーレイと入力

`settings.ts`は親シーンを保持し、起動前に親input.enabledとkeyboard.enabledの元値を保存して無効化する。
Settingsをlaunchして最前面に置き、全画面の遮蔽板とSettings専用の入力を設ける。
親のupdate、タイマー、期間限定効果、定期保存は継続する。設定側で生産量を加算しない。
同じ親・別の親からの重複起動を防止する。

通常の閉じる操作は親を再createしない。Settingsを終了し、同じ入力イベントが親へ届かないよう
次のフレームで親の入力状態を復元する。押しっぱなしのキーとリピート入力が開始・採掘を誘発しないよう、
キー状態のリセットとイベント側のrepeat抑止を適用し、実入力で検証する。
親やゲームの終了時はSettingsも終了し、親shutdown・scale・keyboard・音声解除待ちの購読を解除する。
終了済み親の入力を復元しない。各createで終了フラグや表示状態を初期化する。

Gameの既存SETTINGS配置は100×30の枠内で読める文字サイズにする。
他4画面は共通入口を使う。Game.refreshHudからSOUND文字列更新を削除し、
MキーはSettings外で両方ONなら両方OFF、それ以外なら両方ONにする。
Victoryの空白クリックによる継続やTitleのSpace/Enterが設定操作と競合しないことを確認する。

### タイトルへの復帰

二重操作ガードを立て、settleRunとwriteSaveで現在の進行を処理する。
親がTitleならSettingsのみ閉じる。それ以外は親をstopし、Titleを開始してSettingsをstopする。
親shutdownの既存処理を維持し、停止後の親入力は復元しない。
run.state、実績、セッション所有権を維持し、resetRunやinitializeRunを呼び直さない。
CONTINUEでGameが既存run.stateを使うことを確認する。
タイトル復帰による期間限定演出の終了は既存Game.shutdownの動作を維持し、
Settingsの通常開閉ではそれらを終了しない。

### 全画面

`main.ts`のscale.fullscreenTargetに`game-container`を指定する。
`fullscreen.ts`は利用時にDOMを参照し、document.fullscreenEnabledと対象のrequestFullscreenで可否を確認する。
標準APIに非対応の環境はUNAVAILABLE表示とする。Tauri固有APIや追加権限は使用しない。

全画面ボタンだけはplateButtonのpointerdown動作を外してpointerupから要求し、
awaitやタイマーより前にrequestFullscreen/exitFullscreenを呼ぶ。
Promiseのrejectと同期例外を捕捉し、成功を先取りせず実際のfullscreenElementとScaleManagerのイベントで表示を更新する。
Phaserはdocumentのfullscreenchangeを既に購読しており、FITの再計算を継続利用する。
要求中は連打を抑止するが閉じる・タイトル復帰を妨げない。
閉じた後のPromise完了は画面を書き換えない。Escapeが環境に消費された場合は全画面解除を優先し、
設定画面が残ればもう一度EscapeまたはCLOSEで閉じられる。

## 検証と性能

対応表・具体手順は[quickstart.md](quickstart.md)に記載する。
単体試験は設定移行と保存制約、E2Eは5画面の実入力・音声信号・ラン継続を検証する。
既存SOUNDボタン座標とsoundEnabledを前提としたテスト・補助型も更新し、関連する既存E2Eを再実行する。
全画面の実成功はheadedブラウザおよび利用可能なOSのWebViewで確認し、モック試験とは区別して記録する。
WSLのWebView依存不足が残る場合は未検証OSと理由を明記し、成功したと扱わない。

実装前に基準値を取得し、実装後に同じOS・CPU・GPU・ブラウザ版・DPR1・1280×720・電源条件で比較する。
設備各25、pick3の同じfixtureで通常とstorm/frenzy負荷を各3回、10秒ウォームアップ＋60秒測定する。
既存performance-probeを基準に、Settingsを閉じた条件、開いたままの条件、10回開閉後を測る。
目標60 FPS、同条件のp95フレーム時間の退行10%以内、設定入力から次描画までp95 100ms以下を合格条件とする。
低速環境で基準値が60 FPS未満なら絶対値未達を明示し、退行条件は引き続き評価する。
10回開閉後の購読数・Settingsインスタンス数・音楽数が初回終了後と同じで、
アイドル時に設定起因のストレージ読み書きが0回であることも確認する。
計画段階では動作・性能は未測定であり、保証値とは扱わない。

## 複雑性の確認

憲章違反なし。追加依存なし。新規の全画面アダプターは非同期失敗処理を集約するため、
Settingsコントローラーは5画面での入力遮断・復元と終了処理を一貫させるために限定する。
