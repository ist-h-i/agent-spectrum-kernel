# Prompt v2 result-blind canary protocol

Status: preregistered, pre-result, non-authoritative

Protocol version: 1.0.0

Specification: `SPEC-234-PROMPT-V2-PREREGISTRATION@1`

## Boundary

This protocol freezes a synthetic-verifiable wrapper around the existing #197 `full_ask` scoring authorities. It does not execute Codex or Claude, inspect a measured response, parse private evaluator content, calculate a second raw quality score, add a fifth product condition, recommend a lifecycle action, or activate a Prompt Asset or Portfolio.

The two comparison roles are wrapper-only values: `current_prompt` and `prompt_v2`. Both retain `raw_scoring_condition=full_ask`. Adapter results remain separate and are never pooled, substituted, or converted from missing/unavailable to zero, pass, tie, or parity.

The checked preregistration is `benchmarks/prompt-v2-preregistration.json`. Its digest excludes only `preregistration_id` and `preregistration_digest`; the ID is the final 32 hexadecimal characters of that digest. Any seed, fixture, runtime, scorer, threshold, privacy, or decision-rule change creates a different preregistration namespace.

## Non-circular generated authority binding

The hand-written preregistration intentionally does not name source commit A. After the hand-written files and exact renderer outputs under `docs/fixtures/prompt-v2-preregistration/rendered` are committed, a separate generator supplies source commit/tree A and publishes the generated binding/reference/store in a later commit B. The binding is validated by `validatePromptV2AuthorityBinding` before a plan can be built.

The binding shape is closed:

```text
schema_version: 1.0.0
binding_kind: prompt_v2_preregistration_generated_authority
preregistration_id / preregistration_digest
source:
  repository_revision / repository_tree
  rendered_source_root / rendered_source_inventory_digest
adapter_bindings[codex, claude]:
  adapter_track
  roles[current_prompt, prompt_v2]:
    prompt_role
    asset: asset_type / stable_id / version / record_digest / content_digest
    portfolio: portfolio_id / revision / manifest_digest / asset_set_digest / lock_digest
    selection: selection_object_digest / selection_digest
    projection: renderer_id / renderer_version / renderer_input_digest /
                rendered_bundle_digest / inventory_digest
  evolution: candidate_object_digest / candidate_digest /
             experiment_object_digest / experiment_digest /
             baseline_asset_record_digest / candidate_asset_record_digest /
             rollback_target_manifest_digest /
             phase=pre_result / results_accessed=false /
             projection_mode=prompt_v2_exact / raw_scoring_condition=full_ask
boundaries: all false
binding_digest
```

Within each adapter, both roles use the same adapter-specific stable Asset ID but distinct Asset versions/records/contents, Portfolio manifests/locks, selections, and rendered projections. The source revision is externally supplied and therefore cannot be made self-referential by the hand-written config. The candidate and experiment remain pre-result objects; the binding cannot contain a recommendation, decision, application receipt, result, or activation claim.

## Frozen inventory and runtime

The plan contains exactly 56 cases:

| Execution fixture | Catalog fixture | Class | Repetitions per role/adapter |
| --- | --- | --- | ---: |
| `pr-session-refresh-medium-hard` | `cal-session-refresh` | review | 3 |
| `pr-export-lease-hard` | `cal-export-lease` | review | 3 |
| `impl-rule-batch-medium-hard` | `cal-atomic-rule-batch` | implementation | 3 |
| `impl-transfer-hard` | `cal-concurrent-transfer` | implementation | 5 |

Each `{adapter, fixture, repetition}` block contains both Prompt roles, for 28 blocks. A preregistered seed deterministically orders blocks and alternates the first role so each fixture/adapter has a role-order imbalance of at most one. Case, block, plan, materialization, resume, normalized-result, and report identities all bind their canonical inputs.

Within a pair, the input-manifest record, task digest, workspace digest, evaluator-visible input digest, frozen input digest, public answer-free evaluator-set identity, and common-input identity are byte-identical. Only the exact Prompt projection authority differs. Workspaces and mutable result roots are isolated per case.

Codex is frozen to `codex-cli 0.147.0`, `gpt-5.6-sol`, reasoning effort `high`, a fresh process/workspace per case, `workspace-write`, approval `never`, network disabled, 900000 ms timeout, and sequential execution. Claude is frozen as typed `unavailable` because the CLI is absent. All 28 Claude cases remain in the plan and cannot be spawned through another runtime or replaced with Codex results.

