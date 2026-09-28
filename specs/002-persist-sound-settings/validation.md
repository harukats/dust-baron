# 実装・検証記録: SOUND設定

- 作業ブランチ: `002-persist-sound-settings`
- Node: 26.10.0、pnpm: 12.5.1。既存依存を利用。
- `.gitignore`とRust側ignoreを確認。privateパッケージのためnpm公開用ignoreは不要。
- 前後フック登録ファイルなし。品質チェック16項目合格。
- 分析のU1/A1/I1をタスク・計画・検証ガイドへ反映。

## 修正前の再現と基準値

- 厳格なdocument-user-activation-requiredで初期AudioContext suspendedを確認。空白クリック後もBGMが開始せず、1秒の再生待ちで失敗（修正前）。
- 初回テストのuser-gesture-requiredはWebAudioがrunningで、解除待ちを再現できなかったためポリシーを変更した。
- 初回headed Chromium基準値のGame frame p95は24.8/26.5/27.9ms、FPSは45.11/43.25/43.21、最大操作応答は2.6/2.1/2.2ms（実行ログ）。出力先test-resultsのJSONは後続E2Eの清掃で消えた。Title試行1は表示が消え比較対象として無効、試行2/3は20.0/20.0msだったため、Titleはコミット済みHEADを別サーバーへ展開して3回補測する。環境は安定60FPSに届かず、相対退行を比較する。
- 修正前の設定キーread/writeは全試行0件。Titleではmute=falseなのにSOUND:OFFになる表示不整合も観測した。
- T003〜T010: 設定モデルと共通音声制御、Title初期再生、OFF中SE抑止を実装。保存APIは回帰検証用の最小実装を用意した。

## 段階検証

- US1のE2E 5件合格。初期suspended、空白クリック、最初のOFF（マウス/M）、10回切替、一重再生、OFF中SE生成0を確認。
- ブラウザのmasterVolumeNodeから音声波形を測定し、BGMとタイトル確認SEでONはpeak > 0.0001、OFFはpeak = 0を確認。人によるスピーカー聴取とは区別する。
- M入力直後のアサーションはPhaserの次フレームで入力処理が完了するまで待つよう調整した。
- US2修正前: SPACEによる初回遷移でBGM未再生、遅延UNLOCKEDのGame側リスナー0件を再現。Game/Victoryにも共通処理を接続した。
- US3のNode回帰: 読込・保存APIの仮実装に対し、boolean false復元と即時保存の2件が振る舞いのアサーションで失敗することを確認。

- US2のE2E 5件合格（ON/OFF遷移、SPACE開始、20周、遅延解除の引き継ぎ）。
- 保存実装後のNode 29件合格。解析の欠落・不正値、非ownedアクセス禁止、例外、NEW RUN、離席収益を検証。
- 初期suspended時はPhaser.muteのgetterがAudioParam.gain.valueを参照し、予約済みの0をまだ返さない。復元テストはライブ設定OFF・音源未開始と、解除後のgain=0を検証するよう修正。設定表示はライブ設定を参照するため初期OFF表示を維持する。
- lintとbuild（型検査→Node29件→Vite）合格。テストのStorageラッパーにあった型不一致と整形4件を修正。
- 自動再生許可ケースはPlaywrightのdescribe内でlaunchOptionsを変更できないため、独立したChromiumで検証する。

## 最終のブラウザ検証

- 指定の関連E2E: 38件すべて合格（2.2分）。音声、保存、旧セーブ、所有権、一時プレイ、HMR、復帰を含む。
- 追加のblur/focus経路: 1件合格（3秒）。音声Contextのsuspend/resume、BGM1個と復帰後の出力信号を確認。headlessでの別タブ操作はblurを再現できなかったため、Phaserイベントで検証した。実タブのフォーカス・実スピーカー聴取は実機確認と区別する。
- BGM/確認SE/採掘/購入失敗/Victoryのブラウザ出力を測定。ONで信号、OFFでpeak=0。音量・ミュートの出力グラフを維持する。
- タイトル・Game各ON/OFF変更直後の4通りで復元成功。OFF起動は音源未開始、解除後のgain=0で無音を確認。NEW RUN後もOFF保存を維持。
- pageshow: ownedは停止中に変えた保存値を再読込。ephemeralは共有保存へのアクセスなしでライブOFFを保持し、完全再読込では既定ON。
- 設定キーgetItemはbootで1回、setItemは切替1回につき1回。シーン移動・待機だけでは設定書込みが増えない。

