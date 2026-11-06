# 業務アプリ課題5問 — business-five-v2-workflows

版 `business-five-20261106-workflows1`。既存24課題と ceiling-v1〜v4 から分離した公開仕様です。難度の実モデル校正と採点運用全体の受入は未完了で、`ready_for_measurement=false` を維持します。

## 課題を選ぶ

| ID | 題材・主軸 | 公開入口 | 依頼文 |
| --- | --- | --- | --- |
| CH02 | 帳票の配信・取消・復旧を行う業務アプリ / `durable_compatibility_recovery` | [TASK](public/tasks/ch02-report-operations/TASK.md)・[役割](public/tasks/ch02-report-operations/roles.md) | [one-shot](public/tasks/ch02-report-operations/prompt.txt)・[/goal + PR](public/tasks/ch02-report-operations/goal-pr.txt) |
| CH03 | 店舗価格カタログの移行・切替・差戻しアプリ / `live_migration_rollback` | [TASK](public/tasks/ch03-price-rollout/TASK.md)・[役割](public/tasks/ch03-price-rollout/roles.md) | [one-shot](public/tasks/ch03-price-rollout/prompt.txt)・[/goal + PR](public/tasks/ch03-price-rollout/goal-pr.txt) |
| CH04 | 委譲権限のある文書閲覧・配信アプリ / `authorization_lifetime` | [TASK](public/tasks/ch04-document-access/TASK.md)・[役割](public/tasks/ch04-document-access/roles.md) | [one-shot](public/tasks/ch04-document-access/prompt.txt)・[/goal + PR](public/tasks/ch04-document-access/goal-pr.txt) |
| CH05 | 訂正売上の照合・締め・再接続アプリ / `stream_reconciliation_space` | [TASK](public/tasks/ch05-sales-reconciliation/TASK.md)・[役割](public/tasks/ch05-sales-reconciliation/roles.md) | [one-shot](public/tasks/ch05-sales-reconciliation/prompt.txt)・[/goal + PR](public/tasks/ch05-sales-reconciliation/goal-pr.txt) |
| CH06 | 複数プロジェクトのビルド・成果物公開アプリ / `build_release_dependencies` | [TASK](public/tasks/ch06-build-operations/TASK.md)・[役割](public/tasks/ch06-build-operations/roles.md) | [one-shot](public/tasks/ch06-build-operations/prompt.txt)・[/goal + PR](public/tasks/ch06-build-operations/goal-pr.txt) |

## 渡し方

1. 1問を選び、[catalog.json](catalog.json) にある当該 `input_manifest` を開きます。
2. `one_shot` または `goal_with_pr` の `files` に挙がる公開ファイルだけを、相対パスを保って専用の作業領域へコピーします。共通契約はどちらの形式にも含まれます。
3. 解答者の作業cwdをmanifestの `working_directory`（`public/tasks/<選んだ課題ID>/`）へ設定します。そのディレクトリの `TASK.md` と共通契約への相対リンクが解決する状態で、one-shot は `prompt.txt`、PR形式は `goal-pr.txt` の内容を依頼文に使います。PR形式では、実際の提出先・ブランチ方針を利用者が併せて指定してください。
4. TASK の受入条件・役割・fixture・外部provider契約・資源条件を揃えて渡します。他の問題や作者の作業領域を丸ごと共有しません。

各manifestは公開入力のbyte数とSHA-256を持ち、形式を変えても同じ業務契約を渡せることを確認できます。解法手順・故障箇所・正解コードを配布するものではありません。

## 評価・運用の状態

- 公開側は仕様・サンプル入力・依頼文と入力同一性の確認を提供します。正解・別設計・非公開期待値・採点実装・内部検証結果はこのパッケージに含めません。
- 通常のコード修正課題と異なり、業務結果・保存・通信・画面を合わせて判断する課題です。特定のframework、DB、UI配置、HTTP内部形式やアルゴリズムは指定しません。
- 公開CIはファイルの同一性、リンク、配布境界を確認します。アプリの全要求受入、採点妥当性、難度、モデル性能の証明にはなりません。
- 実行前には、採点版・入力・提出物・予算・隔離方法を別途固定します。未確認や実行障害を0点や成功に読み替えません。

## 公開パッケージの確認

依存の追加、モデル・認証・ネットワーク・コンテナは不要です。リポジトリrootで次を実行します。

```sh
node --test benchmarks/challenge-candidates/business-five-v2-workflows/tools/public-package.test.mjs
```

この5問を自動で旧24問や旧ceiling版へ登録・置換する処理はありません。

## 今版の変更範囲

各問3本の担当間workflowを追加し、既存契約の組合せと外から確認する業務結果を明示しました。元の業務ルール、fixture、provider原子性、非機能の評価範囲は変えていません。解法手順や採点の秘密例は含みません。旧business-five-v1は不変で、旧版の実測や得点を今版へ読み替えません。

`ready_for_test_cycle=true`は公開入力を少数の実装テストサイクルに渡せる状態を示します。`ready_for_measurement=false`および`difficulty_calibrated=false`は、正式評価・難度校正の未確認を区別します。全評価基盤の整備を通常のテストサイクル開始条件にはしません。実行時は当該公開入力、指定model/effort、利用可能なツール、時間上限、取得できる使用量と実解決情報、未観測を記録します。
