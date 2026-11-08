# Human-supervised instruction improvement

This opt-in reference path composes the existing instruction Registry, Codex
generation connector, retained external runner and normal setup installers. It
does not change the formal Evolution certification, its evidence dimensions or
its application-receipt type. A candidate does not need to win to finish a loop.

The two human judgment types are:

1. Approve or reject an exact public Eval packet before any evaluation starts.
   The packet binds candidate, automatically selected cases, public input
   digests, repetitions, both conditions and runtime identity.
2. Approve or reject the reported change and exact normal-owner application
   plan. A later restoration is another occurrence of this same change judgment,
   with its own exact packet; an earlier approval cannot authorize another target.
   When no application owner has been selected, explicit `normal_target: null`
   instead presents a result-review packet without an application plan. Approving
   that result does not authorize installation.

Between these stops, `advanceSupervisedInstructionLoop` automatically invokes
generation, registration, public-catalog case selection, one trial at a time,
reporting, and normal application planning. On change approval it invokes exact
apply, Registry version activation, owned-staging cleanup and final reporting.
On either rejection it retires the unused candidate, cleans owned staging and
reports completion. It does not finish at `decision_declined`.

An explicitly unselected owner is a result-review-only run. After reporting it
stops at `awaiting_result_review`, without invoking plan or any owner operation.
Result approval or rejection finishes with `result_approved_retained` or
`result_rejected_retained`; both retain candidate materializations and evidence.
Eval rejection in this mode also retains them: without an owner boundary, the
host cannot establish the existing disposal preconditions. No fake owner path
is needed or created. Target-bound runs keep the existing apply/reject/cleanup
behavior. A nonexistent string path is still a target error, not an implicit
request to create an owner or switch to result-only mode.

The public case selector ranks changed-instruction coverage, domain diversity
and previous observed cost. People review its result. It never reads private
answers or pretends these observed cases are a holdout. The legacy single-Asset
generation worker still supports its v1 fixed Markdown inventory. The concrete
Full/native profile instead uses `instruction-loop-full-candidate.mjs`: one
provider response can revise multiple selected canonical Skills and add/remove
their Markdown references. It makes an independent local Git version, refreshes
derived bindings through the existing adapter-fixture writer, and uses the normal
kernel/Codex installers to render the entire Full layout. Mirrors, owner state,
executables, tests and grading data cannot be model-authored changes. Only selected
public Skill Markdown and a bounded goal enter the generator input; the executable
checkout and private evaluation resources remain operator-side.

The Full provider uses the existing Codex process transport when separately
authorized. The model-free provider reads a pinned response fixture. They are
distinct execution kinds; fixture results never establish live model quality or
performance. Ordinary transport does not itself prove effective read isolation.

## Host transport and execution

`instruction-loop-command-runtime.mjs` executes fixed, pinned, host-owned argv
without a shell. Each worker receives an immutable request path and a fresh
result path. It publishes `{request_digest, status, output}` itself before exit.
This connects real execution, rather than just recording intended operations.
Workers must durably report results and inspect their original runner receipts.
Commands, source pins, destinations and owner authority are executable local
configuration, never values selected by generated text or imported CAS claims.

The existing external trial runner remains responsible for CLI, permissions,
fresh conversations, task isolation, timing, retained answers and available
usage. A trial worker wraps that runner and returns process closure plus the
original receipt references. The controller imposes no child/history/model
matching rule, timeout or usage-completeness prerequisite. It cannot start the
next root until the previous worker provides `ready_for_next_root: true`.
Known failures with confirmed closure enter the report; unknown process state
stops automatic launches. Missing usage stays null. Cached input is a subset of
input, and observed child counters do not establish complete hierarchical usage.

The standard Codex task adapter preserves all reported errors. A recognized
WebSocket idle-timeout `Reconnecting... n/5` notice is recorded separately as
recovered only when a later `turn.completed` follows it and the local invocation
closes cleanly with exit code zero. Fatal, authentication/approval, unrecognized
or subsequent errors, timeouts and uncertain closure do not use this exception.
This establishes transport completion, never task quality or runtime acceptance.
The behavior applies to newly prepared adapters; existing pinned runs and their
receipts are not rewritten or automatically replayed.

The concrete native adapter retains the original control's conservative closure
flag. A failed root for which that control does not issue readiness remains stopped;
the adapter does not rewrite its completion record or silently relaunch it.

The CLI takes a host-owned config containing `policy` and `runtime`:

```sh
node scripts/supervised-instruction-loop-cli.mjs advance --root RUN --config CONFIG
node scripts/supervised-instruction-loop-cli.mjs status --root RUN
# The host supplies a real human decision for the displayed packet digest:
node scripts/supervised-instruction-loop-cli.mjs advance --root RUN --config CONFIG \
  --decision approved --packet SHA256 --reason 'Owner approved the displayed packet'
```

