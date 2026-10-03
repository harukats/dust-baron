# 検証ガイド: ゴールド・キャッシュ

## 前提と実行

リポジトリで `pnpm install` 済み、Playwright Chromiumが利用可能であること。ブラウザ検証はテスト用プロファイルで実施し、個人のセーブを初期化しない。専用PNGの生成・組み込み後に以下を実行する。

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e tests/e2e/gold-cache.spec.ts tests/e2e/mining.spec.ts tests/e2e/persistence.spec.ts tests/e2e/lifecycle.spec.ts
```

`gold-cache.spec.ts` に専用画像・倍率・期限・音声・保存・再入場の検証がある。実タブ切替は `pnpm exec node tests/e2e/gold-runtime.ts` で実行する。ゲームの手動確認には `pnpm dev` で `http://localhost:8080` を開く。性能測定は別途起動中のdev serverとheaded Chromiumが必要であり、GUI環境がない場合は未実施と記録する。

## 単体検証

1. 種類抽選の0、0.099999、0.1、0.999999でgold/gold/chrome/chromeとなる。クローム報酬抽選の0.499999と0.5で即時報酬/7倍が分かれる。NaN・正負のInfinity・負数・1以上について、種類抽選はchrome、chrome報酬抽選は報酬なしとなり、資源・既存倍率・期限が不変である。goldは報酬抽選値によらず777倍となる。
2. [データモデル](data-model.md) の全遷移と、終了の1ms前・ちょうど・1ms後を検証する。同倍率7倍の更新も従来どおり20秒へ戻る。
3. pick0・自動生産0では通常1、gold中777。pick・設備変更後は新しい通常量×777。砂嵐は通常採掘の基礎を変えない。
4. gold有無で自動生産・オフライン・クローム即時報酬が一致する。セーブ読込、reset、初期化で倍率を復元せず、資源・装備・設備を保持する。

## ブラウザ検証

既存 `tests/e2e/helpers.ts` のfixture/start/clickGameを再利用する。抽選制御はテスト中の対象の出現・回収呼び出しに限定し、Math.randomを常時固定しない。既存ui-checkのクローム報酬検証でも出現種類をchromeへ固定し、即時報酬と7倍の回収結果をそれぞれ確認してから画面を保存する。必要なときだけDEVのwindow.gameと既存run.nowの差し替えを使い、試験後に元へ戻す。製品向けの強制gold操作は追加しない。

1. goldを決定的に出現させ、画像キー・専用絵柄・種類ラベルを確認する。chromeも出現させ、同時に2個にならないことを確認する。
2. [操作契約](contracts/cache-and-mining.md) の通知、HUD、クリックとSPACEの777倍獲得を確認する。同じ対象を二重操作しても報酬は1回だけ。
3. 実際のポインターで回収し、run.nowを期限前・ちょうど・後に制御して20秒終了と10秒消滅を確認する。通常の非表示・復帰も確認し、期限が延長しないこと。
4. 7→777、777→7、777→777を制御し、倍率・終了時刻・通知を確認する。即時報酬は777倍されないこと。
5. gold中に装備や設備を買い、以後の採掘量が更新されること。砂嵐併用で生産だけが従来どおり増えること。
6. ミュートONで出現・回収し無音と視覚通知を確認。OFFとマスター音量変更も音声の既存経路へ反映されること。
7. 保存後reload、タイトル・勝利から継続、新規ラン、所有権がない状態での操作を検証する。進行保護と一時効果解除を確認する。
8. 1280×720と960×540の画面を保存し、ラベル・HUD・ショップの重なりと欠け、透明余白による広いクリック領域がないことを確認する。
9. `pnpm build` 後の `dist/assets/gold-cache.png` と相対ロードを確認する。`pnpm exec vite preview --host 127.0.0.1 --port 8081 --base /dust-baron/` を起動し、`pnpm exec node tests/e2e/gold-build.ts` で `/dust-baron/` 相当でロードエラーがないことを確認する。

## 性能とライフサイクル

変更前の基準取得を実装前に行い、[plan.md](plan.md) の条件・3試行・60秒・閾値で比較する。既存プローブへgold条件を追加後、以下で実行する。

```bash
PERFORMANCE_OUTPUT=specs/004-add-gold-cache/performance-after.json pnpm test:performance
```

砂嵐を15秒ごと・採掘効果を20秒ごとに再付与し、開始時の付与・測定開始時の周期再同期・操作回数を変更前後で揃える。変更後通常は変更前通常、変更後7倍・777倍は変更前7倍と比較する。追加の画像・演出条件は両種類とも測定開始から10秒周期で出現・5秒後に回収し、変更前chromeと比較する。測定ファイルを変更前後で保存し、環境・commit・作業差分を記録する。20回の再入場後に画像・ラベル・入力購読・キャッシュTweenの増加がないことを確認する。受け入れ結果とアセット生成の由来は `specs/004-add-gold-cache/validation.md` に日本語で記録する。未実施・失敗・制約は明記する。
