# Primary evaluation batch connection

`SPEC-PRIMARY-BATCH-1` binds the nine prepared single-task comparisons in
`PRIMARY_FIXTURE_IDS` order, once each, to 27 slots. It is a thin coordinator over
`readUserComparisonPlan`, `inspectUserComparison`, `startUserComparison` and the
native single-task reports. It does not create a runner, OS process manager,
source grader, retry mechanism or condition alias.

## Fixed manifest

The external JSON has `kind: ask_primary_evaluation_batch_manifest_v1`, a fixed
`batch_id`, canonical new output `root`, `conditions`, exact `limits` and nine
ordered `blocks`. `limits` is `{overall_timeout_ms:172800000,
token_budget:45000000,retries:0,concurrency:1,resume:"forbidden"}`. Conditions must
match the actual IDs in every child plan. Neither legacy Kernel nor a future
candidate is silently renamed. The currently installed child-plan reader must
support the selected candidate before preparation can pass.

Each block contains:

- `fixture_id`, canonical prepared `root`, exact `run_id` and `plan_digest`;
- `source_digest`, `task_digest`, `verification_digest` from that plan;
- canonical `public_input_root` and `input_manifest: {path,digest}`;
- `grading: {status,blockers,timeout_ms,binding}`. The exact binding fields are
  `fixture_id`, `input_manifest_digest`, `evaluator_bundle_digest`,
  `scoring_input_freeze_digest`, `profile_id`.

The public manifest is the existing fixture `input-manifest.json`, with its raw
byte digest, exactly one fixture and `task.md` plus `workspace/**` files. File
path sets, bytes and digests must match both the fixed public copy and the seed
plan's `source.inventory`. The seed retains `task.md` and the `workspace/` prefix.
The plan task digest must match manifest `task.md`. The seed repo is an
independent copy of the public input. Batch output, each seed, each public copy
and each comparison root must be disjoint. Manifest files stay outside execution
roots and seed repos. This is local path separation, not OS access enforcement.

Every child is a fresh `single_shot_v1`, has no `rerun_of`, binds `token_budget`
5,000,000 and `overall_timeout_ms` at most four hours. No legacy ownership
inspection is attempted. Plan bytes, prompt, task, verification recipe/reporter,
source inventory, private baselines, pending workspaces and Git metadata are
checked without launching a model. Preexisting start artifacts, output,
changed inputs, duplicate slots/IDs and incomplete publication refuse dispatch.

## Model-free commands and programmatic connection

```sh
node scripts/ask-primary-evaluation-batch.mjs prepare /absolute/manifest.json
node scripts/ask-primary-evaluation-batch.mjs inspect /absolute/batch-root
node scripts/ask-primary-evaluation-batch.mjs report /absolute/batch-root
```

The CLI intentionally exposes only model-free actions. Preparation copies exact
external manifest bytes and saves its digest plus preparation blockers. Report
retains every one of the 27 slots, including missing output, null quality,
unknown usage and null cost. A missing grader is a blocker, not a zero score.

Programmatic `startPrimaryEvaluationBatch(root, confirmedManifestDigest,
{gradingAdapter,signal})` requires the human-confirmed external manifest digest,
unchanged external and copied manifest bytes, all child capabilities and every
connected grading preflight. It creates `consumption/` with exclusive mkdir
before the first dispatch. That directory is never deleted; incomplete or
unknown consumption permanently forbids another start. There is no resume API.

Observed preparation/inspection/start require a registered factory-created adapter
from `ask-primary-evaluation-grading.mjs`, recognized by its private WeakSet
predicate. Caller objects with `ready` labels are blocked before consumption;
they cannot mask missing private/source/profile checks. The current thin grading
adapter preserves missing profile/private evidence and remains blocked.

The grading adapter owns actual scorer connections. Its synchronous
`preflight(block, loadedPlan)` returns `{status:"ready"|"blocked",blockers:[]}`
after checking the fixed `block.grading.binding` against real input, evaluator,
freeze and condition-profile evidence. Missing authority/private assets must
return blocked. All nine preflights run before consumption; the relevant
preflight repeats immediately before each dispatch. Its async
`grade(block, childReport, {signal,deadline_at_ms})` returns
`{status:"completed", ...evidence}` only after independent grading children
have finished and fixed-source grading evidence is preserved. Any incomplete
status, exception, interruption or deadline stops the batch. This coordinator
does not infer native grading from user-comparison test outcomes; it preserves
adapter evidence, while quality fields remain unknown for the owning reporter
to reconcile. The adapter must obey the supplied abort/deadline and five-minute
reservation; synchronous blocking or a noncooperating adapter cannot be forcibly
terminated by this thin layer.

`startComparison` can be injected only for wholly synthetic plans. Omitting it
on synthetic plans refuses before consumption, preventing tests from calling
the production `startUserComparison`. Production requires wholly observed
plans and the ordinary existing start function. The tests use an entirely fake
start adapter; neither model nor grading process is invoked.

## Admission, stopping and reporting

The 48-hour deadline starts at consumption and includes grading. Each block
reserves its entire fixed child overall limit plus declared grading time (at
most five minutes), without rewriting child plans. The active AbortSignal
carries deadline/interruption to the existing child controller. Native
single-task start/terminal/report semantics remain authoritative; each returned
native report is saved with digest and exact run/plan identity.

The shared 45M allowance is reported input plus output lower-bound admission
between blocks; every child also binds its own 5M allowance, totaling 45M.
Cached input is not added again. An exceeded known lower bound forbids further
start and grading. Missing usage stays unknown and does not become measured
zero. Both allowances are admission checks, not provider hard caps or cost
promises. Local timers and synchronous evidence I/O can overshoot; forced
controller termination cannot prove descendant/provider shutdown. Saved PIDs
are never probed or recovered.

Only terminal native `completed` or `verification_failed` slots with valid
receipts and confirmed process completion permit grading or subsequent blocks.
An independent verification failure can therefore continue. Denial,
authentication, interruption, unknown model/verification termination, corrupt
receipts, incomplete children and grading failure stop all later model/grading
starts. Requested blocks whose result is absent remain unknown; untouched
blocks remain not_started. Consumption publication failures remain conservative
and cannot authorize retry. Model failure, ASK behavior, task ambiguity, grader
error and environment failure remain unknown until the owning analysis provides
evidence.

## Implementation and verification trace

`IMP-PRIMARY-BATCH-1` changes only the new coordinator, focused tests and this
contract. Upstream: `PLAN-PRIMARY-PRACTICAL-9-20261012-r2`; no model-run authorization
is inherited. `FVC-PRIMARY-BATCH-1` selects
`formal_verification_contract` under `ask.verification-proof-policy@1.0.0` because
of `public_api_schema_or_compatibility`, `state_concurrency_persistence_lifecycle_or_cross_module` and
`multi_session_multi_agent_or_handoff`.

Verification obligations: O1 exact nine-input/plan/order/condition binding and
no model dispatch in prepare/inspect/report; O2 entirely fake sequential start
with one-time consumption and independent failed verification continuation;
O3 conservative stopping for uncertainty, auth, denial, interrupt, deadline,
usage, mutable state and partial publication; O4 native per-task boundary reuse
without shared runner/schema/CI changes. Focused command:
`node --test scripts/test-ask-primary-evaluation-batch.mjs`. Execution evidence:
`../evidence/primary-batch-tests.log`. Live execution and actual private grading
are unverified and remain blocked until the owning connections and a new exact
human start instruction exist. Parent-owned native recipe and condition-candidate
changes are separate review boundaries.