`--decision rejected` performs the corresponding rejection branch. Model workers
also require `--allow-model-calls`, reflecting pre-existing execution permission;
this flag does not bypass the Eval stop. It must not be supplied for work whose
model-call budget is exhausted. `--request-restore` constructs a new change
packet after a successful application. It never means approval to restore.

At a result or change gate, `--decision deferred` records a human deferral and
leaves the same packet pending. It does not consume approval, retire or clean a
candidate, or dispatch workers; a later decision must match that packet. Eval
approval cannot be deferred through this flag. A saved result approval cannot
be transplanted to a selected owner: policy drift is refused. To later select an
actual owner, initialize a separately recorded historical-import review with the
verified completed trials, generate the exact owner plan and obtain its change
approval. Never rewrite the original journal or replay its consumed failed job.

The runtime has ten stage bindings: `generate`, `register`, `select`, `trial`,
`report`, `plan`, `apply`, `version`, `cleanup`, `restore`. All are required;
there are no silent no-op defaults. Shipped workers connect existing Codex
generation, Registry publication/lifecycle, public selection, and normal-owner
plan/apply/restore/cleanup. `instruction-loop-native-configuration.mjs` supplies
all ten concrete bindings from one pinned profile, using
`instruction-loop-native-worker.mjs`; trial/report ports are now connected.
Native preparation rebases existing own/peer paths and retains the original
runner, control, monitor and prompt. The legacy control's host-root depth is
checked before allocation so monitor rebasing cannot select another workspace.
Use a sibling of the template preparation directory for `native.root`.
Before allocating evaluation work, Full context comparison also checks that
supporting files, file modes and selected capabilities agree. Only the selected
canonical/mirrored Skill edits, regenerated owner metadata and prompt hash
bindings may differ. Missing support files cannot silently become an efficiency
gain. The comparison summary is part of the first approval packet.

The reference report worker verifies retained records and fixed judgments,
reports pairs, time, root/observed-child counters and actual child model/effort
metadata, and preserves missing components and hierarchy uncertainty. Unknown
quality stays Unknown; a reference report is not formal admission. Worker
interruptions are separate from the actual root outcome. There is no replacement
trial runner or grading standard. Pin the worker and the actual relevant source
closure, not unrelated plugin caches. The host must establish execution and
owner authority; a JSON file saying it is trusted grants none by itself.

## Normal owner and versions

`instruction-loop-normal-owner-worker.mjs` uses the reviewed source checkout's
existing `ask-setup` exact plan/apply contract. It does not pass a reference
recommendation as an `evolution_application_receipt`. Source and target identity,
source replay, conflict checks and installer verification remain in force.
Planning has no target mutation. Apply requires the actual second decision.
The source/target/staging paths are fixed by the host and must be disjoint.
Before loading any candidate executable, planning checks the registered source
root, generated Git revision, clean state and owned manifest. The resulting
candidate binding is carried in the exact plan and checked again before apply
and restore. A report from one measured candidate cannot silently authorize a
plan for a changed checkout. Historical unbound preview plans must be replanned;
they are not retroactively treated as bound approvals.

Version activation, historical restoration and retirement use existing Registry
lifecycle APIs and external owner/rollback authority. Physical normal installation
and Registry lifecycle are separate recorded operations. They are not an atomic
transaction: a partial failure preserves both records and stops for inspection;
it cannot claim that both succeeded or blindly undo an unknown partial apply.
Restoration refuses changed installer source or a changed target and uses the
standard reverse installer rollback, then checks baseline managed identities.

Cleanup compares a privately owned manifest and deletes only the listed,
unchanged staging files. It refuses symlinks, undeclared changes, source/owner
overlap and active-candidate retirement. It preserves the manifest, immutable
CAS history, Git history, reports and original trial evidence. Logical retirement
plus deletion of owned materializations is not global CAS garbage collection or
permission to delete shared source branches.

For a new Full version, the native worker archives the independently owned Git
checkout locally. Rejection first requires Registry retirement and confirmation
that the scoped owner is not running the candidate, then checks the owned source,
archive and Full-snapshot hashes before disposing of those private materializations.
The archive and CAS evidence remain. Original/shared source repositories are never
cleanup targets. These private versions belong to one host profile and scoped
owner; do not reuse them as shared source checkouts. Already absent staging files
are recorded separately from files deleted by the current cleanup.

## Resume and evidence scope

