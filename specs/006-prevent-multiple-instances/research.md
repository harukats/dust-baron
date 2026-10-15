# 調査: デスクトップ版の多重起動防止

調査日: 2026-10-15。ローカルコードと公式資料を照合した。以下は設計判断であり、実機での検証結果ではない。

## 1. 起動の排他

**決定**: Rust標準の `File::try_lock` をゲーム起動前に使い、OSに所有権を管理させる。Rustの宣言上の最低バージョンを1.90へ上げる。標準ロックAPI自体は1.89から使えるが、既存Cargo.lockのTauri 2.12.1が1.90を要求することを実装時に確認した。

**理由**: 同時起動でも所有者は1つになる。ハンドルの終了で解放されるため、PID照合や異常終了後のファイル削除を必要としない。ロックファイルは常に同一の実体を使う。ファイルの存在を稼働判定にしない。[Rust File公式資料](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock)

**比較した案**: ファイルの新規作成だけを使う方式は強制終了後の復旧に弱い。古いRustを維持するためのロック用クレート追加より標準機能を選ぶ。現在の開発環境とCIは最低バージョンを満たす。

## 2. 公式プラグインの評価

**決定**: `tauri-plugin-single-instance` 単独の導入を採用しない。

**理由**: 公式の現行ソースにはWindowsで所有者の通知ウィンドウ準備前に追加起動が通る経路、macOSで接続確認とソケット待受開始が非原子的な経路がある。LinuxではDBusが利用できないと起動を継続する。厳密なFR-003を満たす根拠にできない。[Windows実装](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/single-instance/src/platform_impl/windows.rs)、[macOS実装](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/single-instance/src/platform_impl/macos.rs)、[Linux実装](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/single-instance/src/platform_impl/linux.rs)

**比較した案**: プラグインを最初に登録する公式推奨は通常の追加起動には有効だが、別の排他を重ねると所有権と通知の順序が複雑になる。旧版へ固定して競合解消済みと推定することもしない。[公式ガイド](https://v2.tauri.app/plugin/single-instance/)

## 3. 保存場所と識別

**決定**: ユーザー別のローカルデータ領域と既存アプリ識別子を使用する。保存先解決は `dirs`、起動ごとの通知認証値は `getrandom` とし、既存の間接依存を直接依存として宣言する。

**理由**: コピーや別ショートカットでも共通のロックになる。通信情報とゲームのセーブを分離できる。異なるバージョンやログインセッションを区別する追加機構は作らず、同一ユーザーの共有パスではより広く制限されることがある。仕様が対象外とする組み合わせの同時起動を保証するものではない。[dirs API](https://docs.rs/dirs/6.0.0/dirs/fn.data_local_dir.html)、[getrandom API](https://docs.rs/getrandom/0.3.4/getrandom/fn.fill.html)

**比較した案**: 実行ファイルの隣は配置先ごとの重複を許し、Program Filesなどで書き込み不能になる。共通の一時ディレクトリはユーザー間の干渉を招く。

## 4. 既存ウィンドウへの通知

**決定**: 標準TCPのIPv4ループバックとOS割当ポートを使い、固定の表示要求だけを受け付ける。乱数で古いendpointや他プロセスとの取り違えを避ける。

**理由**: 同じ実装を3OSで試験でき、LinuxのDBusにも依存しない。追加起動はコマンドライン引数やセーブを転送しない。ローカルの悪意ある同一ユーザープロセスへの防御は目的としない。[TcpListener公式資料](https://doc.rust-lang.org/std/net/struct.TcpListener.html)

**比較した案**: OS別の名前付きパイプ・Unixソケットは実装経路が増える。外部アドレスへの待受は不要。通信に失敗しても排他を解除して起動することは認めない。

## 5. ウィンドウ復元と終了

**決定**: mainを取得し、表示・最小化解除・フォーカスをそれぞれ試す。起動中は要求を集約し、準備後に処理する。終了中の要求は無視できるが、新しいゲームを開始しない。

**理由**: `set_focus` だけでは最小化解除の契約を表せない。ウィンドウ取得失敗でpanicせず、OSの前面化制限は仕様どおり扱う。[Tauri WebviewWindow API](https://docs.rs/tauri/2.11.6/tauri/webview/struct.WebviewWindow.html)

## 6. 検証範囲

**決定**: ロックと通信はTauri非依存で子プロセス試験する。実ウィンドウの復元は3OSで確認し、Releaseのlockedビルドも通す。

**理由**: このWSL環境はWebView関連のシステムライブラリが不足している。Webのテスト成功やビルド成功だけでウィンドウ操作を検証したとは扱わない。手動Releaseはタグなし・pages_tag空でビルドできるが、実機試験の代替ではない。
