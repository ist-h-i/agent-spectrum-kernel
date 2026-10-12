# CI cache r2 final public source / lineage review

Exact reviewed HEAD: `6f467d49fa7b679749122f6a372008fa0405649b`. Original r2 predecessor/base: `6dd5c883fbd353c05e11210b14faed45e6fc0f0e`. Earlier source review: `1b65cea8f78f76a1c81ddf525f8c881f9c3c2463`; intermediate fix: `bedf4633f3ab5a54d15a94fb91333d5ca72a77f8`. Repository: ask-ci-cache-development. Completed 2026-10-12.

**Source approval: approve. Separate frequency and impact judgments: approve retaining unknown/null, practice-weighted ineligible.** No source blocker or open finding remains. This approval concerns public-source preparation and source lineage only; it does not approve private meaning/grading, admission, production authority validation or empirical difficulty. Current production authority/lineage remain r1, and the earlier r1 semantic insufficient-evidence review is not reopened or resolved.

## Public source and lineage

Verified: policy/catalog, lineage.md and the original short documentation paraphrase remain unchanged from the predecessor. documented_external_pattern is an existing approved closed source type. The reviewer independently checked [GitHub dependency caching documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching). Its cache-key/restoration guidance motivates the engineering pattern; it does not establish this fictional history, service-equivalent behavior, frequency or impact. No documentation code, private workflow data or private answer was copied. Fictional local data and authored model remain the complete evidence domain.

Verified: frozen primary identity, investigation task class, ci_build domain, medium_hard designation, repetitions5, risk none and CI-log/config/historical-run topology are intact. Catalog base aggregate eligibility is unchanged. Frequency and impact have no observed empirical evidence, remain unknown with null weights and exclude practice-weighted aggregation. A deterministic fixture row/failure count is not incident frequency or measured customer/operational impact.

Supported: Plain can recover the exercise from ordinary task/spec/config/history/scenarios/model/reproducer. The source requires complete experiment observations, matched fixed-input cold/restored comparisons, linked controlled intervention, competing-explanation and confounding limits, recommendation options/predictions and scope/confidence. The solver must derive row identities and relations, distinguish build success from cache reuse and avoid inferring isolated external-runtime behavior from a comparison that also changes cache selection. The contract gives named experiment/recommendation categories, reducing unconstrained search, but does not supply the actual linked tuples or eliminate causal comparison. This remains a bounded investigation. Empirical medium_hard calibration and40-minute duration remain Unknown and were not measured.

Verified: all12 task/workspace input entries match exact length/hash. Public input raw digest is `sha256:276cbe5632762a7b03ace4c3057e8a8b04553ba21bdc5c0794355e7c0509f83a`; verification semantic digest is `sha256:d7d60fc5e09009fc5565f7ba7e3e2f8681595b15dc149235b02a6ed09e33b759`. Full exact task/workspace/manifests/source/helper/policy/catalog refs are in source-approval.json.

## Closed report and difficulty judgment

