# 転生(Reign)と実績 設計書

王冠チェーン(`CROWNS`、PR #17)の次の目標として、転生(Reign)と実績を追加する。実績は将来 Steam の実績にもつなげる。
状態: 設計確定。PR 1(Reign コア)は実装済み。実績(PR 2)と Steam(PR 3)は未実装。

## 決定事項

| 項目 | 決定 |
|---|---|
| 転生の解放 | 王冠を1つ取得した後ならいつでも(獲得できる Shard が1個以上のとき) |
| 王冠のコスト | 周回で変えない。短縮タイムを競う |
| 実績の保存先 | セーブとは別キー(NEW RUN で消えない) |
| Steam | デスクトップ版(Tauri)のみ。Web 版はローカル実績だけ |

## 1. 転生(Reign)

### ルール
- **ASCEND の条件**: `crowns >= 1` かつ `shardsForReign(reignTotal) >= 1`。
- **Shard の獲得量**: `floor(cbrt(reignTotal / 1e7))`。`reignTotal` はその周回で稼いだ累計。
  - 例: 1段目到達時で約2個、1e12 で46個、1e14 で215個。
- **Shard の効果**: 累計獲得数(`shardsEarned`)1個につき全生産 +2%。消費しても減らない。
- **リセットされるもの**: `scrap`、`owned`、`pick`、`crowns`、`reignTime`、`reignTotal`。
- **引き継ぐもの**: `reigns`、`shards`、`shardsEarned`、`relics`、累計統計、実績、設定、`playTime`。
- **開始時の状態**: Relic(Head Start / Forge Memory)の効果を適用する。

### Relic(Shard で購入)
| id | 名前 | 効果 | 最大Lv | コスト(Shard) |
|---|---|---|---|---|
| `storm_caller` | Storm Caller | 嵐の倍率 ×2 → ×3 | 2 | 10 / 40 |
| `gold_rush` | Gold Rush | ゴールドキャッシュ確率 +2.5%/Lv | 2 | 15 / 60 |
| `long_shift` | Long Shift | オフライン上限 +2h/Lv | 3 | 8 / 25 / 80 |
| `head_start` | Head Start | 開始時に Scavenger +10体/Lv | 5 | 5 / 10 / 20 / 40 / 80 |
| `forge_memory` | Forge Memory | 開始時の Pick レベル +1/Lv | 4 | 6 / 15 / 40 / 100 |
| `frenzy_lord` | Frenzy Lord | 豊作の持続時間 +5秒/Lv | 3 | 20 / 60 / 150 |

### バランス上の注意
王冠のコストが固定なので、Shard が増えるほど周回は速くなる。1周目の1段目は約106分だが、215個(×5.3)なら20分前後になる計算。
数周で頭打ちになるが、短縮タイムを競う設計なので許容する。物足りなければ、周回ごとの王冠コスト倍率を後から追加できる。

### State の追加(`SAVE_KEY` は v1 のまま)
`reigns`、`shards`、`shardsEarned`、`relics: number[]`、`reignTime`、`reignTotal`、
`stats: { storms, caches, golds, jackpots, fastestCrown }`(`stats` は実績に使うので PR 2 で追加する。PR 1 は他の6つだけ)。

- `deserialize` は欠けたフィールドを 0 / 空で補う(既存の方針どおり)。
- `playTime` は累計のまま残し、Victory の「TIME TO THE …」は `reignTime` で表示する。
- 旧セーブは `reigns = 0`、`reignTime = playTime` として読み込む。

## 2. 実績

### 保存
- キー `dust-baron-achievements-v1`、中身は `{ [id]: unlockedAtMs }`。
- セーブと分離するため、NEW RUN で消えない(Steam の実績は取り消せないため、挙動を揃える)。
- 保存失敗時は、`storage.ts` の既存の一時プレイの扱いに合わせる。

### 一覧(24個、`id` は固定)
- **進行**: `crown_1`〜`crown_5`、`tier_7`〜`tier_10`
- **周回**: `reign_1`、`reign_5`、`shards_100`
- **スピード**: `fast_crown_60`、`fast_crown_30`(`reignTime` で判定)
- **イベント**: `first_storm`、`first_gold`、`jackpot_10`
- **採掘**: `dig_100`、`dig_1k`、`dig_10k`
- **所持**: `own_500`(同一Tierを500体)、`all_milestones`
- **隠し**: `frenzy_777`、`pick_20`

名前・説明文・隠し指定は `config.ts` に置く。

### 判定
- `achievements.ts`(純関数): `newlyUnlocked(state, unlocked): string[]`。Phaser にも DOM にも依存しない。
- `Game.update()` から約1秒ごとに呼び、解除があればトースト表示と `platform.unlock(id)`。

## 3. ファイル構成
| ファイル | 内容 |
|---|---|
| `src/config.ts` | `SHARD_*`、`RELICS`、`ACHIEVEMENTS`(定義のみ) |
| `src/economy.ts` | `shardsForReign`、`ascend`、`buyRelic`、`relicMult` など |
| `src/achievements.ts` | 判定の純関数 |
| `src/platform.ts` | `unlock(id)` の1点。Web は何もしない版 |
| `src/scenes/Reign.ts` | 獲得 Shard の予告、Relic ショップ、確認 |
| `src/scenes/Title.ts` / `Game.ts` | 実績一覧への導線、ASCEND ボタン、解除トースト |

## 4. Steam 実績

### 実現方法
デスクトップ版(Tauri)で `steamworks-rs` を使い、`unlock_achievement(id)` を Tauri コマンドとして公開する。
`platform.ts` の Tauri 版がこのコマンドを呼ぶ。Web 版は何もしない。

### 前提
- Steamworks パートナー登録とアプリ ID。
- 実績を Steamworks 側にも登録する(API 名 = 上記の `id`、名前、説明、解除前後のアイコン)。
- Steam クライアントが起動していること。Steam 外から起動した場合は何もしない。
- Steam 用ビルドは別に用意する(steamcmd でアップロード)。現在の `Release` ワークフローとは独立。

### 注意
- **オーバーレイ通知**: WebView ベースのアプリでは Steam の解除ポップアップが出ない可能性がある(未検証)。ゲーム内トーストは必須。
- **検証環境**: WSL には webkit が無く、CI も Rust 側をコンパイルしない。実機の Windows と Steam クライアントでの検証が必要。
- **再送**: 起動時に、解除済みの全 `id` を Steam へ再送する(冪等)。後から Steam 対応しても過去の解除が反映される。
- **規約**: Tauri 側の capability(現在は `core:default` のみ)に、追加のコマンドを許可する設定が要る。

## 5. 実装の分割
1. **PR 1: Reign コア**
   - テスト: Shard 計算、リセット対象と引き継ぎ対象、Relic の効果、旧セーブの互換。
   - ペーシング: ボットを周回込みにし、2周目が1周目より速いことを確認する。
2. **PR 2: 実績**
   - テスト: 判定の純関数、別キー保存、NEW RUN で消えないこと。
   - UI: トースト、一覧画面。
3. **PR 3: Steam 橋渡し**
   - 条件: Steamworks のアカウントが用意でき次第。実機の Windows で検証する。
