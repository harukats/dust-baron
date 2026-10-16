# タスク: Settings画面の追加

**入力**: `specs/007-add-settings-menu/`のspec.md、plan.md、research.md、data-model.md、contracts/、quickstart.md
**前提**: `.specify/memory/constitution.md`と`AGENTS.md`に従う。新規依存・ネイティブ権限を追加しない。
**検証方針**: 仕様の受け入れシナリオ、計画の検証手順、憲章IIIに基づき保存移行の単体試験と画面・音声のE2Eを含める。文言だけを確認する重複テストは追加しない。
**構成**: 共通基盤の後、3つのユーザーストーリーを独立した検証単位として進める。

## 形式とパス

各タスクは`- [ ] Txxx [P任意] [US番号] 説明`とする。`[P]`は前提完了後に別ファイルで並行作業できるもの。
USラベルはストーリーのフェーズだけに付ける。パスはリポジトリルートからの相対パス。
実装中は関連する`.agents/skills/phaser-*`を読んでインストール済みPhaser 4のAPIを確認する。

## Phase 1: 準備

**目的**: 既存環境と変更前の測定結果を確保する。アプリの変更より先に完了する。

- [X] T001 `package.json`のpnpm指定と依存を確認し、必要ならpnpm installを実行する。既存のpnpm lint・pnpm typecheck・pnpm testの結果とOS/ブラウザ/GPU等の測定環境を`specs/007-add-settings-menu/validation.md`へ記録する。
- [X] T002 `tests/e2e/performance-probe.ts`にp95フレーム時間を追加し、Settings未実装の基準コードでも動く条件判定を設ける。既存の通常・storm/frenzy、各設備25・pick3、DPR1、1280×720、10秒準備＋60秒測定・各3回を維持し、変更前後に同じ計測器を使える状態にする。
- [X] T003 T002の計測器でアプリ実装前の性能を測定し、`specs/007-add-settings-menu/performance-before.json`と`specs/007-add-settings-menu/validation.md`へコミット・計測器の差分・環境・結果を保存する。基準環境の60 FPS未達や実行不能を成功扱いしない。

## Phase 2: 共通基盤

**目的**: 全ストーリーの入口と入力管理を用意する。このフェーズが全ストーリーをブロックする。

- [X] T004 `src/config.ts`にSettingsの配置、5項目の英語表示、利用不可・失敗表示、既定値を集約する。既存の1280×720、色、SETTINGS_KEYを維持し、Gameの100×30枠でもSETTINGSを読める寸法を定義する。
- [X] T005 `src/settings.ts`に開閉コントローラーを追加する。ownerKeyはTitle/Game/Reign/Achievements/Victoryに限定し、data-model.mdの「開いた親を一つ保持」「元のinput.enabledへ戻すための値」「keyboardがある場合だけ復元」「同じ終了操作の二重実行防止」「終了する親の入力を復元しない」「過去のPromiseで新しい画面を更新しない」を満たす一時状態を保持し、重複起動を防ぐ。親の更新は止めず入力だけ遮断し、通常終了では次フレームに元の入力状態へ戻し、親終了・ゲーム破棄時の購読と復元待ちを解除する。
- [X] T006 `src/scenes/Settings.ts`の共通シーンを作り`src/main.ts`へ登録する。既存のdrawPlate/label/plateButtonで最前面の遮蔽板と5項目の配置、CLOSE/Escape、各createでの状態初期化を実装し、`src/settings.ts`と接続する。未実装の操作はこの段階の完了を機能全体の完成と扱わず、後続ストーリーで接続する。

**チェックポイント**: 親を再createせずに共通Settingsを起動・終了する基盤がある。US1から利用者向けの操作を接続する。

## Phase 3: US1 — BGMと効果音の独立設定 (P1、MVP)

**目標**: 全5画面からSettingsを開き、BGMと効果音を個別に切り替え・保存し、元の画面へ戻れる。
**独立検証**: タイトルから開き、音声4組み合わせを確認する。画面遷移・再起動で選択が保たれ、通常の閉じる操作で親の進行と操作が復元される。

### 契約と振る舞いの検証を定義

- [X] T007 [P] [US1] `src/storage.test.ts`へ`specs/007-add-settings-menu/contracts/settings-persistence.md`の移行表を追加する。新しい項目別boolean優先、旧soundEnabledへのフォールバック、既定true、不正JSON・配列・不正型、保存例外、owned/ephemeral/blocked/acquiring/released、NEW RUNによる設定保持を検証する。
- [X] T008 [P] [US1] `tests/e2e/sound.spec.ts`をBGM/SFXの4組み合わせと独立保存の契約に更新する。SC-002に従いBGMと効果音をそれぞれ10往復切り替えて対象5画面を巡回し、各切り替えで選択・表示・再生対象が一致することを確認する。実音声信号、storm/fanfare再生中のOFF、予約音の終了、ONで過去の音を再実行しないこと、解除待ち、blur/focus、Mキー、音楽数最大1を確認するケースを用意する。

