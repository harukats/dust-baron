# 検証ガイド: SOUND設定

この手順は実装後の検証用。実施済みの結果と環境制約は[validation.md](validation.md)に記録する。

## 準備

- Node・pnpmはリポジトリの既存環境を利用し、必要なら`pnpm install`する。
- 個人のスコアを使わず、専用ブラウザプロファイル・Playwrightコンテキストにテストセーブを用意する。
- `pnpm dev`でhttp://localhost:8080を開く。Playwright単独実行では既存設定がdevサーバーを起動する。
- ブラウザ・OS・GPU・表示サイズ・コミットと変更差分を記録する。
- 修正前に、タイトルでBGMが始まらず設定変更が再起動で失われる現状を確認する。

## 自動チェック

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e tests/e2e/sound.spec.ts tests/e2e/persistence.spec.ts tests/e2e/lifecycle.spec.ts tests/e2e/session-base.spec.ts tests/e2e/session-recovery.spec.ts
```

sound.spec.tsで音声機能を、既存の各specで保存とライフサイクルの回帰を確認する。

### Nodeで確認すること

1. 設定の欠落、不正JSON、不正型、true/falseの復元。
2. 未初期化run.stateでの設定保存が進行文字列・lastSaveを一切変えない。
3. 設定変更後にinitializeRunしても、離席収益が従来どおり一度だけ加算される。
4. NEW RUNの前後で設定のメモリ値と保存値を維持する。
5. 非ownedの全モードで設定の保存アクセスが0件、一時プレイでライブ切り替え可能。
6. 保存領域の取得・読み込み・書き込み例外でも設定操作と進行を維持する。

契約の詳細は[sound-persistence.md](contracts/sound-persistence.md)を参照する。

## 操作・実音確認

| 条件・操作 | 期待結果 | 対応 |
| --- | --- | --- |
| 設定なし、再生許可済みでTitle表示 | ON表示とBGM、開始操作不要 | SC-001 |
| 新規プロファイル、Titleの空白をクリックまたはM操作 | 解除後の最新設定に従う。空白操作でTitle維持 | SC-001 |
| TitleとGameでSOUNDボタン・Mキーを各10回交互に操作 | 1秒以内に表示と音声一致、1操作1反転 | SC-002 |
| OFF後にNEW RUN確認SE・採掘・購入・開始・勝利を発生 | BGM・SEが聞こえず、ON復帰でOFF中のSEが鳴らない | SC-003 |
| ON/OFFで開始、CONTINUE、Victory、Game再開、Titleへ戻る | 設定維持、MUSIC登録1個以下、BGM重複0件 | SC-003 |
| Title/Game × ON/OFF変更直後に再読み込み | 4通りで設定復元、OFF起動の発音0件 | SC-004 |
| 既存進行のみ、設定欠落・不正、NEW RUN | 進行保護、既定ONまたは選択値の維持 | SC-005 |
| localStorage取得・書込失敗、一時プレイ | 操作継続と画面間維持、禁止された保存アクセス0件 | FR-012 |

E2Eではwindow.gameを使い、SoundManager.mute、MUSICのgetAll数、isPlaying、activeシーン、表示、localStorage値を確認する。
音声解除の検証は初期AudioContextがsuspendedの条件を明示して実施し、常時自動再生許可だけで代用しない。
背景の空白クリックと最初のOFF操作を別々に試す。解除待ち中にGameへ移動した場合も確認する。
実音確認ではヘッドホン等でOFFの無音とONのBGM・SEを確認し、自動検証結果と区別して記録する。

## 性能とライフサイクル

起動済みdevサーバーに対して`pnpm exec node tests/e2e/sound-probe.ts`を実行する。
出力先は`SOUND_OUTPUT`で指定でき、既定は`test-results/sound-performance.json`。
`SOUND_SCENE=Title`または`Game`で対象を絞り、`SOUND_URL`で比較用サーバーを指定できる。

保存頻度への影響があるため、実装前後を同じ環境・セーブ条件で比較する。

- headed Chromium、1280×720、DPR=1、同じPC・音声機器・通常の再生ポリシー。ブラウザ等のバージョンも記録する。
- Titleと通常Gameの各条件で10秒準備後、60秒測定を3回。SOUND操作は5秒間隔で計10回実施する。
- 操作から表示・ミュート更新までの時間は全件1秒以内。フレーム時間p95は変更前より10%超の悪化がないこと。通常60 FPSは目標であり、実測値を併記する。
- キー別にStorage呼び出しを追跡し、設定書き込みはownedでの切り替え1回につき1回、設定読み込みはownedのboot1回につき1回。フレーム更新・シーン移動だけによる設定保存は0件。
- Title→Game→Victory→Game→Titleを20周する。MUSIC登録数は最大1個、追加UNLOCKED待ちは現シーン最大1件、終了済みシーンの待ちは0件。Mキー1操作が1回だけ反転する。
- 既存`pnpm test:performance`は通常プレイ負荷の参考に使えるが、SOUND操作時間・設定キーアクセス・解除待ち数はこの機能用の計測を加える。

## デスクトップと結果記録

対応するWebView環境で初期ON/OFF、最初の操作、開始・勝利・復帰と保存復元を確認する。
WSLのLinux WebView依存不足の場合、ブラウザ検証で代替完了とはせず、未実施理由と対象環境での実施予定を記録する。
実装時にvalidation.mdへ修正前の再現、各検証の環境・結果、音声の聴取結果、性能比較、未実施や失敗の理由を日本語で記録する。
