# Core grading compatibility and offline replay

IMP-318-GRADED-1 / FVC-318-GRADED-1, revision 3. Upstream: the adopted
Core Bundle definition at e52ad82a and native capture boundary at 46b50288.
The user authorized new-condition normalization/provenance compatibility on
2026-10-06. This does not authorize model execution, real-data grading,
execution grants, authentication changes, or publication of private evidence.

Proof selection: formal_verification_contract under
ask.verification-proof-policy@1.0.0. Triggers: public API compatibility,
persistence, cross-module authority, stable trace. The implementation-context
file is a template; nearby implementations and current checks are the evidence.

The existing requirement weights, formula, scoring policy, private evaluator,
original schemas, evaluator-reference, and saved legacy results remain fixed.
The complete raw scorer source file retains its preregistered byte digest.
New conditions are `plain/core/full`; Core is the adopted K-core, and Full uses
the same core plus its existing extensions. No condition is relabeled as
`kernel_only` or `full_ask`. The old canonical Kernel's missing-router stop is
independent of this compatibility work and remains in its old protocol.

## Implementation and verification contract

| Obligation | Change and required evidence |
| --- | --- |
| G1 | Explicit, scoped new schema profile; original schema bytes and default validation remain unchanged. New normalization contains the actual new condition. |
| G2 | Independently pinned, synthetic-only authority binds product, capture, task, terminal workspace, normalized identity, grader inputs and exact code/schema sources. Missing, unknown or mismatched bindings refuse before scoring. |
| G3 | Existing `verifyEvaluatorAuthority` and `scoreEvaluatorResult` perform the independent evaluator checks and original calculation. No replacement scorer or caller-minted admitted object. |
| G4 | Create-once, separate graded evidence capsule retains public scoring inputs and exact results. Capture evidence directories are not extended or rewritten. |
| G5 | External-digest offline replay checks exact inventory/source/input/result identities and recalculates through the original pure scorer. It does not launch a grader/model or read original private/auth/session roots. |
| G6 | New-condition success, failure/unknown, condition/task/workspace/source/result tampering and legacy fixtures are tested; independent review and exact-head CI are required. |
| G7 | The real connected-result contract is normalized without launching processes. Exact task-only terminal snapshots and original public evaluator references are preserved; unresolved sealed authority refuses scoring. |
| G8 | A non-authority native compatibility review request reuses the verified capture/public-reference connection, preserves all three condition identities and missing prerequisites, and rejects coherent request rehashes that alter those bindings. It never issues admission or execution authority. |

Synthetic captures and calibration evaluator fixtures prove transport,
provenance checks, scoring compatibility and offline persistence only. They do
not prove a real MN task was graded, native sandbox enforcement, evaluator
admission, model compliance, OS support, or ASK effectiveness. Real native
authority is not issued by this contract.

The compatibility schema files are generated from the unchanged base schemas.
Their base `schema_path` wire fields are retained, and the independently pinned
provenance profile explicitly selects the new schema files. Default callers
continue to validate against the original schemas. Profile scope expires on
return, including for inherited async resources; thenable callbacks refuse.

The public calculation material has individual canonical digests in the
original provenance authority. Saving and replay both enforce those bindings;
changing the calculation and score together cannot reuse the original authority.
The capsule retains that authority's exact bytes and raw digest.

```sh
node scripts/generate-ask-core-grading-schemas.mjs --check
node scripts/test-ask-benchmark-portfolio-score.mjs --core-grading-only
node scripts/ask-core-scored-replay.mjs replay /absolute/capsule 'sha256:<external-result-digest>'
```

`scoreCoreCapture(options, newOutputRoot)` requires the original scorer inputs
plus a `coreGradingAuthority` containing a new owner-only authority file, its
independently retained digest, and a new synthetic capture file. It calls the
original verifier and scorer. This is a verification-only synthetic capture
contract, not a native connection-result normalizer or a real MN grading claim.
This is the new public grading entrypoint: the unchanged `scoreEvaluatorResult`
alone does not establish a Core profile around its full calculation lifetime.
Failures preserve partial new output; there is no overwrite, retry or resume.

## Actual capture normalization and original sealed input connection

`normalizeCoreConnectedResult(connectionRoot, externalDigest, newOutputRoot)`
accepts the existing `ask_core_connected_result_v1` contract, including native
captures pending independent validation. It verifies the original offline
capture and preparation, retains the actual `plain/core/full` conditions,
capture/plan/task/product/source identities, session and turn identities, usage,
failure/unknown/not-started states and final-output digests. It reads only the
declared task files, verifies every byte against the terminal `after.inputs`
inventory, and saves task-only snapshots in a separate create-once owner-only
capsule. Workspace drift refuses before allocating that capsule. The original
connected-result bytes are retained with their independently held raw digest.
No auth home, CLI image, execution grant or private evaluator is read or issued.

`replayCoreConnectedNormalization(outputRoot, externalDigest)` checks those
saved snapshots and current public source identities without reading original
capture, workspace or auth roots. Missing verification-command evidence stays
`unknown`; a scope check cannot be substituted for an executed test.

