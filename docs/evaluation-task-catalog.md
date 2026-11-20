# 評価課題の一覧と実行準備

現行課題は [共通カタログ](../benchmarks/evaluation-tasks.json) に登録します。通常24問、業務6問、RC01、CH08が同じ入力目録と版の識別方法を使います。課題によって、配布モードや初回提出後の追加資料を指定できます。

```sh
ask evaluate task-list
ask evaluate task-list --difficulty medium_hard --type review --skill controlled-implementation
ask evaluate task-prepare --id pf-observability-redaction --root /absolute/fresh-run
```

ソースから使う場合は `ask evaluate` を `node scripts/practical-evaluation-cli.mjs` に置き換えます。難易度は出題時の見立てです。新しく校正した結果がなければ `unassessed` を使います。

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
