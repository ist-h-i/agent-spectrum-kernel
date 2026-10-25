# Ceiling v1: 追加課題の公開 seed

既存24問を維持したまま、天井効果の検証に使う6問を追加するための設計パッケージです。狙いはASKの得点を人為的に下げることではなく、通常動作だけでは満点にならない、解ける問題を用意することです。

## 現在の状態

- 作成済み: 6問の問題文、公開 seed、API・固定利用側・決定的 adapter、公開通常テスト、入力 manifest、準備・提出固定用 controller。
- 作成済み（repo 外）: 非公開 evaluator の初期実装、各問 2 構造の正解例、各問 12 件以上の意味的人工不良、同一追加テスト。秘密内容は公開しません。
- 未完了: 全問の承認済み実行境界での採点器検証・独立検証、追加テスト 10 点のソース非開示境界、モデル実行との接続、CH05 の最終採点環境での資源閾値固定。native sandbox 経路は停止し、既存 Docker の再利用を read-only で確認しました。非公開解のソースを提出テストへ渡す route は停止しています。
- 未実施: モデル実行、難易度校正。
- 状態は `public_seed_verified_private_validation_incomplete`。全問 `ready_for_measurement=false`、点数は null のままです。実装・検証・独立レビューの記録は [実装記録](implementation-status.md) に分けて残します。

**追加6問について、固定したFull ASK条件で各課題の平均品質点30〜70点を探索的な校正目標とします。予測値や達成済みの結果ではありません。** 全条件・全試行がこの範囲に入る保証はなく、100点になる正しい解答も必須です。既存24問と合算した平均を30〜70点にする目標ではありません。

既存24問の216試行は別成果物として完了済みです。この追加6問の実装や難度の証拠とは混同しません。個人の実行ログやアップロードされたHTMLは、この公開PRに転載しません。

## 公開 workspace の準備と確認

新規 6 問の実行版は、既存の固定 Docker image で確認した Node `v24.21.0` です。公開準備ツールの host 検証には Node 24 系も使えます。依存 package の追加やネットワーク接続は不要です。repo root で以下を実行できます。

```sh
node benchmarks/challenge-candidates/ceiling-v1/tools/seal-public-inputs.mjs
node --test benchmarks/challenge-candidates/ceiling-v1/tools/public-workspace.test.mjs
node benchmarks/challenge-candidates/ceiling-v1/tools/public-workspace.mjs list
```

`public-workspace.mjs prepare --id <ID> --out <新規の絶対パス>` は該当問題の task.md と公開 workspace だけを新規ディレクトリへコピーします。Git 履歴、設計文書、controller、manifest、採点器はコピーしません。出力先の親は事前に存在する必要があり、既存出力・symlink 経由のパスは拒否します。macOS の `/tmp`、`/var` など OS の alias も含め、親の実パスを使用してください。workspace 内で `npm test` を実行できます。seed の通常テスト成功は全契約の解決を意味しません。

`verify --id <ID> --workspace <パス>` は、controller 側の固定 manifest に対して protected ファイルと提出範囲を検証します。`freeze --id <ID> --workspace <パス> --out <新規パス> --trial-id <ID> --model <実モデルID> --condition <条件ID>` は提出全体のコピーと digest、入力 digest、実行版の対応を保存します。合成検証ではモデル欄を `not-executed` とし、モデル試行として数えません。制御側の検証とコピーの間に入力が変われば完了 manifest を発行しません。

この controller は提出コードを実行せず、採点やモデル推論を行いません。freeze は OS による不変化や実行隔離の代替ではありません。測定側は許可された公開入力だけを持つ別実行環境を使用し、採点側は固定コピーの digest を確認してから、提出コードが非公開 root を読めない境界で実行する必要があります。既存の evaluator authority・入場・採点を迂回して正式スコアを発行する接続ではありません。

## 追加する問題

| ID | 問題 | 主に必要となる判断 |
|---|---|---|
| CH01 | [非同期編集と取り消しの整合性](tasks/ch01-optimistic-edit-history.md) | 複数画面、競合更新、取り消しを一つの状態契約として扱う |
| CH02 | [クラッシュ後も重複しないジョブ実行](tasks/ch02-durable-job-recovery.md) | 永続状態、外部効果の確認、所有権、再開を整合させる |
| CH03 | [稼働中のスキーマ移行とロールバック](tasks/ch03-online-schema-cutover.md) | 混在バージョン、移行中の書き込み、不可逆条件を扱う |
| CH04 | [権限キャッシュと失効の一貫性](tasks/ch04-authorization-revocation.md) | グラフ状の権限、キャッシュ、実行時の再判定を両立する |
| CH05 | [訂正可能なストリーム集計](tasks/ch05-stream-window-revisions.md) | 順序逆転、訂正、締め処理、厳密な金額計算と性能を両立する |
| CH06 | [増分ビルドの依存関係と世代管理](tasks/ch06-incremental-build-generations.md) | 動的依存関係、キャッシュ、変更中のビルドを扱う |

問題文は期待動作と制約を定義し、修正対象の行、正解アルゴリズム、埋め込んだ不良の場所は教えません。難しさは制約の組み合わせから生み、曖昧さ、無関係な大量ファイル、環境不備、短すぎる制限時間では作りません。

## 既存評価との境界

設計の基準は `main@514bf21aa2c955ec44dcaa3db67abe86f397b98e` です。[既存カタログ](../../portfolio-catalog.json)の24 primary / 4 calibration、既存の問題・採点・admission・実行設定は変更しません。新規IDは別名空間とし、既存24問の差し替えや再採点もしません。

[公開入力の作成仕様](fixture-blueprints.md) → [Codex向け作業指示](codex-work-package.md) → [採点・校正方針](evaluation-protocol.md)の順に進めます。`catalog.json` はこの候補パッケージの目録に限り、`ask-benchmark` のconfigとして渡してはいけません。

既存課題との近さも残します。たとえばCH01は既存の非同期UI課題と同じ領域ですが、編集と取り消し、複数の利用箇所を加えます。これは評価機構を調べる意図的な発展課題であり、実務全体から無作為に抽出した6問ではありません。既存24問、追加6問、実在OSS課題の成績は別々に報告します。

## 参照した公開ベンチマーク

参考にしたのは設計原則です。問題文、解答、コード、隠しテストは転載していません。6問はいずれも新規の人工課題であり、以下の公式ベンチマークの問題や同等難度を名乗りません。

- [FrontierCodeの方法論](https://cognition.com/frontiercode): 正しさだけでなく、テスト、変更範囲、既存コードとの整合性を含むマージ可否を評価する。
- [SWE-Bench Proの設計](https://scale.com/blog/swe-bench-pro): 期待動作を明確にしながら解法を与えず、複数ファイルにまたがる改修を扱う。
- [Terminal-Benchの課題品質管理](https://www.tbench.ai/news/terminal-bench-3-0): 解答可能性、不正な高得点、問題文と検証器の対応を点検し、実行側と採点側を分離する。
- [Terminal-Benchの資源校正](https://www.tbench.ai/news/terminal-bench-4-0): 資源不足による失敗を、課題そのものの難しさと混同しない。

一次情報は今回の設計時に確認しました。引用先のスコアから、ASKでの予想点や性能差は推定していません。
