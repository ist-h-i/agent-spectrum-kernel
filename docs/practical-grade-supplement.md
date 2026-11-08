# Complete retained practical grading without repeating a Task

This opt-in recovery completes an unused verification slot after a closed primary
judgment fails the fixed consistency validator. It uses the existing practical
operation, source snapshot, primary response, rules and original one-verifier
budget. It does not repeat the Task, request another primary, select a better
score, or turn a source review into runtime acceptance.

The original evaluation and parent operation must be quiescent. An active,
suspended or unclosed provider blocks dispatch; a process no longer appearing in
a process list is not evidence of closure. Valid low scores and valid partial or
range judgments are not eligible. Existing runs remain readable without using
this recovery.

## Operator flow

Use the absolute operation path and original attempt ID from its saved report.
The host AI executes the following commands and explains any rejected admission.
The user still approves the evaluation cases and the eventual asset change.

```sh
node scripts/practical-grade-supplement-cli.mjs prepare \
  --operation /absolute/operation --attempt ORIGINAL_ATTEMPT_ID \
  --output /absolute/recovery/recipe.json
node scripts/practical-grade-supplement-cli.mjs run \
  --recipe /absolute/recovery/recipe.json \
  --provider /absolute/recovery/pinned-provider.json --allow-model-calls \
  --output /absolute/recovery/receipt-ref.json
node scripts/practical-grade-supplement-cli.mjs selection-packet \
  --receipt /absolute/recovery/receipt-ref.json \
  --output /absolute/recovery/selection-packet.json
```

`prepare` makes no model call. The provider definition has the existing
`commands.grade` command shape, pinned worker/settings/dependencies and an
explicit `model_calls` declaration. It must retain every original grader pin.
A host adapter is responsible for the original fixed grading protocol, one
verification call, provider closure and typed source-quality evidence; this
entry point does not invent a universal grader or run candidate code.

Before dispatch, the library reserves a canonical slot keyed by the original run,
attempt and job. A lost response or failure consumes that slot. Repeating `run`
reads its saved result and never grants another dispatch. Changing the provider
or recipe cannot create another slot for the same attempt.

If closure is unknown, use `inspect --receipt ...` with the saved reference. If a
crash occurred before a receipt was written, use `inspect --recipe ... --provider
...`. Inspection requires the original provider's read-only `inspect_argv` and
has a zero-model-call grant. It appends observations, preserving previous unknown
or failed observations. A provider without an inspector remains unresolved; do
not clear its reservation or rerun the model.

### A failed local guard before provider dispatch

A host can configure a separate pinned, model-free observer when the original
provider inspector cannot interpret a known local guard rejection:

```sh
node scripts/practical-grade-supplement-cli.mjs inspect \
  --receipt /absolute/recovery/receipt-ref.json \
  --observer /absolute/recovery/pinned-closure-observer.json \
  --output /absolute/recovery/observed-receipt-ref.json
```

The host chooses trusted executable configuration; candidate assets, recipes and
model answers cannot select this observer. Its only command is `commands.grade`
with `model_calls:false`; the runner supplies a zero-model grant. The observation
must bind the latest canonical receipt, allocation, original request/result/
transport and pinned evidence. Both parent locks and the evaluation lock protect
validation before and after it runs. An observer transport failure, uncertain
dispatch, changed source or invalid witness cannot close the slot.

The observer receives `inspection_only`, the original job/receipt, its sequence
index and digest references for the original allocation, native request, result
and transport. It returns the ordinary completed command envelope with zero
`model_calls`, `task_calls` and `primary_calls`, the two original request/receipt
digests, and the exact unchanged failed `result`. Its `closure_observation` carries
`kind: verified_pre_dispatch_rejection_v1`, `no_provider_dispatch: true`,
`local_termination_confirmed: true`, a reason, `duration_ms`, evidence references
and the same four original source references. Evidence files must belong to the
bound native execution or the original grader pins. The host AI prepares this
adapter; it adds no human approval step.

A successful `verified_pre_dispatch_rejection_v1` witness records that the known
local guard ended before the provider was invoked. The new receipt can mark that
consumed slot operationally closed, while its original failed result,
`provider_terminal_confirmed:false`, unavailable quality and attempted cost remain
unchanged. The observation is separate evidence, not an upgraded provider result.
It grants no retry or quality disposition. Only other unconsumed slots may then
proceed. Observer evidence and duration are retained separately from Task metrics;
unknown model usage does not become zero.

