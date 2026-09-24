# Context rollover pilot: runtime and matched evaluation

Progresses #275. This is opt-in repository runtime tooling, not a new Skill or a
claim of effective Codex/Claude long-run operation. Baseline: main
`b13e75a996dfd6305d0e6ec11d6207aca66c8368` after PRs #280, #287, #299 and #302.

## Implementation / Formal Verification Contract

- Artifact ID: IMPL-275-RUNTIME-EVALUATION-1; verification: VERIFY-275-RUNTIME-EVALUATION-1.
- Upstream: Issue #275 Slice 3/4; `docs/session-checkpoint-contract.md`;
  `docs/epic-admission-work-package-plan-contract.md`; `docs/metrics-event-contract.md`;
  `docs/execution-envelope-contract.md`; #274 evidence APIs.
- Proof path: formal verification contract (cross-module contracts, persistent
  state, multiple contexts and performance measurement). No compact downgrade.
- Change boundary: canonical policy/observations/bindings, opt-in Codex boundary
  adapter, paired evaluator, deterministic integration fixtures and focused CI.
- Topology: one branch and one PR, ordered observation/policy -> runtime integration
  -> evaluation -> regression/publication. No independent slice branches or copied
  evidence/checkpoint engines.
- Required behavior: publish and read back exact state before context creation;
  reject altered targets, policy, controls, evidence and repeat claims; preserve
  unknown counters; quality dominates efficiency in matched evaluation.
- Checks: focused runtime/evaluation tests, existing checkpoint and Work Package
  suites, #274 suites, schema vocabulary, repository validation and whitespace.
- Stop: invalid or unavailable authority; failed publication/read-back; ambiguous
  fresh-context outcome; lost controls; unknown measurement; unauthorized cost.
  No merge, release, deployment, paid pilot or automatic retry is authorized here.
- Missing evidence: actual Codex long-run and Claude runtime execution. Deterministic
  fake/native-protocol tests do not fill this gap.

## Components and ownership

`context-runtime-observation.mjs` defines adapter-neutral counters and policy
selection. `context-rollover.mjs` owns the boundary transaction and resume checks.
`codex-context-rollover.mjs` provides capability discovery, native event projection,
a host-injected App Server adapter and a safe-stop CLI.
`context-rollover-evaluation.mjs` freezes, claims, records and compares matched runs.
The two closed schemas are validated by these entry points and the focused suite.
Existing installer profiles, generated bundles and always-on instructions are unchanged.

The controller calls the existing `persistSessionCheckpoint` and
`validateSessionResume`; it does not copy their repository snapshot, DAG, control
or CAS logic. #274 remains the only evidence/coverage authority. A checkpoint
carries evidence references, never turns historical evidence into current coverage,
and never makes developer verification into independent approval.

A calling runner must invoke `runtimePreflight` before mutation. It uses the existing
epic-admission and executable-plan validators. Small tasks may return
`ordinary_execution_allowed` without creating a plan or checkpoint. A saved waiting
plan does not authorize execution. This opt-in API does not silently retrofit every
existing Codex entry point or manufacture an Execution Envelope: the authorized host
still owns its envelope, tool permissions and external decision checks.

## Policy and observations

`schemas/context-rollover.schema.json` defines policy, observation, binding and
receipt variants. Each counter has `status`, `value`, `unit`, `source`, and `coverage`.
Unknown means `unavailable` plus `null`, not zero. Incomplete capture is `partial`;
only complete observations can trigger thresholds or satisfy measured comparisons.

All six threshold keys must exist: `model_steps`, `runtime_steps`,
`uncached_input_tokens`, `context_compactions`, `wall_time_ms`, and
`repository_orientation_rounds`. Each is a positive integer or `null` (disabled).
Policy also requires `policy_id`, positive `revision`, `enabled`,
`operator_request_enabled`, `maximum_rollovers` (1..32),
`minimum_runtime_steps_between_rollovers`, `runtime_timeout_ms` (1..300000), and
`telemetry_enabled`. There is no production default or universal threshold.
The small numeric thresholds in tests are synthetic fixtures, not pilot advice.
Freeze explicit project choices before seeing results.

