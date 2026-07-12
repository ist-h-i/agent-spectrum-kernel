# Checkpoint B Comparative Benchmark Report

Run date: 2026-07-12 JST
Protocol commit: `6daae5eb40194db4b814322022494c230be18fc3`
Protocol SHA-256: `2a1f78b7f088884284a8af6de96845e746e6d6ffcb354842928993dc37a47e2e`
Configuration SHA-256: `4104ecd5dcb9b83719a523a5e46650ef97577a028715bc89d90feda66fc3adff`

## Decision

| Workflow | Recommendation | Evidence-backed reason |
|---|---|---|
| PR review / merge recommendation | `simplify` | Full ASK and Kernel-only both found 2/2 frozen major defects with no major false positives, but Full ASK added 77.5% wall-clock and 158.7% token overhead. No senior-effort or rework improvement was observed. |
| Medium implementation + verification | `simplify` | Full ASK and Kernel-only both passed 7/7 hidden requirements with no scope deviation or unsupported completion claim, but Full ASK added 35.1% wall-clock and 110.5% token overhead. No senior-effort or rework improvement was observed. |

`simplify` is the fixed-threshold outcome for these fixtures, not a universal conclusion about ASK. Quality was non-inferior, so the evidence does not support `stop`. The primary expansion metrics are unavailable, so the protocol prohibits `expand`.

## Normalized results

### Review fixture

| Condition | Valid major findings | Major missed | Major false positives | Duration | Tokens | Final output |
|---|---:|---:|---:|---:|---:|---:|
| Plain Agent | 2 | 0 | 0 | 35.268 s | 68,826 | 2,157 bytes |
| Kernel-only | 2 | 0 | 0 | 47.551 s | 95,374 | 2,358 bytes |
| Full ASK | 2 | 0 | 0 | 84.415 s | 246,734 | 2,865 bytes |

Full ASK vs Kernel-only: quality delta `0`; duration `+77.5%`; tokens `+158.7%`; final-output bytes `+21.5%`.

### Implementation fixture

| Condition | Hidden requirements | Scope deviations | Unverified completion claims | Duration | Tokens | Final output |
|---|---:|---:|---:|---:|---:|---:|
| Plain Agent | 7/7 | 0 | 0 | 76.051 s | 92,912 | 1,636 bytes |
| Kernel-only | 7/7 | 0 | 0 | 81.241 s | 105,387 | 1,702 bytes |
| Full ASK | 7/7 | 0 | 0 | 109.734 s | 221,804 | 1,762 bytes |

Full ASK vs Kernel-only: quality delta `0`; duration `+35.1%`; tokens `+110.5%`; final-output bytes `+3.5%`.

## Adoption and runtime evidence

- All six cases executed successfully with Codex CLI `0.144.1`, model `gpt-5.6-sol`, and reasoning effort `high`.
- Full ASK reported the expected review and implementation routes without manual skill naming.
- Kernel-only completed both tasks. Its implementation output explicitly used a Kernel fallback because the referenced router assets were absent; the normalized route heuristic records this as under-processing while objective implementation quality remained 7/7.
- File projection is reported separately from execution. The run does not treat projected assets as proof of business correctness.
- Plain Agent also populated the shared structured `route` field. This shows output-schema compliance, not ASK routing adoption.

## Unknown measurements

The following are `unknown`, not zero:

- senior review/correction time;
- additional human investigation time;
- unresolved human decisions;
- rework count before approval;
- monetary usage cost;
- separately exposed AI/tool execution time beyond measured process wall-clock.

Because senior effort and rework were not observed, neither 25% lower senior correction time nor 20% lower rework can be established.

## Limitations

- One synthetic fixture per workflow cannot establish universal value or causal impact.
- Review scoring uses a preregistered semantic matcher over structured findings; it may undercount or overcount paraphrases.
- Hidden implementation tests establish only the seven frozen fixture requirements.
- Token totals are those exposed by Codex JSONL events and may include cached/context processing according to the runtime's accounting semantics.
- The measured comparison isolates ASK instruction surfaces within this runner, but it does not represent every client, repository, model, or adapter.
- Checkpoint C remains pending on #179. It must preserve this baseline and report architecture, model, CLI, repository, and adapter changes separately.

## Evidence files

- Normalized result: `benchmarks/results/checkpoint-b-2026-07-12.json`
- Frozen protocol: `benchmarks/protocol.md`
- Frozen configuration: `benchmarks/checkpoint-b.config.json`
- Runner and scorer: `scripts/ask-benchmark.mjs`
- Focused regression test: `scripts/test-ask-benchmark.mjs`

Temporary raw outputs, prompts, JSONL events, full diffs, and workspace copies remain outside the repository and are not part of this report.