An append-only, digest-chained journal reserves each operation before dispatch.
On resume a consumed operation is inspected, never dispatched again. A worker's
durable exact-request terminal result continues the pipeline. Missing/partial
results remain uncertain. A dead coordinator lock can be recovered, but does not
prove its child stopped; a live/reused lock PID or uncertain lock is a stop.
This is at-most-once dispatch with honest uncertainty, not exactly-once side
effects or power-loss transaction guarantees.

The native runtime's read-only `inspect_argv` can recover a consumed trial from
the original control's completion, process closure, retained archive and CLI
events. It never calls launch or a model. Inspector failures retain diagnostics.
A worker interruption remains in the report even when the native root completed
normally. CLI counters can remain usable when the runner's secondary counter copy
is missing; absent components stay null, while contradictory or malformed records
are still rejected.

## Full/native profile

`createNativeInstructionLoopConfiguration(profilePath)` returns the controller's
`{policy, runtime}` and pins the actual workers/profile. Relevant profile inputs are:

- `generator`: clean baseline Git source/revision, selected Skill names, goal,
  fresh candidate/Full/staging roots, existing Registry parents and trusted owner
  contexts, runtime metadata, and frozen public support files. `provider.kind` is
  `codex` or the explicitly model-free pinned `fixture` response.
  For repository-contract checks before registration, opt into
  `generator.sourceValidation: {kind: "ask_repository_v1"}` with a complete
  local baseline history. The [source validation contract](instruction-loop-source-validation.md)
  retains failed diagnostics and derives the validation report without weakening
  entrypoint rules. This is source validation, not efficacy or case approval.
- `native`: original prepared config/digest, wrapper digest, original
  control/monitor/prompt hashes, Python executable, sibling preparation root and
  a fresh work population. The existing protected operator root, permission
  boundaries and cross-series mutex remain in force. There is no population-parent
  deny. Fixture mode requires the shipped non-model executable.
- `policy` and `selection`: public catalog/digests and metadata, condition/repetition
  reservation, selection count and coverage/cost inputs. The selector chooses case
  IDs; the human reviews the resulting rows, model/effort and runner identity.
  The first packet also states the fixed quality criteria and whether judgments
  exist. No new model judge is silently started when reference judgments are absent.
- `report`: fixed criteria, available hash-bound reference judgments and optional
  observed-child recovery. These stay operator-side and never enter the generation
  payload or public task workspaces. Missing judgments are explicitly unknown.
- `normal.target` and `assetAuthority`: the scoped owner and existing owner lifecycle
  capability. The exact target/plan still requires the second human judgment;
  a producer or a JSON record is not an independent authority.
  For result-review-only runs set both `normal.target` and
  `policy.normal_target` to explicit `null`; the native worker rejects direct
  plan/apply/restore/cleanup requests without a target. Omitted targets are not
  accepted as an implicit mode change.

Model-call flags grant only an already authorized execution budget. The concrete
worker also checks the host runtime's child-only execution capability before real
generation/trial calls. Neither a profile label nor the read-only inspector grants
that capability. Do not enable real calls merely to test this connection.

Previously approved completed trials may be imported only at initialization,
with host-verified prior approval and exact row bindings. Their journal says
`historical_import` and `executed_by_this_controller: false`. Import is not proof
that the controller generated those candidates or executed those trials. The
16 efficiency trials are historical inputs; no additional real model run is
needed to test these lifecycle connections.

Model-free tests exercise both approval/rejection branches, both stops, selection,
actual worker dispatch, result loss/recovery, unknown-root blocking, partial usage,
Registry lifecycle, rejected executable/private-path edits and report binding.
The native integration proof materializes a new multi-Skill Full Git version,
invokes the original runner/control/monitor with a shipped dummy CLI, recovers two
interrupted workers without duplicate roots, automatically reports unknown dummy
quality, and exercises normal apply/restore and rejection disposal on an isolated
owner. It also reaggregates the historical sixteen through the real report-worker
entry point, retaining the original reference results and observed-child limits.
These are synthetic execution/judgment proofs, not new model performance results,
live application approval or formal quality certification. The real Codex provider
is connected but requires separate live-call authorization and context review.
Authoring-generation usage is separate from implementation-trial usage. The
ordinary generation transport currently records duration, requested model and
scope limits, with token/hierarchy totals explicitly unknown; it is not counted
as zero or folded into the implementation savings.

The optional [continuity commands](instruction-improvement-continuity.md) connect
reviewed work summaries to actual native generation/selection, prepare a fresh
next native configuration from the completed journal, and carry public reasons
and results without inheriting approval. Adapter-neutral authoring supports
individual Skill/Prompt revisions, declared root additions and environment-only
exclusion through the existing compiler. Offline packages and local composition
locks enter the receiver's candidate/Portfolio workflow and never grant admission.
