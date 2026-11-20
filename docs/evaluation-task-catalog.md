# 評価課題の一覧と実行準備

通常25問、業務6問、RC01、CH08を一つのカタログから選べます。全33問に固定番号（`ASK-001` など）、主な作業種別、対象領域のラベル、難易度の見立てがあります。[共通カタログ](../benchmarks/evaluation-tasks.json)

```sh
ask evaluate task-list --format table
ask evaluate task-list --type review --label ui --format table
ask evaluate task-list --label data-migration --label recovery --format table
ask evaluate task-list --difficulty expert --format table
ask evaluate task-list --model gpt-6.2-astra --effort max --score-range 40-60 --format table
ask evaluate task-list --difficulty medium_hard --type review --skill controlled-implementation
ask evaluate task-list --id ASK-012
ask evaluate task-prepare --id ASK-012 --root /absolute/fresh-run
```

ソースから使う場合は `ask evaluate` を `node scripts/practical-evaluation-cli.mjs` に置き換えます。`task-list` の標準出力はJSONです。`--format table` では見立てと現行版の実測点を並べます。角括弧内は各試行の素点、`?` は採点不能、`—` は現行版の観測が未登録であることを表します。`earlier edition in JSON` が出た場合は、同じIDのJSONで以前の観測を参照できます。

- `catalog_id` は領域、難易度、入力版が変わっても同じ問題を指します。新問には未使用の次の番号を割り当てます。`--id` には固定番号と従来の `id` のどちらも使えます。準備・採点記録の `task_id` には従来の `id` を使います。
- `primary_type` は成果物から決めた主な作業種別です。`task_types` の先頭に置き、必要な副次作業を続けます。`--type` は両方を検索します。
- `labels` は課題が扱う対象領域です。たとえば `ui` と `accessibility` は同じ課題に付けられます。`--label` を繰り返すと、すべてに合う課題を返します。使用できる語は共通カタログ冒頭の `labels` にあります。

## 難易度と実モデルの観測

`--difficulty` は出題者の見立てで絞り込みます。`unassessed` は見立てが未設定の課題、`expert` は上位モデルの評価を想定して設計した課題です。`difficulty_basis` でその根拠を確認できます。

上位モデル向けの設計例は、決済台帳の移行・再照合（`ASK-003`）と、過去の明細を共有アーカイブから復元する追加課題（`ASK-033`）です。既存の `ASK-023` は、疎な入力と密な入力でイベント取得の実行時間を測る `hard` の課題です。

`--score-range 40-60` は、現行版の実測得点の中央値が40〜60%の課題を抽出します。両端を含み、小数も指定できます。`--model`、`--effort`、`--condition` は登録されたモデル名、推論強度、実行条件名の完全一致で絞り込みます。たとえば `--condition ask_none` はその条件だけを対象にします。いずれかの実測フィルターを使うと、該当する試行系列だけを表示します。一致する観測がなければ結果は0問です。

各系列は同じ研究・モデル・推論強度・実行条件・採点グループに属します。採点できた素点から中央値を求め、そのグループの満点で割って100を掛けます。偶数件では中央2件の平均を使います。`null` は試行数に残し、中央値の計算からは除きます。1件だけでも表示されるため、実用上の難易度を判断するときは分布と試行数を確認してください。

`task-list --id <ID>` の `difficulty_observations` には、実モデルで得た条件ごとの素点、満点、試行数、採点できた件数が入ります。空配列は登録済みの観測がないことを示します。試行したが採点できなかった点数は `null` です。`edition` は観測と現在の版との関係を示します。

| 値 | 対象 |
| --- | --- |
| `current` | 入力版、入力目録、採点基準と非公開資材の固定値が一致 |
| `previous_input` | 別の入力版または入力目録 |
| `previous_protected_revision` | 同一入力で、以前の非公開資材の固定コミットを使うと元の採点定義を再現できる |
| `previous_assessment` | 同一入力に対する異なる採点定義 |

観測を追加するときは、`model_studies` に出典レポートの名前とSHA-256、ソースと非公開資材のコミット、モデル・推論強度・実行環境を記録します。各課題の観測は、実行した版の `input.version`、`input.digest`、`assessment.digest` に結び付けます。難易度を校正するときは条件ごとに得点分布と満点率を見て、同じ条件の反復と採点上の制約を確認します。1回の試行からは、その条件で実際に得た点数を報告できます。

