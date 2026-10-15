# 調査と技術判断: Settings画面

**日付**: 2026-10-15

## 1. 元の画面の更新を続ける設定オーバーレイ

**決定**: 共通Settingsシーンをlaunchし、親の入力のみ無効化する。

**根拠**: `src/scenes/Game.ts`のcreateはstorm/frenzyや拾得物のタイマーを初期化し、shutdownも
拾得物とfrenzyを終了する。設定を開くだけでstop/startすると元の進行体験を保持できない。
updateは生産の精算、storm/cacheの発生、実績確認を行うため、pauseも既存動作を変える。
既存の入力はイベント方式で、親inputとkeyboardの無効化で更新から分離できる。
TitleのSpace/Enter、Victoryの空白クリックと800ms後の入力登録も遮断対象となる。

**比較した代替案**: 親をpauseする方式は生産以外のイベント時刻を変える。
設定画面へstartする方式は親を再作成する。各画面へ個別パネルを実装すると終了処理が重複する。

**確認資料**: `src/scenes/{Game,Title,Victory,Reign,Achievements}.ts`、
`node_modules/phaser/skills/scenes/SKILL.md`、`node_modules/phaser/skills/input-keyboard-mouse-touch/SKILL.md`。
Phaserのスキルは`.agents/skills/phaser-*`経由で参照した。

## 2. 既存キーで独立した音声設定を保存

**決定**: `SETTINGS_KEY`を維持し、`bgmEnabled`と`sfxEnabled`を保存する。
新しい有効booleanを優先し、項目ごとに旧soundEnabled、有効値がなければONを採用する。

**根拠**: `src/storage.ts`はowned時だけ読み書きし、一時プレイではライブ値を維持する。
この制約を維持すれば別タブ所有権や一時プレイと競合しない。ランの保存形式を変える必要がない。

**比較した代替案**: 新しい保存キーは不要な移行先を増やす。旧soundEnabledをマスターとして残すと
個別にONを選んでも音が出ない二重の設定になる。NEW RUNに設定を含めると独立した好みを失う。

**確認資料**: `src/config.ts`、`src/storage.ts`、`src/storage.test.ts`、`src/session.ts`。

## 3. 音声経路をBGMと効果音に分ける

**決定**: BGMはMUSICインスタンスのmuteと再生開始で制御する。
効果音はmanagerごとの共有出力ゲインで制御し、OFFで予約済みsourceも終了する。
出力は既存のPhaser destinationにつなぎ、共通マスター音量・muteを引き続き反映する。

**根拠**: 現在の`audio.ts`はmanager.muteで音声全体を切り替えるため独立設定に使えない。
`sfx.ts`のplay先頭だけでOFF判定しても、既に開始したstormやfanfareは鳴り続ける。
単一の共有出力とsourceの終了管理で画面をまたいだ既存音も止められる。
BGMの既存get(MUSIC)、音声解除待ちとshutdown解除の構造を維持できる。

**比較した代替案**: 音声全体のmuteは独立設定を満たさない。各シーンに別の音楽を作ると重複する。
効果音ファイル化や別オーディオライブラリの導入は今回の要求に不要。

**確認資料**: `src/audio.ts`、`src/sfx.ts`、`node_modules/phaser/skills/audio-and-sound/SKILL.md`。

## 4. 全画面要求の非同期結果を捕捉する

**決定**: `game-container`を全画面対象とし、標準requestFullscreen/exitFullscreenを
pointerupから同期的に呼び出す薄いアダプターを設ける。Promise失敗を捕捉し、
状態は実際のfullscreenElementとScaleManagerのイベントで更新する。
標準API非対応時は利用不可にし、Tauri固有権限を追加しない。

**根拠**: インストール済み`node_modules/phaser/src/scale/ScaleManager.js`ではstartFullscreenが
ブラウザのrequestを呼ぶが、そのPromiseを返さない。標準APIを直接ラップすれば同期例外と非同期拒否を
捕捉できる。同ファイルはdocumentのfullscreenchangeを監視しFITを更新するため、サイズ管理を重複実装しない。
既存plateButtonはpointerdownなので、この項目だけpointerupへ配線を変更する。

**比較した代替案**: ScaleManager.toggleFullscreenだけに依存する方式はPromise失敗を直接扱えない。
Tauri専用APIは権限とWebとの差を増やす。CSSだけの拡大はOS・ブラウザの全画面表示を満たさない。

**公式資料**:

- [Phaser ScaleManager](https://docs.phaser.io/api-documentation/class/scale-scalemanager): pointerupからの全画面要求と対象要素の指定。
- [MDN requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen): ユーザー操作の必要性とPromiseによる成功・拒否。
- [MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API): 状態と全画面解除。

## 5. タイトル復帰と検証

**決定**: 既存settleRun/writeSaveで精算後、親を終了してTitleへ移る。run.stateを保持する。
単体試験に加え、既存Playwrightと音声信号の測定方法を拡張する。

**根拠**: `src/main.ts`は単調時計と定期保存を既に持ち、`initializeRun`は既存run.stateを再読み込みしない。
独自の収益加算や設定専用保存タイマーは二重計算・負荷の原因になる。
`tests/e2e/sound.spec.ts`は音声出力の信号も検証しており、表示だけの試験より独立制御を確かめられる。

**比較した代替案**: ページ再読込ではセッションと一時プレイを失う。
常時保存や別の進行コピーは既存の所有権と時計を分岐させる。

**未解決事項**: なし。実機WebViewの対応結果は実装後の検証事項で、計画時点で成功したとは扱わない。
