# 保存契約: 独立した音声設定

**対象**: FR-003、004、011、014

## キーと形式

既存キー`dust-baron-settings-v1`を維持する。新しい書き込み内容は次の2項目に限定する。

```json
{"bgmEnabled":true,"sfxEnabled":false}
```

全画面、復帰先、ランの進行、実績をこのキーへ保存しない。

## 読み取りの優先順位

各項目について独立して、対応する新しいboolean → 旧soundEnabledのboolean → 既定trueの順で選ぶ。
数値、文字列、null、配列をbooleanへ暗黙変換しない。不正JSONと読み取り例外では両方trueにする。

| 保存値 | BGM | 効果音 |
| --- | --- | --- |
| 未保存 / 不正JSON / 配列 | ON | ON |
| soundEnabled: false | OFF | OFF |
| soundEnabled: true | ON | ON |
| bgmEnabled: false, sfxEnabled: true | OFF | ON |
| soundEnabled: false, bgmEnabled: true | ON | OFF |
| soundEnabled: false, sfxEnabled: true | OFF | ON |
| bgmEnabled: false, sfxEnabled: null | OFF | ON |
| soundEnabled: false, bgmEnabled: "true" | OFF | OFF |

表の保存値はJSONオブジェクトの内容を簡略表記している。
新形式の保存後は旧soundEnabledを出力しない。ランと実績の保存形式・キーは変更しない。

## モードと失敗

- owned: 起動時読取、変更時保存。ライブ値と音声反映は書き込みより先に行う。
- ephemeral: ストレージの読み書きを行わず、同じ起動中の両設定を保持する。
- blocked/acquiring/released: 設定変更・書き込みを行わない。
- 保存例外: falseを返して操作を続け、ライブ値と音声反映を巻き戻さない。
- 設定が変わらないフレームで保存・読取を繰り返さない。
- NEW RUNやタイトル復帰で設定キーを削除しない。