`detectCodexRuntime()` runs only bounded `--version`, `exec --help`, and
`app-server --help` probes. Discovering a command never proves fresh-context support.
The result includes unavailable process/session identity when not attached to a
live host; Claude is explicitly `unavailable` / `unverified`.

The streaming exec observer counts completed native turns as **runtime steps, not
model steps**. It separates input usage into cached and uncached classes, rejecting
cached > total or unsafe numbers. Raw item text, command arguments, source and
transcripts are discarded. True model steps, tool wait and compactions are not
inferred from exec turn events. A separate App Server compaction observer accepts
`item/completed` / `contextCompaction`; zero requires a host-verified complete event
subscription. Invalid or incomplete telemetry cannot become a complete zero.

The host supplies monotonic launch time, event times and complete-capture status.
Starting a clock at the first event cannot measure process launch or silent setup.
`combineRuntimeObservations` includes the original context and every successor;
any unknown segment keeps that counter unknown. Whole-run wall time is independently
measured around the entire task, including checkpoint, restart and wait overhead,
not summed from partial session durations. Tool wait, orientation, verification,
conflicts, resume failures, human decisions and reason-classified rework need actual
host observations or remain unavailable.

## Checkpoint, restart and launch authority

The host must quiesce repository writers. Existing Slice 2 limits still apply:
unsupported submodules and unbounded state fail closed; important ignored inputs
must be declared. The CAS and measurement output must be outside the target and
Git administrative directory. A checkpoint is not a backup and never restores,
resets, checks out, or overwrites repository files.

The transaction is: inspect actual repository/plan/dependencies/controls and #274
references -> existing checkpoint publication -> CAS read-back -> exact resume
validation -> immutable rollover binding -> optional fresh launch. The binding
adds policy/runtime identities, source process/session hashes, trigger reasons,
sequence and prior receipt. A bounded approved-plan continuation (next task,
allowed/forbidden scope, AC ownership and stop conditions) is separately digested.
It is delivered transiently; no source snapshot or raw conversation is copied to CAS.

The caller supplies the expected binding digest out of band. Resume reopens CAS,
checks policy and receipt lineage, and invokes the existing exact validator for
repo, branch, HEAD/tree, dirty state, plan/package, dependencies, controls and evidence.
It also recomputes the approved continuation. Changing a mutable `latest` pointer,
resealing a different plan, removing an approval or using another runtime policy
cannot silently authorize this binding.

Without a live verified adapter, return `context_rollover_required`, the exact
restart package and next action. The source is retained. In a waiting plan the
package preserves blockers/approvals and the only action is control resolution.
Publication/read-back failures return `blocked`, never a successful rollover.

Automatic continuation uses a trusted host-owned `rpc(method, params)` and `notify`
transport, not a caller-authored capability flag. The Codex adapter requires actual
`initialize`, `thread/start`, and empty `thread/read` results, echoed cwd/model/
approval/sandbox, a non-forked context, and actual matching `sessionId` values.
The target session must differ from the source. It validates the repository again
before `turn/start`, sends the exact package and approved continuation, and accepts
only an actual in-progress turn acknowledgement. The durable receipt records
start, **not task completion or approval**. Only then may the host retire the source.

A no-replace per-scope/sequence launch claim is written before runtime calls.
Crashes, timeouts or ambiguous outcomes leave it intact and forbid automatic retry,
even from a new host process. The timeout bounds waiting for acknowledgement; it
cannot cancel an already delivered external request. Investigate the owned runtime
before any manual recovery. Do not delete a claim merely to make retry succeed.
Prior receipts and minimum observed runtime work prevent immediate repeat rollover.

The explicit Codex runtime-policy digest covers resolved cwd, model,
`approvalPolicy: "never"`, and `sandbox: "readOnly" | "workspaceWrite"`. It is not
proof of every hidden server default, environment variable or installed profile.
An already authenticated, approved host must supply and verify its effective runtime
configuration. Missing/different API echoes fail closed; compatibility with a real
Codex version has not been established by the fake transport tests. No standalone
stdio transport, subscription authorization or paid model launcher is added here.