### 実装と接続

- [X] T009 [US1] `src/storage.ts`のSoundSettingsをbgmEnabled/sfxEnabledのboolean・既定trueへ変更し、独立setterと後方互換読み取りを実装する。「ownedだけが永続保存でき、ephemeralはライブ値のみ変更、blocked/acquiring/releasedは変更しない」を維持し、新形式では2項目だけ保存する。Nodeでの読込時にPhaserやDOMへ依存させず、既存initializeSoundSettings/writeSoundSettingsと一括setSoundEnabledを整合させる。
- [X] T010 [US1] `src/sfx.ts`にmanagerごとの共有SFXゲインとsource追跡を実装し、Phaser destinationへ接続する。「OFF時は出力を0にしてsourceを終了し、新規再生を拒否する。ONで過去の効果音を再実行しない」を満たし、source終了・manager破棄でノードと購読を解放する。非WebAudioでは従来同様に無音で継続する。
- [X] T011 [US1] `src/audio.ts`でBGMをMUSICの個別muteと必要時再生で制御し、T010のSFX出力も反映する。「SoundManagerごとにMUSICインスタンス最大1個」「BGMの個別muteはsfxEnabledに依存しない」を維持し、解除待ちの最新設定反映とshutdown解除を実装する。Mキーは両方trueなら両方false、それ以外は両方trueとし、音声反映後に保存する。
- [X] T012 [US1] `src/scenes/Settings.ts`にBGM/SFXの個別切り替え・状態表示・保存を接続する。入力時だけ表示を更新し、保存例外でライブ値を戻さず、音声が未解除でも選択を保持する。
- [X] T013 [US1] `src/ui.ts`のaddSoundControlを共通Settings入口へ置き換え、`src/scenes/Title.ts`、`src/scenes/Reign.ts`、`src/scenes/Achievements.ts`、`src/scenes/Victory.ts`へ接続する。Settings外のMキーを維持し、TitleのSpace/EnterとVictoryの遅延登録される継続入力にrepeat抑止と終了時の解除を適用する。
- [X] T014 [US1] `src/scenes/Game.ts`のミュートボタンをSETTINGS入口へ変更し、muteTextとrefreshHudのSOUND文字列更新を除去する。採掘・数量切り替え・Mキーを共通の入力遮断と整合させ、通常のSettings開閉ではstorm/frenzy/pickupやrun.stateを初期化しない。
- [X] T015 [US1] `tests/e2e/settings.spec.ts`に5入口、CLOSE/Escape、背景クリック、Space/Enter/Q/M、押しっぱなしキーの検証を追加する。必要に応じ`src/settings.ts`のキー復元処理を修正し、親の再create・意図しない開始/採掘/購入/転生を0件にする。Settings中も既存収益とイベント時間が進むことを確認する。
- [X] T016 [US1] `src/storage.test.ts`と`tests/e2e/sound.spec.ts`、`tests/e2e/settings.spec.ts`のUS1ケースを実行し、旧設定移行・個別保存・再読込・音声4組み合わせ・親入力復元を確認し、SC-002のBGMと効果音それぞれ10往復の実施回数、毎回の選択・表示・再生対象の一致、重複再生0件、保存可能な環境での再起動後の一致を含む結果を`specs/007-add-settings-menu/validation.md`へ記録する。

**チェックポイント**: Settingsと独立音声設定を単独で確認できる。全画面・タイトル復帰は後続で完成させる。

## Phase 4: US2 — 全画面表示の切り替え (P1)

**目標**: Settingsから全画面への移行と解除ができ、非対応・失敗時にも操作を続けられる。
**独立検証**: 対応環境で10往復し、環境側の解除、拒否、非対応、サイズ変更後の入力位置を確認する。US3のタイトル復帰には依存しない。

