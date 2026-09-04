---
name: evidence-ledger
description: Produce a formal multi-claim evidence audit with stable claim IDs. Use only when ask.claim-evidence-status@1.0.0 selects formal_ledger.
---

# Evidence Ledger

## Goal

Produce a separate, independently auditable claim/evidence artifact without replacing the inline claim discipline that applies to all work.

## Use when

Apply this Skill only when `ask.claim-evidence-status@1.0.0` selects `formal_ledger` for at least one closed trigger:

- `explicit_claim_audit`: the user requests a claim/evidence ledger or independent claim audit;
- `multiple_material_claims`: multiple material claims must be audited independently;
- `high_stakes_readiness`: merge, release, production, security, reliability, performance, cost, ROI, or externally communicated readiness is evaluated;
- `cross_artifact_synthesis`: claims synthesize evidence across multiple artifacts or revisions;
- `stable_claim_ids`: a later consumer requires stable claim IDs or missing-evidence closure.

## Do not use when

- Ordinary implementation, investigation, verification, review, or handoff has one or two claims that fit its existing artifact.
- A response merely uses words such as correct, fixed, maintainable, or improved.
- The Skill is installed or available but no closed formal trigger is present.

In these cases, apply the `ask.claim-evidence-status@1.0.0` values `Verified`, `Supported`, `Hypothesis`, `Unknown`, or `Falsified` inline and attach concise evidence or missing evidence to the domain artifact.

## Process

1. Extract claims.

2. For each claim, record:

```text
Claim:
Evidence:
Evidence type:
Status: Verified | Supported | Hypothesis | Unknown | Falsified
Confidence:
Missing evidence:
Next check:
```

3. Grade evidence.

| Evidence type | Strength |
|---|---|
| Passing focused test reproducing changed behavior | Strong for that behavior. |
| Broader suite/build/typecheck | Strong for integration/static guarantees. |
| Runtime/manual check | Useful but scoped. |
| Benchmark with method | Strong only for measured scenario. |
| Code inspection | `Supported` for the inspected property; not executable proof. |
| Assumption or intent | Not evidence. |

4. Downgrade language.
   - `Verified`: state directly with the exact evidence reference.
   - `Supported`: state with the indirect-evidence limitation.
   - `Hypothesis`: use for investigation only and name the next check.
   - `Unknown`: keep the missing evidence explicit; never infer pass, zero, or absence.
   - `Falsified`: correct the claim and retain the contradictory evidence reference.

5. Preserve stable claim IDs and define the exact missing-evidence closure for each claim.

6. If legacy input is encountered, use the environment's projected normalizer: repository path `scripts/claim-evidence-status.mjs` or Claude plugin path `${CLAUDE_PLUGIN_ROOT}/scripts/claim-evidence-status.mjs`. Preserve the original status and migration basis. Never map `weak` to `Verified` or treat historical import as a fresh observation. If no normalizer is available, mark the import unavailable instead of guessing.

## Output

```text
Evidence ledger:
Contract: ask.claim-evidence-status@1.0.0
Trigger: explicit_claim_audit | multiple_material_claims | high_stakes_readiness | cross_artifact_synthesis | stable_claim_ids
| Claim ID | Claim | Evidence | Status | Missing evidence | Next check |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |
```

## Exit criteria

- Unsupported claims are downgraded.
- Every status is one of the canonical five and evidence strength is visible.
- Missing evidence has a next check.
- Final language matches evidence status.
- The activating trigger is recorded; availability alone is not reported as activation.

## Failure modes

| Failure | Correction |
|---|---|
| “Cleaner” claimed without property | Tie to reviewable property. |
| “Faster” claimed without measurement | Require benchmark/measurement. |
| “Fixed” claimed without reproduction | Require failing-then-passing evidence when feasible. |
| “No known issue” used as proof | Unknown is not evidence of absence. |
| Formal table emitted for ordinary work | Keep the status and concise evidence inline unless a closed trigger selects this Skill. |
| Formal table emitted for ordinary work | Keep the status and concise evidence inline unless a closed trigger selects this Skill. |
