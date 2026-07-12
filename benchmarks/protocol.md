# Checkpoint B Comparative Benchmark Protocol

Protocol version: `1.0.0`
Protocol status: frozen before measured outputs
Freeze date: 2026-07-12 JST
Parent issue: #171
Prerequisites: #159 and #160 closed; #179 intentionally excluded until Checkpoint C

## Question

For the included review and implementation workflows, does Full ASK provide material incremental value over Kernel-only without reducing major-problem detection or adding disproportionate false positives, latency, cost, routing overhead, or workflow abandonment?

Plain Agent is a context baseline. Kernel-only is the primary comparator. The benchmark does not infer universal client value or causal effects outside these controlled fixtures.

## Conditions

| Condition | Instruction surface | Repository/task evidence |
|---|---|---|
| Plain Agent | no ASK instruction file or projected skill | identical fixture workspace and task |
| Kernel-only | canonical root `AGENTS.md` copied as the only ASK instruction asset | identical fixture workspace and task |
| Full ASK | canonical Kernel plus installer-projected skills/contracts | identical fixture workspace and task |

Each condition uses a separate git workspace. The runner commits the condition projection before applying the review candidate patch, so ASK assets do not appear in the reviewed diff. Implementation runs start from a clean baseline.

## Fixtures and expected evidence

### `review-001`

The candidate simplifies refund authorization and amount validation. The frozen evaluator oracle contains two independent major problems:

1. missing roles fail open and authorize the refund;
2. invalid or non-positive amounts are accepted.

Expected evidence is a file/line-grounded finding and a merge recommendation. Findings are matched by file plus preregistered semantic terms, not by exact prose. Additional blocking/major findings are counted as unsupported or false positive unless the oracle is amended in a later protocol version.

### `implementation-001`

The task adds immutable, idempotent stock reservation with validation and conflict handling. Visible tests cover the public happy path and one validation case. Hidden evaluator tests cover all frozen requirements, immutability, repeated requests, conflicting idempotency keys, insufficient stock, unknown SKU, and invalid quantities.

Expected evidence is the hidden-test pass count, changed-file boundary, reported verification, and final completion claim.

## Controlled variables

- repository revision and fixture bytes;
- task text and structured final-output schema;
- model (`gpt-5.6-sol`) and reasoning effort (`high`);
- Codex CLI version (`0.144.1` for the first measured run);
- sandbox by task class (`read-only` review, `workspace-write` implementation);
- sequential randomized case order;
- no network requirement in fixture tasks;
- no raw prompt or full output in checked-in results.

If any controlled variable differs, the runner records it and the comparison is downgraded. Unavailable token, cost, AI execution time, or human-effort measurements remain `null`.

## Metrics

Outcome quality:

- valid blocking/major findings;
- major findings missed;
- unsupported/false-positive blocking or major findings;
- hidden requirements satisfied;
- scope deviations;
- unverified completion/readiness claims;
- rework count when observed.

Human effort:

- senior review/correction minutes;
- additional investigation minutes;
- unresolved human decisions.

Cost and latency:

- wall-clock duration;
- AI/tool execution time when exposed;
- input/output tokens and cost when exposed;
- final-output bytes and routing/output overhead.

Adoption and runtime:

- correct route without manual skill naming;
- under-processing or over-processing when evidenced;
- abandonment/non-zero execution;
- projected assets present;
- runtime execution evidence;
- contracts reported in structured output;
- capability downgrade or missing evidence.

## Fixed decision thresholds

Full ASK may be recommended `expand` for a workflow only when one of the following is observed against Kernel-only:

- at least 25% lower senior review/correction time; or
- at least 20% lower rework count;

and all guardrails hold:

- no lower major-problem detection or hidden-requirement satisfaction;
- no increase in unsupported blocking/major findings;
- no workflow abandonment;
- duration and token overhead are each no more than 50%, unless a documented quality gain justifies it.

When both primary improvement metrics are unavailable, `expand` is prohibited. Use:

- `retain` when quality is non-inferior but material improvement is unproven;
- `simplify` when Kernel-only is non-inferior and Full ASK adds disproportionate overhead or over-processing;
- `stop` when Full ASK reduces quality, abandons the workflow, or violates a guardrail without a compensating, evidenced benefit.

## Blinding and evaluation

`prepare` assigns opaque case IDs and randomizes order. Operators should run all cases before opening final outputs. Automated scoring uses the frozen oracle and hidden tests. Human evaluation, when available, should receive only the opaque case ID, task, diff/final patch, structured output, and evaluator rubric; condition mapping is revealed after scoring.

Automated semantic matching is reproducible but not a substitute for senior review. Its limitations are explicit in the report. Human effort is not inferred from model duration.

## Privacy and retention

Temporary workspaces may contain fixture source, prompts, JSONL events, diffs, and full outputs. Keep them outside the repository, do not publish them, and delete them according to local policy. Durable results contain only normalized metrics, bounded evidence labels, hashes, versions, and limitations. Never store secrets, customer data, personal data, or production source in fixtures.

## Checkpoint boundary

This protocol is Checkpoint B only. After #179, copy the config under a new checkpoint ID, preserve this baseline, record the new repository revision/runtime projection, and rerun representative fixtures. A Checkpoint C report must attribute architecture, model, CLI, adapter, and repository changes separately.
