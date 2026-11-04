# Primary 24: practical task revision

Artifact ID: `spec-primary24-practical-20261104`
Artifact type: `spec`
Upstream refs: the user's November 4 request to improve all 24 tasks, measure
GPT-6.1 Terra low with and without ASK, submit results and a separate draft PR,
and merge only after the user's review and approval;
[the canonical assembly](primary-24-task-assembly.md).

## Observable change and preservation

Each of the 24 tasks must give a fictional but concrete work setting, the person
using the result, and mandatory observable completion conditions. Preserve its
existing task identity, domain, difficulty range, editing boundary, input/output
meaning and safety conditions. The small documentation, configuration and test
tasks remain small. Review, investigation, handoff, planning and implementation
remain different kinds of work; this revision does not turn them into one app.

Review the complete distributed `task.md` and `workspace/**`, including schemas,
examples, tests and validation tools. Preserve authoritative existing state,
protocols, supported capabilities and legitimate acceptance examples. Remove
case-specific completed answers, finding counts, selected verdicts/severities,
reference decision tables and prescribed implementation/experiment recipes.
The solver must still select and justify its answer from the supplied facts.
Structural validation must not be described as semantic correctness.

Retain output interfaces when they serve a real consumer. JSON is appropriate
for a machine-consumed review, migration plan or handoff; it does not by itself
make those tasks equivalent. A supplied document must not merely pre-fill that
JSON. Interface changes that remove an answer must be recorded separately from
unchanged business obligations, and controller-side checks must accept valid
alternative solutions rather than a preferred spelling or implementation.

The revision is made at the existing `checkpoint-b2/<fixture-id>` paths to reuse
the public preparation, recipes and controller bindings. The previous version
is the complete Git source at
`9068e22a1c48378d0c266a103e3f8fb93861942e`. Its code, task inputs, freezes,
selectors, private resources and runs remain historical records. Reopen that
version with its matching code and resources; do not run an old selector against
new task bytes or rewrite old results. A complete source archive is also retained
in the operator's local evidence area.

## Delivery labels

The primary delivery mode for these 24 tasks is **one-shot**: one fresh task,
its bounded workspace, required output, checks actually performed and remaining
uncertainty. The optional **goal-pr** mode uses the same engineering task and
acceptance conditions, but permits a longer agent workflow and, only in a real
repository explicitly supplied for that purpose, a reviewable draft PR.
Publishing or merging is not an implicit permission in a fixture. Review-only
tasks remain reviews; they do not require implementing the proposed change.

The separate six ceiling challenges target broader practical `/goal` and PR
work. Their inputs, scoring and implementation are outside this revision.
The catalog name `practice_frequency` is a grouping label, not evidence of how
often a user's organization performs that work.

The delivery labels below describe how to hand the existing task to a model;
they do not create another task catalog, change registration, or authorize a PR.
Every row defaults to `one-shot`; `goal-pr` is an optional delivery wrapper.

| Task | Work product / role | Labels |
|---|---|---|
| hi-authorization-exception | Selective authorization PR review | one-shot · goal-pr |
| hi-external-action-approval | Bounded operations readiness decision | one-shot · goal-pr |
| hi-financial-state-integrity | Duplicate-sensitive ledger implementation | one-shot · goal-pr |
| hi-versioned-migration-safety | Mixed-version migration and recovery plan | one-shot · goal-pr |
| mn-build-option-update | Local release-build configuration | one-shot · goal-pr |
| mn-client-compatibility-fix | Supported-client compatibility repair | one-shot · goal-pr |
| mn-doc-config-correction | Operator documentation correction | one-shot · goal-pr |
| mn-focused-regression-test | Test-only regression protection | one-shot · goal-pr |
| mn-frontend-default-fix | Persisted UI default-state repair | one-shot · goal-pr |
| mn-schema-field-alignment | Producer/importer schema alignment | one-shot · goal-pr |
| mp-accessibility-interaction-review | Keyboard interaction PR review | one-shot · goal-pr |
| mp-ci-evidence-gap | Verification evidence review | one-shot · goal-pr |
| mp-data-migration-handoff | Next-operator migration handoff | one-shot · goal-pr |
| mp-frontend-state-review | List/detail UI consistency review | one-shot · goal-pr |
| mp-iac-rollback-design | Infrastructure preparation and rollback boundary | one-shot · goal-pr |
| mp-performance-investigation | Evidence-backed causal investigation | one-shot · goal-pr |
| pf-api-pagination-behavior | Request/response client implementation | one-shot · goal-pr |
| pf-ci-cache-flake | Reproducible CI reliability investigation | one-shot · goal-pr |
| pf-data-schema-evolution | Backward-compatible schema and local plan | one-shot · goal-pr |
| pf-frontend-async-state | Asynchronous UI lifecycle implementation | one-shot · goal-pr |
| pf-library-compat-upgrade | Cross-platform library adapter migration | one-shot · goal-pr |
| pf-observability-redaction | Diagnostic policy repair plus proposal review | one-shot · goal-pr |
| pf-performance-regression | Measured optimization with behavior preservation | one-shot · goal-pr |
| pf-review-error-contract | Caller-visible error-contract review | one-shot · goal-pr |

