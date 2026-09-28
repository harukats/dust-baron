# タスク: タイトル画面の音声とSOUND設定の永続化

**入力**: `specs/002-persist-sound-settings/`の設計文書

**前提文書**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[音声UI契約](contracts/sound-ui.md)、[保存契約](contracts/sound-persistence.md)、[quickstart.md](quickstart.md)

**検証方針**: 仕様の受け入れシナリオと憲章IIIに基づき、保存境界のNodeテスト、ブラウザE2E、実音確認を含める。回帰テストは対象の実装より先に追加し、修正前の失敗・再現を確認する。実装APIがまだない場合は型エラーを不具合再現の代わりにせず、現状の操作で再現し、APIの読込・更新関数は基盤で仮実装を用意し、永続化前の振る舞いの失敗を確認する。

**構成**: 準備・共通基盤の後、ユーザーストーリーごとに実装と検証をまとめる。チェック済みは実際に完了した作業だけを表す。

## 形式: `[ID] [P?] [Story?] 説明`

- `[P]`は、記載した前提の完了後に別ファイルのタスクと並行できることを示す。
- `[US1]`〜`[US3]`は仕様のユーザーストーリーに対応する。
- パスはリポジトリルートからの相対パス。既存ファイルを再利用し、新しい依存は追加しない。

## フェーズ1: 準備

**目的**: 実装環境を確認し、同条件で比較できる修正前の記録を残す。

- [X] T001 `package.json`と`specs/002-persist-sound-settings/plan.md`に従ってNode・pnpm・既存依存を確認し、必要な場合だけpnpm installを実施する。実装用作業ブランチを作成し、環境とブランチ名を`specs/002-persist-sound-settings/validation.md`へ記録する（mainへの反映はPR経由）。
- [X] T002 `specs/002-persist-sound-settings/quickstart.md`の条件で、タイトル無音と再起動による設定消失を修正前に再現する。`tests/e2e/sound-probe.ts`に音声操作応答・フレーム時間p95・キー別Storageアクセスの計測を用意し、Title/Game各10秒準備＋60秒×3回の基準値を`specs/002-persist-sound-settings/validation.md`へ記録する。
- [X] T003 `src/config.ts`へSETTINGS_KEY（dust-baron-settings-v1）と音声既定値ONを追加する。SAVE_KEY、PLAY_LOCK、MUSICと既存の音量・アセットを維持する。

## フェーズ2: 共通基盤

**目的**: 全画面から利用するライブ設定と音声切り替えを用意する。ストーリー実装はこのフェーズの完了後に開始する。

- [X] T004 `src/storage.ts`へSoundSettingsとrun.settingsを追加し、soundEnabledをboolean・既定trueとして保持する。canPlayで許可された操作のみメモリ設定を更新する共通関数を用意する。StateとnewState、進行初期化・保存処理には変更を加えず、Phaser importやモジュール読込時の保存アクセスを追加しない。設定初期化・保存関数の最小実装も用意し、T017では未永続化の振る舞いを検証する。
- [X] T005 `src/audio.ts`を新設し、applySoundSettingsとtoggleSoundを実装する。run.settingsを共通の設定としてSoundManager.muteへ反映し、切り替え時はメモリ更新とミュート反映を同期実行する。BGM開始はUS1、設定永続化はUS3で追加し、シーンに切り替えロジックを重複させない。

**確認点**: 音声設定を進行から独立して保持し、音声制御をPhaser側へ分離できている。

## フェーズ3: US1 — タイトル画面で音声を切り替える（P1・MVP）

**目標**: タイトル画面でBGMが始まり、SOUNDボタンとMキーでBGM・SEをまとめて切り替えられる。

**独立した検証**: Titleにとどまり、解除済み起動・最初の空白クリック・最初のOFF操作・10回切り替えを試し、表示とBGM・既存SEが一致する。SC-001とTitle側のSC-002に合格する。

### テスト