## CLI and exact restart handoff

From the repository checkout:

```sh
node scripts/codex-context-rollover.mjs detect
node scripts/codex-context-rollover.mjs preflight --request admission-request.json
node scripts/codex-context-rollover.mjs boundary --request rollover-request.json
node scripts/codex-context-rollover.mjs resume --request rollover-request.json --binding sha256:EXACT_BINDING
```

The admission request contains the existing `admission` input and, for an epic,
current `planBundle` objects. The rollover request contains the following local
configuration (substitute actual paths and digests; these are not authorization):

```json
{
  "repository_root": "/owned/worktree",
  "store_root": "/owned/checkpoints/run-1",
  "plan_bundle_paths": {
    "policy": "/approved/admission-policy.json",
    "decision": "/approved/admission-decision.json",
    "context": "/approved/plan-context.json",
    "plan": "/approved/plan.json"
  },
  "policy_path": "/approved/rollover-policy.json",
  "observation_path": "/observed/runtime-observation.json",
  "runtime_policy_digest": "sha256:EXACT_RUNTIME_POLICY",
  "active_package_id": "EXACT_PACKAGE_ID",
  "completed_package_ids": [],
  "operator_request": false,
  "previous_receipt_digest": null,
  "target_paths": [],
  "contract_paths": [],
  "verification_store_root": "/owned/verification-evidence",
  "evidence_ids": []
}
```

Supply applicable `previousPlan`, `previousContext`, `previousPolicy`, and
`previousDecision` paths as required by the current plan lineage. Do not substitute
synthetic fixtures for approval. Keep the request and approved inputs unchanged
between boundary and resume. Boundary/resume return exit 3 for a validated manual
restart, 2 for blocked/invalid, and 0 for ordinary continuation. The returned
`next_executable_action.argv` is an exact local resume-validation command; execute
it in the fresh context and then follow the validated package's next action.
It is not a promise that the CLI automatically created a Codex session.

To integrate an authorized live host, construct `createCodexAppServerAdapter` with
its real transport/configuration and pass it to `executeContextRollover(options,
adapter)`. Feed the host's observed native events to the observers above. Keep this
transport, process ownership and permission boundary outside untrusted JSON inputs.

## Frozen matched measurement and stop conditions

`schemas/rollover-evaluation.schema.json` closes protocol and run inputs. Freeze
policy digest, repository source revision, task digest, runtime policy, rollover
scope (repository/plan/package), repetitions, required gate references, primary/
secondary metrics, materiality thresholds and cost/safety limits before any run.
The task and runtime/permissions must match across conditions; capture every run,
including interruption. Run order alternates by pair: baseline then rollover for
odd repetitions; rollover then baseline for even repetitions. No hidden retries.

```sh
node scripts/context-rollover-evaluation.mjs freeze /owned/evaluation protocol.json rollover-policy.json
node scripts/context-rollover-evaluation.mjs claim /owned/evaluation sha256:EXACT_PROTOCOL baseline 1
# Authorized host executes the claimed baseline and writes a bounded run.json.
node scripts/context-rollover-evaluation.mjs record /owned/evaluation sha256:EXACT_PROTOCOL baseline-1.json
node scripts/context-rollover-evaluation.mjs claim /owned/evaluation sha256:EXACT_PROTOCOL rollover 1
# Authorized host executes the checkpoint/fresh-context condition and records it.
node scripts/context-rollover-evaluation.mjs record /owned/evaluation sha256:EXACT_PROTOCOL rollover-1.json
node scripts/context-rollover-evaluation.mjs evaluate /owned/evaluation sha256:EXACT_PROTOCOL
```

