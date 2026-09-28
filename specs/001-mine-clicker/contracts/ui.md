# UI契約: Mine Clicker

## 全画面の共通規則

UIは英語、文書は日本語。通貨ラベルを `Credits`、生産量を `Credits/s` に統一する。
世界観のscrapは採掘物を指す説明として使用できるが、残高・費用の別通貨を意味させない。
固定1280×720とFITを維持し、960×540でも主要操作が欠けない。

| 操作・表示 | 入力 | 結果 |
| --- | --- | --- |
| START DIGGING / CONTINUE | クリック、Space、Enter | ownedは保存済み進行、ephemeralは同じメモリ内進行を開始 |
| 鉱床 | クリック、Space | 1回の採掘。キーのrepeatでは追加採掘しない |
| Supply Depot | 行クリック | 提示数量・費用で購入。不足時は状態を変更しない |
| BUY x1 / BUY x10 / BUY MAX | ボタン、Q | 数量モード切替。10個は部分購入しない |
| FORGE PICK | 行クリック | 購入成功時だけレベルと採掘量を更新 |
| DUST CROWN | 行クリック | 一度だけ達成。継続後も同じ進行 |
| SOUND | ボタン、M | BGMと効果音を一括ミュート・解除 |
| NEW RUN | 既存の再確認操作 | ownedは保存を削除、ephemeralはメモリ内進行だけを初期化 |

残高・1回の採掘量・毎秒収入は常時確認できる。行の名称・価格・所有数・能力・購入可否を一貫して表示し、丸めた表示値を購入判定には使用しない。
通常・砂嵐・キャッシュ・フレンジー・離席通知・達成の全状態で英語を確認する。効果音と視覚反応の入力結果を一致させる。

## 同時プレイ制限

後の画面にはゲームを開始せず、次の英語案内を表示する。

- 見出し: `GAME ALREADY OPEN`
- 説明: `This save is already in use in another tab or window.`
- 再開案内: `Close the other game, then reload this page to continue.`

採掘、自動収入、離席収入、購入、保存、NEW RUNを実行しない。自動的にプレイ権を奪わない。

## 保存なしの一時プレイ

API非対応・取得例外は競合と区別し、ゲームを新規状態から起動する。Title・Game・Victoryすべてで次の英語案内を常時表示する。

- 見出し: `TEMPORARY PLAY — NOT SAVED`
- 説明: `Saving is unavailable. You can play, but progress will be lost when you reload or close this page.`

同じ画面内の進行は保持し、採掘・購入・強化・達成を通常どおり許可する。CONTINUEは共有保存を検査せず、現在の一時進行だけから判定する。NEW RUNは確認後に一時進行だけを初期化する。共有保存を読み書き・削除せず、離席通知を表示しない。ロック所有中の保存失敗も現在のプレイを継続し、通知は英語にする。

## 受け入れ参照

FR-001〜012・015・016・018、SC-001〜005・008・009・012・013とストーリー1〜4を判定基準にする。
