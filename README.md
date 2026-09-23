# Dust Baron

錆とクロームと砂嵐の世界で、スクラップを掘って成り上がる放置系マイニングゲーム。
[Phaser 4](https://phaser.io/) + Vite + TypeScript で作っています。

![Dust Baron のプレイ画面](docs/screenshot.png)

## 遊び方

鉱床をクリックしてスクラップを掘り、Supply Depot でクルーや機械を雇って採掘を自動化します。
最終目標は **Dust Crown**(2億5000万スクラップ)の購入です。クリア後もそのまま続けて遊べます。

| 操作 | 内容 |
|---|---|
| 鉱床をクリック / `Space` | 掘る |
| ショップの行をクリック | 購入 |
| `BUY x1` ボタン / `Q` | 購入数を切り替え(x1 → x10 → MAX) |
| `SOUND` ボタン / `M` | ミュート切り替え |

- **Forge Pick**:レベルが1上がるごとに、1回の掘削量が2倍になり、毎秒生産量の1%ぶんも上乗せされます。
- **クルーと機械(6段階)**:Scavenger → Dune Miner → Rust Drill → Sandcrawler → Salvage Yard → Storm Refinery。25・50・100…台そろえるごとに、その種類の生産量が2倍になります。
- **砂嵐**:70〜110秒ごとに発生し、15秒間生産量が2倍になります。
- **クロームキャッシュ**:ときどき出現する箱です。クリックすると大量のスクラップか、20秒間の掘削7倍のどちらかが手に入ります。
- **セーブ**:5秒ごとと購入時にブラウザの `localStorage` へ自動保存します。離れていた時間も、半分の速度で最大2時間分を採掘します。

## 開発

### 必要なもの

- Node.js 22.18 以上。テストは Node が `.ts` を直接実行する機能を使います。開発時は 26 で動作を確認しています。
- pnpm。バージョンは `package.json` の `packageManager` で固定しています。

### セットアップ

```sh
pnpm install
pnpm dev        # http://localhost:8080
```

### コマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発サーバー(ホットリロードあり) |
| `pnpm build` | 型チェック → テスト → `dist/` へビルド |
| `pnpm preview` | ビルド結果を確認用に配信 |
| `pnpm test` | 経済ロジックのテスト(`node:test`) |
| `pnpm typecheck` | TypeScript の型チェック |
| `pnpm lint` / `pnpm lint:fix` | [Biome](https://biomejs.dev/) によるフォーマット・Lint のチェック / 自動修正 |

`dist/` は相対パスで出力されるので、そのまま任意の静的ホスティングに置けます。

### 構成

```
src/
  config.ts, economy.ts, storage.ts   # ゲームの数値・ルール・セーブ(Phaser に依存しない)
  economy.test.ts                     # 上記のテスト
  scenes/                             # Boot → Preloader → Title → Game → Victory
  ShopRow.ts, ui.ts, sfx.ts           # UI 部品と、WebAudio で合成する効果音
public/assets/                        # 画像と BGM
```

ゲームのルールは Phaser から切り離した純粋な関数として書いており、ブラウザなしでテストできます。
設計の詳細や Phaser 4 での注意点は [CLAUDE.md](CLAUDE.md) にまとめています。

## アセット

`public/assets/` の画像(ピクセルアート)と BGM(チップチューン)は、Phaser Game Agent の生成機能で作成したものです。
効果音は `src/sfx.ts` で WebAudio を使って合成しています。