実測値は `task-score` の採点範囲に対応する素点で記録します。段階課題の本体得点は `score_group: "challenge"` と登録済み評価器の満点を使います。補足評価の製品観測と提出観測はそれぞれ `product` と `submission` で指定します。表示中の配点と素点の分母が一致することをカタログが検査します。

## 回答者に渡す範囲

`task-prepare` は新しい `--root` に固定入力を照合して用意します。運用者は出力の `workspace/` だけを回答者の作業領域に渡します。`working_directory` から作業し、`prompt_file` があればそれを使います。ホスト側の準備記録、ソースリポジトリ、npmパッケージ、閲覧用の認証情報は運用者側に置きます。CH02〜CH06は `--delivery-mode one_shot` と `--delivery-mode goal_with_pr` を使えます。

通常課題の問題文は業務要件、提出形式、公開の配点を示します。評価者が使う具体的な反例、独立した検査値、追加資料は認証が必要な共通の資材保管先にあります。配布用パッケージから旧問題のファイルと評価者用の追加資料を除外しています。

## 非公開資材を使う準備

カタログ出力の `assessment.calibration` が、全問に共通する非公開リポジトリと固定コミットを示します。認証済みの運用者が、アクセスを制限した作業領域にその版を展開します。以下のコマンドは絶対パスで指定する既存の親ディレクトリを使います。`assets_dir` は回答者の作業領域とソースチェックアウトの外に置きます。

```sh
ref=$(ask evaluate task-list | jq -er '.[] | select(.input.kind == "private") | .input.archive_api_path')
assets_dir=$(mktemp -d)
assets_dir=$(cd "$assets_dir" && pwd -P)
(umask 077; gh api "$ref" | tar -xzf - --strip-components 1 -C "$assets_dir")

ask evaluate task-prepare --id ch01-inventory-reservation-logistics \
  --root /absolute/fresh-logistics-run --assets-root "$assets_dir"
```

物流も共通形式の目録と同じファイル照合処理で準備します。評価者用のファイルは物流の回答者用目録から外れています。

## 初回提出後の追加資料

#528のライブラリ更新と#536の物流課題では、初回の最終回答をホスト側の `delivery/answer.md` に保存してから初回提出を固定します。次のコマンドは、その提出物を照合して別の作業領域を作り、そこで使う追加資料だけを渡します。追試の提出が終わったら `followup/delivery/answer.md` に最終回答を保存します。

```sh
ask evaluate task-freeze --root /absolute/fresh-run
ask evaluate task-followup --root /absolute/fresh-run --assets-root "$assets_dir"
```

RC01とCH08は、`task-prepare` に `--config` と `--assets-root` を渡すと既存の段階実行器を使えます。運用者が初回提出を固定し、第2段階を始めるときに追加資料をコピーします。採点では両段階を照合する引き渡しが必要です。実行方法は [段階実行ガイド](practical-challenge-evaluation.md) を参照してください。

## 採点

```sh
ask evaluate task-inspect --root /absolute/fresh-run
ask evaluate task-score --root /absolute/fresh-run --record /absolute/assessor/record.json
```

評価者は `task-inspect` の `subject` に対して、項目ID、点数、観測結果、根拠ファイルを記録します。根拠ファイルは記録からの相対パス `path` と `sha256:` 付きの `digest` で指定します。最終報告を要する項目では `delivery/answer.md` を、追試が必要な項目では固定版に対応する追試結果を使います。

確認した結果が0点だった場合と、観測できなかった場合を区別します。後者は点数を `null` とし、観測不能の理由を記録します。段階課題に注入した合成実行結果は `stage_evidence_kind: "synthetic"` で識別できます。実モデル試行の結果には含めません。比較する試行では課題ID、入力版、採点基準、モデルと実行条件をそろえます。

## 現行版を更新する

課題IDと出題方法は共通カタログで、公開配点は `benchmarks/task-revisions/<id>/rubric.json` で編集します。公開入力を変更したら `node scripts/seal-evaluation-revisions.mjs --write` で共通目録を更新します。通常課題は現在の課題ディレクトリだけから入力を組み立てます。旧入力は現行の準備に使用しません。

非公開の追加資料や物流入力を更新するときは、評価用資材を固定コミットにまとめ、そのコミットとファイルのハッシュを登録します。配布先の目録に評価者専用資材の本体を載せないこと、選択した版を準備できること、同じ初回提出に別版の追試・採点を流用できないことを確認します。
