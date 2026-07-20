# ASK Comparative Benchmark

This directory contains the preregistered Checkpoint B comparison for Issue #171. It compares the same review and implementation fixtures under three instruction conditions:

- `plain`: repository and task context only;
- `kernel_only`: the canonical root `AGENTS.md` only;
- `full_ask`: the Kernel plus the current projected ASK skills and contracts.

Raw prompts, full model output, full command output, and temporary source copies stay in an operator-selected run directory outside the repository. Checked-in results contain normalized counts, hashes, controlled runtime variables, limitations, and decisions only.

## Commands

```bash
node scripts/ask-benchmark.mjs validate
node scripts/ask-benchmark.mjs prepare --output /tmp/ask-benchmark-checkpoint-b --seed checkpoint-b-2026-07-12
node scripts/ask-benchmark.mjs run --run-dir /tmp/ask-benchmark-checkpoint-b --agent-bin /absolute/path/to/codex
node scripts/ask-benchmark.mjs score --run-dir /tmp/ask-benchmark-checkpoint-b --output benchmarks/results/checkpoint-b-2026-07-12.json
```

Run `prepare` only after [protocol.md](protocol.md) and [checkpoint-b.config.json](checkpoint-b.config.json) are reviewed and frozen. Do not inspect condition outputs before the blinded cases have all completed. A human evaluator may add human-effort fields to a copy of the normalized result; unavailable measurements remain `null`, never `0`.

Checkpoint C must use a new config and result after #179. Do not overwrite the Checkpoint B baseline or combine architecture, model, repository, CLI, or adapter changes into one comparison variable.

The measured Checkpoint B summary is [results/checkpoint-b-report.md](results/checkpoint-b-report.md). The corresponding normalized result is `results/checkpoint-b-2026-07-12.json`; [report-template.md](report-template.md) is the reusable Checkpoint B/C report structure.

## Difficulty-expanded Checkpoint B2

B2 preserves the original B baseline and adds four fixtures under `fixtures/checkpoint-b2/`: medium-hard and hard review tasks plus medium-hard and hard implementation tasks. Agent-visible inputs are hash-pinned; evaluator oracles, hidden tests, and reference patches remain outside prepared case workspaces.

```bash
node scripts/ask-benchmark.mjs validate --config benchmarks/checkpoint-b2.config.json
node scripts/ask-benchmark.mjs prepare --config benchmarks/checkpoint-b2.config.json --output /tmp/ask-benchmark-checkpoint-b2 --seed checkpoint-b2-2026-07-12
node scripts/ask-benchmark.mjs run --config benchmarks/checkpoint-b2.config.json --run-dir /tmp/ask-benchmark-checkpoint-b2 --agent-bin /absolute/path/to/codex
node scripts/ask-benchmark.mjs score --config benchmarks/checkpoint-b2.config.json --run-dir /tmp/ask-benchmark-checkpoint-b2 --output benchmarks/results/checkpoint-b2-2026-07-12.json
```

See [protocol-b2.md](protocol-b2.md) for frozen quality-gain thresholds. B2 can establish value only for its fixtures and controlled runtime; replication remains required before architecture-wide conclusions.

The measured B2 summary is [results/checkpoint-b2-report.md](results/checkpoint-b2-report.md); the reproducible automated score is `results/checkpoint-b2-2026-07-12.json`.

## Post-architecture Checkpoint C

Checkpoint C reuses the four frozen B2 fixtures after #179/PR #190 and pins architecture, model, CLI, adapter, repository, fixture-manifest, and runtime-bundle attribution before execution:

```bash
node scripts/ask-benchmark.mjs validate --config benchmarks/checkpoint-c.config.json
node scripts/ask-benchmark.mjs prepare --config benchmarks/checkpoint-c.config.json --output /tmp/ask-benchmark-checkpoint-c --seed checkpoint-c-2026-07-14
node scripts/ask-benchmark.mjs run --config benchmarks/checkpoint-c.config.json --run-dir /tmp/ask-benchmark-checkpoint-c --agent-bin /absolute/path/to/codex
node scripts/ask-benchmark.mjs score --config benchmarks/checkpoint-c.config.json --run-dir /tmp/ask-benchmark-checkpoint-c --output benchmarks/results/checkpoint-c-2026-07-14.json
```

