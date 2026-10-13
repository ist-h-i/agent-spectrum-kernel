# K-principles v2 candidate（提案・未採用）

Spec `SPEC-KERNEL-PRINCIPLES-V2-CANDIDATE-1` revision 1。
上流は親からの「新版の非モデル候補を最小実装し、採用判断材料を作る」委譲と
`docs/kernel-principles-comparison.md` の `SPEC-KERNEL-PRINCIPLES-1` revision 1。
これはv1の修正でも実行条件への追加でもなく、別ID
`kernel_principles_v2_candidate` の純粋な生成・判定候補である。

## v1の制限の理由と変更判断

Verified: `scripts/kernel-principles.mjs` は本文に ordinary scoped
implementation and trivial work と書き、generationの
`supported_task_classes` をその2分類に限定し、`principlesCapability` は
その分類だけで構造的availabilityを決める。比較docもreview/investigationを
未提供としている。この制限は抽出元にレビュー・調査の基本原則が存在しない
という証拠ではない。抽出される§0は7分類を含み、§1の証拠、§2の文脈、§3の
範囲、§4の承認、§6の仮定、§7の確認、§7.5の継続、§9の禁止事項は用途共通である。

Supported: 初期v1の限定は、形式的review gates、仮説調査Skill、formal proofや
session/control protocolを提供しない候補に、未実装の工程を暗黙に帰属させない
保守的な境界である。設計経緯の動機そのものはsource/docからは証明できない。

supported分類だけを増やすと、本文の対象宣言と食い違い、明示必須手順の不足も
分類だけのavailableへ潰れる。新版は既存生成器を呼び、見出しと用途の説明だけを
置換する。抽出原則・除外範囲は同じまま、generationの`contract_delta`に基底ID、
基底生成digest、変更項目、追加分類、維持境界とdescriptor revisionを記録する。
review / investigation / design / handoffを普通の作業として認めることは、それらの
専門Skillや形式手順を提供・実行したという意味ではない。

## 原型の入出力・境界

`renderKernelPrinciplesV2Candidate(source)` はsealed canonical AGENTS bytesを
受け取り、依存参照のない本文とgenerationを返す。生成コードはv1 moduleを再利用
するが、生成されるentryの`dependencies`は空である。canonical sourceの変更は
除外段落も含めv1 sealで停止する。Full Skillの追加・コピーは行わない。

`principlesV2CandidateCapability(source, body, generation, descriptor)` はまず
正確な再生成一致を確認する。descriptorは次の閉じた形だけを受け取る。

```json
{
  "task_class": "review",
  "requirement_scan": {
    "status": "complete",
    "evidence_refs": ["public task / metadata / relevant project requirements reviewed"]
  },
  "required_procedures": []
}
```

`task_class`はimplementation / trivial / review / investigation / design /
handoff / risk-gatedの閉集合。最後の分類は候補のsupported scope外である。
scan statusはcomplete / unknownのみ。要求の確認がunknownなら
`capability_missing`とする。必須手順があるときは空配列にせず、次の閉じたrecordを
入れる。候補は形式・専門手順を一つも提供しないため、列挙した依存作業を
`capability_missing`として止める。人の承認やglobal capability宣言で補えない。

```json
{
  "kind": "formal",
  "name": "explicitly required formal verification protocol",
  "evidence_refs": ["exact requirement establishing that protocol is mandatory"]
}
```

kindはformal / specializedのみ。未知field/kind/class、不完全record、空証拠ref、
重複した手順はinvalidとして例外で拒否し、availableへ丸めない。基本レビュー等を
`required_procedures`へ自動変換しない。必須の出力schema、供給済みの契約・状態を
読む行為、テスト要求は、その内容を履行する義務である。これらの存在だけで
「利用できないASK形式protocol/専門Skillが必須」とは推論しない。

外部I/O・状態変更・モデル呼出しはない。availabilityは原則entryの構造上の範囲と
callerが確認した要求に対する判定だけであり、approval、実行可否、品質、測定値、
model compliance、成功を証明しない。descriptorの証拠refはここでdereferenceせず、
完了scanの真偽も自動判定しない。語句抽出器や任意のtask classifierを追加しない。
新たな必須手順が見つかったらdescriptorを更新して再判定する。

## 6課題のtask signal admission matrix

各行の根拠は
`benchmarks/fixtures/checkpoint-b2/<fixture_id>/task.md` と `metadata.json`。
テストで両方のexact byte digestを固定し、task signal解釈のドリフトを停止する。
以下は公開taskの限定された成果物作成scopeの判断であり、taskを実行した結果ではない。
各descriptorはscan complete、上記2つのsource refs、required_procedures `[]`。

