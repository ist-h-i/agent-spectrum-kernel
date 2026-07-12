---
name: test-first-verification
description: Establish observable verification before or alongside implementation. Use for bug fixes, new behavior, regressions, refactors, and any change that needs proof.
---

# Test-First Verification

## Goal

Make success observable before declaring the work complete.

## Use when

- Behavior changes.
- A bug fix needs reproduction.
- A refactor must preserve behavior.
- A claim of correctness, performance, security, or reliability will be made.
- Existing test coverage is unclear.

## Do not use when

- The change is purely textual and no behavioral verification is meaningful.

## Process

1. Read `docs/lifecycle-artifact-contract.md` and produce the Verification Contract before or alongside implementation planning. When evidence will support a completion, merge, or release claim, use `docs/lifecycle-traceability-contract.md` to assign stable obligation and evidence IDs, retain the observed upstream revision, and map each evidence item to its exact supported items.

Use available repository context for commands, existing coverage, and test patterns. If a stack or project overlay supplies verification supplements, apply it without hard-coding stack-specific rules into this skill.

When `docs/ai/verification-pattern-ledger.md` exists, consult it only for matching change types, risk classes, regressions, or historically flaky areas:

- `template`: treat as no project-specific reusable verification evidence.
- `active`: use matching `Verified` or `Human-confirmed` entries as expected evidence, `Supported` entries as candidate evidence requiring current confirmation, and `Hypothesis` entries as test ideas only.
- `archived`: cite for history only; do not use as current verification requirements.

Stored verification patterns do not prove current task behavior. Current commands, focused tests, runtime checks, or explicit insufficient evidence remain required.

```text
Verification Contract:
- Artifact ID:
- Artifact type: verification
- Upstream refs:
- Behavior to prove:
- Focused checks:
- Required evidence:
- Insufficient-evidence conditions:
- Evidence required before completion claim:

Conditional fields, omit when irrelevant:
- Trace obligation IDs:
- Regression obligations and broader checks:
- Negative cases:
- Manual/runtime checks:
- Measurement methods:
- Merge or release claim evidence:
- Existing coverage and verification-pattern refs:
- Deltas to upstream proof obligations:
```

2. Tie the contract to the change type.

- Bug fix: require reproduction evidence before the fix when feasible.
- New behavior: tie checks to acceptance criteria.
- Refactor: require evidence that existing behavior is preserved.
- Output change: require an output artifact, sample response, rendered text, schema, or contract when relevant.
- Performance: define measurement method before claiming improvement.

3. Prefer a failing check first when feasible.

4. Choose verification depth.

| Depth | Use when |
|---|---|
| Focused test | Local behavior or bug reproduction. |
| Broader test | Shared module or public behavior changed. |
| Typecheck/lint/build | Compile/static guarantees matter. |
| Manual/runtime check | User-visible or integration behavior lacks automated coverage. |
| Benchmark/security check | Performance/security claim is being made. |

5. Run verification and record exact evidence as records that reference the same Verification Contract. Do not rewrite the contract because checks were executed.

6. If verification fails, report failure. Do not bury it under partial success.

7. If a required verification path is unavailable, report `insufficient evidence` instead of claiming completion. Provide the exact next verification path.
   - Express the next action as the work to do next, such as adding a focused test, running checks, or stopping for missing evidence.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This skill emits the Verification Contract and evidence artifact below; it does not repeat the envelope fields.

```text
Verification Contract:
- Artifact ID:
- Artifact type: verification
- Upstream refs:
- Behavior to prove:
- Focused checks:
- Required evidence:
- Insufficient-evidence conditions:
- Evidence required before completion claim:

Conditional fields, omit when irrelevant:
- Regression / broader / negative / manual / runtime / measurement obligations:
- Merge or release claim evidence:
- Existing coverage and verification-pattern refs:
- Deltas:

Evidence:
- Verification Contract ref:
- Trace evidence IDs, when claim mapping is required:
- command:
  result:
- command:
  result:
- Insufficient evidence observed, when present:
```

Keep the next action only in the shared Execution Envelope. Do not add separate `Not verified` or `Next verification` summaries; attach missing proof to the Evidence record and envelope evidence status.

## Optional Metrics Event Candidate

Only when adoption metrics are explicitly enabled or requested, and verification completes or insufficient evidence is explicitly reported, include a `Metrics event candidate` following `docs/metrics-event-contract.md`.

Record whether a Verification Contract was defined, whether tests were added or updated, whether validation passed, and whether insufficient evidence remained. Do not emit metrics for hidden telemetry or a partial conversation with no durable outcome.

## Exit criteria

- The Verification Contract exists or the change is explicitly exempt.
- The pre-implementation and post-implementation evidence use the same contract reference.
- The changed behavior has an observable check.
- Commands/results are exact.
- Unverified items are explicit and not presented as fixed or proven.
- Success is not claimed from code inspection alone unless no executable check exists.

## Failure modes

| Failure | Correction |
|---|---|
| “I know this works.” | Treat as hypothesis until verified. |
| Existing tests assumed sufficient | Identify which tests cover the changed behavior. |
| Manual check used as proof of all behavior | Scope manual evidence narrowly. |
| Missing required verification path ignored | Report `insufficient evidence` and the next check. |
| Invented command output | Never invent results; say not run. |
