# Checkpoint B2 Difficulty-Expanded Comparative Benchmark Protocol

Protocol version: `1.1.0`
Protocol status: frozen before measured outputs
Freeze date: 2026-07-12 JST
Parent issue: #171
Baseline: Checkpoint B at commit `6daae5eb40194db4b814322022494c230be18fc3`

## Question

For medium-hard and hard review and implementation workflows, does Full ASK produce a material quality improvement over Kernel-only that justifies its incremental latency and token overhead?

Checkpoint B showed a ceiling effect: all three conditions achieved the maximum quality score on one easy review and one easy implementation fixture. B2 preserves that result and introduces four independent fixtures designed to require cross-file contract discovery, state-boundary reasoning, concurrency analysis, evidence discipline, and scope control.

The benchmark establishes evidence only for these fixtures and runtime. It does not prove universal, causal, or client-level value.

## Conditions

| Condition | ASK instruction surface | Agent-visible task evidence |
|---|---|---|
| Plain Agent | none | byte-identical `task.md` and `workspace/` |
| Kernel-only | canonical root `AGENTS.md` only | byte-identical `task.md` and `workspace/` |
| Full ASK | canonical Kernel plus full Codex projection | byte-identical `task.md` and `workspace/` |

ASK projection files live outside the nested fixture `workspace/`. The workspace bytes are verified against `benchmarks/fixtures/checkpoint-b2/input-manifest.json` before preparation. Evaluator directories are never copied into case workspaces.

## Fixtures

| Fixture | Class | Difficulty | Primary discrimination target |
|---|---|---|---|
| `pr-session-refresh-medium-hard` | review | medium-hard | current authorization state, expiry boundary, rollback, concurrent rotation |
| `pr-export-lease-hard` | review | hard | tenant isolation, atomic lease claim, lease ownership, retry state machine |
| `impl-rule-batch-medium-hard` | implementation | medium-hard | repository-defined ambiguity, atomic batch, normalization, versioning, idempotency |
| `impl-transfer-hard` | implementation | hard | serialized state transition, audit rollback, concurrency, idempotency, alias isolation |

One randomized execution per condition and fixture is used for this bounded B2 run. Model stochasticity remains a limitation; any decision to change ASK architecture requires replication on a later run rather than treating B2 as universal proof.

## Frozen evaluator rules

### Review

- Score only `blocking` or `major` structured findings.
- A finding matches one oracle finding when its normalized file path matches any frozen evidence file and at least two frozen `match_terms` occur in its summary/evidence text.
- One agent finding can satisfy at most one oracle finding; one oracle finding can be counted once.
- Unmatched blocking/major findings count as unsupported or false positive.
- `request_changes` or `block` is the correct merge decision for both review fixtures.
- Formatting, naming, optional refactors, generic test requests, and each fixture's documented suspicious-but-correct changes are not findings.

### Implementation

- Run evaluator hidden tests outside the agent workspace.
- A requirement is satisfied only when every hidden test named by that requirement passes.
- Scope is a requirement and is also counted independently as changed files outside frozen `allowed_files` patterns.
- Visible-test claims do not override hidden-test failure.
- A completion claim is unsupported when no reported verification passed or evaluator tests fail.

## Metrics

Quality:

- valid major findings, missed major findings, major false positives, and merge-decision correctness;
- satisfied requirements and requirement-satisfaction rate;
- scope deviations and unsupported completion/readiness claims;
- automated correction units: missed findings + false positives for review; unsatisfied requirements + scope deviations + unsupported completion claims for implementation.

Human effort remains `null` unless a blinded senior evaluator records it. Automated correction units are a bounded proxy and must not be described as minutes, rework, or human effort.

Cost and runtime:

- wall-clock duration;
- input/output tokens exposed by Codex JSONL;
- final-output bytes;
- execution success, ASK projection presence, route evidence, and capability downgrade.

## Fixed value thresholds

Full ASK has a material quality gain over Kernel-only for a fixture when:

- review: at least one additional valid major finding; or
- implementation: requirement-satisfaction rate improves by at least 0.10.

Quality guardrails require:

- false-positive increase `<= 0`;
- scope-deviation increase `<= 0`;
- unsupported-completion increase `<= 0`;
- no workflow abandonment;
- no decrease in the fixture's primary quality metric.

With a material quality gain, Full ASK may be `expand` only when duration overhead is `<= 100%` and token overhead is `<= 150%`. Without a quality gain, the original 50% duration/token overhead guardrails apply. A measured 25% senior-correction reduction or 20% rework reduction may also qualify when human evidence exists.

Recommendations:

- `expand`: material quality or measured-human-effort gain, all quality guardrails, and applicable overhead guardrails pass;
- `retain`: quality improves but evidence is incomplete or overhead exceeds the quality-gain allowance;
- `simplify`: quality is non-inferior but no material gain exists and normal overhead is disproportionate;
- `stop`: Full ASK abandons the workflow, reduces quality, or worsens a quality guardrail.

## Blinding and order

`prepare` assigns an opaque case ID from seed, fixture, repetition, and condition, then randomizes all 12 cases. Operators run all cases before inspecting final outputs. The durable result reveals conditions only after scoring.

## Controlled variables

- fixture input hashes and repository revision;
- task, workspace, structured output schema, model, reasoning effort, CLI version, and sandbox;
- no network requirement and no dependencies beyond Node.js;
- sequential execution with a 15-minute per-case timeout;
- raw prompts, full outputs, JSONL events, full diffs, and temporary workspace copies remain outside git.

## Checkpoint boundary

B2 is a difficulty expansion of B, not Checkpoint C. Checkpoint C remains pending on #179 and must repeat representative fixtures while separating ASK architecture changes from model, CLI, repository, and adapter changes.
