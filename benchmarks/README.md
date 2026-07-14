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
