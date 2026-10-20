# 24課題の組立と採点検証

正本24件のうち、基点main `281c6a93` に公開資産があったのは15件。
残り9件は既存候補PRの固定headから、課題ディレクトリ・専用config・課題別source/authority/
archive helper・試験をそのまま取り込んだ。新しい課題を作り直していない。
共通scorer/parser/primary scope/producer/selector/schema/workflowは、通常マージ済みPR408のmain
`91d7218bb5f7db39d6b30d3ebc45ffb50780a223`を通常統合して再利用する。基点の15課題と過去のrunは変更しない。

| 候補課題 | 再利用元PR / head | 現段階 |
| --- | --- | --- |
| mn-client-compatibility-fix | #341 / f2c4a229387e3d5a756fbbebdeb699b730cbb160 | 公開資産あり。r9に追加反例2件の誤採点あり。r10案は未実行 |
| pf-data-schema-evolution | #350 / 730721c864299c53f18317c93e87da4c983bf7cd | 公開資産・既存rubricと例あり。whole admission未完 |
| pf-performance-regression | #355 / d4162b3651eb39dbd44d627351a6c481ec93de4e | 公開契約・sealed計測stdout consumerあり。共通source接続と独立受入待ち |
| pf-library-compat-upgrade | #358 / d59a6a9bfb2fb9949fcc52b5169a45b82e19c9ef | 公開資産・既存rubricと例あり。whole admission未完 |
| pf-observability-redaction | #359 / d15e2eda8ac5a4c5f064cdaf82d3f24b11bec6a2 | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-authorization-exception | #361 / 5505c1c784774b73bb96475aa2b7b979094c9f6a | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-external-action-approval | #362 / 48dbb870af6c5a8807a1acea6d9a30a6f7cee4fc | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-financial-state-integrity | #363 / e7099dde0adfa140c391177d18c5970ecab5ba32 | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-versioned-migration-safety | #364 / cf95a81330858e441a1b447ee5b7d01f4678bfdb | 公開資産・既存rubricと例あり。whole admission未完 |

公開入力・成果物・要件契約・portfolio登録は24件。個人比較の既存入口も明示選択`catalog24`で24件へ拡張した。
既定の`legacy9`は元の9件・順序・予算を維持する。
公開点検の成功、採点処理のdeveloper control成功、固定resourceとの接続、独立admission、
一括比較の動作を別々に確認する。24件の完成とはまだ報告しない。

## 正常例・不良例を使った実際の検証

既存rubric・採点処理template・author case仕様を**新しい未凍結のprivate作業先**へコピーし、
各課題の現公開workspaceに適用して、採点処理本体を非モデルで実行した。
過去のbundle manifestやrunを採点し直した結果ではない。privateな例・実装・詳細結果はGitへ入れない。
command evidenceは明示的な人工値であり、モデルの検証実行や安全性の証明へ転用しない。

| 課題 | 新しい採点処理本体control | 確認した範囲 |
| --- | --- | --- |
| pf-data-schema-evolution | 22/22期待一致 | schema/migrationの正常・不良・scope・証拠状態 |
| pf-library-compat-upgrade | 34/34期待一致 | adapter/recordの正常・不良・未認識文法・scope・証拠状態 |
| pf-observability-redaction | 40/40期待一致 | policy/reviewの正常・不良・根拠・scope・証拠状態 |
| hi-authorization-exception | 39/39期待一致 | reviewの正常・不良・根拠・scope・証拠状態 |
| hi-external-action-approval | 39/39期待一致 | planの正常・不良・承認状態・scope・証拠状態 |
| hi-financial-state-integrity | 20/20期待一致 | ledgerの正常・不良・未認識文法・scope・証拠状態 |
| hi-versioned-migration-safety | 40/40期待一致 | mixed-version planの正常・不良・rollback・scope・証拠状態 |

### 受入証拠から除外した記録

client r9の7/7・17/17と追加反例0/2は、通常権限でsandboxが失敗した同じ対象を、
外側の実行権限を変えて再実行した原記録である。**承認済み受入証拠、通常の固定成果物単体試験、
独立admission、課題完成の根拠には使わない。** 原記録は保持し、この経路での追加実行は停止した。
内側のsandbox policyを維持したことは、この除外を解除する理由にならない。
r9のown-descriptor比較にはprototype identity/extensibility比較がないという静的指摘があり、
r10の修正案は未実行・未admission。通常権限で既存隔離が動く環境における正常・不良例の受入が必要。

