# Practical Eval and AI recovery

An optional Codex assessor `executableDigest` binds the caller's executable to
its SHA-256 bytes. Selection verifies the absolute path/digest and includes it
in runtime command pins; the assessor verifies it again before allocating its
session or starting the provider. Profiles omitting this setting retain their
existing caller-selected executable behavior. This does not authenticate a
remote model or close arbitrary interpreter/dependency/configuration files.
The check does not close a concurrent replacement race between checking and exec.

Authorized inline Full authoring also passes the model grant in its child-only
environment, matching pinned input-only wrappers without changing the parent
process environment. After the synchronous child returns, its fresh private
session retains bounded stdout/stderr, exit and closure diagnostics, including
failures. These records neither approve cases nor prove remote model completion;
they are not raw feedback to future candidates. A consumed session is not replayed.
Formal R04: authorized child grant only; R05: bounded failure diagnostics and
fresh-session replay refusal. Native-binding model-free regressions cover both.

Formal recovery-executable-pin@1: R01 unchanged legacy/fixture behavior; R02
opt-in drift refused in runtime preparation and before provider dispatch/session
allocation; R03 matching pins participate in the runtime digest and allow the
existing assessment flow. Verification is in test-instruction-loop-practical-runtime.
This reversible opt-in reuses the existing local provider boundary; no new ADR.

Implementation Contract: Artifact recovery-executable-pin@1; upstream R01..R03
and reviewed host-profile drift gap; boundary optional provider-byte checking,
runtime pins and regressions; verification focused failure first, compatibility
and repository validation; evidence recorded with delivery; Formal R01..R03;
handoff no new human gate, model/Eval/owner authorization unchanged.

Spec `practical-evaluation-recovery-spec`, revision 1. Upstream: the owner's
instruction to prioritize real-work value, keep useful incomplete evidence and
let the AI choose individual/all-condition retries, exclusion or reference use
without manipulating results. Human case and eventual application approval remain.

The existing primary batch explicitly requires `single_shot_v1`, `retries: 0`
and no resume (`ask-primary-evaluation-batch.mjs`). It stops after an unsafe or
incomplete child or grading connection. The old comparison's resume path can
start unattempted conditions, not retry consumed attempts. Those frozen contracts
and saved runs are unchanged. This new opt-in lane connects the existing
`skill-effectiveness-evaluation` skill and pragmatic reporter to per-attempt
execution, recoverable evidence and AI judgments. It does not need ASK's private
grading assets and does not rebrand practical notes as formal primary scores.

## Responsibilities and acceptance

- PE-CASES: AI selects useful cases/conditions and records task, input, criterion,
  runtime context and retry reservation. Human approval binds the exact plan
  before the first root. Case/condition/runtime drift requires a new plan.
- PE-JUDGMENT: a failed/interrupted result, lost response or requested-data gap
  produces a bounded AI packet. AI chooses `use`, `reference`, `exclude`, `retry`
  or `stop`, with reason, used dimensions and comparison limits. Missing data
  never becomes zero. Valid poor quality does not automatically trigger retries.
- PE-RETRY: `retry_scope: trial` starts only that row in a fresh attempt/workspace.
  `retry_scope: case` reruns its conditions, preserving originals and recording a
  new comparison cohort. All attempted targets must have confirmed process closure
  and fit the preapproved per-row/extra-trial budget. Successful peers may be
  repeated for fairness; they are not secretly erased or treated as first attempts.
- PE-RESUME: dispatch consumption is written before a worker starts. A consumed
  job is inspected, never replayed. Original durable worker results recover a lost
  response. Uncertain closure disallows new trial roots/retries, but AI can finish
  a limited partial report rather than losing earlier useful results.
- PE-REPORT: all outcomes, reasons, attempts, conditions, metrics and selection
  are retained. Only explicitly selected observations enter the pragmatic
  comparison; reference/excluded results stay in the ledger. Unknown fields stay
  null. The report requires the existing human change gate; this runner installs
  nothing and grants no admission authority.
- PE-LOCAL: public user-owned tasks/checks and optional user-owned graders run in
  fresh explicit workspaces. No fixed private grading repository is required.
  The host can supply a native/model adapter with its own durable process receipts.

Verification `practical-evaluation-recovery-verification`, revision 1, selects
`formal_verification_contract` for persistence/cross-module and regression work.
`scripts/test-practical-evaluation-runner.mjs` covers these obligations using both
controlled failure/lost-response adapters and real local processes. Existing
pragmatic reporter and supervised journal/transport regressions remain required.

## Entry points