The frozen rules are in [protocol-c.md](protocol-c.md). Keep temporary prompts, full outputs, event streams, and workspaces outside the repository. The normalized result explicitly reports that the CLI, repository, and adapter evidence changed alongside the architecture, so Checkpoint C is a bounded remeasurement rather than an isolated causal test.

The measured result is in [results/checkpoint-c-report.md](results/checkpoint-c-report.md), with normalized machine-readable evidence in `results/checkpoint-c-2026-07-14.json`. Full ASK improved one review score but exceeded the quality-gain token allowance; the other three fixtures showed no incremental quality and exceeded the normal token-overhead guardrail.

## Adaptive portfolio foundation, runtime resume, and normalized execution evidence

Issue #197 adds a separate versioned foundation for the redesigned portfolio. The first slice registers the four B2/C fixtures as calibration-only and creates a deterministic plan for separate Codex and Claude tracks across Plain, Kernel-only, Adaptive ASK, and Full ASK:

```bash
node scripts/ask-benchmark.mjs validate-portfolio-catalog --catalog benchmarks/portfolio-catalog.json --similarity benchmarks/portfolio-similarity.json
node scripts/ask-benchmark.mjs validate-portfolio-policy --policy-manifest benchmarks/portfolio-policy-manifest.json
node scripts/ask-benchmark.mjs validate --config benchmarks/adaptive-portfolio.config.json
node scripts/ask-benchmark.mjs plan --config benchmarks/adaptive-portfolio.config.json --output /tmp/adaptive-ask-plan.json --seed local-plan-check
node scripts/ask-benchmark.mjs materialize --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --output /tmp/adaptive-ask-materialized
node scripts/ask-benchmark.mjs seal-selection --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --state-dir /tmp/adaptive-ask-selection-state --case-id case-... --input /tmp/adaptive-selection-input.json
node scripts/ask-benchmark.mjs verify-selection --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --state-dir /tmp/adaptive-ask-selection-state --case-id case-...
node scripts/ask-benchmark.mjs execute-portfolio --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --selection-state /tmp/adaptive-ask-selection-state --run-dir /tmp/adaptive-ask-run-state --adapter codex --runtime-config /tmp/codex-runtime.json --agent-bin /path/to/fake-or-approved-executable
node scripts/ask-benchmark.mjs verify-execution --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --selection-state /tmp/adaptive-ask-selection-state --run-dir /tmp/adaptive-ask-run-state
node scripts/ask-benchmark.mjs normalize-execution --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --selection-state /tmp/adaptive-ask-selection-state --run-dir /tmp/adaptive-ask-run-state --output /tmp/adaptive-ask-normalized-results
node scripts/ask-benchmark.mjs verify-normalized-results --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --selection-state /tmp/adaptive-ask-selection-state --run-dir /tmp/adaptive-ask-run-state --output /tmp/adaptive-ask-normalized-results
node scripts/ask-benchmark.mjs verify-normalized-results --output /tmp/adaptive-ask-normalized-results --snapshot-digest sha256:...
```

Issue #205 Checkpoint 1 freezes the answer-neutral public catalog metadata only: 24 primary IDs, four calibration-only IDs, suite/class/domain/difficulty/repetition registration, capability/evidence/outcome/risk classification, admission state, and digest closure. Fixture bodies and private evaluator packages are not created here. The checked-in 276-pair similarity report is regenerated deterministically from metadata without an LLM, embedding, network, timestamp, or benchmark result; it diagnoses declared-metadata overlap but does not prove semantic identity.

Issue #205 Checkpoint B1 freezes the public, answer-neutral policy contracts only. Review revision `issue-205-checkpoint-b1-r1` binds the admission, scoring, and lineage child digests to the unchanged PR #212 catalog digest. The admission contract separates pre-execution fixture approval from post-pilot aggregate classification and freezes machine-readable gate selectors by fixture role, suite, task class, risk boundary, capability family, and applicable fixture predicate. The scoring contract defines kind-specific `max_points` constraints, preserves blocker failures outside numeric scores, and freezes per-fixture/per-adapter comparison views plus a non-scalar component vector for weighted quality and overhead. Full ASK remains diagnostic, raw fixture results precede aggregate views, and unavailable or unknown measurements are not zero-filled. Ceiling/floor classification is post-pilot and primary-only. Numeric thresholds, weights, selectors, and aggregation rules were frozen before any measured result was read.

