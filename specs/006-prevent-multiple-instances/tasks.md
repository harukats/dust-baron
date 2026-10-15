# タスク: デスクトップ版の多重起動防止

**入力**: `specs/006-prevent-multiple-instances/` の spec.md、plan.md、research.md、data-model.md、contracts/desktop-instance.md、quickstart.md
**構成**: 共通準備 → 共通基盤 → US1（P1）→ US3（P1）→ US2（P2）→ 横断検証
**検証方針**: 仕様のSC-001〜005と憲章IIIに対応する実プロセス試験・実機検証を含む。まず修正前の再現を記録する。実機未実施を合格にしない。

## 表記とパス

`- [ ] T番号 [P任意] [US番号] 説明` を使用する。[P]は、依存タスク完了後に別ファイルの作業と並行できる項目。USラベルはストーリーフェーズだけに付ける。パスはリポジトリルート基準。

## フェーズ1: 準備

**目的**: 作業範囲と修正前の証拠を確保する。

- [X] T001 現在の差分を保全し、main上なら作業ブランチへ移り、実ブランチ名と作業開始コミットを specs/006-prevent-multiple-instances/validation.md に記録する（仕様選択名とGitブランチ名を混同しない）。
- [X] T002 quickstart.md の手順で変更前の配布版の追加起動を再現し、OS・配布形式・既存セーブのバックアップ先・結果を specs/006-prevent-multiple-instances/validation.md に記録する。実行不能のOSは理由と未実施を明記する。
- [X] T003 src-tauri/Cargo.toml の rust-version を最低1.90へ上げ、dirs と getrandom を直接依存へ追加し、src-tauri/Cargo.lock を対応更新する。候補7.0.0 / 0.3.4の解決可能性と最低Rust互換性を確認し、差異は specs/006-prevent-multiple-instances/research.md に反映する。

## フェーズ2: 共通基盤

**目的**: 全ストーリーが共有する境界・型・試験の入口を作る。

- [X] T004 src-tauri/src/single_instance.rs にディレクトリ・乱数を入力に取るTauri非依存の境界と起動結果（io::Result<Option<Ownership>>）/ InstanceGuard / ActivationState を定義する。「Primary / Secondary / Error。SecondaryとErrorからWebView起動へ進まない」「ready / pending / stopping」を型・APIに反映し、src-tauri/src/lib.rs からモジュールを参照する。
- [X] T005 src-tauri/src/single_instance_tests.rs に一時ディレクトリ、同じ試験バイナリの子プロセス、開始バリア、所有者保持・解放、タイムアウト付き回収の共通ヘルパーを作る。src-tauri/src/single_instance.rs から cfg(test) で読み込み、quickstart.md の rustc --test と cargo test の両方で実行可能にする。

**確認地点**: 単体のRust試験入口が利用できる。ゲーム起動の変更はまだ行わない。

## フェーズ3: US1 — 重複起動せずプレイを継続する（P1・MVP）

**目標**: 初回だけゲームを開始し、追加起動・同時起動では既存の進行を保護する。
**独立検証**: 所有者を保持した状態で追加起動10回、未起動から5プロセス同時開始を3組。所有者は1つ、追加ゲーム・音声・保存操作は0件。

- [X] T006 [US1] src-tauri/src/single_instance_tests.rs にロック競合、5子プロセス同時開始×3組、所有者を保持して追加起動10回、ロック取得エラー時にPrimaryを返さない試験を追加し、排他実装前に失敗を確認する。
- [X] T007 [US1] src-tauri/src/single_instance.rs に保存先の準備と失敗時の後始末を実装する。「Unixのディレクトリは0700」「Windowsはユーザー別領域のACLを継承する」を適用し、ゲームセーブへアクセスしない。保存先解決不能や権限エラーから通常起動へ進ませない。
- [X] T008 [US1] src-tauri/src/single_instance.rs に instance.lock を非切り詰めで開く File::try_lock の取得処理を実装する。「ロック取得成功のみが起動許可。PIDやファイル存在は使わない」「ロックファイルのハンドルは複製・子プロセスへ継承しない」「ロックファイルは削除も切り詰めもしない」を守り、WouldBlockとその他のエラーを分離する。
- [X] T009 [US1] src-tauri/src/lib.rs でcontextの識別子 io.github.harukats.dustbaron とユーザー別ローカル領域から共通パスを解決し、WebView生成前に取得する。配置先・PID・バージョンをパスへ含めず、PrimaryだけBuilderを開始し、Secondaryは終了、Errorは原因を標準エラーへ出して終了する。Guardをゲーム稼働期間保持する。
- [X] T010 [US1] src-tauri/src/single_instance_tests.rs の競合試験を実行し、SC-001・002相当の回数・所有者数・結果を specs/006-prevent-multiple-instances/validation.md に記録する。
- [X] T011 [US1] quickstart.md に従い各対象OSで追加起動、同時起動、別ショートカット・同じ配布版のコピー、タイトル・プレイ・Reign・Victoryでの進行維持を確認し、SC-001・002・005の結果を specs/006-prevent-multiple-instances/validation.md に記録する。自然増加や既存側の定期保存を異常と判定しない。