The intermediate package fix includes all test/*.test.mjs in npm test, resolving initial P3 F-CACHE-R2-STRUCTURE-TEST-INVOKE. The sole changed authority-helper bytes add the public structure-test path to protection; every other byte is identical. Only this byte/protected-path delta was inspected mechanically, not the helper's private semantics or execution. Source helper wording now names the correct fixture.

At the final HEAD, summary is removed from required/properties, additionalProperties:false remains, and docs explicitly define the structured fields as the complete report with no extra freeform summaries/claims. All existing observation/witness/control/competing/recommendation/confidence/limitations obligations remain unchanged. This is a justified minimal boundary change: removing mandatory prose does not remove their investigation burden. Unfamiliar strategies/new dimensions still require review under the public contract; this source review does not approve their automatic semantic treatment.

The earlier independent contradictory-summary JSON passed the intermediate shape-only command. The same raw case is now structurally rejected at investigation.summary. Thus that unbounded mandatory prose channel is closed. This is ordinary JSON source verification, not private evaluator evidence, and does not by itself prove causal grading soundness.

## Independent tests and public-model feasibility

Node v24.19.0. The reviewer independently constructed normal/bad JSON reports only from public evidence, without reading author's private original/reference reports or executing candidate code. Four reproducer experiments match a separate calculation from config/scenarios. Two normal references use distinct permitted interventions with valid matched-input comparisons and predicted observations. Their correctness claims are confined to the authored deterministic fixture.

The final normal2/bad2 reports are exactly the original independent reports with summary removed and every other parsed field unchanged. Normal2 pass the final anchored command. Deliberately semantically bad but shape-valid reports2 also pass, matching the explicitly structural validator boundary. Missing witness and extra summary are refused. These passes do not award or prove causal points: future private meaning review must reject wrong links/unestablished rows and cannot substitute labels/schema for observation correctness.

| Independently executed check | Observed result |
|---|---|
| node --test scripts/test-ask-benchmark-pf-ci-cache-source.mjs | 6 pass / 0 fail |
| node scripts/ask-benchmark-pf-ci-cache-source.mjs | exit0; current closure/digests |
| four public reproducer experiments | 4/4 exit0, complete observation equality4/4 |
| exact final anchored command, normal JSON | 2/2 exit0; six ordinary tests each |
| exact final anchored command, deliberately bad shape-valid JSON | 2/2 exit0; six tests each, shape-only acceptance |
| exact final anchored command, missing witness | refused as expected |
| exact final anchored command, extra summary | exit1, refused at investigation.summary |
| standalone report-structure test | 1 pass / 0 fail |
| predecessor-to-final git diff --check | exit0 |
| input byte/digest inventory / r1 public archive | 12/12 current,25/25 archived; original workspace inventory complete |

The r1 archived public task/workspace/authority records match the predecessor byte-for-byte. No r1 private bundle/archive/review or private original answer/code was read. The production repository validator was not run or claimed green. Model/evaluation/comparison CLI, main merge and stopped-client retry were not performed. No repository/Git file was modified by this reviewer.

Normal/bad reference bodies are confined to directories700/files600 in evidence/ and were not printed or sent to the parent. Raw identities:

| Path | Raw SHA-256 |
|---|---|
| evidence/independent-public-checks.py | 7145500861ba6a59fc8c79466795c981bfcf1952edffb3ad15f73f65706e5feb |
| evidence/independent-check-results.json | 61d462c99dbb368dc1df793dba6c8efa65ddf9096a829af8b07c5e2b64f18e1f |
| evidence/closed-report-check-results.json | 2a17fcd3f96b9266af151e6cb562783ee217caab13da00412935fd482a75add7 |
| evidence/reference-key_dimensions.json | 394b1ac4fe05a089becf08117b44fae6a76ff7726dbd35d4e7b7d620797d3562 |
| evidence/reference-disable_artifact_restore.json | ab83c4606ec151c4ec2a6dab66344f58e2d73f27496033109e04011d0410d890 |
| evidence/bad-witness-link.json | dd8f64c9425053cdc64b1e927205b7ae5dcc16a6947061a313ac71ae859293bc |
| evidence/bad-labels-and-unlinked-rows.json | f00e14005ddbbe202ad9639405cd5e993ecf8b85bdb7f1c4fab42d9cc794aec4 |
| evidence/bad-missing-witness.json | 520b8ed1b38cc2037e2e3c2672ede367aa5fdea67a183020ebd1c4ce72f86605 |
| evidence/bad-contradictory-summary.json | 59b522bd57ea313282a84eaa6618ce55dfec23bb88d263be61a7452d55808652 |

## Record preservation and result

The initial five source records at the parent directory remain intact, including the original P3 finding and its evidence. Original manifest raw SHA-256: `22d72b4fc1445cd54e53b3513b2170ce599e681f2aaa53af888ab63fa902d7b0`. Intermediate bedf evidence is also retained separately. This final directory contains new typed source/frequency/impact records, review.md and its manifest; it does not rewrite the earlier review identity.

Baseline review:
- Gate: review-ai-quality.
- Status: pass.
- Evidence: exact final public diff, closed report contract, resolved test invocation, preserved model/intent and independent normal/bad JSON boundaries.

Additional required gates:
- review-domain-impact: status=pass; evidence=bounded investigation meaning, retained matched/control/confounding obligations and separate unknown judgments; signals=reporting_meaning_change.
- review-architecture-impact: status=pass; evidence=explicit version2 source boundary, r1 public byte preservation and sole public authority protected-path delta; signals=public_contract_change.
- review-output-quality: status=pass; evidence=complete structured contract, explicit shape-only CLI and extra-summary refusal; signals=reporting_meaning_change,docs_output_change,report_output_change,cli_output_change,ai_facing_output_change,structured_output_change.
- review-automated-gate: status=pass; evidence=source6/6, closure12/12, reproducible experiments4/4, final normal2/bad2 with6 tests each, required-field/extra-field refusal and archive25/25; signals=automated_evidence_required.

Missing evidence:
- none

Findings:
- none open; F-CACHE-R2-STRUCTURE-TEST-INVOKE resolved. The intermediate summary-authority concern is closed structurally by final source changes.

Decision:
- approve for final public source and documented-pattern lineage only. Private grading/admission remain separate unperformed judgments.

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": {
    "work_mode": "レビュー",
    "operating_mode": "delivery_quality",
    "user_facing": "CI cache r2最終公開sourceとlineageを独立承認する",
    "internal": {
      "primary": "review-router",
      "secondary": [
        "review-ai-quality",
        "review-domain-impact",
        "review-architecture-impact",
        "review-output-quality",
        "review-automated-gate",
        "review-final-merge-gate"
      ],
      "next_if_resolved": "review-final-merge-gate"
    }
  },
  "evidence_status": {
    "checked": [
      "exact source HEAD6f467d49fa7b679749122f6a372008fa0405649b",
      "current source6/6 input12/12 and protected command",
      "r1 public archived bytes25/25",
      "independent experiments4/4 and final normal2/bad2 with six ordinary tests each",
      "missing witness and extra-summary refusal",
      "unchanged policy/catalog/lineage/source documentation and resolved test invocation"
    ],
    "missing": []
  },
  "stop_reason": {
    "status": "completed",
    "details": [],
    "human_decision_required": [],
    "stop_if": [
      "Work would enter private meaning/grader/admission/production authority validation, r1 private originals, model/evaluation/comparison CLI, main merge or stopped-client re-review"
    ]
  },
  "next_action": "Return final exact-head source approval and separate unknown classification records; retain initial finding and interim evidence."
}
```
