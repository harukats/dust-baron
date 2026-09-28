# データモデル: SOUND設定

## SoundSettings

| フィールド | 型 | 既定値 | 意味 |
| --- | --- | --- | --- |
| soundEnabled | boolean | true | BGMとすべてのSEを有効にする |

ライブ設定はstorage.tsのrun.settingsで管理し、シーンの所有物にしない。初期値はconfig.tsの定義を利用する。
保存内容は`{"soundEnabled":true}`または`{"soundEnabled":false}`で、キーは`dust-baron-settings-v1`。

### 妥当性規則

- 保存値なし、読み取り失敗、不正JSON、null・配列・非オブジェクトは既定ON。
- soundEnabledがbooleanの場合だけ採用する。文字列false、数値0などをOFFへ変換しない。
- 不明フィールドは無視する。進行セーブの解析・破棄を伴わない。
- 値は現在の起動内で直ちに更新し、保存失敗で巻き戻さない。

## Stateと保存進行

既存State、`dust-baron-save-v1`、lastSaveを変更しない。音声設定更新はinitializeRun、settleRun、writeSaveを呼ばない。
NEW RUNのclearSave/resetRunは進行にだけ作用する。設定とスコアを同じ保存領域で保持するが、相互の書き込みは独立する。

## 状態遷移

| 状態・操作 | ライブ設定 | 保存アクセス | 音声出力 |
| --- | --- | --- | --- |
| ownedで起動・再取得 | 保存値、なければON | 設定を1回読む | 発音前に適用 |
| ephemeralの新規起動 | ON | なし | 発音前に適用 |
| ephemeralの同一ページ内再起動 | 最新ライブ値 | なし | 再生成した音声管理へ適用 |
| ownedで切り替え | ON/OFFを反転 | 設定だけ即時保存 | muteを同期反映 |
| ephemeralで切り替え | ON/OFFを反転 | なし | muteを同期反映 |
| acquiring/blocked/released | 変更しない | なし | 操作不可 |
| シーン移動・NEW RUN | 維持 | 設定の書き換えなし | 維持 |
| UNLOCKED | 最新値を参照 | なし | ONならBGMを開始 |

音声出力の状態（locked、isPlaying、isPaused）はPhaserが管理し、保存しない。`manager.mute = !run.settings.soundEnabled`の対応を保つ。
