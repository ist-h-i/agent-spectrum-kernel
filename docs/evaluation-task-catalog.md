# 評価課題を探して実行準備する

通常課題、在庫・予約・物流、CH02〜CH06、RC01、CH08を同じコマンドで選べます。一覧には課題ID、タイトル、分野、難易度、課題タイプ、入力と採点定義の参照、スキルごとに観測できる採点項目が表示されます。

```sh
node scripts/practical-evaluation-cli.mjs task-list
node scripts/practical-evaluation-cli.mjs task-list --difficulty medium_hard --type review --skill controlled-implementation
node scripts/practical-evaluation-cli.mjs task-prepare --id pf-observability-redaction --root /absolute/new-evaluation
```

パッケージ導入済みの環境では、同じ引数を `ask evaluate task-list` と `ask evaluate task-prepare` に渡します。

- 難易度は `easy`、`easy_medium`、`medium`、`medium_hard`、`hard`、`unassessed` から指定できます。見立てに使った資料の種類は `difficulty_basis`、RC01・CH08の見立ての出典は `difficulty_source` に表示されます。
- 課題タイプは `implementation`、`review`、`investigation`、`design`、`test`、`handoff`、`documentation` から指定できます。複数のタイプを持つ課題も同じIDで準備します。
- スキルには [manifest.json](../manifest.json) のIDを指定します。複数の絞り込みを指定すると、すべてに一致する課題を表示します。採点で観測する内容は `observations` にあり、項目IDは同じ課題の `assessment` を参照します。

## 作業領域と版を確認する

`task-prepare` は、チェックアウトの外にある既存の親ディレクトリに未使用の `--root` を作り、選択した課題の固定入力を照合して用意します。通常・業務課題では結果の `working_directory` で作業し、`prompt_file` があればそれを使用します。それ以外は `task_file` が実行時の問題文です。準備が完了するとホスト側の `evaluation-preparation.json` に、入力と採点定義の版および作業場所を保存します。

```sh
node scripts/practical-evaluation-cli.mjs task-prepare --id ch02-report-operations --root /absolute/new-ch02 --delivery-mode one_shot
node scripts/practical-evaluation-cli.mjs task-prepare --id ch06-build-operations --root /absolute/new-ch06 --delivery-mode goal_with_pr
```

CH02〜CH06の既定は `one_shot` です。両モードとも共通仕様への相対参照が解決できるように準備します。実行の承認、モデル呼び出し、採点はそれぞれ既存の手順に従います。採点定義は通常課題の新版の問題文・項目別配点と評価者用の固定版、業務課題の受入仕様、段階課題の固定評価器参照に対応します。業務課題では、受入仕様が参照する個別の仕様書も入力目録のハッシュで結び付けます。

### 在庫・予約・物流

一覧の `input.archive_api_path` は、回答者向け固定版を取得するGitHub APIのパスです。配布元を閲覧できるアカウントで認証済みの `gh` を使い、手元のアクセス制限されたディレクトリに展開します。`task-prepare` は配布目録とプロンプトのハッシュ、目録内の各ファイルを照合します。

```sh
archive=$(node scripts/practical-evaluation-cli.mjs task-list |
  jq -er '.[] | select(.id == "ch01-inventory-reservation-logistics") | .input.archive_api_path')
input_dir=$(mktemp -d)
input_dir=$(cd "$input_dir" && pwd -P)
(umask 077; gh api "$archive" | tar -xzf - --strip-components 1 -C "$input_dir")

node scripts/practical-evaluation-cli.mjs task-prepare --id ch01-inventory-reservation-logistics \
  --root /absolute/new-logistics --logistics-source "$input_dir"
```

### RC01・CH08

引数 `--id` と `--root` だけで初回の固定入力を用意できます。既存の段階実行器の準備まで行う場合は、実行環境を記載した `--config` を同じコマンドに渡します。設定ファイルと以後の承認・実行手順は [段階実行ガイド](practical-challenge-evaluation.md) を参照してください。

