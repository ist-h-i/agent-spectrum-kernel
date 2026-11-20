# 評価課題を探して実行準備する

通常課題、在庫・予約・物流、CH02〜CH06、RC01、CH08を同じコマンドで選べます。一覧には課題ID、タイトル、分野、難易度、課題タイプ、入力と採点定義の参照、スキルごとに観測できる採点項目が表示されます。

```sh
node scripts/practical-evaluation-cli.mjs task-list
node scripts/practical-evaluation-cli.mjs task-list --difficulty medium_hard --type review --skill controlled-implementation
node scripts/practical-evaluation-cli.mjs task-prepare --id pf-observability-redaction --root /absolute/new-evaluation
```

パッケージ導入済みの環境では、同じ引数を `ask evaluate task-list` と `ask evaluate task-prepare` に渡します。`challenge-list` も同じ一覧を返します。

- 難易度は `easy`、`easy_medium`、`medium`、`medium_hard`、`hard`、`unassessed` から指定できます。見立てに使った資料の種類は `difficulty_basis` に表示されます。
- 課題タイプは `implementation`、`review`、`investigation`、`design`、`test`、`handoff`、`documentation` から指定できます。複数のタイプを持つ課題も同じIDで準備します。
- スキルには [manifest.json](../manifest.json) のIDを指定します。複数の絞り込みを指定すると、すべてに一致する課題を表示します。採点で観測する内容は `observations` にあり、項目IDは同じ課題の `assessment` を参照します。

## 作業領域と版を確認する

`task-prepare` は、既存の親ディレクトリに未使用の `--root` を作り、選択した課題の固定入力を照合して用意します。通常・業務課題では結果の `working_directory` で作業し、`prompt_file` があればそれを使用します。それ以外は `task_file` が実行時の問題文です。準備が完了するとホスト側の `evaluation-preparation.json` に、入力と採点定義の版および作業場所を保存します。

```sh
node scripts/practical-evaluation-cli.mjs task-prepare --id ch02-report-operations --root /absolute/new-ch02 --delivery-mode one_shot
node scripts/practical-evaluation-cli.mjs task-prepare --id ch06-build-operations --root /absolute/new-ch06 --delivery-mode goal_with_pr
```

CH02〜CH06の既定は `one_shot` です。両モードとも共通仕様への相対参照が解決できるように準備します。実行の承認、モデル呼び出し、採点はそれぞれ既存の手順に従います。採点定義は通常課題の公表要件・評価器参照、業務課題の受入仕様、段階課題の固定評価器参照に対応します。

### 在庫・予約・物流

権限のある評価担当者は、回答者向けの配布元から `task-list` に表示されたコミットを取得し、アクセス制限のある手元のディレクトリに置きます。`public-manifest.json`、`prompt.txt`、`public/` を含む配布先のルートを指定してください。配布目録とプロンプトのハッシュ、目録内の各ファイルを検証して回答者向け入力を準備します。

```sh
node scripts/practical-evaluation-cli.mjs task-prepare --id ch01-inventory-reservation-logistics \
  --root /absolute/new-logistics --logistics-source /absolute/authorized-distribution
```

### RC01・CH08

引数 `--id` と `--root` だけで初回の固定入力を用意できます。既存の段階実行器の準備まで行う場合は、実行環境を記載した `--config` を同じコマンドに渡します。設定ファイルと以後の承認・実行手順は [段階実行ガイド](practical-challenge-evaluation.md) を参照してください。

保存済みの試行や旧版を再現する場合は、その試行が固定したソースと入力・採点定義を揃えます。通常24問を一括で検証する作業には [公開入力の一括点検](primary-24-public-inputs.md) を使えます。

## 検証契約

- Artifact ID `issue-511-verification`。上流は [#511](https://github.com/ist-h-i/agent-spectrum-kernel/issues/511)。
- `ask.verification-proof-policy@1.0.0` の Formal Verification Contract を使用します。既存CLI、配布パッケージと複数の入力契約をまたぐ変更です。
- V1。現行32件のIDを重複なく表示し、難易度・タイプ・スキルの組み合わせで選べることをCLIで確かめます。
- V2。選んだ各IDの固定入力を新規ディレクトリに準備し、入力と採点定義の参照を照合します。段階課題の追加情報、業務課題の別モード、物流の目録外ファイルが回答者の作業領域に混入しないことを確かめます。
- V3。通常課題の一括検証、段階実行器、npm配布後の一覧と準備を既存経路から再確認します。物流の原本確認は既存のアクセス権で取得した固定版を使います。

