# 個人ループ: 既存9課題を使う一巡の手順

この手順は、既存の観測・生成・Registry・Portfolio・Evaluation・Evolution を
接続する。候補の勝利は必要ない。欠測を残した保留、現状維持、不採用も結果になる。
[Issue #379](https://github.com/ist-h-i/agent-spectrum-kernel/issues/379) の全体完了や
実 Mac での運用成功を、人工試験の成功から推定しない。

## 今回の公開検証と利用可能な経路

`scripts/test-ask-personal-evolution-primary-loop.mjs` は、公開 fixture から作った
独立した人工入力で、次の順序を検査する。

```text
public observation → generation request → fake provider / import receipt
→ separate artificial source review / fresh candidate preparation
→ pre-result Portfolio alignment / per-fixture selection / experiment
→ nine-fixture pair seal → prepared driver → existing comparison controller
→ saved producer / synthetic engineering results → saved re-verification
→ separate evaluation trust → proposal → separate artificial human decision
→ completed no-op receipt → fresh unstarted next generation request
```

9課題×2 role×P/K2/F の54 condition は synthetic 専用 fake runner/verifier が
終端を返す。prepared driver の本来の grading factory と pair 委譲先だけを、
独立した Node test process の module mock で置き換える。pair、比較 controller、
producer、保存結果検証、Evolution の契約は既存実装を使う。
本来の private grading resource preflight、private evaluator、実 Codex CLI、
provider 通信、モデル品質、実 Mac の適用/復元はこの検証に含まれない。
production driver に fake callback を渡す API は追加していない。

非モデルの再現コマンド（CI と同じ Node 24.19.0）:

```sh
node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-primary-loop.mjs
node --test scripts/test-ask-personal-evolution-primary-pair.mjs scripts/test-ask-personal-evolution-generation-connector.mjs scripts/test-ask-personal-source-install.mjs
```

人工の比較品質は同じで、cost の必要観測が欠け、variance / mechanism /
external outcome は unavailable のまま、凍結された policy が
`insufficient_evidence` を選ぶ。独立した人工 decision で no-op を記録し、
Registry/Portfolio の heads と既存保存 bytes を維持する。試験用の source review、
grade、decision は実評価・本人承認の証拠には使えない。

## 1. 新しい観測と生成要求を用意する

[観測/準備](personal-evolution-bridge.md) の閉じた public summary を作り、
`preparePersonalEvolutionGenerationRequest` に current parent Asset/Portfolio、
Registry、候補の適用範囲、rollback、holdoutTaskIds、distinct requestedVersion と
fresh requestId を渡す。観測 task IDs は評価の holdout と分ける。
raw history、秘密、private answers は入力に含めない。

既に準備済みの候補を使う場合は、生成を飛ばしてその exact preparation から
始めてよい。生成する場合は、request object digest、public input 範囲と
provider identity/implementation を独立に確認し、新たな直接の本人指示を得てから
[once-generation connector](personal-evolution-generation-connector.md) の
`runPersonalEvolutionGeneration` を一度だけ呼ぶ。比較開始の承認とは分ける。
`verifyPersonalEvolutionGenerationExecution` または
`inspectPersonalEvolutionGenerationStatus` で、元の request から receipt を確認する。
held / consumed_unknown の開始印を消して再試行しない。

生成された候補の safety は `not_evaluated` である。独立した source review が
必要なら、同じ内容を distinct immutable source-reviewed version として既存
`registerAsset` に登録し、`preparePersonalEvolutionCandidate` で新しく準備する。
source review の適用範囲、元の生成 candidate/content と reviewed Asset の関係を
既存 CAS の evidence ref として保持する。source review は品質の評価を代行しない。
未知の safety のままなら、既存 selection の hold を維持する。

## 2. 結果を見る前に baseline と課題を固定する

新規登録で Registry snapshot が進んだ場合は、
`planPersonalEvolutionBaselineAlignment` で dedicated evaluation CAS の
baseline/challenger manifest を準備する。その exact plan digest と両 role の
Portfolio authority contexts を別途確認・pin してから
`applyPersonalEvolutionBaselineAlignment` を呼ぶ。返された alignment が
`NOT_RUN` なら、quality を0にせず reasons と不足証拠を保持する。
これは評価用 branch の準備であり、Mac の設定適用ではない。

既存 subscription を使い追加支出を認めない比較では、新しく確認する manifest の
`budgets.cost_policy: "subscription_no_additional_spend_v1"` を両 role に同じように
固定できる。[Portfolio の費用契約](portfolio-manager-contract.md#explicit-subscription-comparison-policy)
に従い、金額見積・利用可能金額の欠測は `unknown` / `null` のまま残す。
この mode の利用可能金額は Unknown とし、金額上限との併記は拒否される。
値を0に置き換えたり、月間残量を推測したりしない。token / 時間の planning 上限、
サービス自体の拒否、安全性と証拠の条件は維持する。宣言は subscription や課金先の
確認済み証拠にはならず、購入・upgrade・top-up・追加有料 capacity、認証情報や
provider / payment 設定の変更を自動実行する権限を与えない。

alignment は親 manifest の契約を引き継ぐ。既存の hold や固定入力を編集して
新 mode を後付けせず、専用の新しい manifest / selector context / authority と
preparation plan を別途確認してから固定する。保存 selection の `cost_policy` と
manifest digest、experiment 両 role の selection refs、pair の各 fixture binding を
確認する。片側だけの宣言は使えない。費用不明のまま選択できても、結果の費用証拠が
足りなければ採否は引き続き保留になり得る。実開始には別途の直接指示が必要である。

課題の正本は `PRIMARY_FIXTURE_IDS` / `buildPrimaryFixtureRecipe` である。

| Fixture | Formal task class | Active Prompt file |
| --- | --- | --- |
| mp-ci-evidence-gap | review_verification | skill-review.md |
| mp-data-migration-handoff | handoff_resume | skill-handoff.md |
| mn-focused-regression-test | verification_only | skill-verify.md |
| mp-accessibility-interaction-review | pr_review | skill-review.md |
| mp-frontend-state-review | pr_review | skill-review.md |
| mp-iac-rollback-design | design_gate | skill-implement.md |
| mp-performance-investigation | investigation | skill-investigate.md |
| mn-build-option-update | configuration | skill-implement.md |
| mn-doc-config-correction | documentation | skill-implement.md |

各 formal task class の eligible selection を各 role で
`resolvePortfolioSelection` により固定し、block の
`personal_selection_object_digest` に結び付ける。
`prepareUserComparison` で各 fixture/role を別の新しい root に準備する。
元の公開 task/workspace bytes、公開 verification recipe、mutable scope を保持し、
`synthetic` / `observed` を混在させない。実行する observed seed は独立 clone とし、
共有 Git common directory / alternates を使わない。

今回の新しい人工計画は `single_shot_v1`、`kernel_principles_v2` と
`personalPrompt.runtimeVersion: "selected_active_reference_v2"` を明示する。
各 role に P/K2/F があるが、候補/親の比較対象は fresh F 同士である。
K2 は独立した既存 profile であり、旧 K1 結果を別名化しない。
active file は1つ、残りの登録ファイルは exact reference data として保持する。

実 observed 準備では、既存 [primary pair の予算契約](personal-evolution-primary-pair-contract.md)
を明示的に渡す。`prepareUserComparison` の defaults に任せず、
`timeoutMs: 3600000`（60分/条件）、`verificationTimeoutMs: 300000`（5分/検査）、
`overallTimeoutMs: 14400000`（4時間/child）、`tokenBudget: 5000000` を固定する。
各 block は `grading.timeout_ms: PRIMARY_GRADING_RESERVATION_MS`（185分）も持つ。
本来の grader factory の preflight はこの reservation を要求する。
pair 全体の limits は既存 `sealPersonalEvolutionPromptPair` が選択集合から導出し、
別の短い独自上限へ置き換えない。

既存 `buildEvolutionExperiment` / `publishEvolutionExperiment` で、候補、両 role、
9課題、公開採点条件、独立評価境界、必要観測、policy/action mapping、stop 条件を
pre-result に固定する。モデル/CLI/runtime/環境の宣言値、差と unknown を記録する。
採点条件や thresholds を結果から選ばない。実 grading には、両 role の独立した
output root と、同じ固定資産 map を持つ本来の grading resource config を用意し、
block の `grading.resources` と既存の grading reservation に結び付ける。

既定の9件内選択を保ち、管理JSONの`evaluation.fixtureSet: "catalog24"`で正本24件を明示選択できる。
blueprintのfixture IDsは正本順24件を必須とし、部分集合・順序変更・未知集合は拒否する。
selectorは明示catalog24のv7、両role resourceは同じ24件mapかつselectorが選ぶsource/private fileを
正確に指す必要がある。pair登録へ集合を固定し、既存driverを再利用する。
両role合計48 child／144条件枠、240M tokens／340時間を予約する。無人実行policyにも同じ予約を要求し、
足りなければgeneration/review/comparison dispatch前に停止する。この設定は実行許可やnative受入ではない。

`sealPersonalEvolutionPromptPair` に preparation、experiment、blocks、fresh outputRoot
を渡し、返された pair object digest を独立に確認・pin する。子の start が一つでも
消費済みなら、新しい pair の固定に使わない。将来の adoption を計画する場合は、
別途 reviewed lifecycle plan の sorted object digests を `lifecyclePlanObjectDigests`
でこの段階に固定し、plan-bearing v2 pair を使う。

`task_evidence_partial_v1` の別系統8課題や `pf-review-error-contract` をここに
無言で追加しない。それらの pending/admission とこの9課題の一巡は別の境界である。

## 3. prepared driver の内容を確認し、一度だけ開始する

[prepared driver](personal-evolution-driver.md) の detached JSON は、次の必須 fields
と既存の optional Asset/high-impact trust arrays だけを持つ。

```text
storeRoot, preparationObjectDigest, experimentObjectDigest,
pairRegistrationObjectDigest, trustedExperimentObjectDigests,
trustedPairRegistrationObjectDigests, trustedExperimentAuthorities,
trustedPortfolioAuthorityContexts, evaluationAuthority
```

driver JSON file の raw SHA-256 を独立に pin し、
`inspectPreparedPersonalEvolutionLoopFile(path, digest)` で検査する。
これはモデルを起動せず、本来の両 role の registered grading factory と preflight を
確認する。opaque handle は保存 JSON やコピーで代替できない。

実比較の新しい本人指示には、確認した code/source、driver file、experiment と
pair の exact digests、9課題、送信対象、provider/model/CLI、固定 grading resources、
output roots、既存 limits、retry/resume forbidden を含める。その指示を得た後にだけ、
同じ検査から返された handle で
`startPreparedPersonalEvolutionLoop(handle, confirmedPairObjectDigest)` を一度呼ぶ。
実行は既存 pair/runner/original grading に委譲される。今回の開発許可は実比較の開始許可ではない。

通信が切れたら既存 invocation/request、各 role の report/grading、各 block の
`reportUserComparison(root)` を読み、終端と未開始を確認する。
消費済み handle/pair/child を再開しない。provider callback の例外や終了不明、
原 grading の未完了、evidence integrity の不正は既存の stop 境界を維持する。

## 4. 保存結果を読み直し、判断に渡す

正常終端では pair output の `invocation/saved-result-connection.json` が
`savedResults`、grading receipt digests、report、evidence、recommendation を保持する。
新しい採点器を走らせず、同じ固定 context に保存 descriptors を渡す。

```js
const saved = {
  ...fixedDriverContext,
  savedResults: terminalConnection.savedResults,
  trustedSavedEngineeringResultDigests: independentlyVerifiedGradeReceiptDigests,
};
const checked = verifyPersonalEvolutionSavedResults(saved);
```

`independentlyVerifiedGradeReceiptDigests` は本来の controller-owned grader が出した
元の public artifact receipts と照合する。保存 JSON の trust という field 名、
caller の hash、古い結果だけから authority を補わない。
`checked.evidence` 全体を別途評価 authority が確認した場合だけ、exact whole evidence
を `trustedEvaluationAuthorities` に渡して
`preparePersonalEvolutionSavedResultActions` を呼ぶ。

quality delta、native engineering components、false-positive/processing judgments、
時間、usage、人手、cost、安全性を各 saved observation で別々に読む。
欠測は unavailable / insufficient_evidence / unknown のまま残す。
負の quality delta、同等、保留を実行失敗や品質0へ読み替えない。
部分結果では、既存 grading receipts が確認できる完了分だけ descriptors を渡し、
他の role は欠測にする。unsafe witness は complete safety evidence として保持できる。
正常な部分証拠と、変更された source/criterion や foreign lineage の拒否を分ける。

no-op (`retain_current`, `revise_candidate`, `insufficient_evidence`) では、既存
recommendation/proposal に対する独立した本人 decision を保存する。
approved exact decision と `trustedHumanDecisionAuthorities` を別途渡した
`finishPersonalEvolutionSavedResultNoop` が completed receipt を作る。
no-op では heads が同じ、steps は空で、インストールを意味しない。
試験が作る人工 decision を本人の承認として転用しない。

`reject_candidate` は不採用 proposal であり、この no-op API では退役を実行できない。
adoption は separately trusted whole evidence、本人の decision、pre-result lifecycle
plan-bearing pair と既存 Portfolio authority を揃えて
`applyPersonalEvolutionLoopPortfolioAction` へ渡す別操作である。
実 target の適用/復元は既存 installer と新しい rollback authority が必要になる。
人工 target の apply/restore 検査は `test-ask-personal-source-install.mjs` にあり、
実 Mac の成功や許可には読み替えない。

## 5. 次のサイクルへ渡す

次の public observation の `evidence_refs` に前の recommendation/decision/receipt
の artifact ID と digest を残し、今回の欠測・改善候補を要約する。
no-op 後なら unchanged current parent/heads を確認し、fresh observation ID、
request ID、distinct candidate version、新しい pre-result experiment/pair/root で始める。
前の開始印、固定 bundle、結果、grading/admission と CAS objects は保持する。
次の要求が `NOT_RUN` であることを generation status から確認する。

この手順の実利用には、実観測からの候補生成、独立 source/evaluation review、
新しい本人の生成/比較指示、必要な採否/適用/rollback authority が残る。
今回の人工検証は PV1-1/3/4/5/7/8 の接続と手順の部分証拠であり、
PV1-2/6 と全体の反復実運用は Unknown のままである。
