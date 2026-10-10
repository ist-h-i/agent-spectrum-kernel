# Mac / Git / Codex で利用者のリポジトリを三条件比較する

この手順では、利用者の Git リポジトリから独立した P／K／F の作業コピーを準備し、
同じ課題を通常の Codex CLI で順に実行します。元のリポジトリやグローバル設定は
変更しません。準備・内容確認・結果表示では Codex やモデルを起動しません。
**`start` が実行開始の操作です。** 実モデルの利用は、人間が内容と正規の権限を
確認して開始する別段階です。この開発での一連の検証は fake runner による合成試験で、
実モデルの比較は未実行です。

初版は Mac／Git／Codex と、追加依存なしで実行できる既存の `node:test` 形式の
`.mjs` テストを対象にします。一般のフレームワークへの自動対応や、任意の課題の意味的な自動採点は
ありません。仕様は [利用者比較の契約](user-comparison-contract.md)、比較の解釈は
[探索的評価](pragmatic-evaluation.md) に記載しています。

## 1. 操作する場所と前提

完全な ASK checkout と Node 24.x、Git を用意します。実行段階では、利用者が普段
使用している Codex CLI と、その利用に必要な正規の権限・認証が必要です。ASK は
認証ファイルを調査せず、承認設定やセキュリティ設定を変更しません。
Git は [`--no-lazy-fetch` 対応版](https://git-scm.com/docs/git)
を使います。比較元commitのobjectがローカルに不足している場合は、準備を停止します。
準備からremoteへ取りに行く処理はありません。

以下は ASK checkout のディレクトリで操作します。`/absolute/...` を自分の
**絶対パス**に置き換えてください。ASK checkout、対象 repo、保存先は別の場所を
指定し、シンボリックリンクを経由しない実パスを使います。

```sh
ASK_CHECKOUT='/absolute/path/to/agent-spectrum-kernel'
TARGET_REPO='/absolute/path/to/your-repository'
COMPARISON_AREA='/absolute/private/ask-comparisons'
cd "$ASK_CHECKOUT"
node --version
git --version
git --no-lazy-fetch --version
mkdir -p "$COMPARISON_AREA"
git -C "$TARGET_REPO" status --short
BASE_COMMIT="$(git -C "$TARGET_REPO" rev-parse HEAD)"
TASK_FILE="$COMPARISON_AREA/task.md"
VERIFICATION_FILE="$COMPARISON_AREA/verification.json"
RUN_OUTPUT="$COMPARISON_AREA/run-001"
```

`BASE_COMMIT` は比較したい40桁の commit SHA です。上の例は HEAD を使います。
別の commit を使う場合は、その repo 内で実在する完全な SHA を代入してください。
コピーするのは指定 commit のファイルです。未コミット変更や未追跡ファイルは
元の repo に保持され、比較入力には入りません。ASK の導入状態を比較に使う場合も、
その状態が指定 commit に含まれている必要があります。

保存先の親ディレクトリ `COMPARISON_AREA` は実在させます。`RUN_OUTPUT` 自体は
まだ存在しないディレクトリを指定します。既存の出力への上書きは拒否されます。
生成した比較ディレクトリを後から移動する運用には対応していません。

## 2. 単一作業の受入を先に確認する場合

ASK を導入したときに何を受け取るか、一件の公開練習問題で確認したい場合は
[初回開発受入](first-workflow-mac-codex-ja.md) を使えます。これは人工 workspace に
**implementation profile** を導入する準備であり、F 条件の Full ではありません。
対象 repo を渡す command でもありません。

```sh
node scripts/prepare-first-workflow.mjs --json > "$COMPARISON_AREA/first-workflow-preparation.json"
FIRST_WORKSPACE="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).workspace' "$COMPARISON_AREA/first-workflow-preparation.json")"
FIRST_INPUTS="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).parent' "$COMPARISON_AREA/first-workflow-preparation.json")"
FIRST_RECORDS="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).evidence' "$COMPARISON_AREA/first-workflow-preparation.json")"
```

ここまででモデルは起動しません。seed test は2 pass／1 fail、exit 1 が期待値です。
人工 workspace の一時領域は長期保存を保証しないため、必要な受入記録・ログは
利用者の私的な保存先に保管してください。

実行内容と正規の権限を確認した後、通常の Codex で `FIRST_WORKSPACE` を開き、
`FIRST_INPUTS/implementation-input-ja.md` の内容を課題として送ります。
**Codex への課題送信からモデル使用が始まります。** 実装後はその workspace で
独立した端末からテストを実行します。

```sh
cd "$FIRST_WORKSPACE"
node --test test/rule-service.test.mjs
git diff --stat
git diff -- src test
cd "$ASK_CHECKOUT"
```

追加したテストが別ファイルにある場合は、実在するファイルを明示して同じ
`node --test` に加えます。既存5つの `src` と `test/` だけを変更したか、`task.md`
の10要件を満たすかを人が照合し、`FIRST_RECORDS/acceptance-record.json` に実ログと
未確認項目を残します。モデルの完了回答や公開テストの成功だけでは受入完了に
しません。この記入用記録は Activated／Operational の自動認定や release gate の
代わりにはなりません。

## 3. 比較する課題と検証方法を書く

`TASK_FILE` に課題を書きます。例えば既存の `src/value.mjs` と
`test/value.test.mjs` を持つ repo なら、次のように対象と期待する動作を具体化します。
このパスと内容は自分の repo の課題に置き換えてください。

```sh
cat > "$TASK_FILE" <<'EOF'
src/value.mjs の normalizeValue が空文字を受け取ったときに、仕様どおり null を返すよう修正してください。
既存の正常入力の動作を保ってください。変更は src/ に限定し、テストや指示ファイルは変更しないでください。
EOF
cat > "$VERIFICATION_FILE" <<'EOF'
{
  "command": ["node", "--test", "test/value.test.mjs"],
  "requirements": [
    {
      "id": "empty-value",
      "description": "既存の value.test.mjs が空文字で null を返すことを検証する",
      "command": ["node", "--test", "test/value.test.mjs"]
    },
    {
      "id": "compatible-behavior",
      "description": "既存の正常入力の仕様と修正差分を人が照合する"
    }
  ]
}
EOF
```

検証 JSON の `command` と各要件の任意の `command` は、
`["node", "--test", "対象commitに存在する.mjsファイル", ...]` だけを受け付けます。
シェル、glob、npm script、追加依存、モデルによる採点は使いません。複数のテストは
一つずつ明示します。検証に使うファイルと `--allow` の変更可能範囲は重ねられません。
モデルが検証条件を変えて合格することを防ぐため、これらのテストは変更禁止です。
必要なテストが未作成なら、まず利用者が適切なテストを用意した commit を比較元に
選びます。

`requirements` の `id` は重複しない小文字の英数字とハイフン、`description` は
確認したい要件です。`task-tests` は内部のテスト結果に使う予約IDで、指定できません。
要件に `command` がなければ、自動判定は `unknown` のまま
残ります。コマンドの成功がその要件を実際に検証するかは、利用者が確認してください。
独立検証では、準備時に hash を固定した controller の Node reporter を使います。
reporter が Node の構造化イベントから作る JSONL ログで、指定した各ファイルの実テスト件数・失敗・中断・skip・todo を確認します。
テストや変更したソースの標準出力・診断文は別種のレコードとして保存し、集計行として読み取りません。
空ファイルの実行成功だけでは合格にしません。指定した全ファイルでテストが評価され、
すべて合格することが必要です。assertion 数は取得しないため `unknown` です。
テストが要件を十分に検証するかは、利用者がコードと仕様を照合してください。
検証 JSON は、比較元 commit に含まれない私的な領域に置いてください。
非公開の正解・採点データ・過去の回答・認証情報を課題や repo に入れないでください。

## 4. 三条件を準備する

```sh
node scripts/ask-user-comparison.mjs prepare \
  --repo "$TARGET_REPO" \
  --commit "$BASE_COMMIT" \
  --task "$TASK_FILE" \
  --verification "$VERIFICATION_FILE" \
  --output "$RUN_OUTPUT" \
  --allow src/ \
  --cli codex \
  --task-class implementation \
  --global-ask unknown \
  --timeout-ms 600000 \
  --verification-timeout-ms 60000
```

準備ではローカルの Node／Git と既存 installer を使い、独立した Git repo を
3つ作ります。Codex CLI／モデルは起動しません。全条件の比較元 commit、課題、
モデルへ渡す課題文、検証方法、変更可能範囲は共通です。

| 条件 | 作業コピーの内容 |
| --- | --- |
| P／`plain` | プロジェクト内に ASK を追加しない。導入済み ASK の管理対象を分離し、利用者独自の指示を保持する。グローバル Skill や指示は存在しうる |
| K／`kernel_only` | canonical `AGENTS.md` の管理ブロックを使い、ASK Skill を追加しない。利用者独自の指示は保持する |
| F／`full_ask` | この ASK checkout の実際の core と Codex `full` profile、分類済み reference supplement の現在の bytes を使う。利用者独自の指示は保持する |

F の定義は `live_core_plus_codex_full_with_classified_reference_supplement` です。
`control/plan.json` の `full_definition` に ASK 版、source commit、renderer、資産数、
supplement の参照と hash、資産全体の hash を保存し、各条件の `assets` に実際の
ファイルと hash を残します。旧固定実験の hash や条件を更新する処理ではありません。
P は「ASK が完全に存在しない環境」とは呼びません。

K は非 trivial 課題で router 等を必要とします。Skill がなければ
`capability_missing` と記録して K を起動せず、無断で Skill を補いません。
`implementation` で確認する名前は `operating-mode-router`、`skill-router`、
`controlled-implementation`、`test-first-verification` です。
実際に通常の Codex 環境で使えるグローバル Skill が分かっている場合だけ、準備時に
`--global-capability skill-name` を必要な名前ごとに指定できます。この指定は
利用者の宣言として保存され、ASK が発見・読取り・呼出しを確認した証拠にはなりません。
結果を改善するための Skill 追加や `--task-class trivial` への変更は行わないでください。

`--allow` は複数回指定でき、末尾 `/` はそのディレクトリ内、末尾 `/` がない場合は
そのファイルだけを変更可能にします。指示・ASK 資産と検証テストは変更可能に
できません。課題種別は `implementation`／`trivial`／`review`／`investigation` です。
変更可能ディレクトリの内側でも、`AGENTS.md`、`AGENTS.override.md`、
`CUSTOM_INSTRUCTIONS.md` と `.agents`／`.agent-spectrum-kernel` 配下は保護します。

通常利用する設定が分かる場合は `--cli-version '利用している版'`、
`--model '利用するmodel名'`、`--reasoning medium` を加えられます。
`--cli` は `codex` または実行ファイルの絶対パスです。省略された版・model・reasoning
は未知として残し、通常の Codex 設定を使います。`--global-ask` は
`unknown`／`observed`／`not_observed` です。未観測を完全な不存在の証明にはしません。
グローバル設定の完全隔離や、全条件の環境の完全一致は要求しません。

## 5. 内容を確認する

```sh
node scripts/ask-user-comparison.mjs inspect "$RUN_OUTPUT" --json
```

表示される `plan_digest` と、次の内容を確認します。

- 元 repo と commit、課題文、検証方法、P／K／F の資産と機能不足。
- 各条件の実際の executable／引数／cwd／入力、CLI・model・reasoning の宣言。
- 送信入力の範囲、変更可能範囲、保存先、時間制限、1回ずつ・再試行なし・逐次実行。
- 残るグローバル設定・実効 model・将来のツール選択に関する不明点。

モデル入力には同じ課題文、指定 commit の repo、条件別の指示、および通常の Codex
会話・ツールの文脈が入りえます。検証 JSON と制御記録は作業コピーの外に置きますが、
公開検証コマンドは課題文に含めます。将来選ばれる全通信や全グローバル指示の
事前列挙は要求しません。一方、利用する provider／送信先と、その repo・課題の
共有可否、認証の利用、組織ポリシー、実行権限は利用者が通常の正規の手続で
確認してください。環境差の許容は権限不足の代わりにはなりません。

検証は新しいコピーで独立した Node プロセスを使います。repo のテストコードを
実行するため、信頼して実行を許可できるテストを選んでください。検証コピーは
セキュリティ sandbox ではありません。時間制限はローカルプロセスグループの
終了処理で、provider 側の取消しや token／費用の厳密な上限を保証しません。
検証記録の `execution_origin` は通常の入口で `controller_node_process` です。
合成試験の差替え検証は `synthetic_injected_verifier` として区別し、独立した
controller プロセスで実行したとは記録しません。実測側への差替えは開始前に拒否します。

## 6. 人間の操作で開始する

**以下の `start` だけが既存 Codex runner へ起動を要求します。** 内容確認と必要な
正規の承認を終えた人間が実行してください。`PLAN_DIGEST` には直前の `inspect` に
表示された `sha256:...` 全体をそのまま代入します。

```sh
PLAN_DIGEST='sha256:inspectに表示された64桁のdigest'
node scripts/ask-user-comparison.mjs start "$RUN_OUTPUT" --confirm "$PLAN_DIGEST"
```

P→K→F の順で独立した `codex exec` セッションを使い、各条件は最大1回です。
同時実行、自動再試行、失敗後の別経路、resume はありません。準備済みの入力や
作業コピーが変わると起動を拒否します。起動拒否・runner 失敗・timeout・中断・
検証失敗が起きたら後続条件を開始しません。K の `capability_missing` はその条件を
未実行として保存し、F の処理へ進みます。

`start` は一度だけ使えます。起動前の拒否であっても開始記録を消して再利用しないで
ください。新しい試行には新しい出力先と実行 ID が必要です。コマンドの exit 0 は
全条件のプロセス完了、exit 2 は完了以外の条件があることを示し、全要件の受入合格
を意味しません。controller の入力拒否や記録読取りエラーは exit 1 です。

## 7. 結果を開く・途中で止まった状態を確認する

```sh
node scripts/ask-user-comparison.mjs report "$RUN_OUTPUT"
node scripts/ask-user-comparison.mjs report "$RUN_OUTPUT" --json
```

実行中に `Ctrl+C` で中断を要求できます。その後は同じ保存先に対して `report` で
確認します。端末が閉じたり強制終了された場合も、この command は起動せずに
保存済みの状態だけを読みます。3つの予定条件をすべて表示し、後続の未開始条件を
除外しません。

| 主な状態 | 読み方 |
| --- | --- |
| `not_started` | 起動要求なし。時間・使用量・品質を0や成功にしない |
| `capability_missing` | 必要な route または CLI がない。不足した名前と起動要求の有無を確認する |
| `permission_denied` | 起動が権限により拒否された。別経路で回避しない |
| `runner_failed`／`timeout`／`interrupted` | 実行失敗・時間制限・中断。理由と部分成果を確認する |
| `incomplete`／`result_missing` | 完了記録がない、読めない、または保存成果が欠損・不整合。完了や使用量を推測しない |
| `verification_failed` | 独立したテストが合格しなかった。検証ログを見る |
| `scope_violation` | 変更禁止ファイルへの変更がある。修正差分と scope の違反一覧を確認する |
| `completed` | CLI プロセスが正常終了した。品質の受入は検証結果と要件照合で別に判断する |

JSON は `launch_requested`（起動要求）、`spawn_observed`（ローカル子プロセス開始の
観測）、`process_completed`（終了の観測）、exit code、失敗理由を分けて残します。
成果物が欠けた場合も、独立した hash と実行IDで確認できる起動要求・開始観測は
表示します。確認できない完了・exit code・品質は `unknown` のままです。
子プロセスの開始観測は、provider のモデル呼出しや課金回数の独立した証明では
ありません。テストと要件、scope、時間、取得できた input／output／cached tokens、
実際の model が出力された場合の値、条件差と不明点を確認できます。
条件の所要時間は開始要求から記録・検証までです。CLI の処理時間は
`process_duration_ms`、各検証の時間は検証記録で別々に確認できます。
取得できない使用量・費用・request 数は null／`unknown` で、0として集計しません。

保存場所は利用者が指定した `RUN_OUTPUT` です。

| 保存先 | 内容 |
| --- | --- |
| `control/plan.json`、`control/plan.digest` | 実行 ID、日時、比較元、課題・検証 hash、設定、各条件の全ファイル hash、Full の定義 |
| `inputs/prompt.md`、`control/task.md`、`control/verification.json` | 実際の課題入力と共通検証方法 |
| `control/node-test-reporter.mjs` | hash を固定した独立検証用の Node reporter。モデル入力には含めない |
| `control/baselines/` | 各条件の準備済みファイルの私的なbaseline。hashを固定し、修正差分の比較元に使う |
| `control/patch-workspaces/` | 差分採取専用のcontrollerコピー。モデル側のGit index・objectを使わず、変更前後の確認済みbytesからpatchを作る |
| `arms/plain`、`arms/kernel_only`、`arms/full_ask` | 独立した条件別 Git repo と修正内容 |
| `control/start.json`、`control/end.json` | 開始操作と終了の記録。強制終了時は終了記録がない場合がある |
| `control/slots/<condition>/` | `request.json`、`spawn.json` と各 digest、`result.json`、CLI ログ、応答、修正 patch、独立検証ログなど、取得できた証拠 |
| `verification/<condition>/` | 結果を独立検証した作業コピー |

記録は私的なローカル領域に保存され、自動 upload はありません。認証ファイル、
トークン、Cookie、Authorization ヘッダー、環境変数全体を収集しません。
ただし課題・repo・応答・patch 自体に秘密が含まれないことは利用者が確認してください。
ログは既知の認証形式を除去しますが、任意の秘密の完全な検出は保証しません。
公開する場合は、生の記録・ログ・私的パスをそのまま掲載せず、許諾された要約を作ります。

計画と開始記録は保存した hash と照合します。手動で計画を書き換えて過去の結果に
別の commit や設定を付け直すことはできません。記録に不整合があれば理由を表示して
停止します。新しい条件は新しい出力先・実行IDに保存してください。

## 8. 別の試行と複数の結果

再実行を選ぶ場合は、旧結果を保存したまま、新しい出力先に準備します。
`PREVIOUS_RUN_ID` は旧 `control/plan.json` の実行 ID を読み取ります。

```sh
PREVIOUS_RUN_ID="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).run_id' "$RUN_OUTPUT/control/plan.json")"
NEXT_OUTPUT="$COMPARISON_AREA/run-002"
node scripts/ask-user-comparison.mjs prepare \
  --repo "$TARGET_REPO" --commit "$BASE_COMMIT" \
  --task "$TASK_FILE" --verification "$VERIFICATION_FILE" \
  --output "$NEXT_OUTPUT" --allow src/ \
  --cli codex --task-class implementation --global-ask unknown \
  --timeout-ms 600000 --verification-timeout-ms 60000 \
  --rerun-of "$PREVIOUS_RUN_ID"
node scripts/ask-user-comparison.mjs inspect "$NEXT_OUTPUT" --json
node scripts/ask-user-comparison.mjs report "$RUN_OUTPUT" "$NEXT_OUTPUT" --json
```

新しい `start` を選ぶと、完了済み条件も含む新しい三条件の試行になります。
不足条件だけを旧 ID で再開する機能はありません。課題・設定・検証方法を変更した
場合は、その違いが解釈に影響します。集計は既存の探索的 reporter を使い、
合成試験・実モデルの観測・未実行 plan を別々に扱います。異なる課題や成功基準も
一つの品質 score に混ぜません。結果が欠けた条件を隠して比較成功にしません。

## 9. 対応範囲と結果の限界

ASK 未導入 repo と、所有範囲を確認できる ASK 導入済み repo が対象です。
導入済みでは schema 3 の core／Codex install state と一致する管理 hash を使い、
管理対象だけを各コピーから分離します。`AGENTS.md` の管理ブロック外と利用者独自
ファイルは保持します。管理対象の変更、部分導入、古い／曖昧な state、所有対象の
衝突、Claude／hook 導入は準備時に停止します。利用者独自のファイルを削除して
成功へ変える処理はありません。
rootに空でない `AGENTS.override.md` がある構成も、canonical `AGENTS.md`による
比較条件を維持できないため準備で停止します。利用者のoverrideを削除して続行しません。
管理記録がなく canonical `AGENTS.md` の本文がそのまま置かれた場合も、所有範囲を
判断できないため停止します。利用者が文章中でASKに言及しているだけなら保持します。

初版は通常の commit 済みファイルだけに対応し、symlink、submodule、認識できる
秘密ファイルを拒否します。1ファイル32 MiB、commit 全体256 MiB、最大2万ファイルが
準備の上限です。commit に含まれる `.agents/runs/`、
`.agent-spectrum-kernel/runtime/`、`ask-runtime/` の過去実行記録も、課題入力への
混入を避けるため準備時に停止します。これらを自動削除する処理はありません。
作業コピーのGit管理領域は、外部を指すcommon directoryやファイルのリンクを
Gitを起動せずに検査します。差分は私的なbaselineと確認済みの変更bytesから
controller専用コピーで作り、モデル側のindex・object storeをGitで読み取りません。
通常のstaging・repackは許容しますが、mutable Git storageは最大10万entries・
深さ32に制限し、超過時は停止します。準備では三条件の私的baselineも保存するため、
元repoのファイル量に応じた追加のディスク容量が必要です。
対象の build／外部サービス／依存導入／任意フレームワークの採点は
今回の入口には含めません。

この比較から判断できるのは、指定した課題・commit・環境で各条件が何を作り、
どこで止まり、どのテスト・要件が確認でき、どれだけ時間や観測可能な使用量が
かかったかです。モデルの自己申告を品質点にせず、採点できない要件は判定不能として
残します。単一課題の差は ASK 全般の有効性、因果効果、ROI、実運用成功、
ASK v1 全体の完成を証明しません。Full の設置と、実際の Skill 使用も区別します。

[旧三条件 driver](local-three-arm-comparison.md) は合成試験専用のままです。
旧 r8〜r24 診断、拒否済み Python 起動要求、認証調査を再試行しません。
以前の外側の承認拒否は Codex／モデル起動0回であり、ASK 本体の失敗実測ではありません。
この新しい入口の開発完了も、その拒否を解除する根拠にはなりません。