- [X] T017 [P] [US2] `tests/e2e/settings.spec.ts`へ全画面の実成功とモックによる失敗を区別するケースを追加する。pointerupでの要求、実状態への追従、非対応、同期例外・Promise拒否、連打、要求中のCLOSEと再表示後の古い完了結果を検証する。
- [X] T018 [P] [US2] `src/fullscreen.ts`に利用時だけDOMを参照する標準Fullscreen APIのアダプターを追加する。availableはAPI/許可状態、activeは「実際のfullscreenElementがゲーム対象であるか」から求め、「要求時にactiveを反転しない」を守る。同期例外・Promise拒否を捕捉し、非対応・失敗を区別する。
- [X] T019 [US2] `src/main.ts`のscale.fullscreenTargetにgame-containerを指定し、Scale.FITと既存のサイズ追従を維持する。`src/fullscreen.ts`の対象と一致させ、Tauri権限やRust側を変更しない。
- [X] T020 [US2] `src/scenes/Settings.ts`の全画面ボタンをpointerupへ配線し、awaitやタイマーの前に要求する。pendingは「要求中の重複要求のみ抑止」、messageは「他の操作を妨げない表示」とし、ScaleManagerのイベントと実状態で表示更新する。generationで終了後の結果を無視し、購読をshutdownで解除する。
- [X] T021 [US2] `specs/007-add-settings-menu/quickstart.md`に従いheadedブラウザで10往復、環境側Escape、1280×720・960×540・縦長の表示と入力位置、非対応・拒否を確認し、`specs/007-add-settings-menu/validation.md`へ環境と証跡を記録する。実全画面未確認をモックの成功で代替しない。

**チェックポイント**: 全画面単独の検証が完了し、音声設定と閉じる操作を妨げない。

## Phase 5: US3 — 進行を保持したタイトル復帰 (P1)

**目標**: すべての対象画面のSettingsからタイトルへ戻り、同じランを継続する。
**独立検証**: タイトル以外の4画面から戻ってCONTINUEし、ランと実績が保持され、二重収益がない。Title自身からは設定だけ閉じる。

- [X] T022 [P] [US3] `tests/e2e/settings.spec.ts`へ4画面からのタイトル復帰→CONTINUE、Title自身の復帰、一時プレイ、保存例外、連打、全画面要求中の復帰を追加する。run.stateの同一性と資源・設備・王冠・転生・実績、既存ルールの経過時間収益、Settingsと親の終了を確認する。
- [X] T023 [P] [US3] `src/storage.test.ts`にタイトル復帰相当のsettleRun→writeSave→既存ラン継続で収益を重複加算しないケースを追加する。owned/ephemeral、保存例外、音声設定・実績の保持を既存の制御可能な時計で検証し、進行ルール自体は変更しない。
- [X] T024 [US3] `src/settings.ts`と`src/scenes/Settings.ts`へRETURN TO TITLEを接続する。二重操作を防いでsettleRun/writeSave後に親を終了しTitleへ移り、「終了する親の入力を復元しない」を守る。Titleが親なら設定だけ閉じ、run.stateと所有モードを保持してresetRun/initializeRunを呼び直さない。
- [X] T025 [US3] `src/scenes/Game.ts`、`src/scenes/Reign.ts`、`src/scenes/Victory.ts`、`src/scenes/Title.ts`の終了・継続処理を確認し、必要な修正でSettings終了と既存保存・入力解除を整合させる。通常開閉では一時効果を保持し、タイトル復帰時は既存shutdownの終了処理を維持する。`src/storage.ts`のラン・実績形式を変更しない。
- [X] T026 [US3] `src/storage.test.ts`と`tests/e2e/settings.spec.ts`のUS3ケースを実行し、4画面とTitle自身の復帰、一時プレイ、保存不可、全画面要求中の復帰結果を`specs/007-add-settings-menu/validation.md`へ記録する。

**チェックポイント**: 全5項目が接続され、全3ストーリーをそれぞれ操作・検証できる。

## Phase 6: 横断検証と仕上げ

**目的**: 既存機能との整合、性能、対象環境、記録を確定する。

- [X] T027 [P] `tests/e2e/helpers.ts`、`tests/e2e/sound-probe.ts`、`tests/e2e/ui-check.ts`などをrgで調べ、旧SOUND座標・soundEnabled前提の補助型と検証を新しい設定へ更新する。必要な対象だけを変更し、旧形式移行を検証するfixtureは残す。
- [X] T028 [P] `tests/e2e/settings.spec.ts`に各画面10回開閉後の購読数・Settings数・音楽数、親/ゲーム破棄、設定由来のアイドル時ストレージアクセス0回の横断確認を追加する。5画面で二重遷移・閉じたSettingsへの入力・継続的な参照増加がないことを確認する。
- [X] T029 `specs/007-add-settings-menu/quickstart.md`のpnpm lint・pnpm typecheck・pnpm test・関連E2E・pnpm buildを実行し、`tests/e2e/persistence.spec.ts`、`tests/e2e/reign.spec.ts`、`tests/e2e/achievements.spec.ts`、`tests/e2e/crowns.spec.ts`、`tests/e2e/lifecycle.spec.ts`の回帰も含め結果を`specs/007-add-settings-menu/validation.md`へ記録する。失敗は修正し、未実施を明示する。
- [X] T030 `tests/e2e/performance-probe.ts`へ設定表示中・10回開閉後・設定入力応答の条件を追加し、同じ計測器と環境で`specs/007-add-settings-menu/performance-after.json`を取得する。T003との共通条件でp95フレーム時間退行10%以内、設定応答p95 100ms以下、目標60 FPSを評価し、追加条件は絶対値と開閉前後を比較して`specs/007-add-settings-menu/validation.md`へ記録する。
- [ ] T031 利用可能なWindows/macOS/Linuxでpnpm tauri devから音声4組み合わせ・全画面・タイトル復帰を確認し、`specs/007-add-settings-menu/validation.md`へOS/WebViewごとの結果を記録する。非対応ではUNAVAILABLEと他操作の継続を確認し、WSLの依存不足などで実行不能なら対象OSを未検証として記録する。
- [X] T032 `specs/007-add-settings-menu/quickstart.md`と`specs/007-add-settings-menu/validation.md`を最終実装に合わせ、FR-001〜014・SC-001〜006の証跡と未実施事項を整理する。`specs/007-add-settings-menu/tasks.md`の完了状態は実際に達成した項目だけ更新し、保存互換性・性能・実機制約をレビュー可能にする。

