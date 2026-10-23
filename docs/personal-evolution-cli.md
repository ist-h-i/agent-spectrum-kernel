# Personal evolution command

Implementation Contract: `personal-evolution-cli-implementation-v1` (implementation).
Revision: 3. Upstream artifact ref: `personal-evolution-cli-spec-v1@3`.
Upstream: #385, #379; base `189ca2a4f47db9c0f3ab63677afa58a7a0e90622`.
Change boundary: a CLI composing the existing generation, Prompt pair, saved-result
and human-decision APIs; no new runner, scoring, installation or authority model.

Spec: `personal-evolution-cli-spec-v1` (spec).
Revision: 3.

- PECLI-1: configure existing Asset/Portfolio/evaluation references once. A user
  then supplies a public problem summary and the configured target to `start`.
- PECLI-2: generated content needs explicit source approval. Reading results
  grants no evaluation or decision trust. Confirmation and decision are separate
  commands; missing authority is a saved, reasoned needs-action outcome.
- PECLI-3: resume reads completed generation/comparison records and advances from
  them without repeating either dispatch. Consumed incomplete work is preserved.
- PECLI-4: approved hold can close with the existing no-op receipt and an unstarted
  next request. Candidate rejection/adoption and physical installation are never
  silently reported as applied. Missing dimensions remain Unknown.
- PECLI-5: explicitly fix the existing scoring-version selector before generation.
  Missing, invalid or drifted selectors cannot fall back to checkout grading refs;
  both comparison roles retain its exact selector and selected public bindings.
- PECLI-6: explicitly recover interrupted, wholly unstarted local preparation
  into a fresh disjoint directory. Preserve generated files, source approval and
  old partial files. Verify the fixed source revision, confirmed cycle/review
  snapshots and all inputs before using that revision's preparation/sealing and
  driver inspection APIs. Publish the absent cycle pair snapshot only after
  both roles are sealed, preflight-ready and unstarted; stop without dispatch.
  Started/unknown work, input drift, locks and output collisions block recovery.
  A failed attempt retains its new partial files and never retries automatically.

Verification Contract: `personal-evolution-cli-verification-v1` (verification),
revision 3; upstream artifact ref: `personal-evolution-cli-spec-v1@3`,
selected `formal_verification_contract` under
`ask.verification-proof-policy@1.0.0` because the CLI crosses persisted lifecycle
and cross-module boundaries and feeds a PR handoff (canonical triggers
`state_concurrency_persistence_lifecycle_or_cross_module`,
`multi_session_multi_agent_or_handoff`, `merge_release_or_stable_trace`).
Focused obligation: PECLI-1–6
through an artificial public input, fake provider, runner and original grading
interface, including repeated resume and missing/declined review. Command:
`node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs`.
Existing driver/primary-loop tests and repository CI supply regression evidence.
PECLI-6 additionally requires artificial interruption/recovery, immutable old
files, unchanged approval, real existing seal/inspect APIs with fake grading
preflight, no dispatch, source/input drift and started/unknown/collision refusal,
and preservation after another preparation failure. Command:
`node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli-recovery.mjs`.
Actual provider, model quality, Mac application and all-Skill support remain
Unknown; synthetic success does not prove them. Evidence and final handoff are
recorded in the PR.

## One-time management input

`configure --config /absolute/existing-resources.json --profile /absolute/profile`
snapshots local management input. It reads existing resources and starts no model.
The JSON contains the existing API inputs: `storeRoot`, generation `blueprint`,
`generationActor`, `trust` (the three existing Asset/Portfolio/high-impact trust
arrays), `portfolioAuthority`, `selectorContext`, `experimentTemplateObjectDigest`,
`evaluationAuthority`, `generation` (`executable`, `timeoutMs`), and `evaluation`
(`publicInputRoot`, `cliBin`, `cliVersion`, `model`, `reasoning`, `evidenceKind`,
`scoringVersion` with the existing fixed manifest `path` and raw `digest`,
`gradingResources` with distinct `baseline` and `challenger` path/digest refs).
The blueprint selects a nonempty, duplicate-free subset of the single 24-task
primary catalog in catalog order using `blueprint.evaluation_scope.fixture_ids`.
There is no new-user nine-task mode. Evaluation resources remain local.
The template retains its predeclared recommendation and action policy.
The scoring selector is required and checked through the existing scoring-version
verifier, including pinned resource bytes, before a profile is saved. Both roles
use that version's evaluator/freeze references. This selects an existing version;
it does not revise scoring or admission. Older profiles lacking the selector need
a fresh explicit configuration before new execution; saved completed results
continue to use their original records.
Each cycle uses a fresh grading output root; the fixed resource template's
fixture references are unchanged. Cycle directories must be fresh and outside
the ASK source checkout, CAS and fixed grading resources. The profile pins this
source revision; a source upgrade requires a fresh management profile before
new execution. Saved completed work is inspected through its existing records.