保存済みの試行や旧版を再現する場合は、その試行が固定したソースと入力・採点定義を揃えます。会計台帳移行や旧予約・配送の資材は [移行前のV4固定版](https://github.com/ist-h-i/agent-spectrum-kernel/tree/e27575504f306772a13d568c3fcfa986060d6d37/benchmarks/challenge-candidates/ceiling-v4-continuity) から参照できます。改訂前に固定した通常24問の入力を一括で検証する作業には [公開入力の一括点検](primary-24-public-inputs.md) を使えます。

## 改訂版を採点する

通常24問では、回答者が受け取る `task.md` の末尾に10点の内訳を表示します。`task-prepare` が初期入力を照合します。提出後は、評価者が次のコマンドで提出物を識別し、どの固定ファイルに変更があったかを確認します。回答者にハッシュの転記を求める手順はありません。

```sh
node scripts/practical-evaluation-cli.mjs task-inspect --root /absolute/new-evaluation
node scripts/practical-evaluation-cli.mjs task-score --root /absolute/new-evaluation --record /absolute/assessor/record.json
```

1. `task-list` の `assessment.calibration` が示すリポジトリ・コミット・ディレクトリを、アクセスできる評価者が開きます。一つのコミットから共通の補助ファイルも取得してください。校正用の答案と評価手順は評価者の作業領域に置きます。
2. 最終回答を作業領域外で受け取った場合は、ホスト側の `--root` 直下に `delivery/answer.md` として保存します。回答者の実行記録も `delivery/` にまとめてから `task-inspect` を実行してください。回答本文や記録だけが違う提出も区別できます。最終報告を要する項目は、報告を取得できなければ未観測とします。`subject` は課題ID、入力・採点基準の版、提出ファイルの一覧と内容から求めたダイジェストを含みます。評価者は、この提出物に対して行った操作、保存状態、提出者のテストが検出した差など、各項目が求める証拠を保存します。固定入力の差分は変更範囲の判断に使い、設定・テストを変えて得た結果を元の条件での成功に数えないでください。
3. 評価者用JSONの `subject` に先ほどの値を入れ、`items` に項目ごとの `criterion_id`、`points`、`reason`、`evidence` を記録します。`evidence` は採点記録からの相対パス `path` とファイルの `digest`（`sha256:` と16進64桁）の組です。評価できなかった項目は `points: null` と理由を記録します。`critical_violations` には業務への実害 `impact` と根拠 `evidence` を記録できます。
4. `task-score` は提出内容・版・証拠ファイルを照合し、評価者の判断を集計します。根拠を確認して0点とした項目と未観測の項目を分けて表示します。未観測を含むグループでは確定分だけを `confirmed_points` に表示し、合計 `points` は `null` にします。

在庫・予約・物流、CH02〜06、RC01、CH08の改訂項目は診断用です。製品の動作と提出者のレビュー・検証を別々に集計します。CH08の機能40点・UI/UX60点とRC01の100点には従来どおり段階実行器の採点経路を使用してください。第1段階の提出物を固定してから、第2段階の情報を渡します。RC01とCH08で観測に得点を付けるには、`challenge-score-handoff` で両段階の提出物を照合しておく必要があります。

比較には `task_id`、`input.digest`、`assessment.digest` が一致する試行を使います。モデル・推論設定・対象外のスキルも固定します。実際に試行したときは、項目別結果と未観測数、採点できた件数とそのうちの満点件数を記録してください。時間・トークンは別に記録します。改訂前の答案と点数は、その試行のコミットから参照できます。

## 検証契約

- Artifact ID `issue-511-verification`。上流は [#511](https://github.com/ist-h-i/agent-spectrum-kernel/issues/511)。
- `ask.verification-proof-policy@1.0.0` の Formal Verification Contract を使用します。既存CLI、配布パッケージと複数の入力契約をまたぐ変更です。
- V1。現行32件のIDを重複なく表示し、難易度・タイプ・スキルの組み合わせで選べることをCLIで確かめます。
- V2。選んだ各IDの固定入力を新規ディレクトリに準備し、入力と採点定義の参照を照合します。段階課題の追加情報、業務課題の別モード、物流の目録外ファイルが回答者の作業領域に混入しないことを確かめます。
- V3。通常課題の一括検証、段階実行器、npm配布後の一覧と準備を既存経路から再確認します。物流の原本確認は既存のアクセス権で取得した固定版を使います。
