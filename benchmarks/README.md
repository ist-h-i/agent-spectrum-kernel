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