Rejected observer output is retained in an unresolved observation receipt. A
fresh model-free observer can inspect that latest reference. A pure empty
observation reservation can resume its never-dispatched observer; execution
evidence always requires inspection rather than dispatch. No consumed verifier
is restarted. A host-specific observer must verify its exact guard contract;
process-list absence or an AI assertion alone is insufficient.

The AI judges the new packet using `use`, `reference` or `exclude`, recording the
packet digest, reasons, selection basis, used dimensions and comparison limits.
It writes the ordinary recovery assessment JSON, then records the once-only
choice:

```sh
node scripts/practical-grade-supplement-cli.mjs select \
  --receipt /absolute/recovery/receipt-ref.json \
  --assessment /absolute/recovery/assessment.json \
  --output /absolute/recovery/selection-ref.json
node scripts/practical-grade-supplement-cli.mjs report \
  --root /absolute/practical-evaluation \
  --receipts /absolute/recovery/receipt-refs.json \
  --selections /absolute/recovery/selection-refs.json \
  --output /absolute/recovery/report-revision-ref.json
```

The two plural input files contain arrays of the saved reference objects, not
filenames or automatic latest-file searches. `select`'s output reference file
contains the selection reference for that array. Host-AI assessment inference
usage is recorded as not collected, not zero. Model provider grading usage and
duration are separate from the original Task metrics.

Report generation makes no model call. The revision retains the original report,
result digest, dispositions, quality, Task duration and usage, plus every supplied
supplement, selection, cost and limitation. Report generation does not change the original journal or human decision
packet. To present the revised evidence through the existing pending judgment,
run the standard operator before submitting a decision:

```sh
node scripts/supervised-instruction-loop-cli.mjs operate \
  --root /absolute/operation --profile /absolute/profile.json \
  --config /absolute/config.json --cycles 1 \
  --report-revision /absolute/recovery/report-revision-ref.json
```

Use the operation's original cycle budget; this option does not extend it. The
operation must be paused at result/change review with no consumed decision or
pending work. The controller appends a revision transition, retaining the original
report, prior packet digest and any previous plan. It publishes a fresh result
packet, or recomputes the plan before a fresh change packet. No owner apply occurs
until the human approves that exact new packet. Submit the decision in a separate
operator invocation after reviewing it; a decision and report revision in the same
invocation reject. Old packet digests, consumed decisions and applied/retired
cycles cannot be reused. Repeating the same revision before a decision is
idempotent. The normal result-only configuration still retains the candidate and
cannot apply it to an owner target.

For subsequent feedback, pass the saved revision reference explicitly to the
standard `next` or `next-policy` CLI as `--report-revision`. A revision already
attached to the pending judgment is carried into feedback automatically. Both original and
revised report digests enter the next-cycle provenance. Case and change approvals
are not inherited. Omitting the option preserves the existing continuation path.

## Scope and evidence limits

Admission currently supports the retained `host_business_practical_grader_v1`
protocol with a closed, invalid primary and unused original verifier. Its source
checks bind the original job directory, settings, dispatch, public inputs,
selected source copies, primary reply/session and grading input capsule. These
are checks of retained local history; they do not certify complete model context,
remote attestation, source execution, or runtime acceptance.

The host-specific adapter and real-model recovery must be validated separately
from the model-free library tests. Unknown quality remains unknown when correction
fails. Do not weaken fixed rules or choose among scores to improve the aggregate.

The CLI refuses output files inside the original evaluation or its parent
coordinators before dispatch. Keep operator files in a separate recovery folder.
A crash after reservation directory creation but before metadata publication
returns `requires_inspection/reservation_metadata_missing`; it never adopts a
replacement provider or grants replay. Recovery of that exceptional state needs
host-specific evidence of what was dispatched.

The cost ledger snapshots all consumed canonical slots, including failed,
unclosed and unselected work; absent metrics remain unknown. Explicit quality
references choose what to discuss, not which executions to charge. A published
revision retains its historical snapshot when later supplements are attempted.

An interruption after revision admission can be resumed with the same option.
A reserved plan is inspected, never dispatched twice. Later review and feedback
read the admitted report by its immutable digest and exact journal admission
event, so moving to a subsequent cycle or cleaning owned staging does not require
re-running old graders. This data reader cannot admit a new revision or grant
another verification call.

## A separate new grading round or evidence derivation

The unused-verifier contract above remains intentionally narrow. For an explicitly
budgeted new grading procedure on retained answers, including valid low or range
results, use [retained grading report admission](practical-retained-grade-report.md).
It imports a separately identified result with a pinned model-free inspector; it
does not reopen a consumed verifier or rerun a Task. Both kinds use the existing
fresh result/change packet and next-cycle feedback path.