7課題の初回controlではauthorizationのreport_text読込が不足し35件が不一致だった。
検証側が既存の例を正しく展開するよう修正し、新しい出力先で39/39を確認した。
この失敗記録も保持している。初回失敗を製品側の問題や成功へ置き換えない。

## 既存課題と性能課題の追加確認

従来9件のうちJSON成果物を読む8件を、新しい未凍結の採点処理・固定例コピーで確認した。
**324/324期待一致**。既存6件も現在の公開referenceのbundle digestと一致するtemplateを選び、
**150/150期待一致**。モデル、候補コード、sandbox、旧runや旧bundle manifestは実行していない。
従来課題でも、schema不足・未知の意味・command証拠不足はnull/manualを保つ例が含まれる。

| 課題 | 期待一致 |
| --- | ---: |
| hi-authorization-exception | 39/39 |
| hi-external-action-approval | 39/39 |
| hi-financial-state-integrity | 20/20 |
| hi-versioned-migration-safety | 40/40 |
| mn-build-option-update | 15/15 |
| mn-doc-config-correction | 18/18 |
| mn-frontend-default-fix | 20/20 |
| mn-schema-field-alignment | 18/18 |
| mp-accessibility-interaction-review | 50/50 |
| mp-ci-evidence-gap | 56/56 |
| mp-data-migration-handoff | 49/49 |
| mp-frontend-state-review | 54/54 |
| mp-iac-rollback-design | 11/11 |
| mp-performance-investigation | 71/71 |
| pf-api-pagination-behavior | 17/17 |
| pf-ci-cache-flake | 42/42 |
| pf-data-schema-evolution | 22/22 |
| pf-frontend-async-state | 17/17 |
| pf-library-compat-upgrade | 34/34 |
| pf-observability-redaction | 40/40 |
| pf-review-error-contract | 36/36 |

固定例の展開漏れ（scope、代替frozen input、file mode、frozenWorkspace引数など）による検証harnessの失敗も
別出力に保持し、修正後の一致だけに置き換えていない。これらはsealed gradingや独立admissionの証拠ではない。

性能回帰では、固定の正常例が公開機能14件を通り、両workloadで目標内だった。固定の空出力例は機能試験で失敗し、
固定seedは約107秒で回帰/不確実の判定を最後まで取得できた。計測データの改ざん・欠損等を含む5試験も通過。
計測は一度読んだmodule bytesを直接loadし、同じbytesのdigestを出力する。コマンドに追加の数分上限は設けず、
既存runの予算で管理する。private採点処理は候補を実行せず、事前確認したAST相当例だけを認識する。
正常・未知・scope逸脱・検証欠損を含む従来5 controlに加え、既存sealed evidence-rootを読む未凍結private処理の
9 controlで正常pass・回帰fail・欠損/不整合/inconclusive manual/nullを確認した。公開pure consumerの8試験も通過。
carrierは人工値であり認証済み実計測の受入証拠にはしない。applicable admission gateは全件unknown、作者による自己承認はない。

## 全24件の入力・成果物・判定範囲

以下は正本catalog、公開task、evidence-map、requirement-recordの対応。期待する意味は公開taskと参照契約に従う。
表のcontrol数は採点処理本体の固定例であり、現在の共通sourceへのsealed接続・独立admissionは別途必要。
全課題でfrequency/impactは証拠がない限りUnknown、性能・安全性・ASKの優位性へ一般化しない。

