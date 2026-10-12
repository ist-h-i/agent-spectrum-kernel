# Frontend async public-source title follow-up

Reviewed HEAD: `ed78e002c3a8e85aee8fa46fa61ffccba82c76de`. Predecessor: `bb9665c9eca56de74e2a0efc245a9586a60048b7`; original base: `f1ac0141eb7c6ef75ddc6cb35f0be7ef72b2a879`. Repository: `ask-frontend-async-development`. Completed 2026-10-12.

**Decision: approve for the existing public source subset.** Source lineage approval and separate unknown frequency/impact judgments are retained. This is not approval of the entire new commit or its private-preparation additions.

## Evidence and change

The only changed original source ref is `scripts/test-ask-benchmark-pf-frontend-async-source.mjs`. At lines 7 and 8 the titles now say “frozen role requires async search and view lifetime” and “seed exposes request replacement and disposal regressions”. An exact byte comparison proves replacing only those two predecessor title strings yields the complete current file: assertions, imports and every other byte are unchanged. The current file is 2775 bytes, raw SHA-256 `671291c0f736ea2de5c42e234aeffdb5d64f59a7b9e115d93cf0447c9f9839c4`.

All 13 other original refs are byte-identical: task, six visible/input workspace components, manifest, verification contract, lineage, source summary, source helper, policy and catalog. Exact refs remain in source-approval.json. Frozen ID/intent/domain/class/topology and the documented external-pattern basis therefore retain the prior bounded judgment. No new frequency/impact evidence exists; both bands remain unknown, weights null and practice-weighted aggregation ineligible.

`node --test scripts/test-ask-benchmark-pf-frontend-async-source.mjs` independently reran at this HEAD with Node v24.19.0: exit 0, 6 pass, 0 fail. That ordinary public source check includes the intentional seed contract of 12 tests, 5 pass and 7 expected failures. Unchanged local-view feasibility and interaction proofs remain in the original review, rather than being claimed as newly rerun browser verification.

The prior nonblocking P3 finding `F-ASYNC-AUTHOR-TEST-TITLES` is resolved. No new finding was identified in this title-only slice.

## Scope and retained records

The four added paths are outside this follow-up and were not read or reviewed:

- benchmarks/pf-frontend-async-state.config.json
- scripts/ask-benchmark-pf-frontend-async-authority.mjs
- scripts/ask-benchmark-pf-frontend-async-review-archive.mjs
- scripts/test-ask-benchmark-pf-frontend-async.mjs

The original five records in the parent directory remain immutable. Their four-record manifest hashes were rechecked, and the original manifest raw SHA-256 remains `0af1bb807d7beed8501cfccc127da354d17d7bf1e7db8ea36e63d26bed40c57f`. This follow-up writes exactly five new records in its own directory.

Baseline review:
- Gate: review-ai-quality.
- Status: pass.
- Evidence: exact replacement-only diff, unchanged asserted behavior and original source refs.

Additional required gates:
- review-domain-impact: status=pass; evidence=identical lineage/policy/catalog, separate unknown frequency and impact judgments; signals=reporting_meaning_change.
- review-output-quality: status=pass; evidence=corrected labels now describe their actual unchanged assertions; signals=docs_output_change,ai_facing_output_change,structured_output_change,cli_output_change.
- review-automated-gate: status=pass; evidence=source6/6 and predecessor/current byte-closure comparison; signals=automated_evidence_required.

Missing evidence:
- none

Findings:
- none open; F-ASYNC-AUTHOR-TEST-TITLES resolved.

Decision:
- approve for this public source subset only.

Private evaluator/preparation soundness, meaning/grading, fixture admission, actual DOM/React/browser UI, accessibility and real-network reliability remain outside this approval. No private original, answers, newly added helpers, model/CLI/comparison execution, main merge or stopped-client re-review was performed. Repository files were not modified.

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": {
    "work_mode": "レビュー",
    "operating_mode": "delivery_quality",
    "user_facing": "公開sourceテストの2タイトル修正だけを独立追補確認する",
    "internal": {
      "primary": "review-router",
      "secondary": [
        "review-ai-quality",
        "review-domain-impact",
        "review-output-quality",
        "review-automated-gate",
        "review-final-merge-gate"
      ],
      "next_if_resolved": "review-final-merge-gate"
    }
  },
  "evidence_status": {
    "checked": [
      "exact ed78e002c3a8e85aee8fa46fa61ffccba82c76de",
      "13 original source/policy/catalog refs byte-identical",
      "existing source test exact two-title substitution only",
      "source tests 6/6",
      "original five-record raw-byte integrity"
    ],
    "missing": []
  },
  "stop_reason": {
    "status": "completed",
    "details": [],
    "human_decision_required": [],
    "stop_if": [
      "Work would inspect excluded private-preparation files or enter private evaluation, admission, model/CLI/comparison, main merge or stopped-client re-review"
    ]
  },
  "next_action": "Return the separate follow-up source/unknown classification records and their raw hashes; preserve the original five records."
}
```