**確認地点**: US1単独で多重起動防止をデモできる。既存ウィンドウの復元はUS2で追加する。

## フェーズ4: US3 — 終了後に再起動できる（P1）

**目標**: 正常終了・強制終了後とも手動解除なしで再起動する。
**独立検証**: 所有者を正常終了・強制終了させ、それぞれ3回再起動する。ロックファイルが残っていても取得できる。

- [X] T012 [US3] src-tauri/src/single_instance_tests.rs に正常終了・子プロセス強制終了後の各3回再取得、残存endpoint、終了処理中の競合と終了完了後の再試行の試験を追加する。既に満たされているケースは回帰試験として成功を記録し、不足する振る舞いを特定する。
- [X] T013 [US3] src-tauri/src/single_instance.rs にGuardの正常終了・部分初期化失敗時の終了管理を実装する。「stopping → 通知スレッド停止・join → endpoint削除 → Fileを閉じて解放」の順を維持し、待受追加前も再取得可能にする。ロックファイルを削除せず、残存endpointを所有権判定に使わない。
- [X] T014 [US3] src-tauri/src/lib.rs でTauriの実際の終了経路とGuard寿命を接続し、ウィンドウが閉じる前の解放や終了取消時の解放を防ぐ。起動失敗時も確実に解放し、強制終了はOSによる解放に任せる。
- [X] T015 [US3] 子プロセス試験と各対象OSの正常終了後・強制終了後の再起動各3回、終了競合を実施し、SC-004と保存内容の通常読み込み結果を specs/006-prevent-multiple-instances/validation.md に記録する。

**確認地点**: US1とUS3のP1機能が成立し、手動のロック解除を必要としない。

## フェーズ5: US2 — 起動済みのウィンドウに戻る（P2）

**目標**: 追加起動で既存ウィンドウを表示・最小化解除し、OSの許可範囲で操作対象へ戻す。
**独立検証**: 起動済みアプリの最小化・背面化後に追加起動し復元する。起動準備中の要求は1件に集約し、通知不能でも多重起動しない。

- [X] T016 [US2] src-tauri/src/single_instance_tests.rs に通知契約の試験を追加する。正しいtokenの受理、不正token・過大データ・途中切れ・期限切れ・古いendpointの拒否、起動準備中の要求集約、停止後の要求無視を検証し、実装前に失敗を確認する。
- [X] T017 [US2] src-tauri/src/single_instance.rs にendpointの書式・公開・読取検証を実装する。「プロトコルバージョン、IPv4ループバックのポート、32バイト乱数の64桁小文字16進表現」「所有者のみ書き込む。追加起動は最大256バイトまで読み、不完全・古い・不正な情報を信頼しない」を守る。契約どおりASCIIの1 <port> <token>形式で、portは1〜65535。待受確保後に公開し、古いendpointは所有者だけが置き換える。Unixではendpoint作成時から0600とし、Windowsはユーザー別領域のACLを継承する。
- [X] T018 [US2] src-tauri/src/single_instance.rs に127.0.0.1のOS割当ポートでの待受・表示要求・OK応答を実装する。要求上限128バイト、1接続の読み込み200ms以内、追加側の接続・読み書き各200ms以下かつ全再試行2秒以内を守る。受理するのはtoken一致のACTIVATE 1だけとし、通知失敗からPrimaryへ昇格せず、停止・joinをT013の終了管理へ接続する。待受は非ブロッキングとし、接続がない場合は終了通知を待つ。終了通知で待機を即座に解除し、接続処理には読み書き全体で200msの総期限を設ける。ゲームの更新ループには待機処理を追加しない。メインスレッドへの配送は完了待ちをせず、終了時のjoinとの相互待ちを防ぐ。
- [X] T019 [P] [US2] src-tauri/src/lib.rs にTauriメインスレッドへ配送する表示処理を実装し、mainに show()、unminimize()、set_focus() を個別に試みる。ウィンドウ不存在や個々の失敗でpanic・再生成せず、トークンをログへ出さない。T018と並行可能だが、通知接続はT020で行う。
- [X] T020 [US2] src-tauri/src/lib.rs で所有者の通知待受と表示処理、追加側の通知と終了を接続する。乱数はgetrandomで生成し、準備失敗ではゲームを開始しない。「複数の表示要求をpending=trueの1件へ集約する。無制限の要求キューを作らない」を実装し、main準備後に保留を処理する。readyへの移行と要求受付の競合による取りこぼし・無制限のメインスレッド配送を防ぐ。macOSのFinder・Dockからの再オープンを RunEvent::Reopen で受け取り、同じ表示復元処理へ接続する。起動準備中は集約し、終了中は処理しない。
- [X] T021 [US2] Rust通知試験と各対象OSの最小化・背面・初回画面表示前の追加起動を実施し、SC-003、通知待ち総計2秒以内、通常復元2秒以内の目標に対する実測とOS制限を specs/006-prevent-multiple-instances/validation.md に記録する。macOSはFinder・Dock・open -nの各経路で最小化解除と既存ゲームの継続を確認する。