- [X] T006 [US1] `tests/e2e/sound.spec.ts`へUI契約のタイトル検証を追加する。既存`tests/e2e/helpers.ts`を再利用し、解除済み起動、suspendedからの空白クリック、最初のSOUND/MによるOFF、10回切り替え、MUSIC最大1個、OFF中のSE音源未生成を確認する。実音とは区別して再生・ミュート・表示・音源生成を検証し、タイトル無音の回帰条件が修正前に失敗することを確認する。

### 実装

- [X] T007 [US1] `src/audio.ts`にensureMusicを追加する。ONかつ解除済みならget(MUSIC)で既存曲を再利用し、未登録時のみadd、未再生・未一時停止時のみplayする。locked時はシーン当たり最大1件のUNLOCKED待ちを登録し、最新設定を参照する。SHUTDOWNで解除し、toggleSoundのON復帰時にも開始を保証する。
- [X] T008 [P] [US1] `src/sfx.ts`のSfx.playでmanager.mute時の新規音源生成を抑止する。既存destination接続とマスター音量適用を維持し、OFF中のイベントをキューに積まず、ON復帰時に持ち越して鳴らさない（T007と並行可）。
- [X] T009 [US1] `src/scenes/Title.ts`のcreateで発音前に設定適用とensureMusicを呼び、start内の専用BGM開始処理を共通処理へ統合する。createの一時状態リセット、NEW RUN確認、開始SEの既存動作を維持する（T007完了後）。
- [X] T010 [US1] `src/ui.ts`のaddSoundControlをtoggleSoundへ接続する。SOUND表示とMキーの結果を一致させ、OFF切り替えのSEを追加せず、SHUTDOWN時のMキー解除を維持する（T007・T009完了後）。
- [X] T011 [US1] `tests/e2e/sound.spec.ts`のTitleケースと`specs/002-persist-sound-settings/quickstart.md`のTitle実音手順を実施し、BGM・確認SEのON/OFF、初回解除、全操作1秒以内、重複0件の結果を`specs/002-persist-sound-settings/validation.md`へ記録する（T006〜T010完了後）。

**確認点**: タイトルだけで音声操作を検証可能。永続化は次のUS3で完成させる。

## フェーズ4: US2 — 画面を移動しても音声設定を維持する（P1）

**目標**: Titleで選んだ設定をGame・Victoryへ引き継ぎ、各画面の変更を共通設定へ反映する。

**独立した検証**: ON/OFFそれぞれで開始・CONTINUE・勝利・再開・Title復帰を行う。Gameでボタン/Mを各10回切り替え、OFFの開始・採掘・購入・勝利SEが鳴らず、BGMの重複がない。

### テスト

- [X] T012 [US2] `tests/e2e/sound.spec.ts`へON/OFFでの開始・CONTINUE・勝利・再開・Title復帰とGameの10回切り替えを追加する。最初のSTART/SPACEでTitle終了後に音声解除されるケースとVictoryのSOUND操作で意図せずGameへ移らないケースを含め、必要な修正前の失敗を確認する。

### 実装

- [X] T013 [US2] `src/scenes/Game.ts`のcreateでSE生成前に設定を適用しensureMusicを呼ぶ。toggleMuteと既存Mキーを共通toggleSoundへつなぎ、表示更新・キーボード終了処理・run初期化の時点を維持する（US1完了後）。
- [X] T014 [P] [US2] `src/scenes/Victory.ts`のcreateでfanfareより前に設定適用とensureMusicを呼ぶ。共通addSoundControl、SOUND上のクリックを除外する再開入力、既存保存処理を維持する（US1完了後、T013と並行可）。
- [X] T015 [US2] `tests/e2e/sound.spec.ts`へTitle→Game→Victory→Game→Titleの20周検証を追加し実行する。MUSIC登録最大1個、現シーンの追加UNLOCKED待ち最大1件、終了済みシーンの待ち0件、Mキー1操作1反転を確認する（T012〜T014完了後）。
- [X] T016 [US2] `specs/002-persist-sound-settings/quickstart.md`の画面遷移と実音手順を実施し、開始・採掘・購入失敗・勝利のSE、ON復帰、初回解除前の遷移、フォーカス喪失と復帰時のBGM継続を`specs/002-persist-sound-settings/validation.md`へ記録する（T015完了後）。