```sh
node scripts/practical-evaluation-cli.mjs advance --root /absolute/run --config /absolute/config.json
node scripts/practical-evaluation-cli.mjs status --root /absolute/run
# Only the actual human's approval of the displayed case packet:
node scripts/practical-evaluation-cli.mjs advance --root /absolute/run --config /absolute/config.json \
  --decision approved --packet sha256:EXACT_PACKET --reason 'Approved the displayed cases and budget'
# At an AI stop, the host AI submits its own routine recovery decision:
node scripts/practical-evaluation-cli.mjs advance --root /absolute/run --config /absolute/config.json \
  --assessment /absolute/ai-assessment.json
```

`--allow-model-calls` reflects an existing authorized model budget. It does not
bypass case approval. `awaiting_ai_recovery` is an AI action, not a human approval
request. A host agent should read the packet, inspect relevant original evidence,
write the structured judgment and advance. A pinned `assess` worker can do this
automatically; `practical-evaluation-assessor.mjs` connects the existing Codex
process transport, or a declared model-free fixture for tests. Assessment costs
are separate from trial resource measurements. Uncertain/consumed assessment
processes are not blindly replayed; the current host AI can supersede a missing
assessment with a recorded judgment of the same exact evidence packet.

The config is `{plan,runtime}`. `plan` has:

- `kind: practical_evaluation_plan_v1`, bounded `id`, `goal`, `runtime_digest`
  equal to the canonical runtime digest and `evidence_kind: synthetic|observed`;
- `conditions: [{id,context}]`, with `cli_version`, `model`, `reasoning`,
  `platform`, `global_context_ref` (text or null), and optional `environment_ref`;
- `cases: [{id,task_ref,input_ref,success_criteria_ref,public_input_digest}]`;
- `repetitions`, `global_context: {ask_presence,change_status}`;
- `recovery: {max_extra_trials,max_retries_per_row,allow_exclusion,allow_reference,
  required_dimensions}`, where dimensions are `execution`, `duration`, `usage`, `quality`.
  Choose only measurements material to the decision. Unknown optional metrics
  remain visible without forcing an assessment or another run.

`runtime.commands` contains `trial` and optional `assess` with the existing pinned
argv/pins/model-call fields and optional read-only `inspect_argv`. No shell or
model-selected executable is used. Each worker receives immutable request and
fresh result paths, publishing `{request_digest,status,output}`. Trial output
retains `ready_for_next_root`, `cli_seconds`/metrics, evidence refs and an optional
task outcome. An exit code alone is not a subjective quality grade.

The shipped local worker argv is
`node practical-evaluation-worker.mjs SETTINGS SETTINGS_DIGEST execute`;
its inspector uses `inspect`. Settings map case IDs to explicit frozen
`files: [{source,target,digest}]` and an optional `grader`, and condition IDs to
their frozen instruction `files`, `command` and `command_role: check|task`.
A command has absolute executable argv, source pins, timeout and explicit
`model_calls`. The approved case's `public_input_digest` equals the canonical
digest of its `{target,digest}` inventory. Source/workspace paths are validated
before execution. A `check` or a supplied grader may establish the caller's
declared criterion; an ungraded task retains unknown quality. The optional
`observation_path` supplies explicit token counters, never guessed from stdout.
The executable test includes a complete, runnable model-free configuration.
An optional [typed grader observation](practical-quality-observations.md) carries
scope, outcome and the existing fixed-point summary in a verified provider
receipt. Source-only positive judgments remain overall Unknown for runtime
acceptance; valid partial evidence need not cause a task rerun. Invalid optional
quality stays Unknown while useful execution/usage survives. Reported grading
and assessment resources remain separate from every task attempt.

Pin the grader's criterion code and dependencies, separately from editable
application code. When a pin's source is copied into the task workspace, the
worker also verifies that copy's bytes and mode immediately before each command.
A task that changes a pinned grader cannot obtain a grade from the changed copy;
its task completion remains available for recovery. Pins describe the declared
criterion closure; undeclared dependencies and hostile-process sandboxing are
outside this local worker's guarantees.

The local worker records owned process-group closure on Unix and its exact scope;
it does not claim to cancel or observe remote provider jobs or escaped daemons.
Native/model adapters must supply appropriate closure evidence. Communication
loss or missing closure never causes the runner to kill a saved PID or relaunch
the same attempt. Known failures can be retried or excluded; unresolved execution
can be referenced/excluded with all further trial launches suspended.