B1 does not create the 24 design-level pre-admission records; those belong to B2. Design review is not final admission. Actual fixture admission and private evaluator packages remain in #206 through #209 with the #204 boundary; actual practice-frequency lineage remains in #208; deterministic scoring remains in #197. Issue #198 Stage 0 remains blocked and measured results remain unread. Issues #193 through #196—including their bodies, comments, edit histories, old scenarios, and old answer structures—are prohibited as oracle or policy sources. Issues #204 and #205 remain open, and #206 through #209 have not started.

The read-only policy command validates all closed Schemas, catalog and child digest binding, manifest closure, lifecycle/scoring/lineage semantics, prohibited answer content, and deterministic checked-in bytes. Current catalog aggregate eligibility remains provisional and does not bypass final admission.

The `plan` command records the non-sensitive canonical seed with its ID and SHA-256 digest so the artifact can be independently regenerated. Its `plan_id` binds the config digest, protocol digest, repository revision, and seed into every case/block namespace.

The `materialize` command consumes that existing plan; it never creates or replaces a seed. Before writing a case it re-derives the complete plan identity, validates every manifest-pinned agent-visible input, and rejects evaluator leakage, path escape, symlink traversal, a non-empty output, or adapter/condition projection mixing. It builds through a sibling staging directory and publishes `materialization-manifest.json` only after every case passes Schema and boundary validation.

Each case contains `BENCHMARK_TASK.md`, the frozen `workspace/`, and only its condition projection. Plain has no ASK projection, Kernel-only has canonical `AGENTS.md`, Adaptive has Kernel plus an adapter-owned pre-selection boundary, and Full ASK uses the existing Codex or Claude installer contract independently. The manifest records fixture and projection inventories separately, so all four conditions in a block can prove identical starting inputs without treating generated ASK assets as fixture bytes.

`seal-selection` is Adaptive-only. It revalidates the supplied plan and materialization as a consumer, including current case file bytes/modes re-anchored to the plan-pinned fixture manifest, plan and projection identities, four-condition blocks, evaluator/path/symlink gates, and the absence of result-like artifacts. It writes the selection only outside all cases at `<state-dir>/selections/<case-id>.json`, backed by a versioned state identity/index. The seal binds the plan, materialization, case, adapter, fixture, repetition, frozen input, projection, and normalized pre-result selection, including at least one non-blank observed signal. Its SHA-256 digest uses sorted-key canonical JSON with `selection_digest` omitted; semantic array order is retained. A repeated seal, deletion/recreation, replacement, digest drift, foreign case/adapter/plan/materialization reuse, or state symlink is rejected.

Selection inputs contain the task class, signals, selected/skipped mechanisms, gates, requested/omitted agents, expected evidence, capability downgrades, bypass state, and exact adapter/profile/renderer/projection fingerprint. They cannot include result, score, correctness, recommendation, completion, hidden-test, oracle, or evaluator fields. Lightweight bypass has an explicit reason and skipped mechanisms; capability downgrades are evidence of unavailable capability rather than a zero score or simulated execution.

`execute-portfolio` creates an immutable run identity plus independent case state, atomically published claims, terminal commit manifests, and attempts outside materialized/selection roots. It copies each case into a tokenized OS temporary workspace outside the durable run, removes that workspace on every normal terminal path, and lets exact stale-claim recovery clean hard-interruption residue. Durable attempts retain only a closed Schema/digest-bound request, result, commit, and approved structured final JSON when completed. It validates every Adaptive seal before projection, before spawn, and after output collection. Adapter identities are compare-and-set and bind every attempt to the effective command and policy; Codex and Claude remain separate tracks, and Claude is unavailable unless its placeholder, policy-argument, `--help`, and `--version` contract is confirmed. `verify-execution` is deterministic and read-only across completed, failed, unavailable, interrupted, and invalid terminal evidence; stale claims require the explicit `recover-case` command.