**確認地点**: US1・US3・US2が揃い、通知が排他を弱めず終了時のリソース解放も維持する。

## フェーズ6: 横断検証と仕上げ

- [X] T022 src-tauri/src/single_instance.rs と src-tauri/src/single_instance_tests.rs の全試験を単独rustcおよび対応環境のcargo test --lockedで実行し、US2追加後の同時起動・強制終了・通知途中の終了を再検証する。接続なし・要求途中・通知処理中の各状態から終了処理が1秒以内に完了し、ロックを再取得できる試験を追加して実行する。結果と失敗修正を specs/006-prevent-multiple-instances/validation.md に記録する。
- [X] T023 src-tauri/Cargo.toml と src-tauri/Cargo.lock の整合性、cargo fmt --check、pnpm lint、pnpm typecheck、pnpm test、pnpm buildを確認し、結果を specs/006-prevent-multiple-instances/validation.md に記録する。環境制約によるRust検証不能をWeb成功で代替しない。
- [X] T024 .github/workflows/release.yml の既存手動Release（pages_tag空）または同等の対応環境でWindows・macOS Universal・Linuxのlockedバンドルを検証し、SC-001〜005の最終実機結果とともに specs/006-prevent-multiple-instances/validation.md に記録する。未実施OS・未合格項目があれば本タスクは未完了のままにする。タグ作成・公開・Pages配布は行わない。
- [X] T025 実装したコマンド・依存・制約に合わせ specs/006-prevent-multiple-instances/quickstart.md と plan.md を更新し、AGENTS.md に最低Rustバージョンと単一起動の責務・検証方法を追記する。新規JS権限・ゲームState・セーブ形式変更がないこととFR-001〜007の追跡を確認する。

## 依存関係と実行順

```text
準備 T001→T002→T003
  → 共通基盤 T004→T005
  → US1 T006→T007（保存先準備）→T008（排他取得）→T009（起動接続）→T010→T011
  → US3 T012→T013→T014→T015
  → US2 T016→T017→T018 ─┐
                  T019 ─┴→T020→T021
  → 横断検証 T022→T023→T024→T025
```

T019はT016完了後にT017〜T018と並行できる。実機環境が不足してT011/T015を実行できない場合は未完了として残し、既存のコード・自動試験が成立していれば次の実装へ進める。ただし最終完了はT024の全対象OSの検証まで認めない。

## 要件の対応

| 要件・成果 | 実装・検証タスク |
|---|---|
| FR-001・003 / SC-001・002 | T006〜T011、T022、T024 |
| FR-002・007 / SC-005 | T009〜T011、T020、T024 |
| FR-004 / SC-003 | T016〜T021、T024 |
| FR-005 / SC-004 | T012〜T015、T022、T024 |
| FR-006 / 全OS | T011、T015、T021、T024 |
| endpoint・通知の制約 | T007、T016〜T020、T022 |

## 並行実行例

- **US1**: 同じRustファイルを連続変更するため実装の並行化はしない。T009後の自動試験と、安定した同一ビルドを使う複数OSの試験は別環境で実行できるが、共通validation.mdへの記録は統合して行う。
- **US3**: 終了処理の実装は逐次実行する。T014完了後のWindows・macOS・Linuxの再起動試験は別環境で並行できる。T015は結果をまとめて判定する。
- **US2**: T016完了後、T017〜T018の標準Rust通信実装とT019のTauri表示処理は別ファイルなので並行できる。双方完了後にT020で接続する。

## 実装と段階的な確認

1. 準備・共通基盤・US1で、追加ゲームを開始しない最小のMVPを作りSC-001・002・005を確認する。
2. 次に同じP1のUS3で終了後の再起動を確認する。US1の暫定実装をそのまま公開せず、復旧まで確認する。
3. P2のUS2でウィンドウ復元を加え、通知と終了の競合を含めて既存試験を再実行する。
4. 3OSのlockedビルドと全受け入れ試験が揃ったところでレビュー可能な完了とする。

全25タスク。共通・横断9件、US1が6件、US3が4件、US2が6件。実装とローカル検証は validation.md に記録。未完了のT002・T011・T015・T021・T022・T024は実機再現・各OSのWebView・Cargo検証の環境制約による。外部ワークフローは起動していない。