An AI assessment has `packet_digest`, `action`, `reason`, `selection_basis`,
`retry_scope` (trial/case only for retry, otherwise null), `used_dimensions` and
`comparison_limits`. Bases are execution failure, missing evidence, environment
mismatch, fair comparison, practical reference or no value in more runs (the
machine uses snake_case). The runner enforces closure/budget/packet identity,
not the AI's claim that a score is attractive. The complete ledger lets a human
see and reject selective interpretation. Retrying only one side is allowed and
explicit; rerunning the case's conditions is another legitimate recorded choice.

The existing pragmatic report now accepts optional `condition_ids` for caller
comparisons while preserving the original three-condition behavior. All attempts
are available alongside the selected comparison, including overhead from failed
and replacement runs. A missing dataset does not invalidate observed data or
silently turn its unknown part into pass/fail/zero.

## Use in the self-improvement loop

`createNativeInstructionLoopConfiguration(profilePath)` also accepts
`kind: full_practical_instruction_loop_profile_v1` and
`policy.evaluation_mode: practical_v1`. Keep the existing Full `generator`,
Registry/asset authority, protected host/state roots and `normal.target` fields.
Replace the fixed native-runner/grading configuration with `practical`:

- fresh `root` for the Eval journal/jobs, `baselineRoot` for the frozen baseline
  Full projection and the existing `baselineEnvironmentObjectDigest`;
- `cases` containing public case IDs, task/input/criterion refs, explicit frozen
  file inventories and optional user-owned graders; the policy catalog binds
  those same public input digests;
- `conditions.baseline` / `.candidate` with context, command and command_role;
  the complete verified baseline/candidate instructions are copied automatically;
- `recovery`, `global_context`, `evidence_kind`, optional pinned `assessor`
  settings (`fixture` for model-free proof, `codex` for authorized actual calls).

Selection retains the complete-context comparison and exact practical plan in
the parent's case packet. The inner runner verifies the actual parent journal's
approval, current evaluation job, exact plan digest and all case/condition/
repetition/input bindings. It does not create another human approval requirement.
Generated candidate text cannot replace these host-owned runtime fields.

The evaluation workflow is resumable; individual consumed commands remain
at-most-once. The normal supervised CLI selects the appropriate runtime from the
config and accepts `--assessment FILE` for routine host-AI judgments. With an
automatic assessor it advances without that handoff. A lost coordinator response
inspects/resumes the inner journal without repeating a completed trial. Once the
report is available it returns to the existing result-review or exact change
gate, then the existing approved apply/version/cleanup workflow. No practical
report substitutes for a formal Evolution admission receipt.

The existing `next` command handles both profile kinds: fresh private state and
Eval roots, applied-baseline/Registry updates, prior reasons, selected outcome
counts and all-attempt resources are carried into the next candidate request.
The command prepares configuration only and never copies old approval to a new
cycle. A consumer uses the configured complete ASK runtime; installation of the
Skill alone does not place all source CLIs into the adopting project's scripts.

## Connected component operation

For individual Skill/Prompt create/revise/exclude, configuration composition or
reviewed incoming assets, use `component_practical_instruction_loop_profile_v1`.
The scoped `full_practical_instruction_loop_profile_v1` remains compatible for
source-backed Full Skill revision. Both use the same practical runner and two
human decision types; they have different candidate and application adapters.

The component profile fixes these host-owned fields:

- `protectedRoot`, disjoint `stateRoot`, `storeRoot`, `candidateRoot`,
  `registrySnapshotDigest`, `baselineEnvironmentObjectDigest`, `adapter`,
  instruction `runtime`, `supportPaths`, `environmentTrust`, `bundleDescriptor`,
  `assetAuthority`, and `normal: {target,ownerStateDigest?}`. Null target retains
  the existing result-only review behavior. An independent normal-installer
  state pin is required when leasing an existing installer owner.
- The existing `policy`, `selection` and `practical` public-case configuration.
  A case packet binds the entire baseline/candidate file inventory, including
  helpers, exact public inputs and recovery budget.
- `candidate.composition?: {layers,excludedStableIds?}` and
  `candidate.packageImports?: [{options,confirmedPlanDigest,layer:{id,kind},
  mappings:[{stable_id,files:[{source,target}]}]}]`. Each import uses the existing
  reviewed local plan. Every accepted asset needs explicit receiving mappings;
  identity/dependency/conflict checks run before any owner operation.
- `candidate.authoring?: {editableStableIds,removableStableIds?,additions,
  provider}`. The provider is an explicitly synthetic `fixture` for mechanical
  proof, or `codex` with a pinned executable/model/timeout for authorized calls.
  Host inventories and descriptors constrain the response; the model can choose
  revise/create/exclude text operations, including a justified no-op. It cannot
  generate executable helpers, metadata, permissions or adoption authority.

