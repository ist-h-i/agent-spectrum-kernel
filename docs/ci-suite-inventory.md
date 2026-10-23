# CI suite inventory — Issue #433

## Current implementation after PR #440

Verified implementation baseline: main
`331389222488ff296607a3c0b00a0a70b1cde36d`, tree
`05d6939a2cee11f588036277e867b1fda712a40f`. The historical counts below are
stage-specific, not the current total. Validate has **148 registered Node script
invocations**: the 140 inherited from #439 plus eight controls (one plan, one
new plan/receipt regression command, five receipt producers and one gate).
The manual-comparison follow-up adds one unconditional common invocation for its
two lightweight artificial test files, so the current total is **149**. No
workflow or job is added. Local-eval retains **25** registrations. Counts include the preserved conditional
failure diagnostic; they are inventory counts, not a claim every conditional
command executes on a green run. PR #441 synchronized documentation only; the
subsequent cross-workflow change below leaves these Validate/local-eval counts
and their workflow bytes unchanged.

Docs-checks now owns the complete validator, whitespace and CI/control checks;
plan plus five workers feed the fixed six-dependency validate gate. The original
134-command snapshot and table remain historical evidence. The separate
[step preservation fixture](fixtures/ci-full-run-step-inventory.json) records the
107 inherited run blocks from #439 head `ce89336b`, including its failure-only
diagnostic. The active receipt registry also has 107 required descriptors, but
its set excludes that failure-only diagnostic and includes the new plan/receipt
regression step. The manual-comparison follow-up brings the active required
registry to **108** descriptors while preserving every historical fixture block
unchanged. Neither fixture replaces the current workflow as execution
authority.

