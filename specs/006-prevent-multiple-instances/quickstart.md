# 検証ガイド: 多重起動防止

## 前提

Rust 1.90以上、packageManager指定のpnpm、各OSのTauriビルド依存とデスクトップセッションを用意する。本機能の実装後に実施する。実装前にも同じ追加起動手順で不具合を再現し、環境と結果を記録する。元のセーブは事前にバックアップする。

## 静的確認とビルド

リポジトリルートで実行する。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
pnpm tauri build -- --locked
```

依存変更時はCargo.lockを更新してコミット対象へ含める。macOSのUniversal配布は既存Releaseと同じく `pnpm tauri build --target universal-apple-darwin -- --locked` で確認する。3OSのビルドは既存Releaseの手動実行（pages_tag空）を利用できる。これは実機受け入れ試験の代替ではない。

WSLでWebView依存不足の場合は理由を記録する。Tauri非依存の排他・通信試験は次を実行できる構造とする。

```sh
rustc --edition=2021 --test src-tauri/src/single_instance.rs -o /tmp/dust-baron-single-instance-tests
/tmp/dust-baron-single-instance-tests
```

## Rustの振る舞い試験

同じ試験バイナリの子プロセスを専用の一時ディレクトリで動かす。5子プロセスの開始をバリアで揃え、勝者を親が解放するまで保持させ、所有者が厳密に1つであることを3回確認する。正常終了・強制終了後のロック再取得も確認する。単なるソース文字列検査で代替しない。

通知については正しいtokenでの受理、不正token・過大/途中切れデータの拒否、endpoint準備待ち、期限切れ、残存endpointの置換、停止とスレッド終了を確認する。接続なし・要求途中・通知処理中の各状態から終了処理が1秒以内に完了し、ロックを再取得できることを検証する。追加起動相当の呼出しが所有者へ昇格しないことを検証する。

## 各OSの受け入れ試験

開発サーバーの再実行ではなく、ビルド済みアプリを起動する。TauriのWebView補助プロセス数をゲームの多重起動数と混同しない。

| 試験 | 操作・回数 | 合格条件 |
|---|---|---|
| SC-001 | 同じ配布版を起動し追加起動10回 | ゲームは1つ、追加画面・重複音声0件 |
| SC-002 | 全終了後5回をほぼ同時起動、3組 | 各組でゲーム1つ。最初の表示前の要求も含める |
| SC-003 | 最小化/背面から再起動 | 最小化解除。OS許可時は前面化・フォーカス。通常2秒以内を目標として実測 |
| SC-004 | 正常終了後/強制終了後に各3回再起動 | 手動解除0回ですべて起動 |
| SC-005 | タイトル、プレイ、Reign、Victoryで追加起動 | 既存画面維持。進行喪失・追加起動による保存変更や重複収益0件 |
| 配置先 | 別ショートカットと同じ配布版のコピーから起動 | 同じゲームに戻り、重複しない |
| 終了競合 | 終了中に起動し、終了完了後に再試行 | ゲーム重複なし、終了後の試行成功 |

Windowsは通常起動した実行ファイルを `Start-Process` で繰り返し開く。macOSはFinder・Dockの再オープンと `open -n /実際のパス/Dust\ Baron.app` の両方で確認し、OSによる再利用だけを単一起動対策の証拠にしない。Linuxは実行可能なAppImageまたはインストール済み実行ファイルを複数回開く。強制終了ではゲーム本体を対象とし、完全終了を確認する。

ゲーム進行は自然に増え、既存側の定期保存も継続する。SC-005では数値やセーブの完全不変を要求せず、初期画面への戻り、二重のオフライン加算、追加側からの書込みがないことを、状態比較・必要に応じたOSのファイルアクセス観察で確認する。

## 結果の記録

`specs/006-prevent-multiple-instances/validation.md` にコミット、OS/デスクトップ環境、配布形式、各試験の回数・結果、復元時間、ログ、未実施理由を日本語で記録する。OSによるフォーカス制限とアプリの復元失敗を区別する。各OSの未実施項目が残る場合は合格扱いにしない。