| 課題 / 公開入力 | 期待する作業 | 成果物・変更可能範囲 | 固定例 / 判定限界 |
| --- | --- | --- | --- |
| [hi-authorization-exception](../benchmarks/fixtures/checkpoint-b2/hi-authorization-exception/task.md) | Review an ownership boundary while preserving legitimate exception handling. | `review.json` | 39件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [hi-external-action-approval](../benchmarks/fixtures/checkpoint-b2/hi-external-action-approval/task.md) | Prepare a bounded operation while preserving the specific-action approval boundary. | `operation-plan.json` | 39件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [hi-financial-state-integrity](../benchmarks/fixtures/checkpoint-b2/hi-financial-state-integrity/task.md) | Investigate and implement a duplicate-sensitive financial state workflow. | `src/ledger.mjs` | 20件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [hi-versioned-migration-safety](../benchmarks/fixtures/checkpoint-b2/hi-versioned-migration-safety/task.md) | Design a versioned migration that preserves mixed-version integrity and rollback truth. | `migration-plan.json` | 40件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [mn-build-option-update](../benchmarks/fixtures/checkpoint-b2/mn-build-option-update/task.md) | Apply a narrow build option update with focused configuration evidence. | `build.config.json` | 15件期待一致 |
| [mn-client-compatibility-fix](../benchmarks/fixtures/checkpoint-b2/mn-client-compatibility-fix/task.md) | Implement a localized client compatibility guard with focused regression evidence. | `src/preferences.mjs`, `test/preferences.test.mjs` | 追加反例2件で誤採点、r10未確認 |
| [mn-doc-config-correction](../benchmarks/fixtures/checkpoint-b2/mn-doc-config-correction/task.md) | Correct a small documentation or configuration inconsistency directly. | `docs/worker-retries.md#json-block` | 18件期待一致 |
| [mn-focused-regression-test](../benchmarks/fixtures/checkpoint-b2/mn-focused-regression-test/task.md) | Add focused regression evidence without redesigning production behavior. | `test/session-key.test.mjs` | 固定例13件あり。隔離実行の確認保留 |
| [mn-frontend-default-fix](../benchmarks/fixtures/checkpoint-b2/mn-frontend-default-fix/task.md) | Implement and verify a focused local default-state correction. | `src/display-preferences.mjs`, `test/display-preferences.test.mjs` | 20件期待一致 |
| [mn-schema-field-alignment](../benchmarks/fixtures/checkpoint-b2/mn-schema-field-alignment/task.md) | Align an adjacent schema field contract without introducing a generic framework. | `schemas/member.schema.json`, `test/member-record.test.mjs` | 18件期待一致 |
| [mp-accessibility-interaction-review](../benchmarks/fixtures/checkpoint-b2/mp-accessibility-interaction-review/task.md) | Review interaction semantics with precise evidence and false-positive restraint. | `review.json` | 50件期待一致 |
| [mp-ci-evidence-gap](../benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/task.md) | Determine whether available CI evidence supports a bounded verification conclusion. | `review.json` | 56件期待一致 |
| [mp-data-migration-handoff](../benchmarks/fixtures/checkpoint-b2/mp-data-migration-handoff/task.md) | Prepare executable resume state for a mixed-version data change. | `handoff.json` | 49件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [mp-frontend-state-review](../benchmarks/fixtures/checkpoint-b2/mp-frontend-state-review/task.md) | Review cross-file UI state and rendering consistency with selective evidence. | `review.json` | 54件期待一致 |
| [mp-iac-rollback-design](../benchmarks/fixtures/checkpoint-b2/mp-iac-rollback-design/task.md) | Design an infrastructure change boundary with safe preparation and truthful rollback. | `change-plan.json` | 11件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [mp-performance-investigation](../benchmarks/fixtures/checkpoint-b2/mp-performance-investigation/task.md) | Investigate competing performance hypotheses using measurements and causal restraint. | `investigation.json` | 71件期待一致 |
| [pf-api-pagination-behavior](../benchmarks/fixtures/checkpoint-b2/pf-api-pagination-behavior/task.md) | Implement and verify a recurring request and response behavior change. | `src/pagination.mjs`, `test/pagination.test.mjs` | 17件期待一致 |
| [pf-ci-cache-flake](../benchmarks/fixtures/checkpoint-b2/pf-ci-cache-flake/task.md) | Investigate intermittent build evidence and isolate a reproducible CI boundary. | `investigation.json` | 42件期待一致 |
| [pf-data-schema-evolution](../benchmarks/fixtures/checkpoint-b2/pf-data-schema-evolution/task.md) | Implement and verify a backward-compatible schema evolution. | `schemas/customer-v2.schema.json`, `migrations/v1-v2.plan.json` | 22件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [pf-frontend-async-state](../benchmarks/fixtures/checkpoint-b2/pf-frontend-async-state/task.md) | Investigate and implement asynchronous UI state and rendering behavior. | `src/search-controller.mjs` | 17件期待一致 |
| [pf-library-compat-upgrade](../benchmarks/fixtures/checkpoint-b2/pf-library-compat-upgrade/task.md) | Migrate a library API while preserving cross-platform compatibility evidence. | `src/archive-compat.mjs`, `migration-record.json` | 34件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [pf-observability-redaction](../benchmarks/fixtures/checkpoint-b2/pf-observability-redaction/task.md) | Balance operational visibility with data minimization in an implementation review. | `config/projection-policy.json`, `review.json` | 40件期待一致。実行時の安全/rollback観測は別証拠が必要 |
| [pf-performance-regression](../benchmarks/fixtures/checkpoint-b2/pf-performance-regression/task.md) | Diagnose and verify a repeatable performance regression. | `src/event-lookup.mjs` | 機能正常/不良、private処理9件・公開データ8試験。実sealed計測の受入待ち |
| [pf-review-error-contract](../benchmarks/fixtures/checkpoint-b2/pf-review-error-contract/task.md) | Review caller-visible error contract behavior across implementation boundaries. | `review.json` | 36件期待一致 |