## 依存関係と実行順

```text
T001 → T002 → T003
  → T004 → T005 → T006（共通基盤）
    → US1: T007/T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016
      → US2: T017/T018 → T019 → T020 → T021
      → US3: T022/T023 → T024 → T025 → T026
        → T027/T028 → T029 → T030 → T031 → T032
```

- 推奨順は共通基盤→US1→US2→US3→横断検証。3ストーリーはすべてP1。
- US1は他ストーリーの完成に依存しない。MVPは共通入口と独立音声設定、通常の開閉まで。
- US2とUS3は共通Settingsの音声接続・入口があるUS1後に着手でき、機能上は相互に依存しない。
- US2とUS3は`src/scenes/Settings.ts`と`tests/e2e/settings.spec.ts`を共有するため、その編集は直列にする。全画面要求中のタイトル復帰ケースは両方の実装後、T026で最終確認する。
- T009はT007/T008のケース定義後、T011はT009/T010後、T012〜T016は音声経路と基盤の接続後に実行する。
- T019/T020はT018後。T021はT017〜T020後。T024はT022/T023後。T026はUS2・US3実装後。
- T027/T028は全ストーリーの編集完了後に並行可能。T029は両方の終了後、T030はT003と実装完了後、T032は全結果の整理後に実行する。
- 検証環境の不足は結果に記録し、未実施の実機成功や性能合格を主張しない。

## 並行作業の例

共通の前提を終えてから、次の組み合わせだけを同時に扱える。同じファイルを編集するタスクは並行にしない。

| 対象 | 並行できる組み合わせ | 完了後の接続 |
| --- | --- | --- |
| US1 | T007のstorage単体試験とT008の音声E2E | T009から実装を進めT016で確認 |
| US2 | T017の全画面E2EとT018のfullscreenアダプター | T019/T020で実画面へ接続 |
| US3 | T022の復帰E2EとT023のstorage精算試験 | T024/T025で復帰処理へ接続 |
| 横断 | T027の既存補助コード更新とT028の設定ライフサイクル試験 | T029でまとめて回帰確認 |

この一覧は作業分割の可能性を示し、今回のタスク生成では実装や並行エージェント実行は行わない。

## 要件と検証の対応

| 要件・基準 | 主な実装 | 確認 |
| --- | --- | --- |
| FR-001/002、SC-001 | T004〜T006、T012〜T014、T020、T024 | T015、T021、T026 |
| FR-003/004/005/014、SC-002 | T009〜T012 | T007/T008、T016 |
| FR-006/007/012、SC-003 | T018〜T020 | T017、T021、T031 |
| FR-008/013、SC-005 | T005/T006、T013〜T015、T020/T025 | T015/T028、T029 |
| FR-009/010、SC-004 | T024/T025 | T022/T023、T026 |
| FR-011、SC-006 | T009/T012、T018/T020、T024 | T007/T017/T022/T023、T016/T021/T026 |
| 憲章III/Vの回帰・性能・終了管理 | T002、T005/T010/T020、T027 | T003/T028〜T032 |

## 実装方針

1. 実装前の基準値と共通オーバーレイを用意する。
2. US1を最小提供範囲として音声設定と安全な開閉を完成させ、個別に検証する。
3. 全画面表示を加えて実環境で確認し、タイトル復帰を加えてラン継続を検証する。
4. 全項目接続後に既存E2E・ビルド・性能・対象WebViewを確認する。

MVPは中間確認用であり、今回要求された機能の完了にはUS2とUS3および横断検証も必要である。
実装・検証の完了状況は上記チェックボックスとvalidation.mdを参照する。T031の各OS実WebView確認は環境不足のため未完了。
