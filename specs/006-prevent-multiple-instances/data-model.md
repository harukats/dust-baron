# データモデル: 単一起動の実行時状態

ゲームのStateや保存形式に追加フィールドはない。

## 所有権

| 項目 | 内容 |
|---|---|
| 識別子 | `io.github.harukats.dustbaron` |
| ロック | ユーザー別ローカル領域の `instance.lock` に対する排他ロック |
| 保持期間 | WebView生成前から、ゲーム終了・通知スレッド停止まで |
| 判定 | ロック取得成功のみが起動許可。PIDやファイル存在は使わない |

ロックファイルのハンドルは複製・子プロセスへ継承しない。ロックファイルは削除も切り詰めもしない。ロックとendpointを分離し、Windowsのロック中の読み書き制約を回避する。

## 通知先

`instance.endpoint` は1起動分の情報。プロトコルバージョン、IPv4ループバックのポート、32バイト乱数の64桁小文字16進表現を持つ。セーブやPIDを含めない。書式は[契約](contracts/desktop-instance.md)を参照。

所有者のみ書き込む。追加起動は最大256バイトまで読み、不完全・古い・不正な情報を信頼しない。所有者終了後に残存してもロックの取得を妨げない。Unixのディレクトリは0700、endpointは0600。Windowsはユーザー別領域のACLを継承する。

## 実行時オブジェクト

- **InstanceGuard**: ロックのFile、待受、停止フラグ、スレッドハンドル。所有者だけが保持する。
- **ActivationState**: ready / pending / scheduled / stopping。scheduledでメインスレッドへの配送を最大1件に制限する。複数の表示要求をpending=trueの1件へ集約する。無制限の要求キューを作らない。
- **起動結果**: Rustの `io::Result<Option<Ownership>>` で表現する。Ok(Some)がPrimary、Ok(None)がSecondary、ErrがErrorに対応する。SecondaryとErrorからWebView起動へ進まない。独自のLaunchOutcome列挙型は追加しない。

## 状態遷移

1. 未起動 → ロック取得 → 通知先準備 → ゲーム起動 → ready。
2. ロック競合 → endpoint準備の有限待ち → 表示通知 → 終了。待ちや通知失敗時も終了する。
3. ready前の表示通知 → pending → ready時に1回表示復元。
4. 正常終了 → stopping → 通知スレッド停止・join → endpoint削除 → Fileを閉じて解放。
5. 強制終了 → OSがハンドルを閉じる → 次の所有者がロック取得し残存endpointを上書き。
6. ロック/通信準備のエラー → 診断して起動中止。ロック取得前の失敗を競合として扱わない。

保存先の削除・改変やOSユーザーをまたぐ悪意ある操作への耐性は本機能の対象外。通常のゲーム保存不可時の既存動作と、単一起動を確立できない起動時エラーを混同しない。
