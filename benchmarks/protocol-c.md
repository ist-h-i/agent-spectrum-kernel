# Checkpoint C Post-Architecture Comparative Benchmark Protocol

Protocol version: `2.0.0`
Protocol status: frozen before measured outputs
Freeze date: 2026-07-14 JST
Parent issue: #171
Architecture prerequisite: #179, merged by PR #190 at `6f0fd437e6cdad3c1188c92d3740a5a531a5757f`
Baseline: Checkpoint B2 at repository revision `57866e2ad42d7c1db91488528b0879a87776d4e0`

## Question

After the canonical dual-runtime architecture, does Full ASK provide material incremental value over Kernel-only on the frozen B2 review and implementation fixtures without reducing quality or adding disproportionate false positives, latency, tokens, workflow abandonment, or senior correction effort?

This is a post-architecture remeasurement, not a causal architecture experiment. The model and fixture inputs are held constant, but the Codex CLI, ASK repository, and adapter projection differ from B2. Those variables are reported separately and prevent attributing any observed difference solely to #179.

## Conditions

| Condition | ASK instruction surface | Agent-visible task evidence |
|---|---|---|
| Plain Agent | none | byte-identical B2 `task.md` and `workspace/` |
| Kernel-only | current canonical root `AGENTS.md` only | byte-identical B2 `task.md` and `workspace/` |
| Full ASK | current Kernel plus the post-#179 Codex `full` projection | byte-identical B2 `task.md` and `workspace/` |

The three conditions remain separate. Kernel-only is the primary comparator for Full ASK; Plain Agent remains the context baseline.

## Frozen fixture set

Checkpoint C reuses all four B2 fixtures without changing agent-visible inputs or evaluator oracles:

| Fixture | Class | Difficulty |
|---|---|---|
| `pr-session-refresh-medium-hard` | review | medium-hard |
| `pr-export-lease-hard` | review | hard |
| `impl-rule-batch-medium-hard` | implementation | medium-hard |
| `impl-transfer-hard` | implementation | hard |

The input manifest SHA-256 is `e90d3e32db60d372ecf0437a53e00dd3c9ddaf23298c25f37609e92effeb2b6d`. Evaluator directories remain outside prepared case workspaces. One randomized sequential execution per condition and fixture is used, matching B2's repetition count.

## Frozen evaluator rules

The automated evaluator and thresholds are unchanged from `benchmarks/protocol-b2.md`:

- review scores only structured `blocking` or `major` findings;
- one finding matches at most one frozen oracle when its file matches and at least two frozen semantic terms occur;
- unmatched blocking/major findings are false positives;
- implementation requirements pass only when every mapped hidden test passes;
- scope deviations are changes outside frozen allowed-file patterns;
- a completion claim is unsupported when no reported verification passed or evaluator tests fail.

The frozen automated score is the reproducible decision input. Any later manual adjudication must be labeled supplemental and must not rewrite the preregistered result.

## Fixed metrics and thresholds

The B2 metrics and decision thresholds are retained verbatim. Full ASK has a material quality gain when it adds at least one valid major review finding or improves implementation requirement satisfaction by at least `0.10` against Kernel-only. Quality guardrails permit no increase in false positives, scope deviations, or unsupported completion claims, no abandonment, and no decrease in the primary quality metric.

Without a material quality gain, duration and token overhead must each be at most `50%`. With a material quality gain, the limits are `100%` duration and `150%` tokens. A measured `25%` senior-correction reduction or `20%` rework reduction can also qualify. `expand` is prohibited when the relevant improvement evidence is unavailable or guardrails fail. Other outcomes use the frozen `retain`, `simplify`, or `stop` rules from B2.

Unavailable senior review time, additional investigation time, unresolved human decisions, rework, AI usage cost, or other measurements are recorded as JSON `null` and reported as `unknown`, never zero. Automated correction units remain a bounded proxy and are not human time or rework.

## Controlled and attributed variables

| Variable | B2 | Checkpoint C | Interpretation |
|---|---|---|---|
| Fixture inputs and evaluator | frozen B2 manifest/oracle | unchanged | controlled |
| Model | `gpt-5.6-sol` | `gpt-5.6-sol` | controlled |
| Reasoning effort | `high` | `high` | controlled |
| Repetitions/order policy | one, seeded, sequential | one, seeded, sequential | controlled; seed differs and is hash-recorded |
| Codex CLI | `0.144.1` | `0.144.2` | changed; separately reported |
| ASK repository | `57866e2...` | captured by the prepared run manifest | changed; separately reported |
| Architecture | pre-#179 | canonical dual-runtime after #179 | target change, but not isolated |
| Adapter evidence | B2 projection digest unavailable | Codex renderer/profile/digests pinned in config | evidence availability changed |

The post-#179 runtime bundle file SHA-256, canonical contract digest, Codex full-profile fingerprint, and projected-asset digest are pinned in `benchmarks/checkpoint-c.config.json`. Projection evidence proves asset generation, not external runtime behavior. Runtime execution is evidenced only by completed CLI cases and structured outputs.

## Blinding, execution, and privacy

`prepare` assigns opaque case IDs and randomizes all twelve cases. All cases must finish before condition outputs are inspected. Automated scoring uses the frozen hidden evaluator and reveals condition mappings only in the normalized result. A human evaluator, if later available, receives opaque task/diff/output artifacts before mapping is revealed; no human-effort value is inferred from model duration.

Raw prompts, full outputs, JSONL events, submitted diffs, and temporary workspaces remain outside git. Durable results contain normalized metrics, bounded hashes, controlled variables, limitations, and decisions only. Do not store secrets, customer data, personal data, production source, or full fixture/output capture.

## Decision boundary

Checkpoint C can support an `expand`, `retain`, `simplify`, or `stop` recommendation only for each tested fixture and the observed runtime. One repetition cannot establish universal or causal value. Architecture-only conclusions remain unsupported because CLI, repository, and adapter evidence changed alongside the architecture.