## User procedure

Run each operation with `node scripts/ask-personal-evolution-cli.mjs`:

```sh
start --profile /absolute/profile --cycle /absolute/cycle-1 --target TARGET --problem /absolute/public-problem.txt
status --cycle /absolute/cycle-1
review-source --cycle /absolute/cycle-1
review-source --cycle /absolute/cycle-1 --approve --reason 'Reviewed these exact files and inherited scope/effects for this evaluation.'
result --cycle /absolute/cycle-1
confirm-evaluation --cycle /absolute/cycle-1 --confirm --reason 'Reviewed the saved comparison and its missing evidence.'
decide --cycle /absolute/cycle-1 --approve --reason 'Accept the proposed hold; effectiveness remains unproven.'
```

`TARGET` is the configured Prompt stable ID. The problem file is a bounded,
user-reviewed public summary of the actual problem; do not include credentials,
private answers or raw development history. `start` authorizes one generation
and one fixed comparison under the profile, with the explicit source-review
pause. It will invoke the real configured provider/runner when run normally:
the development tests replace dispatch only inside their isolated test process.
Actual execution requires the user's direct authorization to Codex; this change
does not launch it during development.

Use `start --cycle /absolute/cycle-1` to resume. Review approval resumes the same
authorized cycle through evaluation; it does not approve model effectiveness.
Both review operations without their affirmative flag are read-only. `decide
--decline --reason '...'` records a declined proposal. Each result includes its
reason, existing artifact refs and the next command. The local `readout.json` is
a replaceable presentation cache, never authority; status is rebuilt from the
existing records and immutable command inputs.

Source approval attests only that the exact generated content was reviewed for
the inherited applicability, permissions/effects, source safety and freshness
for this comparison, without new high-impact behavior. A distinct
immutable reviewed version keeps the generated content unchanged and retains
unevaluated quality, unknown ownership/license and the exact original parent.
High-impact changes require their existing separate path.

After a completed no-op, `next --cycle /absolute/cycle-1 --output /absolute/cycle-2
--problem /absolute/next-public-problem.txt` prepares a fresh unstarted request
referencing the prior receipt. `start --cycle /absolute/cycle-2` starts it when
separately authorized. A consumed invocation with no complete saved result is
needs-action, never an instruction to rerun old work. Partial child reports and
grading artifacts stay in their original output directories.

An abrupt process/host termination can leave the empty `.command-lock` directory.
The CLI stops further mutations with `command_in_progress_or_interrupted`.
First confirm the original generation/comparison processes have terminated and
inspect `status` plus the original invocation records. Only then remove that
empty lock with `rmdir /absolute/cycle/.command-lock` and resume the same cycle.
Consumed incomplete work still remains needs-action; removing a lock grants no
retry or new authority. The tested lost-return case runs `finally` and removes
the lock; it does not prove automatic recovery from every kind of interruption.

## Recover interrupted local preparation

An approved source can have a partial `evaluation/` but no `pair.json`, invocation
or child start. Ordinary `start` preserves this state. Use the explicit
preparation-only operation after reading the original records:

```sh
node scripts/ask-personal-evolution-cli.mjs recover-preparation \
  --cycle /absolute/cycle-1 \
  --source /absolute/clean-fixed-ASK-checkout \
  --output /absolute/new-unused-preparation-directory \
  --input-digest sha256:CONFIRMED_CYCLE_INPUT_SNAPSHOT_DIGEST \
  --source-review-digest sha256:CONFIRMED_SOURCE_REVIEW_SNAPSHOT_DIGEST
```

Copy the confirmed `digest` fields from `cycle-1/input.json` and
`cycle-1/source-review.json`; verify their values and the candidate first.
The output parent must exist and the output must be absent and disjoint from
the old cycle, source checkouts, CAS, public inputs and resource templates.
Existing output is preserved and refused, even after a failed recovery.

