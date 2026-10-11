# Single-shot user comparison candidate

Spec `SPEC-USER-SINGLE-SHOT-1` revision 2 references the explicit 2026-10-11
local-development delegation. It defines a new, opt-in plan contract, alongside
`SPEC-USER-COMPARE-1` and `SPEC-USER-UNATTENDED-1`. It does not reinterpret old
plans, fixed experiments, grants, rejected runs, or saved evidence. This task
initially permitted local source edits, entirely fake tests, static checks and
independent review only. The integration delta below extends that local phase;
no real comparison preparation/start/resume, model, CLI, new OS ownership
diagnosis or settings change is authorized in either phase.

Integration authorization delta (2026-10-11): the human explicitly approved
turning the six-file candidate into a PR, necessary non-model verification,
independent review and merge. Current-main reconciliation, commit/push/Draft PR,
ordinary existing non-model CI, existing generated-fixture writers and remote
main/reviewed-tree verification are now allowed. Local verification adds no
new real process-termination experiment or ownership diagnostic. This changes
publication and verification scope only, not the runtime contract or old gates.

Observable behavior delta:

- A1: a newly prepared plan may explicitly select `--execution-contract
  single_shot_v1` (programmatic `executionContract`). Its digest-bound policy
  records one attempt, zero retry, sequential conditions, `resume: forbidden`
  and `termination_scope: direct_child`. Omission preserves the old policy.
  Unsupported contracts and inconsistent policy/protocol are rejected. There
  is no fallback from a refusal or automatic creation of another run ID.
- A2: the first exclusive owner-generation directory consumes the run's start
  before any child dispatch. Parent directories are synced before proceeding.
  Existing, empty, torn or unknown owner/start/history evidence blocks another
  start. A crash may lose useful evidence and all remaining availability for
  this run; it must never reopen the start right. Condition launch intents use
  the existing immutable, digest-chained history before dispatch. Pending event
  folders survive failed persistence; records are never repaired or replaced.
- A3: the living controller holds each directly spawned ChildProcess. The
  direct-child runner calls only that object's `kill`, after spawn and before
  exit/close or a known exitCode/signalCode. It never signals a stored numeric
  PID or process group and never checks signal 0, boot time or process birth.
  The direct child is not detached. Spawn receipt observation is synchronous.
  Unknown termination/drain or failed signal is recorded and prevents later
  model and verification processes. Closed-child callbacks cannot signal again.
- A4: any interruption ends this invocation. `resume` rejects this contract
  even when later conditions were never requested. Offline inspect/report do
  not probe saved PIDs. An unreleased owner or missing terminal receipt remains
  unknown; a corrupt publication remains corrupt and consumed.
- A5: workspace separation, approved edit scope, frozen verification recipe,
  bounded logs, terminal and invocation receipts, elapsed deadline, reported
  usage lower bound and aggregation share existing processing. Preexisting slot
  outputs refuse before launch; later write collisions preserve prior bytes.
  Synthetic injected verification stays synthetic, not independent process
  evidence. Task-test failure may still continue independent conditions when
  the direct child's end is confirmed; stop failures keep existing policy.

Architecture decision (local candidate, not an accepted runtime guarantee):
add a policy branch to the existing preparation, state, orchestration and
runner modules. Reuse the exclusive generation as the consumption boundary
and reuse history/reports. No new runner, Router, Skill, OS route or generic
process manager is needed. Older resume and process-group behavior is kept
behind the omitted-contract default. The maintenance tradeoff is a small
explicit branch at start, ownership observation, child termination and report
boundaries; removing recovery reduces diagnostic and retry paths for this
contract but does not eliminate the old paths' maintenance cost. Revisit the
candidate if these branches start duplicating the workflow. No cost, failure
probability or performance improvement is estimated.

Limits and lost functionality:

- No continuation of this run after interruption, controller crash, partial
  persistence or uncertain child completion. A new run is a separate human
  decision, preparation and authorization, never an automatic retry.
- No saved-PID recovery and no claim of offline liveness. Exit/close is local
  ChildProcess evidence, not proof of an OS ownership identity or provider end.
- Forced parent termination cannot guarantee child, grandchild, helper or
  provider shutdown. Direct-child success does not certify descendant/provider
  quiescence. This candidate intentionally provides no process-tree teardown.
- Stream/drain timeouts, synchronous storage and cleanup can exceed local
  deadlines. Available usage is only a reported lower bound, not billing or
  cancellation confirmation. Unknown usage/cost is never zero.
- Atomic/fsync semantics are a local-filesystem assumption. Fake tests establish
  controller ordering and conservative state transitions, not power-loss,
  native signal delivery, malicious state alteration or cross-host guarantees.

Implementation Contract `IMP-USER-SINGLE-SHOT-1` revision 2 references this Spec.
The actual boundary is four existing scripts, one new entirely fake test suite,
and this candidate contract, plus CI registration and required generated adapter
fixture/report synchronization through existing writers. The task report holds executed results and review
findings; the contract is not a receipt. Repository implementation context is a
`template`, so current source and nearby contracts supply the bounded context.
No old ADR is superseded: this document retains the candidate decision and
review trigger without declaring operational adoption.

Formal Verification Contract `FVC-USER-SINGLE-SHOT-1` revision 2 references A1–A5.
Policy selection `PROOF-USER-SINGLE-SHOT-1` selects `formal_verification_contract`
under `ask.verification-proof-policy@1.0.0`, with observed triggers
`state_concurrency_persistence_lifecycle_or_cross_module`,
`multi_session_multi_agent_or_handoff`, `multiple_specialized_checks`,
`merge_release_or_stable_trace`.

Proof obligations:

- O1 (A1/A2/A4): entirely virtual filesystem, process and clock I/O for opt-in
  policy, concurrent starts, consumed-marker crash, partial records, duplicate
  start, output collision and resume refusal. No files outside the virtual tree
  may be read during the tested execution; no real process may be launched.
- O2 (A3/A4): fake ChildProcess, clock and signals for timeout, exit/close versus
  delayed signals/receipt error, unknown termination, and no numeric PID signal
  or ownership probe. Later condition/check admission must stop when unknown.
- O3 (A5): the same fake environment exercises actual existing scope, log,
  verification-summary, receipt, duration/usage and aggregation code. Older
  policy and pending-only resume compatibility use fake ownership metadata.
- O4: static syntax/whitespace checks and a fresh independent source review of
  safety, availability, investigation burden and maintenance costs. Missing
  native/provider/real-filesystem evidence stays NOT_RUN and cannot support
  runtime-safety, operational-readiness, performance or effectiveness claims.
- O5 (integration delta): existing adapter fixture writer is byte-idempotent;
  full bundle check, verification-proof-policy regression, generated validation
  report and repository validator pass. The fake suite runs in Mac/Ubuntu CI.
  Required ordinary non-model CI and a fresh independent exact-head review pass
  before merge; fetched remote main and GitHub merge identity must match the
  reviewed tree. Broader Issue #318 acceptance remains open.

Focused command: `node --test scripts/test-ask-user-comparison-single-shot.mjs`.
Static checks: `node --check` for changed scripts and `git diff --check`.
Do not run the older comparison suites locally here: they include real Git repos,
subprocesses and ownership I/O despite being model-free. The initial local phase
excluded broad validator and runtime-bundle generation. The integration delta
authorizes those existing non-model checks, ordinary non-model CI and required
fixture synchronization. Native child/provider acceptance remains unverified.

Failed obligations or unresolved major review findings prevent local-development
completion. A passing fake suite does not authorize starting any comparison.
