# 実装計画: タイトル画面の音声とSOUND設定の永続化

**作業ブランチ**: `002-persist-sound-settings` | **日付**: 2026-09-28 | **仕様**: [spec.md](spec.md)

**入力**: `specs/002-persist-sound-settings/spec.md`

作業ブランチ`002-persist-sound-settings`は実装時に作成した。仕様ディレクトリとブランチ名は独立であり、mainへの反映はPRで行う。

## 概要

タイトル画面でもBGMを開始し、全画面のSOUNDボタンとMキーを共通の切り替え処理につなぐ。
設定は進行とは独立したlocalStorageキーへ即時保存する。既存の進行セーブ、lastSave、オフライン収益を変更せず、NEW RUN後も設定を保持する。
初期ミュートは発音前に適用し、Phaserの音声解除イベントで最新設定を再確認してBGMを開始する。

## 技術的背景

**言語・バージョン**: TypeScript 7.0.2系。明示的な`.ts` importとNodeの型除去を維持する。

**主要依存**: Phaser 4.2.1（ローカル導入版）、Vite 8.3系、pnpm 12.5.1、Tauri 2。新しい依存は追加しない。

**保存**: `dust-baron-save-v1`は現状維持。`config.ts`に`SETTINGS_KEY = 'dust-baron-settings-v1'`と既定の音声設定を追加する。

**検証**: Node `node:test`、既存Playwright、ブラウザでの実音確認。実装後はlint・typecheck・test・buildを実施する。

**対象環境**: ブラウザと共通Webコードを利用するデスクトップWebView。WSLにはLinuxのWebView依存がなく、Tauri検証は対応環境で行う。

**プロジェクト種別**: クライアントのみのPhaserゲーム。

**性能目標**: 通常プレイ60 FPSを目標とし、音声操作の反映は1秒以内。測定条件と退行基準は[quickstart.md](quickstart.md)に定義する。

**制約**: owned以外の共有保存アクセス禁止、保存失敗時のプレイ継続、BGM一重再生、音声解除前の無音、シーン終了時のイベント解除。毎フレームの設定保存は禁止する。

**規模・範囲**: 単一SOUND設定、Title・Game・Victory、起動処理と保存処理。楽曲追加、個別音量、画面レイアウト変更、複数ウィンドウ即時同期は対象外。

## 憲章チェック

Phase 0開始前に仕様と既存コードを確認し、違反なし。Phase 1設計後も以下の方針で全項目に適合する。

| 原則 | 設計での適合 | 判定 |
| --- | --- | --- |
| I 日本語 | 計画・調査・モデル・契約・検証手順は日本語 | 合格 |
| II 純粋なコア | storageはPhaser非依存、保存アクセスは関数呼び出し時のみ。音声処理はaudio.tsへ配置 | 合格 |
| III 振る舞い検証 | 保存境界のNodeテスト、実操作E2E、実音確認、修正前後の同条件比較を計画 | 合格 |
| IV 状態保護 | Stateと進行セーブ形式を維持。設定更新はlastSaveとオフライン計算に触れない | 合格 |
| V 性能とライフサイクル | 設定保存は操作時だけ。音声とイベント数、操作応答、フレーム時間を測定 | 合格 |
| 配布上の制約 | 既存アセット・相対URL・固定解像度・Tauri権限を維持、mainへの反映はPR | 合格 |

例外申請は不要。未解決の設計事項はない。品質チェックは仕様の品質を示し、実装済みを示すものではない。

## プロジェクト構成

### この機能の文書

```text
specs/002-persist-sound-settings/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/
    ├── sound-ui.md
    └── sound-persistence.md
```

`tasks.md`は本ディレクトリに含め、必要に応じて次の`$speckit-tasks`で更新する。

### 変更対象のソース

```text
src/
├── config.ts              # 設定キーと既定値
├── storage.ts             # ライブ設定、解析・読み込み・更新・保存
├── storage.test.ts        # 保存制約と進行保護の回帰検証
├── audio.ts               # 新規: Phaser側の設定適用とBGM開始
├── sfx.ts                 # ミュート中の新規SE生成を抑止
├── main.ts                # セッション確定後の設定初期化
├── ui.ts                  # Title/Victoryの共通切り替え
└── scenes/
    ├── Title.ts           # create時BGM開始、start内の開始処理を統合
    ├── Game.ts            # 共通切り替え、音声解除待ちの引き継ぎ
    └── Victory.ts         # 発音前の設定適用、共通切り替え

tests/e2e/
├── sound.spec.ts          # 新規: 設定・再生・遷移・復元
├── sound-probe.ts         # 新規: 同条件の音声・保存・フレーム計測
└── helpers.ts             # 既存操作ヘルパーを再利用
```

**構成の判断**: 保存とメモリ状態は既存storage.tsへ置き、Phaserを使う処理だけaudio.tsへ分離する。経済モデルへ音声設定を混ぜず、新しいサービス基盤を作らない。

## 実装方針

1. storageに`SoundSettings`と`run.settings`を追加する。欠落・不正値は既定ONに補正する。設定初期化と更新の契約は[sound-persistence.md](contracts/sound-persistence.md)に従う。
2. main.bootでセッション確定後、Phaser.Game生成前に設定を初期化する。ownedでの再起動は再読込、一時プレイの同一ページ内再起動はライブ設定を維持する。
3. audio.tsで`applySoundSettings(scene)`、`toggleSound(scene)`、`ensureMusic(scene)`を共有する。SOUND切り替えはメモリ更新とミュート適用を即時実施し、設定保存を同じ操作内で完了する。初期設定は各音声使用シーンでSE生成前に適用する。
4. ensureMusicはMUSICが未登録の場合だけ追加し、ONかつ解除済みで、未再生・未一時停止の場合だけplayする。シーン移動で曲を停止・作り直さず、既存のフォーカス喪失によるpause/resumeを妨げない。OFFはglobal muteで出力を止める。
5. lockedならシーンごとに最大1件のUNLOCKED待ちを登録する。終了時に解除し、次の音声使用シーンが待ちを引き継ぐ。解除時に最新のON/OFFを読み直す。同一入力でOFFにする際はミュートを先に適用し、解除順序に関わらず発音を防ぐ。
6. Sfx.playはmanager.muteの場合に音源を生成しない。既存destinationへの接続を維持し、鳴っているSEにもglobal muteが適用される。OFF中のイベントをキューに積まない。
7. Title/VictoryのaddSoundControlとGame.toggleMute、各Mキーを同じtoggleSoundへ接続する。終了時の既存キーボード解除を維持し、Title.startの専用BGM開始処理を削除する。

音声制御に使うPhaser APIは導入版のスキルとソースで確認済み。詳細な判断根拠は[research.md](research.md)に記録する。

## 検証と完了条件

[quickstart.md](quickstart.md)のNodeテスト、E2E、実音、性能・イベント数検証を実施し、実装時にvalidation.mdへ環境・手順・結果を記録する。
FR-001〜006は音声UI契約、FR-007〜012は保存契約へ対応する。成功基準SC-001〜005をすべて検証する。
今回の計画フェーズではゲームコードを変更せず、実装や実機検証の結果を先取りしない。
