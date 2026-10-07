# Verification Contract: ASK Core Capture Frozen Source Root

- Artifact ID: `verification-ask-core-capture-frozen-source-root@1`
- Artifact type: `verification`
- Upstream refs:
  - User task: merged PR #328 P1, discussion `r4198659677`
  - Source snapshot: `be57bad349ae620d61be38f75337cfdc1b3e6d05` (tree `849c9f231f833c79b9b4a00dc3f8ab09900c0230`)
  - Behavior under proof: `scripts/ask-core-capture-producer.mjs::buildCoreCaptureScoringInputs`
- Selected path: `formal_verification_contract`
- Formal trigger: `state_concurrency_persistence_lifecycle_or_cross_module` — frozen-source authority paths cross the producer/evaluator module boundary.

## Behavior proof obligations

1. With an explicit frozen source root, the scorer root, private-helper root, catalog, policy manifest, scoring policy, admission record, requirement record, output contract, evaluator reference, and freeze manifest resolve beneath that source root. The call's capture/invocation root remains distinct.
2. With no explicit frozen source root, all frozen authority paths continue to resolve beneath the producer's default source root.
3. Building public scoring inputs reads only the public freeze manifest needed to resolve those references. It does not open `privateRoot`, `privateEvaluationRoot`, private evaluation artifacts, invoke a grader, or call a model.
4. A supplied root without its public freeze manifest, a symlinked manifest, and an unsafe relative path fail closed before scorer inputs are returned. The downstream public authority-anchor check rejects changed manifest bytes against the captured digest.
5. Incomplete verification-command evidence continues to refuse sealed evaluator execution.
6. A separate public frozen checkout can be connected and verified using its own source root; tampering with its public source remains rejected.

## Focused checks and required evidence

- `node --test scripts/test-ask-core-capture-producer.mjs`
  - Covers explicit/default roots, all eight frozen authority paths, public-only input assembly, and refusal when verification evidence is incomplete.
- `node --test scripts/test-ask-core-native-connection.mjs`
  - Covers synthetic no-model capture and connection to a separately materialized public frozen source, including public-source tampering refusal.
- Inspect the test output and final diff. Record each exact exit status and test summary; do not infer broader or live-readiness claims from these synthetic checks.

## Insufficient-evidence conditions

- Either command is not run, exits nonzero, or does not execute the named coverage.
- Static assertions are the only evidence for a runtime/path behavior claim.
- A result requires real ASK measurement, Codex CLI, private grader data, auth, or an excluded environment probe.

## Evidence required before a completion claim

- Both focused synthetic commands exit successfully.
- An independent reviewer examines the final diff and exact test results, with no unresolved P1/P2 finding affecting these obligations.
- Any behavior outside these public synthetic checks remains explicitly unverified.
