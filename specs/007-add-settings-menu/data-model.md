# データモデル: Settings画面

## SoundSettings

`run.settings`に保持し、ランのStateや実績とは独立する。

| フィールド | 型 | 意味 | 初期値 |
| --- | --- | --- | --- |
| bgmEnabled | boolean | 音楽を許可する | true |
| sfxEnabled | boolean | 操作音・イベント音を許可する | true |

読み取り規則は[保存契約](contracts/settings-persistence.md)に従う。
UIの選択は即座にライブ設定へ反映し、音声経路に適用してから保存する。
ownedだけが永続保存でき、ephemeralはライブ値のみ変更、blocked/acquiring/releasedは変更しない。
Mキーは両方trueの場合だけ両方false、それ以外は両方trueへ変更する。
NEW RUN、転生、タイトル復帰で音声設定を初期化しない。

## SettingsContext（保存しない）

| フィールド | 型・値 | 制約 |
| --- | --- | --- |
| ownerKey | Title / Game / Reign / Achievements / Victory | 開いた親を一つ保持 |
| previousInputEnabled | boolean | 元のinput.enabledへ戻すための値 |
| previousKeyboardEnabled | booleanまたは未存在 | keyboardがある場合だけ復元 |
| closing | boolean | 同じ終了操作の二重実行防止 |
| returningToTitle | boolean | 終了する親の入力を復元しない |
| generation | 起動ごとに異なる識別値 | 過去のPromiseで新しい画面を更新しない |

遷移は「閉じた状態 → 親入力無効化 → Settings表示 → 通常終了またはタイトル復帰」。
通常終了では次フレームに親入力を復元し、親を再作成しない。
親shutdownまたはゲーム破棄では購読を解除して終了し、存在しない親を復帰させない。

## FullscreenView（保存しない）

| フィールド | 型・値 | 制約 |
| --- | --- | --- |
| available | boolean | 標準APIとdocumentの許可状態から判断 |
| active | boolean | 実際のfullscreenElementがゲーム対象であるか |
| pending | boolean | 要求中の重複要求のみ抑止 |
| message | なし / 非対応 / 変更失敗 | 他の操作を妨げない表示 |

要求時にactiveを反転しない。成功・環境側解除時に実際の状態を再取得する。
失敗しても音声設定やランを変更しない。終了後の結果は表示に適用しない。

## 音声ランタイム（保存しない）

- SoundManagerごとにMUSICインスタンス最大1個。BGMの個別muteはsfxEnabledに依存しない。
- WebAudio利用時はmanagerごとの共有SFXゲインと再生中source集合を保持する。
- OFF時は出力を0にしてsourceを終了し、新規再生を拒否する。ONで過去の効果音を再実行しない。
- source終了でノード接続・参照を解放し、manager破棄でゲインと残存sourceを破棄する。
- 音声未解除・非対応時は設定値を保持し、再生できないことを理由にゲームを停止しない。

## 継続中のラン

既存`run.state`、実績、accountedAtMs、期間限定効果の時計を再利用する。
新しい保存フィールドは追加しない。Settingsの開閉中も既存の更新を続ける。
タイトル復帰でsettleRunを呼んでから保存し、CONTINUEでは既存のrun.stateを使う。
既存Game.shutdownによる一時効果終了は維持するが、通常のSettings開閉ではshutdownを呼ばない。