Generation automatically imports confirmed candidates, composes layers, invokes
authoring when configured and freezes the whole environment. It then evaluates
after case approval and builds an exact target plan before change approval.
Empty or byte-identical authoring does not create a fake full-content revision.
An unchanged environment finishes with `no_change`, preserves its observations
and cleans only its private copies; no pointless Eval or application is claimed.

Component adoption explicitly verifies the current supervisor's case decision,
report, target, exact plan and actual change decision. It uses the existing
environment target planner/file lifecycle and optional normal-owner lease; it
does not create or impersonate a formal Evolution application receipt. Preview
handles cannot apply. Restoration requires a fresh change-type decision, checks
the recorded applied state before writes and restores original Registry states.
In particular an initially captured candidate is not retroactively called a
formally admitted/current baseline.

Use supervised `configure --profile PROFILE --root CONFIG_DIRECTORY` to build
the pinned `config.json` without starting a model or changing the owner.
Use the configured runtime's supervised CLI `operate --root OPERATION --profile
PROFILE --config CONFIG --cycles N`, with the usual `--decision`, `--packet`,
`--reason`, `--assessment` and authorized `--allow-model-calls` flags. `N` is an
explicit budget from 1 through 10. `operation-status --root OPERATION` is read-only.
After a cycle completes, `operate` prepares and starts the next cycle and stops
at its new case packet without asking for another routine continuation decision.
It carries the actual applied baseline, decisions, uncertainty and observed
costs. It consumes import confirmations only once and updates the editable
inventory to the receiving configuration. No-op or requested restoration ends
the operation. The operation report links preserved cycle reports and sums
observed attempt resources without pooling quality across different cycles or
inventing missing costs.

The next configuration and fresh destinations are reserved before dispatch.
Current and reserved profile/config digests are checked on resume; old human
decisions are never copied as authority. A response loss in an already consumed
model/owner stage still uses inspection rather than replay. Chained local
overlays bind the previous completed journal, exact applied state and approved
lease; rollback restores the immediately preceding overlay and its owner bytes.
The original formal Evolution application APIs retain their separate checks.

The current improvement-result history and the active owner anchor are separate.
A rejected proposal or declined restoration does not select an uninstalled
baseline. A new restoration request after refusal receives a distinct packet;
the old decision cannot authorize it. The next cycle still needs both its own
case and change judgments.

Owned completion inspection recovers a lost final stage result without repeating
generation or owner writes. Target completion receipts bind the approved plan,
state hash, inode, bytes/removals and owner lease; generation receipts bind the
request/profile and private directory identities. Pure preparation and immutable
Registry operations can be reconstructed. Refusal cleanup checks exact retired
Assets and private ownership before finishing a partial cleanup. Missing positive
completion evidence, pending owner markers/locks or local edits remain uncertain;
the runner does not clear them or overwrite user work to make a plan fit.

## Execution and context limits

Instruction checks cover the declared condition files' bytes/modes and a bounded
local AGENTS/CLAUDE/.agents/.claude inventory. Dependency/cache/VCS trees and global
ambient instructions remain explicitly outside that check. Changes or inspection
limits become AI recovery issues; they do not silently establish an equivalent
runtime or force all observed data to be discarded.

For model-calling commands, a successful exit can use an explicit host-declared
`model_terminal_contract: synchronous_cli_completion`. A failed/interrupted model
command needs a provider closure receipt before it is retryable. Alternatively
configure `provider_closure_path` relative to the owned attempt control directory;
the wrapper writes `{request_digest,command_digest,invocation_digest,terminal:true,provider_ref}`.
Pinned argv supports `{evaluation_request_digest}`, `{evaluation_command_digest}`
`{evaluation_control_root}`, `{evaluation_command_role}` and
`{evaluation_invocation_digest}` placeholders. A closure destination must be
fresh for each invocation; use a role-specific path (the role placeholder is
also supported in `provider_closure_path`). Task receipts cannot authorize grader
completion, and old evidence is never deleted to make a receipt reusable.
Local process-group exit alone does
not establish that remote work ended. The task wrapper's receipt belongs outside
the editable task workspace and must reflect the provider/adapter's actual
terminal state. Without that evidence the AI can still reference/exclude useful
observations and produce a limited report while further trial launches suspend.

All-attempt resource totals include original failures and replacement runs, with
observed/missing counts. Assessor execution observations are separate; uncollected
token/cost/hierarchy values remain unknown, never free or included in trial savings.