**確認点**: US1とUS2は保存機能を待たずに同じ起動中で独立検証できる。

## フェーズ5: US3 — 次回起動でも音声設定を復元する（P2）

**目標**: 設定を操作直後に保存し、発音前に復元する。旧セーブ、NEW RUN、保存失敗、一時プレイで進行を保護する。

**独立した検証**: Title/Game × ON/OFF変更直後の4通りの再読み込みで復元を確認する。Nodeテストで進行文字列・lastSave等の不変性、旧セーブと離席収益、一時モードのアクセス0件を確認する。

### テスト

- [X] T017 [US3] `src/storage.test.ts`へ保存契約の回帰テストを追加する。設定欠落・不正JSON・不正型・true/false、所有権の全モード、保存領域取得/getItem/setItem例外、未初期化run.stateでの即時保存、進行文字列・lastSave・accountedAtMs・offline不変、NEW RUN後の設定維持、オフライン収益の一度だけ加算を検証する。設定保存が未実装で失敗することを確認する。
- [X] T018 [P] [US3] `tests/e2e/sound.spec.ts`へTitle/Game各ON/OFF変更直後の4通りの再読み込み、保存済みOFF起動の初回発音防止、旧進行だけの起動、NEW RUN、一時プレイ、保存失敗でも画面間維持のケースを追加する。pagehide/pageshowでownedは保存値を再取得し、ephemeralは同一ページ内の最新ライブ値を維持することと、HMR後の保存済みOFFを検証する。保存・復元の回帰条件が修正前に失敗することを確認する（T017と並行可）。

### 実装

- [X] T019 [US3] `src/storage.ts`へ設定解析・初期化・即時保存を追加し、共通音声切り替えのメモリ更新・ミュート適用後に保存を呼ぶ経路を完成させる。モデルの制約「保存値なし、読み取り失敗、不正JSON、null・配列・非オブジェクトは既定ON。」「soundEnabledがbooleanの場合だけ採用する。文字列false、数値0などをOFFへ変換しない。」「不明フィールドは無視する。進行セーブの解析・破棄を伴わない。」「値は現在の起動内で直ちに更新し、保存失敗で巻き戻さない。」をそのまま実装する。ownedだけ設定キーを読み書きし、非ownedの保存アクセスは0件、設定変更からinitializeRun/settleRun/writeSaveを呼ばない（T017・T018完了後）。
- [X] T020 [US3] `src/main.ts`のbootでrun.mode確定後・Phaser.Game生成前に設定を初期化する。ownedの起動・再取得で1回読む、一時プレイの初回はON・同一ページ内再起動は最新ライブ値を維持する。blocked起動、pagehide/pageshow、HMRの世代管理・セッション解放を維持する（T019完了後）。
- [X] T021 [US3] `src/storage.test.ts`と`tests/e2e/sound.spec.ts`の保存ケースを実行し、`src/audio.ts`・`src/ui.ts`・各シーンの共通切り替えがT019の保存経路を使うことも確認する。旧セーブ互換、NEW RUN、離席収益保護、保存失敗・非owned制約、4通りの復元を`specs/002-persist-sound-settings/validation.md`へ記録する（T019・T020完了後）。

**確認点**: 全ユーザーストーリーの機能が完成し、保存による進行喪失・離席収益重複が0件である。

## フェーズ6: 仕上げと横断検証

**目的**: 全受け入れ条件と計画上の検証をそろえ、残る制約を記録する。

