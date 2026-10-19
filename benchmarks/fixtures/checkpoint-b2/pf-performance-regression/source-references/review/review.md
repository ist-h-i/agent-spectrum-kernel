# Performance public source / lineage independent review

Exact reviewed HEAD: `02c527f64d8fc9b3e19a117d328e8100d2dafb10`; pinned-main base: `b81fa69d96e6e3a77d279cfa7209e92d22f112e4`; branch feat/primary-pf-performance-20261012; repository ask-performance-development. Initial source snapshot351b539fd97e756f4a56f84e5012daf42a6ee490 was also inspected. Completed2026-10-12. Repository remained clean and was not modified.

**Source approval: approve. Frequency and impact: approve retaining unknown/null, practice-weighted aggregation ineligible.** No source blocker or open finding remains. This is not private evaluator/admission approval, model grading, empirical hard calibration or production performance certification.

## Source, rights and frozen role

Verified: documented_external_pattern is an existing approved type and closed lineage-schema enum. The reviewer independently checked [Node24 performance.now documentation](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html#performancenow). It supports the high-resolution elapsed-time API, not a claim that this particular event lookup regression occurred externally. The checked-in short paraphrase says precisely that API pattern is used; lookup code/data are separately original fictional material. No documentation implementation/example code or private business data is copied. The retrieved24.x page reports24.21.0; local measurement runs use24.19.0, as the source states.

Verified: catalog and lineage policy are byte-identical to pinned main. Frozen primary identity remains investigation_implementation / performance / hard / repetitions5 / risk none; topology remains implementation_and_tests plus runtime_measurements, with performance diagnosis/regression testing intent. Catalog base aggregate eligibility is unchanged. Documentation prevalence, sample repetitions, fixture failure and local speedup are not occurrence/impact measurements. Both bands remain unknown, weights null and practice-weighted ineligible. Neither band substitutes for the other.

## Public recoverability, semantics and difficulty

Verified: the ordinary task, contract, slow reference, seed, data generator, tests and measurement disclose enough to solve the local exercise without private answers or ASK-specific cues. Only src/event-lookup.mjs is editable; the final command protects all other workspace files. The nine input entries close exactly by bytes/digests. Input raw digest: `sha256:0e2cf6a60b1ec05023c691ef27b706229bb95d2bea1159e797440915aba5ca18`; verification semantic digest: `sha256:7903acd6e9efef8c76d86dc8f2156e7b9b3ffe0d3a6612c6d169a25f1c9bb737`. All ten completion/evaluator/admission records remain generation_pending. No source-check pass is represented as a delivered solution or adopted fixture.

The seed and intentionally slow reference have identical behavior. Requests retain group order and duplicate IDs. Events require finite timestamp/window bounds, inclusive ranges, strict selector equality and original occurrence order/object identity, including duplicate occurrences. Null/primitive records and invalid windows are excluded consistently. Type/object identity, NaN non-equality and zero equality are explicitly tested. Input arrays/records remain unchanged, and mutations to input/request contents must be observed on later calls. Ordinary data properties, no proxies/accessors/concurrent mutation, keep the local boundary recoverable.

Supported: the design represents performance investigation plus implementation, not a request to merely return a metric label. A solver must diagnose repeated scanning, choose a request-scoped organization, preserve the semantic boundaries and demonstrate actual local runtime separately from functional correctness. Typed compound-key invariants apply to any compound key a solver uses, not to a prescribed algorithm. The reviewer independently used a timestamp-range-first organization with strict component comparisons and original occurrence restoration. It is a valid alternate route and avoids requiring a particular hidden index structure.

The visible contract/test cases reduce ambiguity and reveal the preservation obligations; the narrow generated windows permit a compact conventional solution. That proves public feasibility and fair alternative solutions, not triviality or empirically hard difficulty. No observed source defect forces grading an easier placeholder exercise, but the hard designation/45-minute expectation remain frozen metadata without empirical calibration. No model/difficulty experiment was performed. Source approval does not claim hard has been measured.

## Measurement scope and conditional outcomes

Verified: the protected runner uses performance.now around actual function calls, warms both implementations twice, alternates order across five samples, validates every timed result afterward and records all durations, medians, input/output/consumption counts and runtime/platform/architecture. Index construction inside the lookup call is included in elapsed time. Equality assertions/consumption occur outside the measured function interval; counts are reported separately and not substituted for time.

Both generated workloads use16000 events,2400 requests and narrow inclusive windows; sparse varies64 tenants, dense uses1. Their output counts are154 and9600 respectively. Dense here means tenant/selectivity/output difference, not a measured wide-range or production distribution. Memory peaks, wide-window worst cases, repeated concurrent traffic and real services are outside this measurement. There is no production baseline/deployment claim: the scan reference is deliberately slow authored source.

A baseline median below12ms, nonfinite ratio or sample max/min dispersion above12 yields inconclusive exit3. A bounded ratio over0.4 yields local regression exit1. Any inconclusive workload keeps the combined result nonpassing, even if another workload is within target. This is a local guard, not a formal statistical-confidence guarantee. Two fresh-process repeats for the independent solution are well within bounds: candidate dispersion approximately1.20–1.33, reference1.00–1.07, and baseline medians about1.92–2.04 seconds.

The reviewer exercised both inconclusive branches using separate copied configurations: a floor above actual elapsed time and a dispersion limit below1 with floor0. Both direct measurement runs use the real clock and exit3, including a candidate ratio below0.4. These are reviewer-only branch controls, not submitted candidates or changed protected files; their modified configuration would not pass the task's anchored invocation. No clock spoofing or private runtime exploitation was used.

## Independent verification

Author private normal source files were never read. The reviewer independently authored one conventional solution and one deliberate order-breaking variant in this review evidence directory. Source bodies are not printed or included here; only results and hashes are recorded.

| Check | Result |
|---|---|
| source author suite at initial351b snapshot | 6/6, including actual seed runtime observation |
| source suite at final02c successor | 6/6, including actual seed runtime observation |
| current source closure validator | exit0 |
| independent exact anchored command, two fresh processes | 2/2 exit0; functional14/14 and both runtime workloads each |
| additional independently authored boundaries | 5/5 |
| deliberate timestamp-output-order variant | anchored exit1, functional refusal |
| floor/dispersion reviewer controls | each exit3, inconclusive |
| pinned-main-to-final whitespace diff | exit0 |
| input inventory / generation markers |9/9 exact;10/10 generation_pending |

The five extra tests cover a mixed typed-selector/object/NaN matrix with duplicate occurrences, sparse arrays, primitive/optional-field records, same-identity changed content/fresh outputs, and deterministic mixed windows plus nonmutation. They compare with the supplied behavior reference and exact matching object identities. The bad-order variant distinguishes returning timestamp order from preserving original occurrence order.

Actual local medians (milliseconds):

| Run | Workload | Reference | Independent solution | Ratio |
|---|---|---:|---:|---:|
| independent-repeat-1 | sparse | 1921.494 | 5.272 | 0.002744 |
| independent-repeat-1 | dense | 2031.607 | 6.255 | 0.003079 |
| independent-repeat-2 | sparse | 2036.558 | 5.625 | 0.002762 |
| independent-repeat-2 | dense | 2016.250 | 6.205 | 0.003078 |

The source suite deliberately treats the scan seed as functional success plus runtime regression/inconclusive, not a completed improvement. Its direct seed-measurement observation takes about63 seconds on this environment; the task command timeout is60 seconds. The independent improved anchored runs finish within that timeout, while an unoptimized seed can fail by timeout in that route. No anchored seed pass or uniform host-time guarantee is claimed. This expected unoptimized failure does not establish a source blocker; future evaluator command failure/timeout handling remains outside this source review.

An initial nonblocking identity nit F-PERF-SOURCE-IDENTITY was reported: command_id used async-search-validation and source closure errors named pf-frontend-async. Successor02c replaces only those identity/diagnostic strings and regenerates verification identity. The task, input bytes and canonical script are unchanged. Byte comparison confirms the exact replacement-only helper difference; the P3 is resolved, with no behavior change.

Private source/case evidence is under evidence/, directories700/files600. Raw hashes:

| Path | Raw SHA-256 |
|---|---|
| evidence/independent-range-index.mjs | 9e985b9c374c1fe82517e32a2aabd7951ec433455fc5cd3c7b1d94a760bd8db9 |
| evidence/bad-timestamp-output-order.mjs | 7a586a622ca2fdb69a29e3f8dbfe0b4f82b5233a49a765ba18d0ae87567ff424 |
| evidence/independent-boundaries.test.mjs | 1a72ac24425111a37e8b24e7de12b79dc8cb30d042aac1fc7951f7e7e5ccb7c0 |
| evidence/run-independent-checks.py | 8ec4a709cd03945f3fbff92fe0501295c24d554160190a858fdfdd5b2e2779c9 |
| evidence/independent-results.json | 14b8882567b35449d58b1f7a04393d6c7d6bed007b0e6c67038b5f392c496302 |

Full repository validator success was supplied by the parent but not independently rerun, and no repository-wide green claim is made. No private evaluator/admission, old diagnostic, model/evaluation/comparison CLI, main merge or production service action was performed.

## Review result

Baseline review:
- Gate: review-ai-quality.
- Status: pass.
- Evidence: exact source/ref/contract consistency, public feasibility, function preservation, resolved helper identity nit and bounded runtime behavior.

Additional required gates:
- review-domain-impact: status=pass; evidence=honest local measurement meaning, frozen investigation intent and separate unknown bands; signals=reporting_meaning_change.
- review-architecture-impact: status=pass; evidence=source-only API contract, request-scoped state and protected measurement/reference boundary with no global cache or shared worker change; signals=public_contract_change.
- review-output-quality: status=pass; evidence=actual duration/median/count report, explicit local scope and nonpassing inconclusive states; signals=docs_output_change,report_output_change,cli_output_change,ai_facing_output_change,structured_output_change.
- review-automated-gate: status=pass; evidence=source6/6 final, functional14, extra5, two anchored runtime repeats, bad-order refusal, actual-clock inconclusive controls and closure9/9; signals=automated_evidence_required.

Missing evidence:
- none

Findings:
- none open; F-PERF-SOURCE-IDENTITY P3 resolved at exact final HEAD.

Decision:
- approve for public source preparation and documented-pattern lineage only. Separate frequency/impact unknown classifications approved; private grading/admission remain unperformed.

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": {
    "work_mode": "レビュー",
    "operating_mode": "delivery_quality",
    "user_facing": "performance課題の公開sourceとlineageを独立レビューする",
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
      "exact source02c527f64d8fc9b3e19a117d328e8100d2dafb10",
      "public inventory9/9 protected command and generation_pending10",
      "source6/6 and semantic contract/ref/test review",
      "independent functional14 and five extra boundary tests",
      "two exact anchored runtime repeats on sparse/dense",
      "bad-order refusal and separate actual timing inconclusive controls",
      "official Node API pattern and frozen catalog/policy unknown bands"
    ],
    "missing": []
  },
  "stop_reason": {
    "status": "completed",
    "details": [],
    "human_decision_required": [],
    "stop_if": [
      "Work would inspect author private normal sources, private evaluator/admission, old diagnostics, model/evaluation/comparison CLI, main merge or production services"
    ]
  },
  "next_action": "Return bounded exact-head source approval and separate unknown frequency/impact judgments with raw-byte record hashes."
}
```