## 残る完成作業

- PR408の共通分類/parserと登録APIは統合済み。新15件のproducer/scope受入は検証済みv7 selector付きに限定する。課題別private authorityの新版固定・独立受入は別途必要。
- `mn-focused-regression-test`は新しい固定例を既存隔離で確認する必要がある。既存13例の存在は確認したが今回の意味採点完了とはしない。
- クライアントr10案の固定正常/追加不良例を許可された隔離環境で確認し、新しいprivate authority・公開reference・独立レビューへ接続する。
- 性能回帰のstdout consumerを共通source新版と新規private authorityへ固定し、既存sealed transportでの独立受入を閉じる。候補作成JSONは代用しない。
- 7候補の安全性/rollback観測を含むwhole admission、全24件の共通source新版への接続と独立admissionを閉じる。
- 24件の公開入力/準備/再検証は既存入口で確認可能。実公開入力から72枠の未実行準備、fakeによる全24件の比較・採点・部分失敗保存は確認した。共通sourceと課題別authorityを接続したnative受入は未完。

未評価・採点不能・manualの品質/点数はnullを保持する。過去のrunや凍結bundleの再採点・上書き、
実モデル/Codex比較の開始、認証/security設定の変更、25件目以降の課題追加は行わない。

## 実装状態と残る受入（2026-10-20）

| 分類 | 対象・具体的な不足 | 次の実装／検証 |
| --- | --- | --- |
| 実装済み・統合済み | recipe/batch/prepare/gradingとv2公開task bindingの正本24件対応 | 実公開入力とv7 selectorを使う72枠準備2/2、recipe/batch fake43/43。モデル・grader起動なし |
| 実装済み・共通source固定と受入待ち | 性能のsealed stdout consumerと未凍結private処理 | 既存evaluationInputEvidenceRoot経由のrecord/body、normalized lineage、command digest、loaded source digest、最終source、raw samplesを照合。pure8/8、人工private control9/9。別の証拠経路は作らない |
| 実装済み・統合済み | PR408の分類・shell parser・v7登録集合API | 実APIで3/3。24件すべての選択resource検証と新15件のうち1件のproducer/scope接続を確認。v1〜v6は9件限定を維持 |
| 通常権限での検証待ち | client r10の既存隔離による正常・不良例 | 拒否対象を権限変更や隔離外経路で再実行しない。通常権限の受入証拠を別途取得するまで未検証 |
| 通常権限での検証待ち | focused-regressionの13固定例の挙動受入 | 通常権限の固定正常1件はcoverage manual/null。既存隔離で観測が成立するまでは未検証 |
| 実装不足／通常権限での検証待ち | 候補7件の課題別安全・rollback観測とwhole admission | carrierの存在を安全証明にせず、対応付けを実装し、観測不足はunknownのまま独立reviewへ渡す |
| fake受入済み・統合head CIで確認 | 24件比較・採点と途中失敗保存 | 1件の明確なfail品質0、別のmanual品質null、その後の24件目の成功を同じreportへ保存。固定headの既存CI入口へ試験登録 |

## 既存入口からの使い方

公開契約だけを点検する（モデル・採点実行なし）:

```sh
node scripts/ask-benchmark.mjs list-primary-inputs
node scripts/ask-benchmark.mjs prepare-primary-inputs --output /absolute/new-public-inputs
node scripts/ask-benchmark.mjs verify-primary-inputs --input /absolute/new-public-inputs --output /absolute/new-report.json
```

既存`ask-primary-evaluation-prepare.mjs`のoptions JSONに`"fixtureSet":"catalog24"`を追加すると、
正本順24件・P/K2/Fの72枠を準備する。省略時は従来9件。新しい管理入口は作らない。
K2の既存rendererはbyte-exactで保持し、新15件だけ追加の記述moduleを保存済み/current hashで照合する。
24件の上限は120M tokens／170時間、再試行0・逐次実行・resume禁止で、既存の各child4時間と
grading185分の予約を維持する。この数値は実行許可ではない。未承認resource/sourceでは開始をblockする。
未準備の入力、未知のfixture set、24件の欠損/順序違いを拒否する。