`normalize-execution` first reuses the canonical execution, materialization, selection, Schema, path, symlink, inventory, and digest verification. It then derives versioned per-attempt records and publishes an immutable generation under `generations/snapshot-<source-snapshot-digest>/`, with `normalized-results-root.json` owning the run-specific collection and `normalized-run.json` owning the generation. The snapshot digest binds every case state, committed attempt, and present adapter identity; a retry that is currently active still publishes all earlier committed attempts but never its uncommitted active attempt. The manifest also carries a self-excluding `normalized_run_digest`. Run progression appends a distinct generation without mutating older snapshots, while repeating the same snapshot is byte-identical and idempotent. Normal verification re-derives the current generation from authoritative execution artifacts; `--snapshot-digest` verifies an older generation's self-consistency without claiming that it is current. Unmanaged or cross-run output, conflicting generation bytes, and abandoned staging fail closed.

Normalized records contain only bounded committed telemetry and digests. Missing values retain `unknown`, `unavailable`, or `not_applicable` with a reason; they are never coerced to zero. `harness_spawned_secondary_agent_count` reports only the harness-owned observation. Runtime agent count and subagent activity are `unknown` when an available runtime did not report them and `unavailable` when the runtime itself could not run. Raw stdout/stderr, final content, prompts, transcripts, private environment values, and absolute private paths—including POSIX, Windows drive, UNC, and Windows device forms—are excluded. Runtime unavailable and capability-downgrade reasons are retained only as bounded codes or digest/byte evidence, not copied raw text.

The checked-in Checkpoint B, B2, and C result schema is intentionally not reinterpreted as the new execution-evidence schema. Passing one of those historical result files as a run root is deterministically rejected with an explicit migration-required error. They remain readable through their existing `result.schema.json` and reports until a separately versioned migration is approved.

## Evaluator isolation boundary checkpoint

Issue #204 now has a boundary checkpoint for a public evaluator reference, a private-root-only bundle manifest, and a public evaluator-result envelope. The validator binds bundle identity to fixture/input identity and exact asset inventory, requires real managed boundary roots, reuses the existing immutable normalized-results verifier to bind root identities and result lineage, and rejects canonical repository/private-root overlap, symlinks, path escape, inventory drift, cross-identity transplants, public-field leakage, and byte-identical private material in every boundary root or Git-managed repository file. Full `verify-evaluator-boundary` verification requires a staged public-artifact root; lower-level commands explicitly report the omitted publication guarantee. The exact-byte scanner covers copies and hard links but not partial, transformed, re-encoded, or semantically equivalent content. See [evaluator-boundary.md](evaluator-boundary.md) for digest definitions, inspection limits, storage rules, and the read-only CLI guarantee levels.

This is not Issue #204 completion. No private evaluator package is committed or uploaded by public CI, and the 24 evaluator packages are not generated. Issue #205 Checkpoint B1 freezes metric, threshold, weight, equivalent-solution, and false-positive semantics; Issue #197 owns the later deterministic scoring engine; #198 Stage 0 remains blocked. Public answer content from Issues #193 through #196 is prohibited as evaluator or policy source.

The focused policy, execution, normalization, and evaluator-boundary tests use only deterministic public contracts, fake executables, or synthetic artifacts. Measured runtime execution, evaluator/oracle inspection, scoring, comparative telemetry interpretation, and product-value conclusions remain unauthorized until the clean fixture/evaluator work is complete and #198 freezes input manifests, evaluator digests, runtime variables, and seeds.

Materialization-specific regression coverage is run with:

```bash
node scripts/test-ask-benchmark-materialize.mjs
node scripts/test-ask-benchmark-portfolio-policy.mjs
node scripts/test-ask-benchmark-selection.mjs
node scripts/test-ask-benchmark-execution.mjs
node scripts/test-ask-benchmark-normalized-results.mjs
node scripts/test-ask-benchmark-evaluator-boundary.mjs
```

See [protocol-adaptive.md](protocol-adaptive.md) for the condition, adapter-separation, balanced-ordering, repetition, privacy, pre-result Adaptive selection, normalized evidence, and evaluator-boundary contracts.
