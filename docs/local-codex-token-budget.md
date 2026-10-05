# Opt-in comparison token budget

Existing plans retain 30,000 tokens per trial and 60,000 cumulative. A new
connection descriptor can explicitly select `tokenPolicy`, together with the
existing `timePolicy`:

```json
{"kind":"codex_comparison_token_budget_v1","trial_tokens":50000,"cumulative_tokens":100000,"accounting":"input_plus_output_including_cached","enforcement":"post_trial","retry":0}
```

This creates v6 (closed reads) or v7 (declared reads). It does not modify v1–v5,
old permissions, or saved results. The policy is closed: altered values or extra
fields are rejected. The source-bound plan, fresh exact phase permission and
saved report carry the selected policy. Old or incomplete permissions cannot
approve this selection. Preparing a plan does not issue approval or run a model.

The modest opt-in increase provides more operating room for comparison without
raising the distribution default. It is provisional, not evidence that either
condition will complete. Kernel completion and the suitability of this budget
remain unverified. No new real model trial was consumed to implement this option.

## Accounting and stop behavior

Known terminal usage remains input plus output, including cached input. Reasoning
usage is already part of output and is not added twice. Cached input is not
subtracted. Unknown usage stops execution; it is not treated as zero for deciding
whether the next condition may run. The recorded cumulative value is a partial
sum when usage is unknown.

A known trial total at or above 50,000 stops before the next condition. A known
cumulative total at or above 100,000 also stops. Both checks happen after the
trial, so they cannot prevent overshoot or guarantee a maximum bill. There are
no hidden retries. With exactly two slots and each accepted below 50,000, their
sum is below 100,000; the cumulative guard remains explicit for accounting and
is tested directly at its boundary rather than claiming an impossible accepted
pair reaches it.

Task, model, effort, grading separation, identity checks and read restrictions
are unchanged. Time remains 120 seconds startup, 120 seconds from observed turn
start, 240 seconds absolute and 2 seconds residual drain. See
[the time policy](local-codex-time-budget.md). Offline replay verifies existing
sealed evidence without calls, permission issuance or writes.

## Verification Contract

- Artifact ID: issue315-comparison-token-budget-v1
- Artifact type: verification
- Upstream refs: Issue #315; Draft PR #317; preceding source 7e6e7a16d9d75dd2b5731fef43780cef75a465ff
- Selected path: formal_verification_contract under ask.verification-proof-policy@1.0.0; protected permission and execution-budget boundary.
- TBUD-O1: only explicit v6/v7 selection changes caps; legacy behavior and replay remain compatible.
- TBUD-O2: exact plan/source/permission/report binding rejects old, missing or altered permission/policy before execution.
- TBUD-O3: trial boundary 49,999/50,000/50,001, cumulative 99,999/100,000/100,001 and unknown usage preserve stop/no-retry behavior.
- TBUD-O4: both conditions share accounting and policy; sealed replay has identical content and no writes.
- Focused check: `node --test --test-name-pattern=comparison scripts/test-ask-local-codex.mjs`.
- Regression check: `node --test scripts/test-ask-local-eval.mjs scripts/test-ask-local-codex.mjs scripts/test-ask-local-codex-time-budget.mjs scripts/test-ask-synthetic-json-pilot.mjs`.
- Required evidence: model-free checks, repository validation, runtime bundle check, independent review and exact submitted-head CI. Command results must be recorded separately; this contract alone is not a passing result.
- Insufficient evidence: failing checks, mismatched final source, or absent CI completion prevents a verified implementation claim. No mocked/platform-independent test establishes real OS/model verification.
- Runtime checks: no new real CLI/canary/model call, actual grant or authentication change authorized for this delivery. A future real experiment needs a new plan and explicit approval.

Issue #291's 14 pairs/28 trials and existing acceptance criteria remain unchanged.
Draft PR #313 remains preserved; this change does not merge or replace its evidence.