Use the existing `ask-benchmark.mjs prepare-primary-inputs` command to produce
`inputs/<fixture-id>/task.md` and `workspace/**`; provide only the selected input
directory in a fresh model session. `records/`, source checkout, private grading,
historical versions and other answers are operator inputs, not model inputs.
The existing preparation report's 72 P/K2/F placeholders remain unexecuted and
are not the 48-trial practical measurement plan.

For one-shot delivery, provide the selected task unchanged and request its
required artifacts and a concise statement of executed checks and limitations.
For goal-pr delivery, add only the explicitly supplied repository/branch and
draft-PR destination; retain the same task outcomes. JSON outputs remain where
the real consumer is a reviewer or operator importing a structured result. The
24 rows deliberately retain configuration, documentation, test-only, code,
review, investigation and operational-planning work rather than inventing a
larger application to equalize file formats.

## Verification contract

Artifact ID: `verification-primary24-practical-20261104`
Artifact type: `verification`
Upstream refs: `spec-primary24-practical-20261104`
Selected proof: `formal_verification_contract` (public contracts, performance
measurement, multiple sessions and a merge claim).

| Obligation | Required evidence |
|---|---|
| All 24 tasks are improved without collapsing their roles | Per-task public change inventory and fresh independent review of the full distributed inputs |
| Contracts and protected scope still match the published bytes | Existing public-input preparation/reverification, refreshed input/command/output/scope references and negative drift tests |
| Necessary behavior survives removal of public answers | Focused public tool/contract checks; separate controller-side semantic compatibility review; unqualified grading stays unknown |
| Model inputs exclude private grading and past answers | Exact prepared file inventory; isolated fresh workspaces and equal policy in both arms |
| Measurement records reflect real individual trials | Fixed plan, one-shot terminal evidence, monotonic elapsed interval, official available usage and coverage limitations for every slot |
| Integration and PR reflect the final source | Relevant repository tests, complete required CI and a fresh final-HEAD review |

Passing public validators proves only their declared scope. Missing native
qualification, semantic grading authority, official usage or terminal evidence
remains missing; it is not a zero score, successful run or model defect.

## Measurement plan

The proposed practical measurement is 24 canonical tasks × two actual conditions
(`ASK off`, `ASK full`) × one fresh implementation trial: **48 trials**. Use
`gpt-6.1-terra` with `low` reasoning. Run trials sequentially, with no Sol trial,
automatic retry or hidden replacement. This is one observation per condition,
not a replicated estimate of ASK's general effect. The optional goal-pr delivery
mode is not an additional set of trials.

Before the first trial, freeze the revised public-input version and per-file
hashes, common prompt, exact ASK installation revision/inventory, CLI and runner
identities, model/effort, tool/subagent policy, permissions, network and source
exclusions, canonical order and all 48 fresh output locations. The same task bytes
and execution policy apply to both arms; the declared ASK assets are the intended
difference. Candidate implementations cannot read the source checkout, grading
materials, old answers or another trial. Keep work/logs and final artifacts in
durable local storage and confirm each terminal state before starting the next.

The previous Mac single-trial runner is reusable without inventing another eval
engine. Its `--ask` flag is a label, so installation and isolation must be verified
separately. Native raw logs and answers remain local. Report root usage components
and trial-wide coverage separately; never add cached input to input tokens, infer
child coverage, substitute self-reported tokens or turn missing usage into zero.

This practical measurement is separate from the existing formal primary batch.
That batch has three closed P/K2/F conditions, and its v10 runtime authority is
explicitly unqualified. Its old gates, selectors and reservations are not relaxed
or renamed to start two arms. New task bytes cannot inherit old semantic grading
admission. A practical run and public check pass do not establish formal primary
admission or a comparable historical primary score. The final plan must identify
the actual supported execution route and remaining grading limitations before
any model dispatch.

## Completion and human review

The implementation record will link the exact changed files, executed checks,
per-task deltas, trial records, unavailable evidence and independent reviews.
Prepare a separate draft PR from the ceiling work. Keep it unmerged until the
user has reviewed the actual changes and measurement results and explicitly
approved the merge. After approval, recheck the remote base/head, required tests,
CI and final-head review before the normal merge.

Current state: all 24 public tasks are revised and the 241 distributed model
input files are prepared and reverified. Pending authority metadata has been
refreshed using the existing writers, with static compatibility verified for all
24 tasks. See the [per-task change and evidence inventory](primary-24-practical-review.md).
No implementation model trial has started. The proposed 48-trial practical
execution method, effective isolation, final installed ASK identity, full CI and
measured results remain unverified or pending. This work does not establish
formal primary admission or authorize merging before the user reviews results.
