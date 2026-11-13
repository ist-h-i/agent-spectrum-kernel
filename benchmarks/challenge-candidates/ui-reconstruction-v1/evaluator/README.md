# CH08 semantic assessor bundle

`rubric.json`, `score.mjs`, `README.md` are the exact registered evaluator bytes.
Copy these three files to a private directory outside the checkout, solver run,
and toolchain roots before using `challenge-score-handoff`. Do not execute
submission code with access to this directory. These files are public authoring
assets; keeping the runtime assessor directory separate is an execution boundary,
not a claim that the published criteria are secret.

An independent assessor must inspect the frozen app, transcript, DELIVERY.md,
REASSESSMENT.md, and actually exercise the published scenarios in a browser.
Bind every observation to an artifact/probe location and explain the observed
behavior. A code claim or screenshot alone cannot establish interactive behavior.
Missing browser access or missing probes means unknown, not fail or pass. The
calculator checks decision structure and arithmetic; it cannot certify semantic
truth, browser execution, or evidence authenticity.

Assessment shape: `{kind:"ch08_assessor_decisions_v1", requirements:[{id,
checks:[{id,status:"pass"|"fail",evidence:[{artifact,observation}]}]}],
release_blockers:[{id,status:"clear"|"observed",evidence:[{artifact,observation}]}]}`.
Every rubric item and checkpoint must occur exactly once. For unknown checkpoints
or blockers, replace evidence with nonempty `missing` and `next_check` strings.
All four blocker rules must be observed or explicitly unknown. Do not infer
clear from a missing item. The observation `artifact` identifies a frozen source,
transcript, screenshot, or reproducible probe; it is not an executable command.
No assessor-authored points or weights are accepted.

Each checkpoint earns one quarter of its parent item's weight. Functional /70
and UX /30 are reported separately. Their optional sum /100 is only complete
when every checkpoint is known. Unknown weight is retained and never reweighted.
An observed release blocker remains separate from points. Framework choice,
visual copying, generation speed, model identity and tokens earn no quality points.

Use the existing challenge assessment import packet, setting `assessment` to
this decision object. `grading_metrics` records assessor overhead separately.
Solver task duration and observed input/output/cached tokens remain standard
provider receipts and cumulative linked-session usage. Missing usage remains
null; cached tokens are an input subset. Initial implementation and read-only
reassessment durations are separately visible and must not be mislabeled as
implementation generation time alone.

Synthetic all-pass/all-fail decisions in repository tests exercise arithmetic
only. They are not correct UI implementations, calibrated scores or model trials.
