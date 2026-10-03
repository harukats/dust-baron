# データモデル: ゴールド・キャッシュ

## キャッシュ

| 属性 | 型・値 | 所有場所・規則 |
|---|---|---|
| kind | `CacheKind = 'chrome' \| 'gold'` | Game。出現時に固定 |
| pickup | `Phaser.GameObjects.Image \| null` | Gameの `cachePickup`。最大1個 |
| label | `Phaser.GameObjects.Text \| null` | Gameの `cacheLabel`。画像と一緒に破棄 |
| expiresAtMs | 有限の絶対時刻 | Gameの既存期限。出現時刻+10秒 |
| nextSpawnSeconds | 非負の待ち時間 | Gameの既存cacheIn。初回17.5〜35、以後35〜70 |

画像がnullなら回収対象なし。kindもnullへ戻す。出現→回収または期限消滅→待機。削除前にkindを取り出す。回収処理で先にsettleし、時刻が期限以上なら無効。画面再入場は対象を再生成せず待機から始める。

## 一時的な採掘効果

| 属性 | 型・値 | 規則 |
|---|---|---|
| frenzyMult | `1 \| 7 \| 777` | `run` に追加。初期値1 |
| frenzyEndsAtMs | 有限の絶対時刻 | `run` の既存値。初期値0 |
| frenzyLeft | 非負秒数 | Gameの表示用派生値。正の状態源にしない |

有効倍率は期限未満かつ有効な倍率なら7/777、それ以外は1。終了後の保持値が777でも純粋な期限判定により無効となる。初期化では必ず1と0をセットで書く。

| 現在 | 取得 | 結果 |
|---|---|---|
| 通常・期限切れ | 7 | 7倍、now+20秒 |
| 通常・期限切れ | 777 | 777倍、now+20秒 |
| 有効7 | 7 | 7倍、now+20秒へ更新 |
| 有効7 | 777 | 777倍、now+20秒へ置換 |
| 有効777 | 7 | 倍率・期限を維持、予約なし |
| 有効777 | 777 | 777倍、now+20秒へ更新 |

## 純粋コアの関数契約（命名は実装時に確定）

- `selectCacheKind(roll)`：0以上1未満の乱数値を受け、gold閾値0.1で分類する。非有限値または範囲外ならchromeを返す。
- `cacheReward(state, kind, roll)`：goldはrollを参照せず必ず777倍を返す。chromeは有限かつ0以上1未満のrollに対し、roll<0.5で倍率なしの即時報酬、それ以外で7倍を返す。不正なchrome報酬抽選値なら報酬なしを返す。報酬は `credits`、`frenzy`、`none` の判別可能な値として返し、Stateの変更は呼び出し側で行う。`none` は資源・倍率・終了時刻を変更しない。
- `activeDigMultiplier(mult, endsAtMs, nowMs)`：期限境界を判定し1/7/777を返す。
- `applyDigFrenzy(mult, endsAtMs, incomingMult, nowMs)`：上表の倍率・期限を返す。非有限時刻は無効として現在の有効効果を変更しない。未知の倍率は有効効果として扱わない。
- `digGain(state, mult, endsAtMs, nowMs)`：`clickPower(state, perSecond(state))` × 有効倍率。内部で時刻取得・Phaser操作・保存をしない。

通常の内部呼び出しはMath.randomの0以上1未満、run.nowの有限時刻を保証する。種類抽選の非有限値・範囲外はchromeへ倒す。chrome報酬抽選の不正値は報酬なしとし、資源・既存倍率・終了時刻を変更しない。goldでは報酬抽選を行わない。不正値はNaN、正負のInfinity、負数、1以上を含む。倍率・時刻の不正値は1倍扱いとする。有限性を失う獲得量は既存earnの防御で残高へ加算しない。

## 永続状態と互換性

`State`、serialize、deserialize、保存キーは変更しない。倍率効果と出現状態は保存しない。獲得済み資源・累計・クリック数は通常どおり更新する。initializeRun/resetRun/Game.createの解除規則を保ち、run.stateが存在する再入場ではセーブ再読込とオフライン加算を繰り返さない。

`canPlay()` がfalseなら回収・採掘・報酬付与なし。blocked等の所有権ルールは既存sessionを維持する。
