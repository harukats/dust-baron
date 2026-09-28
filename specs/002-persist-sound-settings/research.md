# 調査結果: 音声設定とタイトルBGM

## 1. 設定の保存方式

**決定**: 音声設定は専用キー`dust-baron-settings-v1`で保存し、進行キーは変更しない。

**理由**: main.bootではownedのrun.stateがnullのままTitleへ入り、Gameで初めてinitializeRunする。タイトルでwriteSave(loadSave())を使うとlastSaveを更新して離席収益を失う。設定と進行を独立させれば旧セーブの移行やNEW RUNの設定引き継ぎが不要になる。仕様の同じlocalStorageに保存する要求を満たす。

**比較した案**: Stateへの追加、進行セーブのラッパー形式、設定キー分離。前二者はタイトルでの部分更新や旧形式移行、リセット時の設定退避が増えるため採用しない。

**根拠**: src/main.tsのboot、src/storage.tsのinitializeRun/writeSave/resetRun、src/storage.test.ts。

## 2. 保存制約と初期化

**決定**: 設定の読み書きもownedのみ許可する。セッション確定後に設定を読み込み、音声シーンのcreate冒頭でミュートへ適用する。一時プレイではONで開始し、同一ページ内でライブ設定を維持する。

**理由**: 既存テストはowned以外のread/write/removeをすべて禁止している。設定だけ例外にすると一時プレイやロック競合の意味が変わる。設定保存は進行保存を呼ばず、失敗してもメモリ設定を戻さない。

**比較した案**: 全モードで設定だけ保存する方法、Titleで進行を先に初期化する方法。共有保存制約とオフライン計算時点を変えるため採用しない。

## 3. BGMと音声解除

**決定**: Title.createから共通ensureMusicを呼び、解除待ちはUNLOCKEDで扱う。Game/Victoryでも共通処理を使い、音声解除前のシーン移動に対応する。

**理由**: PhaserのSoundManagerはゲーム全体で共有され、音楽はシーン移動後も存在する。get(MUSIC)とisPlaying/isPausedで既存曲を再利用し、重複playを防ぐ。解除コールバックは設定をキャプチャせず、実行時の最新設定を確認する。

**比較した案**: ゲーム開始ボタンでのみ再生する現状、独自DOM解除リスナー、フレームごとの再生試行。タイトル再生の要件に合わない、Phaserの解除処理を重複させる、不要な処理を増やすため採用しない。

**根拠**: .agents/skills/phaser-audio-and-sound/SKILL.md、node_modules/phaser/src/sound/BaseSoundManager.js、src/sound/webaudio/WebAudioSoundManager.js（node_modules/phaser配下）。音声の自動開始は実行環境の制限を受けるため、初回操作後の解除を扱う。[MDNの自動再生ガイド](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)。

## 4. SEのミュート

**決定**: global muteを音声出力の制御に使い、Sfx.playでミュート中の音源生成を抑止する。

**理由**: 導入版WebAudioSoundManagerではdestinationはmasterMuteNodeで、その後masterVolumeNode、AudioContext.destinationへ接続される。既存Sfxの接続先は正しい。生成抑止を加えるとOFF中の長いSEがON直後に聞こえることを防げる。

**比較した案**: BGMだけのmute、Sfx専用AudioContext、毎回音源を生成して出力だけ止める方法。共通設定やマスター音量への適合、OFF中のイベントの持ち越し防止で不利なため採用しない。

**範囲**: OFF以前に鳴り始めたSEはglobal muteで無音になる。OFF中に発生するSEを生成・遅延再生しないことが今回の持ち越し禁止条件であり、開始済み音源の再設計は不要とする。

## 5. 検証手段

**決定**: 保存と境界条件は既存Nodeテスト、操作・遷移・解除は既存Playwright、聞こえ方は実音確認で検証する。

**理由**: isPlayingだけでは音が聞こえている証明にならない。共有マスターのミュート状態と実音を両方確認する。既存E2Eの設定・window.game・操作ヘルパーを再利用できるため追加依存は不要。

**比較した案**: E2Eのみ、Nodeテストのみ、新しい音声テスト基盤。保存不変条件または実音が検証できない、保守負担が増えるため採用しない。

調査時点のソース確認で設計上の未解決事項は解消した。実際の音声応答とWebView動作は実装後の検証項目である。
