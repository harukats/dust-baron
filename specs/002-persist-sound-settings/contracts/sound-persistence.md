# 保存契約: 音声設定と進行保護

## 保存先と所有権

設定は`SETTINGS_KEY = 'dust-baron-settings-v1'`へJSONで保存する。進行キー`dust-baron-save-v1`を変更しない。
設定読み書きはownedのみ許可する。acquiring・blocked・ephemeral・releasedではlocalStorageへアクセスしない。

## 操作の契約

- 起動: main.bootでrun.mode確定後に設定を復元する。Game生成前にライブ設定を用意し、最初のSE/BGMより前にSoundManagerへ適用する。
- 変更: canPlayで許可される場合だけライブ値を更新する。ownedなら同一操作内で設定キーへ保存する。タイトルでrun.stateがnullでも実行できる。
- 失敗: localStorage取得、getItem、setItemの例外を捕捉する。読込失敗はON、保存失敗はライブ値を保持する。プレイを停止しない。
- 復元: booleanのみ採用し、欠落・不正はON。不明フィールドは無視する。
- NEW RUN: 進行キーだけをリセットし、設定キーとライブ値は維持する。
- 一時プレイ: 初回はON。同一ページ内の再起動は最新値を保持し、再読み込み後の保持は保証しない。

## 進行への不変条件

設定変更前後で進行キーの文字列、lastSave、run.state、run.accountedAtMs、run.offlineを変更しない。
オフライン収益は従来どおりGameのinitializeRunで一度だけ加算する。
通常の進行保存は設定キーを書き換えない。設定変更に伴う保存で進行の初期化を行わない。

## 受け入れ検証

FR-007〜012を、未プレイ状態での保存、4通りの再起動、旧セーブ、不正値、保存例外、全非ownedモード、NEW RUN、離席収益のテストで確認する。
詳細は[quickstart.md](../quickstart.md)。
