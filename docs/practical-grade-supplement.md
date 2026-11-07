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
supplement, selection, cost and limitation. It never changes the original journal
or human decision packet. Report the revision to the user before asking for a
change decision; an earlier decision applies only to its original packet.

For subsequent feedback, pass the saved revision reference explicitly to the
standard `next` or `next-policy` CLI as `--report-revision`. Both original and
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