- [X] T022 `package.json`のpnpm lint・pnpm typecheck・pnpm test・pnpm buildと、`specs/002-persist-sound-settings/quickstart.md`指定のsound/persistence/lifecycle/session E2Eを実施する。失敗は原因を修正して再検証し、結果を`specs/002-persist-sound-settings/validation.md`へ記録する。
- [X] T023 `tests/e2e/sound-probe.ts`でT002と同じ環境・負荷・測定時間の変更後比較を実施する。全音声操作1秒以内、フレーム時間p95悪化10%以内、ownedの切り替えごとに設定setItem1回・bootごとにgetItem1回、フレーム更新・シーン移動で設定保存0件、非ownedのアクセス0件を確認し、`specs/002-persist-sound-settings/validation.md`へ数値を記録する。
- [ ] T024 対応WebViewで`specs/002-persist-sound-settings/quickstart.md`のデスクトップ音声・初回解除・遷移・復元を実施し、OS/WebView・実音結果を`specs/002-persist-sound-settings/validation.md`へ記録する。実施できない場合は理由・影響・残る実施項目を記録し、未実施を合格や完了扱いにしない。
- [X] T025 `specs/002-persist-sound-settings/validation.md`にFR-001〜012・SC-001〜005の結果と検証タスクを対応付ける。`specs/002-persist-sound-settings/quickstart.md`の手順を実装後の実行方法へ合わせ、`specs/002-persist-sound-settings/tasks.md`は実際に完了した項目だけチェックする。未実施・制約を明記し、公開やmainへの直接反映は行わない。

## 依存関係と実行順序

### フェーズ依存

```text
準備 T001→T002→T003
  ↓
基盤 T004→T005
  ↓
US1 T006→(T007 ∥ T008)→T009→T010→T011
  ↓
US2 T012→(T013 ∥ T014)→T015→T016
  ↓
US3 (T017 ∥ T018)→T019→T020→T021
  ↓
横断検証 T022→T023→T024→T025
```

- US1は共通基盤完了後に開始できる。US2はUS1のBGM開始・共通UIへ依存する。
- US3の保存実装自体は共通基盤後に着手可能。ただしsound.spec.tsとvalidation.mdをUS1/US2と共有するため、推奨順序はUS1→US2→US3とする。
- 同じファイルの編集、同じブラウザでの音声・性能測定、validation.mdへの記録は直列化する。
- 失敗の確認が済んだテストについて、対象実装完了後に同条件で合格を確認する。環境理由で実施できない検証は未完了のまま記録する。

### 並行実行の例

| ストーリー | 前提 | 並行できる作業 | 合流地点 |
| --- | --- | --- | --- |
| US1 | T006完了 | T007のaudio.tsとT008のsfx.ts | T009・最終T011 |
| US2 | US1とT012完了 | T013のGame.tsとT014のVictory.ts | T015 |
| US3 | US2完了 | T017のstorage.test.tsとT018のsound.spec.ts | T019 |

これはファイルの競合を避けられる作業例であり、並行エージェント起動を今回実施する指示ではない。

## 要件と検証の対応

| 要件・成果 | 実装タスク | 検証タスク |
| --- | --- | --- |
| FR-001・002 / SC-001 | T007・T009 | T006・T011・T012 |
| FR-003・004 / SC-002 | T005・T008・T010・T013・T014 | T006・T011・T012・T016・T023 |
| FR-005・006 / SC-003 | T007・T013・T014 | T012・T015・T016 |
| FR-007・008 / SC-004 | T019・T020 | T017・T018・T021 |
| FR-009〜011 / SC-005 | T003・T004・T019・T020 | T017・T018・T021 |
| FR-012 | T004・T019・T020 | T017・T018・T021 |
| 全体の品質・配布環境 | 全実装タスク | T022〜T025 |

## 実装戦略

1. 準備と共通基盤を完成させ、US1を最小の検証可能な成果とする。タイトル画面だけでBGM・SE切り替えを実演できる。
2. US1の独立検証後、US2でプレイ・勝利・復帰へ適用する。
3. US3で即時保存と起動前復元を接続し、進行の不変条件を検証する。
4. 横断検証で音声・保存・性能・ライフサイクル・配布環境の結果をそろえる。

MVPはUS1までのT001〜T011。ユーザーが依頼した機能全体の完了にはUS2・US3と横断検証も必要である。

## 注記

全25タスク（準備3、基盤2、US1が6、US2が5、US3が5、横断検証4）。今回生成したタスクはすべて未着手。
仕様品質チェックリストは実装完了のチェックに流用しない。次の`$speckit-analyze`で文書間の整合性を確認し、`$speckit-implement`で実装を進められる。