| fixture_id | 公開分類 → 原則分類 | 個別のtask signal / 保持する境界 | 明示必須の未提供手順 | 判定 |
| --- | --- | --- | --- | --- |
| mp-frontend-state-review | pr_review → review | inbox filtering/selection stateのdiff・契約・実装・testsからmerge readinessを評価。review.jsonだけを書く。metadata: frontend/state_consistency、risk none | ASK review gateやSkill実行要求なし。基本レビューの範囲 | available |
| mp-accessibility-interaction-review | pr_review → review | toolbar keyboard interactionのdiff・markup・interaction notes・testsを照合。review.jsonだけを書く。metadata: accessibility/interaction_semantics、risk none | accessibilityというdomainだけで専門Skill必須とはしない。基本レビューの範囲 | available |
| mp-performance-investigation | investigation → investigation | 供給されたincident/source/measurements/replayから競合仮説を支持・反証・未解決に分け、exact excerptとbounded non-production next check/stopを記録。metadata: performance/hypothesis_testing、risk none | 因果証明を捏造しない原則は有効。ASK調査Skillやformal proofの実行要求なし | available |
| mp-ci-evidence-gap | review_verification → review | workflow/CI/tests/repo guidanceの証拠がmergeを支持するか評価。公開taskは関連local checksを認める。metadata: ci_build/evidence_synthesis、risk none | 供給済みguidanceのtest:all義務は維持。未提供形式gateを走らせたとは主張しない | available |
| mp-iac-rollback-design | design_gate → design | 供給されたplan/state/commands/approval/rollback/knowledge policyに基づくchange-plan.jsonを作成・local validateする。infra command・apply/approval・state editは禁止。metadata: iac_cloud、approval_required | production mutationはscope外。安全準備とexact approval境界を計画に残す作業は基本設計。ASK risk-gate実行要求なし | available |
| mp-data-migration-handoff | handoff_resume → handoff | 供給済みmixed-version plan/compatibility/operation/approval/evidence/runbookをhandoff.jsonに整理・local validate。全verification IDを一度ずつ保持。migration/reconciliation実行禁止。metadata: data_schema、rollback_required | 操作継続を実行しない。状態・approval・pending checks・rollback limitsの引継ぎは基本handoff。ASK state serialization実行要求なし | available |

この解釈で未知なのはモデルの能力・遵守、成果物の正しさ、品質効果である。
metadataのcapability familyやrisk boundaryは観測signalであり、必須Skill IDでも
実行許可でもない。追加project instructionが専門手順を明示必須にした場合、表の
availabilityは使い回せない。供給契約を満たせないときも完成を主張できない。

## 開発verification契約

Implementation `IMP-KERNEL-PRINCIPLES-V2-CANDIDATE-1` revision 1はこのSpecを参照。
変更はこのdocと2つの新規scriptのみ。親への証拠ログは
`../evidence/k-principles-v2-tests.log`。v1 source、生成bytes、条件登録、過去run、
共有ファイル、Full、runner、CLI、prepare/start/resumeは変更・実行しない。

Formal Verification Contract `FVC-KERNEL-PRINCIPLES-V2-CANDIDATE-1` revision 1。
開発作業はproof policy `ask.verification-proof-policy@1.0.0` の
`multi_session_multi_agent_or_handoff` に該当するためformalを保持する。
これは候補にformal protocolを含めるという契約ではない。

- O1: deterministic source rendering、同一抽出map、原則本体bytes不変、依存なし、deltaとsupported scope。
- O2: source/body/generation drift拒否、closed descriptor、unknown scan、全supported分類で明示formal/specialized不足、global宣言拒否。
- O3: 6公開task/metadataのexact digestと個別分類・risk signalに基づくmatrix判定。
- O4: v1 module digest / 生成digest / unsupported scope / 既存condition登録の不変、新IDを既存比較conditionへ採用しない。

検査コマンドは`node --test scripts/test-kernel-principles-candidate-v2.mjs scripts/test-kernel-principles.mjs`。
モデル・CLI・旧所有権診断・comparison起動はこの検証に含めない。
検査成功はこの原型の構造と判断境界の証拠に限る。全CI、native model、実評価、
品質・効果は未検証。rollbackは新規3ファイルの除去で、v1変更やrun移行は不要。

親の要判断項目: 6行の公開signal解釈、明示必須手順のdescriptor化責任、基本原則の
追加scope、別version採用の可否。候補は未採用のまま設計判断へ渡す。実行planへの
自動採用・既存条件のalias・再評価開始は行わない。