Provider cache state is typed `unknown`. `cached_tokens` is recorded separately when present; relevant token total is exactly `input_tokens + output_tokens` and never adds cached tokens again.

## Resume and normalized-result contract

A new resume state inventories all 56 plan cases as pending with attempt `1`. Applying a normalized result is a functional append of an immutable `{normalized_result_id, normalized_result_digest, status}` reference. Only a pending exact case in the same run, plan, and materialization may transition. Duplicate completion, retry/attempt substitution, omitted inventory, case reorder, cross-run or cross-version transplant, and cherry-picking are rejected. `pendingPromptV2Cases` returns only still-pending plan records.

Terminal status is `scoring_ready`, `not_scoring_ready`, or `unavailable`. Every metric is typed as `known`, `unknown`, `unavailable`, or `not_applicable`; only `known` has a numeric value. Route/gate values are likewise typed. A `scoring_ready` wrapper must cite the existing #197 engineering result/evaluation/result-set identities and `full_ask`; the wrapper does not recalculate the raw score.

Durable normalized results contain exact preregistration, generated binding, plan, materialization, run, case, Asset, Portfolio, selection, Evolution, Prompt projection, common-input, and #197 scorer authority identities. They may contain typed native-unit metrics and status values. They may not contain raw prompts, raw model output, stdout/stderr, private evaluator paths/content, measured-result paths, or an embedded evaluator payload.

## Frozen comparison rules

Reports are computed independently for Codex and Claude. A repository outcome requires both adapter reports to be complete and never pools their values.

- Inventory: every expected paired case must be scoring-ready for an adapter comparison.
- Quality: for each fixture, median `(prompt_v2 - current_prompt)` normalized requirement score is at least `0.00`; at least `ceil(2n/3)` repetition deltas are non-negative.
- Guardrails: no paired Prompt v2 value may increase for any of the eleven frozen count fields.
- Route/gates: Prompt v2 must be non-inferior for decision, verification, evidence, and required-mechanism gates; unknown/unavailable cannot pass.
- Tokens: per-pair reduction is `(current_total - prompt_v2_total) / current_total`, where total is input plus output. Adapter median reduction is at least `0.30`, at least `ceil(2N/3)` pairs meet `0.30`, and the median reduction is at least the larger normalized within-role token MAD.
- Duration: median paired increase `(prompt_v2 - current) / current` is at most `0.20`. An increase above `0.20` and at most `0.50` passes only when median quality gain is at least `0.05` and exceeds the larger within-role normalized-quality MAD. Above `0.50` fails.
- Stability: all required medians, MADs, and sign counts must be complete.

Outcome precedence is immutable: missing/incomplete/unavailable evidence gives `insufficient_evidence`; a quality, guardrail, or route/gate regression gives `revise_and_repeat`; complete non-regressing evidence that misses efficiency, duration, or stability gives `retain_current`; only all-pass evidence gives `adopt_prompt_v2`. These are non-authoritative Prompt outcomes, not recommendations or lifecycle decisions.

## Exported API

`scripts/ask-benchmark-prompt-v2.mjs` exports:

- canonical identity helpers: `canonicalDigest`, `stableCanonicalJson`, `computePromptV2PreregistrationDigest`, `computePromptV2AuthorityBindingDigest`;
- config/binding: `loadPromptV2Preregistration`, `validatePromptV2Preregistration`, `validatePromptV2AuthorityBinding`;
- plan/materialization: `buildPromptV2ExecutionPlan`, `validatePromptV2ExecutionPlan`, `buildPromptV2MaterializationManifest`, `validatePromptV2MaterializationManifest`;
- resume: `createPromptV2ResumeState`, `validatePromptV2ResumeState`, `pendingPromptV2Cases`, `applyPromptV2NormalizedResult`;
- normalized/report: `buildPromptV2NormalizedResult`, `validatePromptV2NormalizedResult`, `buildPromptV2ComparisonReport`, `validatePromptV2ComparisonReport`.

The only focused synthetic verification command for this work package is:

```sh
node scripts/test-ask-benchmark-prompt-v2.mjs
```

That test uses fabricated digests, typed metrics, and existing-authority references only. It does not run a measured Prompt comparison or inspect protected evaluator bytes.