For the exact #440 hosted proof, single-batch measurements and remaining
consumer-closure/docs-v1 observation limits, see
[the verified shadow state](ci-shadow-and-os-boundaries.md#verified-state-after-pr-440).
Selection remains disabled; an ordinary change to these two CI documents is
outside the closed docs allowlist and therefore proposes full execution.

The single new common command is
`node --test scripts/test-ask-primary-evaluation-start.mjs scripts/test-ask-primary-nine-condition-report.mjs`.
It exercises the CLI through artificial module mocks and saved synthetic JSON;
it starts no real Codex/model/native qualification. The existing batch regression
is not added again. `test-ci-full-run.mjs` checks unique unconditional ownership,
unchanged workers and absence of cross-workflow duplicates. Existing receipt
and strict aggregate rules include the new step automatically. Historical command
and step inventories remain preserved baselines rather than regenerated totals.

## Cross-workflow duplicate reduction

Baseline: main `e54baee215ee613227baba337da13bb8b5268537` after #441.
Context-rollover and verification-completion now use Ubuntu 24.04 and Node
24.19.0, matching Validate/common before equating any calls. All three use
checkout@v5 with full history and the default PR merge ref, repository-root cwd,
and no custom environment on the affected tests. No new workflow or job is
added: the four automatic workflows and eleven checks remain.

| Exact invocation | Sole owner | Removed duplicate calls |
| --- | --- | --- |
| `node scripts/test-session-checkpoint.mjs` | Validate/common | context-rollover: 1 |
| `node scripts/test-epic-admission-work-package-plan.mjs` | Validate/common | context-rollover: 1 |
| `node scripts/test-json-schema-validation.mjs` | Validate/common | context-rollover: 1 |
| `node scripts/test-verification-evidence.mjs` | Validate/common | context-rollover: 1; verification-completion: 1 |
| `node scripts/test-verification-scoped-reuse.mjs` | Validate/common | context-rollover: 1; verification-completion: 1 |
| `node --test scripts/test-verification-reuse-completion.mjs` | verification-completion | context-rollover: 1 |

This removes eight duplicate Node test invocations per full PR run: six from
context-rollover and two from verification-completion. In the original inventory
extractor's units, context-rollover has 2 Node script registrations instead of 8;
verification-completion has 6 instead of 8 (its unchanged conditional validator
and inline result printer are not extra test invocations). Validate remains 148
and local-eval 25. The original table below is historical, not the current total.

The affected tests independently create/clean temporary fixtures or read inline
and canonical fixtures. JSON-schema tests use a unique temporary directory under
the checkout and remove it in `finally`; it is not an input to later suites.
Epic admission's branch/GITHUB_HEAD_REF check still sees the same PR event.
None exports step outputs, environment or a shared fixture consumed by a later
step. There is no stdout/artifact transfer between these calls. Flags and source
revisions are preserved, not replaced by similar-looking tests. Absolute temporary
paths and workflow-specific Actions identifiers are not claimed byte-identical.

Context's unique runtime-boundary/matched-evaluation suite stays. Verification's
measurement-core/false-blocking, paired measurement/handoff, decision-core and
real-Git completion suites stay, as do fixture-provider measurement, its result
summary and always-uploaded bounded JSON artifacts. Both workflows retain their
validators and whitespace checks; triggers, permissions and timeouts stay fixed.

Common's five owners remain unconditional and bound to the existing strict
receipt and fixed validate aggregate. The completion owner remains an
unconditional verification-completion step. Context success alone is insufficient:
completion still requires same-HEAD validate and verification-completion success
plus all other required checks. No protection rule or cross-workflow gate is
changed or added. `test-ci-full-run.mjs` checks exact ownership, flags, pinned
setup and retained unique coverage, with cheap negative fixtures for missing
owners, duplicates, flag/runtime/cwd drift, skipped completion and lost artifacts.

This source-level reduction does not establish a hosted elapsed-time or cost
improvement. Pinning the former floating runtime is part of the change; earlier
floating-runtime durations are not an equivalent before/after comparison.
Hosted verification of this follow-up is not yet recorded. Mac boundaries,
selective execution, consumer closure and real evaluation are unchanged.

## Local fixture and producer follow-up after #443

This local candidate preserves the four workflows and the 148 Validate / 25
local-eval registrations. No new job, selection mode or verification cache is
introduced. It combines two independent changes:

- The personal-pair synthetic engineering template reads the existing aggregate
  fixture's input-building result directly, instead of publishing and fully
  reverifying result-set, repetition, paired and aggregate reports just to read
  an input JSON. The original `collect()` path and aggregate regressions remain;
  report publication is asserted to preserve input bytes. Actual pair producer,
  normalized, safety and saved-result checks remain. A paired local comparison
  across all 24 fixtures observed 65.79s versus 2.81s in total, with every template
  byte-identical and no aggregate authority returned by the input-only path.
- Saved pair verification uses its existing producer scope's verified object for
  run/plan/full-block checks before normalized verification. This replaces an
  immediate standalone verification followed by the same scope-entry verification.
  The later engineering scope and recursive drift rechecks remain. Explicit
  outer producer calls per complete saved role/pass become 3→2; the current
  catalog24 roundtrip's two complete passes over 48 roles become 288→192 calls.
  These counts exclude internal additional checks and are static path counts.

A separate physical checkout with independent Git metadata measured only the
producer change, without the template change: the same one-fixture/two-role
saved-pair regression passed before 29.32s / 29.06s and after 25.93s / 25.98s in ABBA
order on Darwin / Node 24.19.0, with profiling enabled equally. The observed mean
reduction was 3.24s (11.1%) for that limited test, n=2 per version. The initial
profile's removed direct-verification branch accounted for about 2.79s of samples.
This is local evidence, not a hosted CI reduction or an estimate for catalog24.
Source pins differ with candidate bytes; each process creates its own artifacts.

The #443 hosted Mac personal-CLI group took 2362.64s; overlapping catalog24/v8,
v7 and unattended tests took 1373.37s, 1317.25s and 987.80s respectively. Their
internal producer timings were not logged, and these durations cannot be added.
The full local profile and two earlier fixture-suite sessions have unknown
outcomes after transport loss. They were not stopped, restarted or credited as
successful; the new isolated limited runs provide separate evidence only.

Foreign blocks, missing grading provenance, criterion transplants and later
producer-byte drift must reject, with inactive authority after return/failure.
Nested refusal must leave the owning outer scope active until it exits; thrown
callbacks and thenables must not leak scope. Source-build/nested refusal is
retained, though which rejecting error wins first can differ. There is no
cross-role/command producer reuse or actual model/private-admission claim.

The earlier `--no-local` clone-overhead candidate remains outside this combined
diff; its subsecond measurement alone did not justify another hosted batch.
Full integrated/hosted timing and publication remain pending. Historical
inventory below is retained unchanged.

## Historical stage-1 baseline

Source baseline: `a6d71c6c81973f585fe1aa27e4524a5a62889846`.
The command inventory also includes the additive PR #427 registrations from
`2e19d583f885e1eedfab7429c0314dfd9a502414`: V10 schema, runtime binding,
runtime lineage, and the V2 build archive. Its `source_head` identifies that
134-command input; local-eval commands and the strict aggregate are preserved.
The table below is the historical stage-1 command-ownership snapshot, including
unchanged workflows. Subsequent registrations are recorded in the historical deltas below; the
current registration count and ownership are summarized first.
Manual model workflows remain manual; presence is not execution authorization.
Fake/synthetic checks are infrastructure evidence, not real LLM quality.

## Historical delta from main 7a44f734

The table below remains the historical stage-1 snapshot. At that stage ownership differed
as described in [the shadow/OS inventory](ci-shadow-and-os-boundaries.md):
Mac omits build-successor-v2 and unattended-policy (existing Validate Ubuntu
owners), and kernel-principles gets a separate Ubuntu-only local-eval step.
Every other Mac file/flag and historical working-directory invocation remains.
Validate/common additionally tests and records the shadow classifier; its output
never selected execution. The four-dependency aggregate was unchanged at that
stage; #440 later introduced the six-dependency gate described below.
After both source integrations at main `318ad1fc`, common also runs
`node --test scripts/test-ask-personal-evolution-trace.mjs` and
`node --test scripts/test-codex-metrics-collector.mjs` unconditionally.
The then-current main `0b94087b` also retains #427's V10 schema/runtime/lineage commands
and build-review-archive file. The composed workflow has 139 inventoried Node
script invocations:
the unchanged 134-command main inventory plus five explicitly allowed CI additions
(coverage guard, classifier test, shadow record and the two focused commands).
Per-command multiset checks prevent loss and duplicate registration.

## Historical lifecycle addition — PR #439 after PR #438

Main `61e32104` includes the runtime/performance evidence connection. Its follow-up
adds exactly one command to Validate/common (Ubuntu 24.04) and the same command to
the Mac-only local-eval step (macOS 15), both using Node 24.19.0:

`node --test scripts/test-ask-primary-performance-execution.mjs scripts/test-ask-primary-performance-lifetime.mjs`

The tests use artificial clocks/transports and ordinary owned Node children,
process groups and files. Both OS owners matter for termination and inode checks;
they do not run Codex, a model or the native sandbox probe. At #439 the Validate
inventory was 140 Node script invocations (preceding 139 plus one); local-eval had 25
(preceding 24 plus the explicit Mac owner).
The closed coverage guard preserves every preceding invocation/flag and the
strict aggregate. The historical 134-command fixture/table remains unchanged.
Native qualification remains unavailable until genuine runtime evidence exists.

## Dependencies and OS boundaries

Validate repository has an independent plan job and five full-run workers:
independent-local-clone, docs-checks, common, repository-tests and personal-cli.
Each uses a full-history checkout, Node 24.19.0 and Ubuntu 24.04. Workers do not
wait on the plan or consume another worker's output; a plan failure cannot
suppress full verification. Docs-checks owns the complete repository validator,
its unchanged failure-only diagnostic, whitespace and existing CI/control checks.
Common retains the remaining regressions, fixed source fetches and frozen
wrappers in their existing relative order.

Fixed validate has its own checkout/runtime and always evaluates six predecessors:
plan plus all five workers. It requires each exact job result to be success,
recomputes the plan, and checks the complete worker receipts against checkout
identity, run/attempt, runtime, policy and registry. Missing/extra/stale/malformed
plans or receipts and required job failure/skip/cancel are rejected. The proposed
docs profile does not control execution; all five workers remain required.

Both local-eval matrix entries retain host preflight, synthetic process lifecycle,
timeouts, path/permission checks, historical-root isolation, immutable Full/Core
preparation, receiver, native boundaries, controller attribution and capture
producer checks. At stage 1, all Mac test-file invocations remained. Eleven current-HEAD
Ubuntu invocations are instead owned by common/personal-cli: authority-v2,
build-successor-v2, review-archive-v2-scope, unsafe-actions-v8, personal CLI,
catalog24, catalog24-v8, unattended-policy, unattended, source-reviewer and
synthetic-json-pilot. Flags match. Synthetic JSON is split from its former Mac
multi-file invocation; per-file coverage is preserved. Historical working-directory
suites are never equated to current HEAD.

At #440/#441, context-rollover and verification-completion retained floating
Node 24 and Ubuntu latest; they were not treated as equivalent to pinned Node/OS.
The cross-workflow slice above pins those runtimes before removing eight audited
duplicate calls. No path filters, model triggers, concurrency cancellation,
protection or permissions changes are introduced.

## Command inventory

Exact original commands for changed workflows are preserved in
[ci-full-run-inventory.json](fixtures/ci-full-run-inventory.json). The focused
regression checks validate commands and local-eval per-file flags/coverage.
Shell setup, public source fetches and working-directory prerequisites remain
authoritative in the workflow files. Manual workflows in this table are unchanged.

| Workflow / job | Suite | Command |
| --- | --- | --- |
| `context-rollover.yml` / `context-rollover` | Test runtime boundary and matched evaluation | `node --test scripts/test-context-rollover.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve checkpoint and admission authority | `node scripts/test-session-checkpoint.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve checkpoint and admission authority | `node scripts/test-epic-admission-work-package-plan.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve evidence and current coverage boundaries | `node scripts/test-verification-evidence.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve evidence and current coverage boundaries | `node scripts/test-verification-scoped-reuse.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve evidence and current coverage boundaries | `node --test scripts/test-verification-reuse-completion.mjs` |
| `context-rollover.yml` / `context-rollover` | Validate schemas and repository | `node scripts/test-json-schema-validation.mjs` |
| `context-rollover.yml` / `context-rollover` | Validate schemas and repository | `node scripts/validate-repo.mjs` |
| `issue291-measured.yml` / `verify` | Validate existing synthetic successor boundaries | `node --test scripts/test-ask-benchmark-prompt-successor.mjs scripts/test-ask-benchmark-prompt-successor-report.mjs scripts/test-ask-benchmark-prompt-successor-input-guards.mjs scripts/test-ask-benchmark-prompt-successor-fake.mjs` |
| `issue291-measured.yml` / `verify` | Verify preparation workflow packaging | `node --test scripts/test-ask-benchmark-prompt-successor-workflow.mjs` |
| `issue291-measured.yml` / `verify` | Verify successor usage and collection control | `node --test scripts/test-ask-benchmark-prompt-successor-usage.mjs scripts/test-ask-benchmark-prompt-successor-control.mjs` |
| `issue291-measured.yml` / `verify` | Verify measured recovery state transitions | `node --test scripts/test-ask-benchmark-prompt-successor-measured-recovery.mjs` |
| `issue291-measured.yml` / `verify` | Verify native successor transport and normalized usage | `node --test scripts/test-ask-benchmark-prompt-successor-execution.mjs` |
| `issue291-measured.yml` / `verify` | Verify native collection and existing scoring boundaries | `node --test scripts/test-ask-benchmark-prompt-successor-scoring.mjs` |
| `local-eval.yml` / `fake` | Observe host prerequisites without Codex or auth | `node scripts/ask-local-eval.mjs preflight` |
| `local-eval.yml` / `fake` | Primary authority profile and static resource boundaries (no workers) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-authority-v2.mjs scripts/test-ask-primary-build-successor-v2.mjs scripts/test-ask-review-archive-v2-scope.mjs scripts/test-ask-primary-unsafe-actions-v8.mjs` |
| `local-eval.yml` / `fake` | Nine-primary-fixture personal roundtrip (fake provider/runner/grading only) | `node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-primary-loop.mjs` |
| `local-eval.yml` / `fake` | Personal user command loop and resume (fake dispatch only) | `node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs scripts/test-ask-personal-evolution-cli-catalog24.mjs scripts/test-ask-personal-evolution-cli-catalog24-v8.mjs scripts/test-ask-personal-evolution-unattended-policy.mjs scripts/test-ask-personal-evolution-unattended.mjs` |
| `local-eval.yml` / `fake` | Personal candidate generation adapter (fake transport only) | `node --test scripts/test-ask-personal-evolution-codex-generation.mjs` |
| `local-eval.yml` / `fake` | Personal source reviewer adapter (fake transport only) | `node --test scripts/test-ask-personal-evolution-source-reviewer.mjs` |
| `local-eval.yml` / `fake` | Fake lifecycle and failure regressions (no model calls) | `node --test scripts/test-ask-local-eval.mjs scripts/test-ask-local-codex.mjs scripts/test-ask-local-codex-time-budget.mjs` |
| `local-eval.yml` / `fake` | Synthetic JSON pilot (Ubuntu covered by Validate repository) | `node --test scripts/test-ask-synthetic-json-pilot.mjs` |
| `local-eval.yml` / `fake` | User repository comparison preparation and execution (fake runner only) | `node --test scripts/test-kernel-principles.mjs scripts/test-ask-user-comparison-prepare.mjs scripts/test-ask-user-comparison.mjs scripts/test-ask-user-comparison-logs.mjs scripts/test-ask-user-comparison-unattended.mjs scripts/test-codex-output-observer.mjs` |
| `local-eval.yml` / `fake` | Single-shot lifecycle regressions (entirely fake I/O) | `node --test scripts/test-ask-user-comparison-single-shot.mjs` |
| `local-eval.yml` / `fake` | Historical context isolation boundaries (current HEAD) | `node --test scripts/test-historical-full-test-root.mjs` |
| `local-eval.yml` / `fake` | Prepare isolated immutable Full test context | `node scripts/prepare-historical-full-test-root.mjs "$RUNNER_TEMP/ask-historical-full" > "$RUNNER_TEMP/ask-historical-path"` |
| `local-eval.yml` / `fake` | Full reference closure and three-arm synthetic protocol (no Codex) | `node --test scripts/test-ask-local-full-package.mjs scripts/test-ask-local-three-arm.mjs scripts/test-ask-local-three-arm-qualification.mjs` |
| `local-eval.yml` / `fake` | Opt-in shared core, Full projections and offline comparison (no Codex) | `node scripts/generate-ask-core-bundle.mjs --check` |
| `local-eval.yml` / `fake` | Opt-in shared core, Full projections and offline comparison (no Codex) | `node --test scripts/test-ask-core-bundle.mjs` |
| `local-eval.yml` / `fake` | Mac native adapter proposal and task prequalification (synthetic only) | `node --test scripts/test-ask-core-native-preparation.mjs` |
| `local-eval.yml` / `fake` | Fixed synthetic process receiver and protected offline results (no native CLI) | `node --test scripts/test-ask-core-native-receiver.mjs` |
| `local-eval.yml` / `fake` | Exact authority lifecycle, new-session adapter and scratch integration (synthetic only) | `node --test scripts/test-ask-core-native-boundaries.mjs scripts/test-ask-core-native-connection.mjs` |
| `local-eval.yml` / `fake` | Core condition grading authority and scored offline replay (synthetic only) | `node scripts/generate-ask-core-grading-schemas.mjs --check` |
| `local-eval.yml` / `fake` | Core condition grading authority and scored offline replay (synthetic only) | `node scripts/test-ask-benchmark-portfolio-score.mjs --core-grading-only` |
| `local-eval.yml` / `fake` | Native compatibility record bindings without controller trust (synthetic only) | `node --test scripts/test-ask-core-native-compatibility-provenance.mjs` |
| `local-eval.yml` / `fake` | Owner-attributed controller context boundaries (synthetic only) | `node --test scripts/test-ask-core-controller-attribution.mjs scripts/test-ask-core-evaluator-dependency-closure.mjs` |
| `local-eval.yml` / `fake` | Saved capture to original normalizer and terminal scoring inputs (synthetic only) | `node --test scripts/test-ask-core-capture-producer.mjs` |
| `validate-calibration-input-package.yml` / `validate` | Check syntax and public input package boundaries | `node --check scripts/ask-benchmark-calibration-input-package.mjs` |
| `validate-calibration-input-package.yml` / `validate` | Check syntax and public input package boundaries | `node --test scripts/test-ask-benchmark-calibration-input-package.mjs` |
| `validate.yml` / `common` | Verify CI coverage preservation and strict aggregate | `node --test scripts/test-ci-full-run.mjs` |
| `validate.yml` / `common` | Run ASK setup planning and exact apply tests | `node scripts/test-ask-setup.mjs` |
| `validate.yml` / `common` | Run model-free install and recovery release smoke | `node scripts/test-release-install-recovery.mjs` |
| `validate.yml` / `common` | Run public first-workflow preparation regressions | `node --test scripts/test-first-workflow-preparation.mjs` |
| `validate.yml` / `common` | Run offline pragmatic evaluation report regressions | `node --test scripts/test-ask-pragmatic-evaluation-report.mjs` |
| `validate.yml` / `common` | Verify prospective performance probe (synthetic controls only) | `node --test scripts/test-ask-benchmark-pf-performance-probe.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-execution-input.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-public-runtime-v2.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-protocol-catalog-probe.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-stderr-diagnostics.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-sqlite-startup-diagnostics-v3.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-scoring-version.mjs scripts/test-ask-primary-processing-source.mjs scripts/test-ask-primary-resource-authority-writers.mjs scripts/test-ask-primary-runner-async-local-storage.mjs scripts/test-ask-primary-evaluation-private-grading.mjs scripts/test-ask-primary-evaluation-grading.mjs scripts/test-ask-benchmark-frozen-authority-modes.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-saved-scoring.mjs` |
| `validate.yml` / `common` | Qualify prospective rule-batch contract and frozen preparation (model-free) | `node --test scripts/test-rule-batch-contract-v2.mjs scripts/test-rule-batch-comparison-preparation.mjs` |
| `validate.yml` / `common` | Run UI harness and Skill-reference regressions | `node --test scripts/test-codex-skill-reference-preflight.mjs scripts/test-skill-assets.mjs scripts/test-skill-reference-canonical.mjs scripts/test-ui-ux-adapter-assets.mjs docs/fixtures/ui-ux-design/fixture-state.test.mjs scripts/test-prompt-v2-historical-renderer.mjs` |
| `validate.yml` / `common` | Run dependency-free scenario visual review regressions | `node --test scripts/test-scenario-visual-review.mjs` |
| `validate.yml` / `common` | Check adapter runtime bundle freshness | `node scripts/adapter-runtime-bundle.mjs > "$RUNNER_TEMP/ask-expected-runtime-bundle.json"` |
| `validate.yml` / `common` | Verify bounded full-target streaming snapshots (artificial only) | `node --test scripts/test-target-snapshot-streaming.mjs` |
| `validate.yml` / `common` | Rehearse parent rollback and return to pre-install absence (artificial only) | `node --test scripts/test-personal-prompt-preinstall-return.mjs` |
| `validate.yml` / `common` | Run synthetic JSON pilot fake-only regressions | `node --test scripts/test-ask-synthetic-json-pilot.mjs` |
| `validate.yml` / `common` | Run portfolio aggregate v2 component sensitivity tests | `node scripts/test-ask-benchmark-portfolio-aggregate-result-v2.mjs` |
| `validate.yml` / `common` | Run portfolio consumer sensitivity detail tests | `node scripts/test-ask-benchmark-portfolio-consumer-report.mjs` |
| `validate.yml` / `common` | Run nondegenerate high-impact sensitivity and exact Evolution tests | `node scripts/test-ask-benchmark-portfolio-high-impact-sensitivity.mjs` |
| `validate.yml` / `common` | Run nondegenerate high-impact sensitivity and exact Evolution tests | `node scripts/test-evolution-loop-integration.mjs --high-impact-population` |
| `validate.yml` / `common` | Run successor snapshot and source-session regressions (current HEAD) | `node --test scripts/test-ask-benchmark-source-session.mjs scripts/test-successor-process-state.test.mjs scripts/test-frozen-evaluator-fixture.test.mjs` |
| `validate.yml` / `common` | Run successor snapshot and source-session regressions (current HEAD) | `node --test scripts/test-ask-benchmark-calibration-source.mjs scripts/test-ask-benchmark-prompt-successor.mjs scripts/test-ask-benchmark-prompt-successor-delivery.mjs scripts/test-ask-benchmark-prompt-successor-native.mjs scripts/test-ask-benchmark-prompt-successor-report.mjs scripts/test-ask-benchmark-prompt-successor-scoring-inputs.mjs` |
| `validate.yml` / `common` | Run successor snapshot and source-session regressions (current HEAD) | `node --test scripts/test-ask-benchmark-prompt-successor-integration.mjs scripts/test-ask-benchmark-successor-input-snapshot.mjs scripts/test-ask-benchmark-evaluator-root-manifest.mjs` |
| `validate.yml` / `common` | Run bounded successor scoring authority regressions (current HEAD) | `node --test scripts/test-ask-benchmark-prompt-successor-input-guards.mjs` |
| `validate.yml` / `common` | Run bounded successor scoring authority regressions (current HEAD) | `node --test scripts/test-ask-benchmark-prompt-successor-scoring-contract.mjs` |
| `validate.yml` / `common` | Run session checkpoint and resume tests | `node scripts/test-session-checkpoint.mjs` |
| `validate.yml` / `common` | Validate repository consistency | `node scripts/validate-repo.mjs` |
| `validate.yml` / `common` | Show generated validation report diff on failure | `node scripts/validate-repo.mjs --write-report` |
| `validate.yml` / `common` | Run baseline semantic review route contract tests | `node scripts/test-review-route.mjs` |
| `validate.yml` / `common` | Run Execution Envelope record contract tests | `node scripts/test-execution-envelope-record.mjs` |
| `validate.yml` / `common` | Run installed Codex runner Execution Envelope conformance tests | `node scripts/test-codex-runner-execution-envelope-conformance.mjs` |
| `validate.yml` / `common` | Run managed JSON Schema validation tests | `node scripts/test-json-schema-validation.mjs` |
| `validate.yml` / `common` | Run exact Codex risk approval tests | `node scripts/test-codex-risk-approval.mjs` |
| `validate.yml` / `common` | Run review decision matrix tests | `node scripts/test-review-decision-matrix.mjs` |
| `validate.yml` / `common` | Run claim evidence status contract tests | `node scripts/test-claim-evidence-status.mjs` |
| `validate.yml` / `common` | Run one-task Skill effectiveness outcome contract tests | `node scripts/test-skill-effectiveness-outcome.mjs` |
| `validate.yml` / `common` | Run verification proof policy contract tests | `node scripts/test-verification-proof-policy.mjs` |
| `validate.yml` / `common` | Run autonomous development control tests | `node scripts/test-ask-autonomous-development.mjs` |
| `validate.yml` / `common` | Run epic admission and Work Package Plan contract tests | `node scripts/test-epic-admission-work-package-plan.mjs` |
| `validate.yml` / `common` | Run generic content-addressed store tests | `node scripts/test-content-addressed-store.mjs` |
| `validate.yml` / `common` | Run Asset Registry contract tests | `node scripts/test-asset-registry.mjs` |
| `validate.yml` / `common` | Check the exact candidate-only Asset Registry sample | `node scripts/asset-registry-samples.mjs --check` |
| `validate.yml` / `common` | Run evidence-conditioned Portfolio Manager contract tests | `node scripts/test-portfolio-manager.mjs` |
| `validate.yml` / `common` | Run evidence-conditioned Portfolio Manager contract tests | `node --test scripts/test-portfolio-subscription-policy.mjs` |
| `validate.yml` / `common` | Check the exact Portfolio Manager sample | `node scripts/portfolio-manager-samples.mjs --check` |
| `validate.yml` / `common` | Run governed Evolution contract tests | `node scripts/test-evolution-loop.mjs` |
| `validate.yml` / `common` | Run governed Evolution full-closure integration tests | `node scripts/test-evolution-loop-integration.mjs` |
| `validate.yml` / `common` | Verify opt-in Prompt repetition recommendation bridge (artificial only) | `node --experimental-test-module-mocks --test scripts/test-personal-prompt-repetition-statistics.mjs scripts/test-personal-prompt-repetition-evaluation.mjs scripts/test-personal-prompt-repetition-driver.mjs` |
| `validate.yml` / `common` | Run personal observation and generated candidate contracts (model-free) | `node --test scripts/test-ask-personal-evolution-observation.mjs scripts/test-ask-personal-evolution.mjs scripts/test-ask-personal-evolution-generation.mjs scripts/test-ask-personal-evolution-generation-connector.mjs scripts/test-ask-personal-evolution-saved-results-mode.mjs scripts/test-ask-personal-evolution-primary-pair.mjs scripts/test-ask-personal-source-install.mjs scripts/test-ask-personal-prompt-runtime-v2.mjs scripts/test-personal-prompt-target-application.mjs scripts/test-personal-prompt-codex-handover.mjs scripts/test-personal-prompt-owner-manual-recovery.mjs scripts/test-codex-installer-preflight-order.mjs` |
| `validate.yml` / `common` | Verify real personal source reviewer contract (fake transport only) | `node --test scripts/test-ask-personal-evolution-source-reviewer.mjs` |
| `validate.yml` / `common` | Check the exact governed Evolution sample | `node scripts/evolution-loop-samples.mjs --check` |
| `validate.yml` / `common` | Run portfolio catalog tests | `node scripts/test-ask-benchmark-portfolio-catalog.mjs` |
| `validate.yml` / `common` | Run portfolio policy tests | `node scripts/test-ask-benchmark-portfolio-policy.mjs` |
| `validate.yml` / `common` | Run prospective task evidence partial readout tests (model-free) | `node --test scripts/test-ask-task-evidence-profile.mjs` |
| `validate.yml` / `common` | Run prospective task evidence partial readout tests (model-free) | `node scripts/test-ask-benchmark-portfolio-result-set.mjs --task-evidence-readout-only` |
| `validate.yml` / `common` | Run portfolio design pre-admission tests | `node scripts/test-ask-benchmark-design-admission.mjs` |
| `validate.yml` / `common` | Run portfolio independent design review tests | `node scripts/test-ask-benchmark-design-review.mjs` |
| `validate.yml` / `common` | Run portfolio admission decision overlay tests | `node scripts/test-ask-benchmark-admission-decision.mjs` |
| `validate.yml` / `common` | Guard admitted fixture invariance | `node scripts/test-ask-benchmark-admitted-fixture-invariance.mjs` |
| `validate.yml` / `common` | Run general benchmark tests | `node scripts/test-ask-benchmark.mjs` |
| `validate.yml` / `common` | Run adaptive portfolio execution tests | `node scripts/test-ask-benchmark-execution.mjs` |
| `validate.yml` / `common` | Run admitted portfolio propagation preparation tests | `node scripts/test-ask-benchmark-admission-propagation.mjs` |
| `validate.yml` / `common` | Run verification command evidence contract tests | `node scripts/test-ask-benchmark-command-evidence.mjs` |
| `validate.yml` / `common` | Verify read-only saved primary command capture | `node --test scripts/test-ask-primary-saved-command-capture.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v2 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v3 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v4 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v5 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v6 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --evaluation-v7 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --evaluation-v8 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-unsafe-actions-v8.mjs scripts/test-ask-primary-v8-resource-closure.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-classification-v7.mjs scripts/test-ask-primary-runtime-shell-v7.mjs scripts/test-ask-primary-evaluation-correctness-v7.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-registered-fixture-v7.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-authority-v2.mjs scripts/test-ask-primary-build-successor-v2.mjs scripts/test-ask-review-archive-v2-scope.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-evidence-v3.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-evidence-v4.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-discovery-grammar-v9.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --evaluation-v9 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-evidence-v9.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-literal-word-v5.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-auxiliary-shell-v6.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-evidence-recognition-v2.mjs scripts/test-ask-review-target-requirement-v2.mjs` |
| `validate.yml` / `common` | Verify literal body and review target diagnostics (no execution) | `node --test scripts/test-ask-saved-command-body-observation.mjs scripts/test-ask-review-target-requirement.mjs` |
| `validate.yml` / `common` | Verify bounded private runtime observation transport | `node --test scripts/test-ask-benchmark-runtime-observation.mjs` |
| `validate.yml` / `common` | Run verification evidence exact-reuse tests | `node scripts/test-verification-evidence.mjs` |
| `validate.yml` / `common` | Run verification scoped reuse and coverage tests | `node scripts/test-verification-scoped-reuse.mjs` |
| `validate.yml` / `common` | Run adaptive portfolio normalized result tests | `node scripts/test-ask-benchmark-normalized-results.mjs` |
| `validate.yml` / `common` | Run terminal inventory protocol ordering regressions | `node --test scripts/test-ask-benchmark-terminal-inventory-order.mjs` |
| `validate.yml` / `common` | Run evaluator isolation boundary tests | `node scripts/test-ask-benchmark-evaluator-boundary.mjs` |
| `validate.yml` / `common` | Run build-option fixture contract tests | `node scripts/test-ask-benchmark-mn-build-option-update.mjs` |
| `validate.yml` / `common` | Run schema-field public source tests (current HEAD) | `node --test scripts/test-ask-benchmark-mn-schema-field-source.mjs` |
| `validate.yml` / `common` | Run frontend-default public source tests (current HEAD) | `node --test scripts/test-ask-benchmark-mn-frontend-default-source.mjs` |
| `validate.yml` / `common` | Run practice-frequency public source tests (current HEAD) | `node --test scripts/test-ask-benchmark-pf-api-pagination-source.mjs scripts/test-ask-benchmark-pf-frontend-async-source.mjs scripts/test-ask-benchmark-pf-ci-cache-source.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node --test scripts/test-ask-benchmark-prepare-capability.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-pf-api-pagination.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-pf-frontend-async.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-pf-ci-cache.mjs` |
| `validate.yml` / `common` | Run schema-field fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-schema-field-alignment.mjs` |
| `validate.yml` / `common` | Run frontend-default fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-frontend-default-fix.mjs` |
| `validate.yml` / `common` | Run documentation/config fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-doc-config-correction.mjs` |
| `validate.yml` / `common` | Run focused regression fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-focused-regression-test.mjs` |
| `validate.yml` / `common` | Run CI-evidence review fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-ci-evidence-gap.mjs` |
| `validate.yml` / `common` | Run accessibility interaction review fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-accessibility-interaction-review.mjs` |
| `validate.yml` / `common` | Run data migration handoff fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-data-migration-handoff.mjs` |
| `validate.yml` / `common` | Run frontend state review fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-frontend-state-review.mjs` |
| `validate.yml` / `common` | Run IaC rollback design fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-iac-rollback-design.mjs` |
| `validate.yml` / `common` | Run performance investigation fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-performance-investigation.mjs` |
| `validate.yml` / `common` | Run CI-evidence review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-ci-evidence-gap-review-archive.mjs` |
| `validate.yml` / `common` | Run accessibility interaction review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-accessibility-interaction-review-review-archive.mjs` |
| `validate.yml` / `common` | Run data migration handoff review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-data-migration-handoff-review-archive.mjs` |
| `validate.yml` / `common` | Run frontend state review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-frontend-state-review-archive.mjs` |
| `validate.yml` / `common` | Run IaC rollback design review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-iac-rollback-design-review-archive.mjs` |
| `validate.yml` / `common` | Run performance investigation review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-performance-investigation-review-archive.mjs` |
| `validate.yml` / `common` | Run evaluator-authority integration contract tests | `node scripts/test-ask-benchmark-portfolio-evaluator-result.mjs` |
| `validate.yml` / `common` | Run portfolio raw engineering result score tests | `node scripts/test-ask-benchmark-portfolio-score.mjs` |
| `validate.yml` / `common` | Run portfolio engineering result-set tests | `node scripts/test-ask-benchmark-portfolio-result-set.mjs` |
| `validate.yml` / `common` | Run portfolio repetition report tests | `node scripts/test-ask-benchmark-portfolio-repetition-report.mjs` |
| `validate.yml` / `common` | Run portfolio paired comparison report tests | `node scripts/test-ask-benchmark-portfolio-paired-comparison-report.mjs` |
| `validate.yml` / `common` | Run portfolio aggregate result tests | `node scripts/test-ask-benchmark-portfolio-aggregate-result.mjs` |
| `validate.yml` / `common` | Run portfolio directional outcome report tests | `node scripts/test-ask-benchmark-portfolio-directional-outcome-report.mjs` |
| `validate.yml` / `common` | Run portfolio mechanism observation scorecard tests | `node scripts/test-ask-benchmark-portfolio-mechanism-scorecard.mjs` |
| `validate.yml` / `common` | Run legacy calibration migration tests | `node scripts/test-ask-benchmark-portfolio-legacy-calibration-migration.mjs` |
| `validate.yml` / `common` | Run Prompt v2 preregistration contract tests | `node scripts/test-ask-benchmark-prompt-v2.mjs` |
| `validate.yml` / `common` | Run Prompt v2 preregistration authority fixture tests | `node scripts/test-prompt-v2-preregistration-samples.mjs` |
| `validate.yml` / `common` | Check Prompt v2 preregistration authority fixture freshness | `node scripts/prompt-v2-preregistration-samples.mjs --check` |
| `validate.yml` / `repository-tests` | Run repository validation tests | `node scripts/test-validate-repo.mjs` |
| `validate.yml` / `personal-cli` | Verify personal CLI and unstarted preparation recovery (model-free) | `node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs scripts/test-ask-personal-evolution-cli-catalog24.mjs scripts/test-ask-personal-evolution-cli-catalog24-v8.mjs scripts/test-ask-personal-evolution-cli-recovery.mjs scripts/test-ask-personal-evolution-unattended-policy.mjs scripts/test-ask-personal-evolution-unattended.mjs scripts/test-ask-personal-evolution-rejection.mjs` |
| `verification-completion.yml` / `verification-completion` | Validate repository consistency before fixture suites | `node scripts/validate-repo.mjs --write-report` |
| `verification-completion.yml` / `verification-completion` | Run runtime measurement and provider boundary tests | `node --test scripts/test-verification-reuse-measurement-core.mjs scripts/test-verification-reuse-false-blocking.mjs` |
| `verification-completion.yml` / `verification-completion` | Run paired measurement and handoff integration tests | `node --test scripts/test-verification-reuse-measurement.mjs` |
| `verification-completion.yml` / `verification-completion` | Measure public fixture without model credentials | `node scripts/verification-reuse-measurement.mjs --provider fixture --repetitions 2 --output "$RUNNER_TEMP/verification-reuse-measurement" > /dev/null` |
| `verification-completion.yml` / `verification-completion` | Run decision-point protocol and accounting tests | `node --test scripts/test-verification-decision-core.mjs` |
| `verification-completion.yml` / `verification-completion` | Run real-Git multirevision and completion tests | `node --test scripts/test-verification-reuse-completion.mjs` |
| `verification-completion.yml` / `verification-completion` | Preserve exact and scoped evidence compatibility | `node scripts/test-verification-evidence.mjs` |
| `verification-completion.yml` / `verification-completion` | Preserve exact and scoped evidence compatibility | `node scripts/test-verification-scoped-reuse.mjs` |


The public-verification sandbox request/receipt regressions are appended once to
the existing Local eval fake comparison matrix command. Mac checks only construct
requests and use artificial transports; Linux records the explicit platform skip.
No native sandbox, model, new job or workflow is started by those regressions.
The historical inventory remains unchanged; the CI test accounts explicitly for
this one additional file while retaining all earlier coverage.
