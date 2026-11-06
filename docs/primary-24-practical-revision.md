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
Preserve the checked-in `binary_scope_verification_v1` result profile, requirement
arrays and scoring scope; binding refreshes do not authorize a scoring-profile
migration. Versioned historical selectors remain separate.

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

## Host preparation and frozen grading source

The next two paragraphs record the initial preparation boundary. The integration
update below identifies the later frozen grading checkout.

The initial host descriptors pinned the reviewed task and raw metadata bytes for
all 24 revised inputs. Retained-event authorization observations also pin the
reviewed task and verification-contract versions for the seven scoped fixtures;
they classify local fictional work and grant no execution permission. Task
classes, risk boundaries, action rules, capability checks, reference format and
the principles renderer remain unchanged. The original exact
lookup bytes are retained with their historical Git source, not silently reused
against revised task bytes.

The initial pending grading runtime was retained in a separate checkout at
`b0e3e99829255106a74d8516d58179886df7ee8e` (tree
`c557de7a0a0a0f72ed7fa159a9fd78f644ddba3e`). It contains the revised 241 model
input files and closed v1 metadata, with runtime sources pinned to
`483d861b376835e52f65138d39d9eb3a113d9bdd`. Use the existing explicit
`frozenSourceRoot` resource boundary. The live host checkout must not substitute
for that evaluator runtime after its preparation descriptors change.

Do not regenerate the private chain merely to follow host descriptor pins:
the descriptor's metadata hash and the evaluator graph's module hash would form
a dependency cycle. Keep exact drift rejection and immutable source checks.
This separation reuses an existing API; it does not itself establish resource
admission or formal runtime qualification. The later practical measurement is
recorded below and does not change those authority limits.

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

## Measurement plan and executed series

### Original plan and superseded child policy

The following records the original planning requirements. The completed
`normal24-v2` series below used a later execution policy; the original
child-disabled policy is not a description of those 48 trials.

The practical measurement plan is 24 canonical tasks × two actual conditions
(`ASK off`, `ASK full`) × one fresh implementation trial: **48 trials**. Use
`gpt-6.1-terra` with `low` reasoning. Run trials sequentially, with no Sol trial,
automatic retry or hidden replacement. This is one observation per condition,
not a replicated estimate of ASK's general effect. The optional goal-pr delivery
mode is not an additional set of trials.

The initial native-runner plan proposed ephemeral sessions with both agent
features disabled in both arms: one root Terra low session per trial and no
nested model or reviewer sessions. That policy was superseded for the completed
comparison. The older 15 ephemeral/declared-child-disabled trials remain a
separate historical series and are excluded from the reported 48. Self-review
does not satisfy an independent-review requirement, and execution authorization
does not establish environment qualification.

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

### Completed practical measurement (2026-11-05)

The clean `normal24-v2-terra-low` series completed **48/48 root CLI trials**:
24 tasks, once with ASK off and once with ASK full, requested as
`gpt-6.1-terra` / `low`, in fixed off-before-on order. The model-facing source
was frozen at `f71286a1369c4c36aca01116c2e36465cf5d9995`. Later integration
repairs through `303d242dcde51e494ea81ec7b806bdf731146474` did not change those
model inputs. The later pending grading runtime is the separate frozen checkout
at `8d589ceebef5777494c0ef0eb655d9e00d7f618b`; this supersedes the initial
`b0e3e998` preparation reference above, without granting formal admission. The root CLI intervals did not overlap, all 48 exited zero, and
all 48 retained-work archives and receipts were hash-verified. CLI exit zero
is execution evidence, not proof that every task outcome was met.

The actual route used persistent sessions and normal child-agent behavior.
Child use, history inheritance, child model and reasoning effort were left to
the model; parent-child matching was not forced. The recorded stable feature
settings were `multi_agent=true`, `multi_agent_v2=false`, with neither overridden.
Both conditions shared prompt, CLI settings, permissions and public inputs;
the fixed ASK assets were the intended difference. Sixteen child records were
observed (eight per arm): 15 normal terminals and one interruption, with observed
Terra/low settings. Observed records do not establish complete child coverage or
that every requested independent review occurred.

The CLI window was 2026-11-05 11:58:15–13:30:59 UTC. Two operator-only process
classifier stops were repaired and reviewed, and already-started trials were
adopted once. No automatic model retry or time cutoff was used. The initial
environment-affected pair and the older 15 trials are retained separately and
excluded. Sol remains on hold.

The [completed measurement and integration inventory](primary-24-practical-review.md#completed-measurement-and-integration-2026-11-06)
records observed duration and root usage, reference content judgments, mandatory
verification gaps and evidence locations. Four answers retain partial assessments;
formal scores and full parent/child token totals and costs remain null. One
fixed-order observation per condition does not establish ASK's causal effect.
The practical results do not establish formal primary admission.

## Completion and human review

All 24 public tasks are revised and the 241 distributed model input files are
prepared and reverified. Pending authority metadata was refreshed with the
existing writers; static compatibility and practical execution are separate
from formal grading admission. See the [per-task change and evidence inventory](primary-24-practical-review.md).

At integration head `303d242dcde51e494ea81ec7b806bdf731146474`, all four CI
workflows completed successfully. Those historical results do not certify a
later documentation commit; final-head CI and independent review must be checked
again before merging [PR #451](https://github.com/ist-h-i/agent-spectrum-kernel/pull/451).

The original plan required explicit approval after result review. On 2026-11-06
the user requested independent review and merge. That authorization covers the
normal merge after findings are resolved and the remote base/head, required
checks and final-head review are verified; it does not turn the remaining
measurement unknowns into confirmed results. This update does not claim that
merge or final-head review has completed.