fake試験は既存batchのprepare/start/reportを使う。成果物、検証失敗ログ、grading結果と要件判定を
課題×条件に保持し、通常の検証失敗やmanual gradingの後も次課題へ進む。状態不明のchildや
incomplete gradingは既存の停止規則に従う。未評価を品質0へ補完しない。

## 統合後の基盤実装の検証契約

Artifact ID: `verification-primary-24-assembly-20261020`

Upstream refs: Issues #207・#379、PR407、通常マージ済みPR408、正本`portfolio-catalog.json`、
[共通v7の検証契約](primary-evaluation-correctness-v7.md)。既存のformal選択を維持し、
この契約は入力・準備・fake一括処理・証拠接続という実装範囲を証明する。全24件のnative受入を代替しない。

| Behavior proof obligation | Focused check / required evidence |
| --- | --- |
| 正本24件の入力・出力・要件・変更範囲が存在し、不良入力の影響が局所化される | `test-ask-primary-public-inputs.mjs`。24件列挙、公開入力だけの準備、ドリフト・欠損・不正scopeの負例と残り23件の保存 |
| 明示catalog24と共通v7の接続、過去versionの互換性 | `test-ask-primary-registered-fixture-v7.mjs`。集合・順序・未知ID負例、全24resource、新規課題のproducer/scope、selectorなし拒否 |
| 既存入口でv7 selector付き72枠を未実行のまま準備する | `test-ask-primary-principles-v2-connection.mjs`。実公開入力、選択freeze digest、モデル0、品質null、旧renderer維持と追加依存の改変拒否 |
| 一部失敗・manualを品質0と混同せず保存し、後続課題を処理する | `test-ask-primary-evaluation-batch.mjs`。24件fake、課題×条件の成果物・ログ・要件・理由、明確なfail0とmanual/null、24件目の成功 |
| 計測値とsourceの対応を検査し、欠損・改ざん・不確実を成功へ補完しない | `test-ask-benchmark-pf-performance-measurement.mjs`、既存carrier fake試験。人工データでありnative性能・認証・安全の証明ではない |
| 最終source・生成物・既存入口の整合性 | runtime bundleの`--write`後`--check`、repository validation、既存general benchmark、共通v7試験、関連CIの最終head結果と独立レビュー |

Insufficient-evidence conditions: private authorityが旧profileのまま、admissionがunknown、既存隔離が動かない、
実sealed計測や課題別安全/rollback観測がない場合は、その受入を未確認のまま残す。除外したclientの実行記録は再利用しない。

Evidence required before completion claim: 上表の実装範囲の検査と独立レビューが一致すること。
「24件すべての採点・native受入が完成」という主張には、前述の未完了事項を別途解消する証拠が必要。

Evidence required before merge claim: 統合後の最終headに対する非モデル試験・生成物整合性・関連CI・独立レビュー、
および未受入事項の明示。マージ操作は親の判断待ちであり、この契約やfake成功が承認を与えることはない。

Proof selection (`ask.verification-proof-policy@1.0.0`):

```json
{
  "selection_id": "primary-24-proof-selection-20261020",
  "policy_ref": "ask.verification-proof-policy@1.0.0",
  "selected_path": "formal_verification_contract",
  "behavior_ref": "docs/primary-24-task-assembly.md",
  "eligibility_facts": [],
  "formal_triggers": [
    {
      "trigger_id": "public_api_schema_or_compatibility",
      "evidence_refs": [
        "scripts/ask-primary-fixture-recipe.mjs",
        "scripts/ask-primary-scoring-version.mjs"
      ]
    },
    {
      "trigger_id": "state_concurrency_persistence_lifecycle_or_cross_module",
      "evidence_refs": [
        "scripts/ask-primary-evaluation-batch.mjs"
      ]
    },
    {
      "trigger_id": "performance_or_reliability",
      "evidence_refs": [
        "scripts/ask-benchmark-pf-performance-source.mjs"
      ]
    },
    {
      "trigger_id": "multi_session_multi_agent_or_handoff",
      "evidence_refs": [
        "https://github.com/ist-h-i/agent-spectrum-kernel/pull/407"
      ]
    },
    {
      "trigger_id": "merge_release_or_stable_trace",
      "evidence_refs": [
        "https://github.com/ist-h-i/agent-spectrum-kernel/issues/379"
      ]
    }
  ],
  "formal_verification_contract_ref": "verification-primary-24-assembly-20261020"
}
```