Use owner-approved disposable fixtures, identical initial source/runtime configuration
and bounded task instructions; no production mutations, merge/release/deploy or new
subscriptions. Use separate checkpoint stores per measured run so a prior run's
launch claim cannot be reused. Preserve the same exact configured working path for
matched runs when runtime policy binds cwd. The authorized host owns clean fixture
reset between runs; this library never resets the user's worktree. Export the bounded
receipt/binding/authorization/checkpoint/snapshot CAS closure to the evaluation store
using existing verified CAS reads and no-replace writes. Do not export raw session
files. Evidence reference transfer remains subject to #274's existing contract.

A run must be claimed before external execution and recorded before the next slot.
The claim returns frozen wall-time, uncached-token and human-decision limits. The
host must enforce live watchdog/usage limits and report stopped/unknown outcomes;
this offline evaluator does not kill paid runtime processes or attest provider
billing. Stop immediately on invalid checkpoint/resume, lost controls, unsafe action,
quality failure, exceeded limits, unknown required safety telemetry, or uncertain
external request outcome. Keep the claim and artifacts; do not retry or rewrite a
completed slot. Freeze a separately reviewed successor experiment for changed choices.

Run observations retain all native metrics and classified rework. Quality fields
cover missed requirements/blockers, unsafe attempts, unsupported completion claims,
scope deviation and rework, alongside exact required/verified gate references.
Reported coverage is a measurement input, not a replacement for #274 current-target
coverage or independent judgment. Obtain quality judgments from the existing approved
verification/review process. Do not infer missing quality counts as zero.

Evaluation reopens stored receipts and matches policy, scope and initial source.
Known quality failure, lost coverage, stopped run or exceeded limit yields `stop`
before considering efficiency. Increased rework, resume failures or integration
conflicts cannot be offset by speed. Missing pairs/counters/required receipts yield
`insufficient_evidence`; insufficient gain or secondary regression yields `revise`.
`retain` requires every matched pair to satisfy frozen thresholds with complete
required quality/efficiency observations. No aggregate average may conceal a bad pair.

Deterministic fixtures and real measurements cannot be mixed. Reports expose exact
source inventory, native-unit differences, coverage and evidence scope. Schema-valid
`measured` input alone does not authenticate a run: external runner/evaluator evidence
is still required, and `operational_enablement_authority` is always false. The harness
cannot itself justify a product default, effectiveness claim or Issue #275 closure.

## Privacy, verification and remaining evidence

Telemetry persistence is opt-in at a checkpoint boundary. The original Metrics Event
contract is used with bounded CAS references and empty unknown outcome counts.
Runtime/session identities are hashed. Closed inputs reject raw prompt, transcript,
source and command-output fields. Errors omit supplied values. Local restart stdout
can include declared repository-relative plan paths and local CLI arguments; treat
it as owner-local operational state, not an automatically published metrics stream.

The focused suite uses real temporary Git repositories, existing plan/checkpoint and
signed #274 evidence APIs, fresh child Node processes and a deterministic native RPC
fake. It covers trigger/no-trigger/multiple/unavailable signals, policy errors,
publication/read-back failure, repo/branch/HEAD/dirty/plan/dependency mismatches,
blocker/approval preservation, evidence loss/tamper/transplant, supported/unsupported
paths, exact resume, replay/timeout protection, telemetry privacy, paired recommendations
and quality-regression refusal. Whole-task aggregation includes the original context
and rollover overhead. CI runs the new suite plus checkpoint/admission/evidence and
schema/repository checks on Node 24.

Local implementation validation used Linux x64, Node v22.16.0 and git 2.47.3.
The focused suite passed 55 tests. No actual Codex executable, paid model call,
App Server session, live subscription bridge or matched long-run was available in
this execution environment. Node 24 CI is separate evidence, not inferred from local
Node 22. Claude remains unverified. Review the exact PR HEAD and real runtime protocol
before an authorized pilot. Until measured evidence satisfies the issue-level AC,
this work is `Progresses #275`, not `Closes #275`.

Native API references used for the adapter (runtime compatibility still requires
actual observation): [Codex App Server](https://developers.openai.com/codex/app-server)
and [non-interactive execution](https://developers.openai.com/codex/noninteractive).
