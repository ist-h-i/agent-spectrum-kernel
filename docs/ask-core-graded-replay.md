# Core grading compatibility and offline replay

IMP-318-GRADED-1 / FVC-318-GRADED-1, revision 1. Upstream: the adopted
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
Failures preserve partial new output; there is no overwrite, retry or resume.

## Remaining evidence and execution proposal

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