## 実機検証の制約

- pkg-configでwebkit2gtk-4.1とdbus-1が見つからないことを確認。このWSLではTauri/WebView検証を実行できない。Rust/デスクトップ側や権限・依存は変更していない。
- T024は未完了。対応OS/WebViewで初期ON/OFF、初回解除、画面遷移、保存復元、実音を確認する必要がある。ブラウザの波形確認をWebViewや人による実音聴取の合格として扱わない。

## 性能比較と最終チェック

- headed Chromium 153.0.8010.12、WSL2 6.18.33.2、AMD RYZEN AI MAX+ 395、1280×720、DPR=1。各条件10秒準備＋60秒×3回、5秒間隔のM操作10回。基準コミットは63f4933836264cbf59a80775dea7f39e1c90b5d6、変更後は本作業の未コミット差分。
- Title補測はコミット済みHEADの一時展開を8081で、変更後は作業ツリーを8080で実行。中断時の補測プロセスは終了し結果ファイルがなかったため再実行した。重いビルド/テストは計測に並行させていない。
- 保持した結果: [変更前Title](performance-before-title.json)、[変更後Title/Game](performance-after.json)。変更前Gameは冒頭の実行ログ値を使用する。

| 条件 | 変更前frame p95各回(ms) | 変更後frame p95各回(ms) | 中央値の変化 | 変更後FPS各回 |
| --- | --- | --- | --- | --- |
| Title | 20.7 / 20.2 / 20.3 | 20.5 / 20.8 / 21.4 | 20.3→20.8 (+2.46%) | 54.52 / 54.49 / 53.02 |
| Game | 24.8 / 26.5 / 27.9 | 25.3 / 25.6 / 25.2 | 26.5→25.3 (-4.53%) | 44.60 / 44.66 / 44.76 |

- 各回のp95中央値による前後比較は悪化10%以内。60FPSの目標はこの環境では未達で、変更前からの制約として併記する。
- 変更後60操作の次フレームまでの最大応答は2.5ms。音声・表示の更新内容はE2Eのライブ値/表示/出力信号アサーションで別途検証している。
- 全6回で設定getItem=1、setItem=10、MUSIC登録=1、終了時SOUND:ONとmute=falseが一致。待機・遷移のみ書込0と非ownedアクセス0はE2E/Nodeで合格。
- pnpm testは29件合格、pnpm buildは型検査・29件・Vite出力すべて合格。関連E2E38件＋追加focus1件合格。最終typecheck合格。追加した計測JSON2件のみlintで整形違反が出たため、値を変えずBiome整形後、最終lintは48ファイルすべて合格。git diff --checkも合格。

## 要求と検証の対応

以下はNode・Chromiumで確認した結果。SC-001〜003の人による聴取と対応WebViewでの確認はT024の残項目に含む。

| 要求 | ブラウザ・Nodeで確認した内容 | 検証タスク |
| --- | --- | --- |
| FR-001・002 / SC-001 | 自動再生許可時のTitle BGM、操作による解除、最初のOFF、遅延解除の画面間引継ぎ | T006・T011・T016 |
| FR-003・004 / SC-002 | ボタン/M各10回、表示とライブ値、BGMと各SEのON信号/OFF無音、OFF中SE生成なし | T006・T011・T012・T016・T023 |
| FR-005・006 / SC-003 | ON/OFFの開始・CONTINUE・Victory・Title・再開始、20周でBGM最大1個、購読の解放、blur/focus経路 | T012・T016 |
| FR-007・008 / SC-004 | 切替即時保存、Title/Game×ON/OFFの4通り即時再読込、OFF起動で音源未開始・解除後gain=0 | T017・T021 |
| FR-009・010 / SC-005 | 保存キー分離、既存セーブ維持、不正/欠落で既定ON、進行・lastSave・離席基準不変、離席収益1回 | T017・T021・T022 |
| FR-011 / SC-005 | NEW RUNで進行のみ初期化、メモリ/保存のOFF維持 | T017・T021 |
| FR-012 | 非owned設定アクセス0、一時プレイでライブ操作、取得/読込/書込例外でも継続、HMR・pageshow復元 | T017・T021・T022 |

- 最終のafter_implementフック確認: `.specify/extensions.yml`なし。T001〜T023・T025の24件完了、T024のみ環境制約により未完了。
