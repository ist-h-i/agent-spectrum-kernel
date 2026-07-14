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

## Adaptive portfolio foundation, workspace materialization, and selection seal

Issue #197 adds a separate versioned foundation for the redesigned portfolio. The first slice registers the four B2/C fixtures as calibration-only and creates a deterministic plan for separate Codex and Claude tracks across Plain, Kernel-only, Adaptive ASK, and Full ASK:

```bash
node scripts/ask-benchmark.mjs validate --config benchmarks/adaptive-portfolio.config.json
node scripts/ask-benchmark.mjs plan --config benchmarks/adaptive-portfolio.config.json --output /tmp/adaptive-ask-plan.json --seed local-plan-check
node scripts/ask-benchmark.mjs materialize --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --output /tmp/adaptive-ask-materialized
node scripts/ask-benchmark.mjs seal-selection --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --state-dir /tmp/adaptive-ask-selection-state --case-id case-... --input /tmp/adaptive-selection-input.json
node scripts/ask-benchmark.mjs verify-selection --config benchmarks/adaptive-portfolio.config.json --plan /tmp/adaptive-ask-plan.json --materialized /tmp/adaptive-ask-materialized --state-dir /tmp/adaptive-ask-selection-state --case-id case-...
```

The `plan` command records the non-sensitive canonical seed with its ID and SHA-256 digest so the artifact can be independently regenerated. Its `plan_id` binds the config digest, protocol digest, repository revision, and seed into every case/block namespace.

The `materialize` command consumes that existing plan; it never creates or replaces a seed. Before writing a case it re-derives the complete plan identity, validates every manifest-pinned agent-visible input, and rejects evaluator leakage, path escape, symlink traversal, a non-empty output, or adapter/condition projection mixing. It builds through a sibling staging directory and publishes `materialization-manifest.json` only after every case passes Schema and boundary validation.

Each case contains `BENCHMARK_TASK.md`, the frozen `workspace/`, and only its condition projection. Plain has no ASK projection, Kernel-only has canonical `AGENTS.md`, Adaptive has Kernel plus an adapter-owned pre-selection boundary, and Full ASK uses the existing Codex or Claude installer contract independently. The manifest records fixture and projection inventories separately, so all four conditions in a block can prove identical starting inputs without treating generated ASK assets as fixture bytes.

`seal-selection` is Adaptive-only. It revalidates the supplied plan and materialization as a consumer, including current case file bytes/modes, plan and projection identities, four-condition blocks, evaluator/path/symlink gates, and the absence of result-like artifacts. It writes the selection only outside all cases at `<state-dir>/selections/<case-id>.json`, backed by a versioned state identity/index. The seal binds the plan, materialization, case, adapter, fixture, repetition, frozen input, projection, and normalized pre-result selection. Its SHA-256 digest uses sorted-key canonical JSON with `selection_digest` omitted; semantic array order is retained. A repeated seal, deletion/recreation, replacement, digest drift, foreign case/adapter/plan/materialization reuse, or state symlink is rejected.

Selection inputs contain the task class, signals, selected/skipped mechanisms, gates, requested/omitted agents, expected evidence, capability downgrades, bypass state, and exact adapter/profile/renderer/projection fingerprint. They cannot include result, score, correctness, recommendation, completion, hidden-test, oracle, or evaluator fields. Lightweight bypass has an explicit reason and skipped mechanisms; capability downgrades are evidence of unavailable capability rather than a zero score or simulated execution.

None of these commands invokes Claude or Codex, collects output, resumes a partial run, inspects outcomes, or scores results. Selection sealing records only the pre-result decision boundary. Measured execution remains unauthorized and blocked until #193–#197 artifacts are validated and #198 freezes manifests, evaluator digests, thresholds, weights, runtime variables, and seeds.

Materialization-specific regression coverage is run with:

```bash
node scripts/test-ask-benchmark-materialize.mjs
node scripts/test-ask-benchmark-selection.mjs
```

See [protocol-adaptive.md](protocol-adaptive.md) for the condition, adapter-separation, balanced-ordering, repetition, privacy, and pre-result Adaptive selection contracts.