`--source` defaults to this checkout. For an older profile, explicitly select
its unchanged clean checkout at the exact `profile.sourceRevision`. Git checks
ignore replacement objects so replacement refs cannot mask changed API bytes. The new
command owns only the command lock and atomic publication of the absent cycle
pair snapshot. An isolated local Node worker imports that fixed checkout's
existing generation-status, preparation, sealing and driver-inspection APIs.
It does not upgrade/rewrite the old profile, source approval, generated content,
plans, scoring version or grading originals. The fixed code must provide those
existing APIs; this is a compatibility helper, not execution under a newer
evaluation definition. Preparation can add immutable objects to the dedicated
CAS and creates local comparison repositories in the fresh output.

Recovery requires a completed generation receipt, the existing explicit source
approval and unchanged generated/input/resource bytes. Every existing partial
comparison must have a valid plan, exact saved copies and wholly unstarted
slots. Starts, evidence, unknown/torn plans, unknown preparation entries,
grading outputs, an existing pair or a command lock stop recovery. No automatic
process recovery or retry is attempted. A new failure retains the new partial
directory and leaves `pair.json` absent; inspect it before choosing any further
action. The earlier readout/error cache is retained.

Success runs existing pair sealing and original grading resource preflight,
then saves `pair.json` once and returns `prepared_comparison`. It starts zero
generation, comparison or grading processes. Inspect the fixed pair and obtain
a new direct human instruction before `start --cycle /absolute/cycle-1` in the
fixed source checkout. Source approval is already recorded; do not repeat it.
The profile's fixtures, six-session-per-fixture protocol, budgets, retry 0 and
concurrency 1 remain fixed. Evaluation confirmation and judgment remain later
human actions after saved results exist.

Preparation Git errors now include a closed operation label, with a validated
object ID for `cat-file`. They retain no arbitrary argv, stderr or environment.
For an immutable older API, the isolated worker observes its `spawnSync` failure
and appends the same label without changing its arguments, return values,
timeouts or retry behavior. It restores the builtin binding before exiting;
the supervising process and fixed source files are unchanged. An operation label
identifies the failed call, not the underlying OS cause of `EAGAIN`.

An approved `reject_candidate` decision now creates and verifies a completed
receipt retiring only that candidate in the derived Registry snapshot, retaining
the baseline and exact Portfolio. `next` passes its result Registry and receipt
to a new request. Adoption remains a separate pending lifecycle action; this CLI
does not adopt a candidate into a Portfolio or apply it to the Mac.
A positive recommendation needing a separately fixed lifecycle plan is reported
as needs-action, not converted to a hold or auto-approved.

For bounded unattended composition of these same operations, see
[the run policy and procedure](personal-evolution-unattended.md).


## Single-catalog task selection and old-profile compatibility

New `configure` inputs select registered tasks through
`blueprint.evaluation_scope.fixture_ids`; omitting the old `evaluation.fixtureSet`
means the canonical 24-task catalog. The saved profile explicitly pins that
selection. Selecting one or several tasks does not select a different rubric,
relax private-resource admission, authorize adoption/apply, or start evaluation.
The fixed v7/v8/v9 selector and separate role resource maps still bind the
canonical catalog; the selected tasks must match those exact resources.

Old immutable profiles/Prompt pairs/batch reports retain their old meaning. A
saved profile that omitted `fixtureSet` is read as its historical nine-task
selection, never silently expanded to 24; explicit old fields and historical
order/budgets are compatibility inputs only. To move to current catalog
selection, copy the management inputs, choose the desired catalog task IDs and
current matching scoring resources, omit the legacy selector field, then run
`configure --config NEW_CONFIG --profile NEW_PROFILE` into a fresh directory.
This creates a new snapshot and starts no model. Keep the old profile/cycles and
all saved results. A source upgrade already requires a fresh profile; do not edit
an old profile or relabel an old score to migrate it.

Verification: default full catalog and mixed-subset preparation, no model calls,
unknown/missing evidence preserved, invalid/duplicate/reordered IDs rejected,
separate role resource pins and saved-profile compatibility. These software
checks do not qualify native execution, private grading or model quality.

New request/cycle creation (`start --profile` and `next`) and new pair sealing
require the current explicitly pinned catalog selection. Reading an old profile
does not grant permission to create another old-format cycle/pair; these writers
stop with a migration message before creating output or applying alignment.
Existing cycle status/results and verification of already sealed old pairs keep
their original read path. Never migrate a pair by changing its saved fixture IDs.