`connectCoreNormalizedEvaluator({outputRoot, externalDigest, frozenSourceRoot})`
connects this normalized capture to the original MN public evaluator reference
through the existing `verifyPublicEvaluatorReference`. It validates the exact
original public source closure and inspects its normalized condition contract.
It does not relabel treatments or manufacture sealed execution provenance.

The current original MN reference fixes revision `ab2ce5fe` and 52 public source
files, including the normalizer, normalized schema, evaluator boundary and
terminal-workspace verifier. That original normalized schema supports
`plain/kernel_only/adaptive_ask/full_ask`; `core/full` are rejected. Moreover,
connected capture has no original portfolio run/materialization/selection
authority or sealed verification-command evidence. The production evaluator
re-verifies these roots before accepting a normalized record. Thus the connector
returns typed blockers for those missing authorities and unsupported conditions,
and checks the request's evaluator bundle binding. Private sealed inputs remain
an unresolved prerequisite; no real data grading was performed.

This closes real capture normalization and the original public reference
connection, including original public scoring-input freeze verification through
the existing `verifyPortfolioScoringInputs`, not native scoring readiness. The
original freeze raw digest, reference, policy, requirements, output contract
and admission references are verified together; private inputs are not read.
A separately defined independent
native compatibility authority must bind the new normalized treatment and its
terminal snapshot to the fixed evaluator before any original private-input
read or real grading. The synthetic scoring profile above is never that
authority. The original reference, policy, sealed source and scorer stay fixed.

## Remaining evidence and execution proposal

### Native compatibility work boundary

The already authorized implementation can prepare a review request from the
verified normalized capsule and original public sealed reference. It can bind
the new condition identities, product, task, execution request, terminal task
inventories and original public evaluator/freeze digests, and verify a saved
request by rederiving it. `buildCoreNativeCompatibilityReview` and
`verifyCoreNativeCompatibilityReview` do only this. A caller may retain the
request and its canonical digest separately; these APIs allocate no output,
issue no authority, accept no private-input path and start no processes.
Successful verification means the request matches these public/capture inputs.
It does not verify the independence or truth of a future issuer's statement.

| Remaining boundary | Concrete proposal / decision still required |
| --- | --- |
| Issuer and independence | Select a named human/organization responsible for compatibility admission, separate from the model runner and capture producer. Decide who independently checks its evidence and how the external trust anchor is retained. A caller-supplied digest or `issuer` label alone proves neither authority nor independence. No signing credential or trust registry is configured here. |
| Original run/materialization/selection authority | A separate producer must create fresh records binding run/case/attempt, actual `plain/core/full` identity, original task/freeze, selected candidate, request/raw capture and terminal state. Define a new-condition provenance adapter with explicit owner review. Do not fabricate these records from a completed capture or rewrite original schemas. |
| Verification-command evidence | Define the allowed commands and observer, then capture exact argv/cwd, source/workspace digests, exit/timeout, stdout/stderr digests and terminal epoch under separate permission. An observed scope check or final model message cannot stand in for command execution. |
| Original sealed input binding | The private evaluator owner independently checks private input/manifest against the original reference and freeze, establishes task/grader separation and disjoint roots, and issues a digest-bound admission statement. This requires separate private-read authority; no private bytes belong in the review request or model input. |
| New-condition bridge | Approve an additive compatibility layer binding the actual new normalized condition/terminal authority to the unchanged requirements, scoring policy and evaluator source. Keep legacy validation on the original schemas. Review how the original production evaluator rechecks provenance before admitting this new profile; synthetic authority must remain rejected. |
| Actual execution | After the above bindings are fixed and independently verified, obtain a fresh bounded execution approval. The proposal below retains post-trial token limits that can overshoot; this implementation and the resume instruction authorize no model, CLI, private grading or grant issuance. |

The review request always has `authority_status: not_issued`,
`independence_status: not_verified`, `scoring_ready: false` and
`live_ready: false`. Unknown/missing prerequisites are not inferred from
successful normalization. It closes preparation of the review request only;
native compatibility authority and real evaluator admission remain blocked.

Before any real comparison: freeze the final compatibility head and all exact
source/evaluator/product digests; obtain independently verified original sealed
evaluator inputs, terminal task workspace and command evidence; verify runtime
binary/tool inventory, discovery and permission enforcement; obtain fresh
independent admission and a separate bounded execution authority. The grader's
private read authority must not be reused as the model's authority.

A future proposal may use macOS native Node 24 and a pinned Codex image, one
10-second Full canary with a separate 1,000-token post-trial limit, then one
trial each of plain/core/full in a preselected order, gpt-6.1-sol/medium,
120-second startup and task budgets, 240-second absolute cap and 2-second drain.
The proposed comparison token limits are 50,000 per trial and 150,000 total,
checked after trials and therefore capable of overshoot. Any failure, unknown,
changed binding, boundary violation or threshold stops all later stages; no
retries. This paragraph is a proposal, not execution authorization.

Mac/Ubuntu synthetic checks are distinguished from real Mac, Linux and WSL2
verification. Native Windows entry remains unsupported; Docker is optional
future work. #291's 14 pairs/28 trials and all acceptance criteria are unchanged.
