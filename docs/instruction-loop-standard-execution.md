# Use the standard improvement path for the next cycle

Specification `instruction-loop-standard-execution-spec@1`. Upstream: the owner's
request to use ASK's standard improvement mechanism in the next cycle and expose
remaining manual work, retaining human case and change approvals.

The standard controller is supervised `configure` / `operate`, with component or
Full practical profiles. Historical primary batches and the current 36-trial
source/process/auth/conditions stay frozen. They are not rewritten or resumed
under this new lane. New operational cases require their own approval.

Inspection found two concrete integration gaps: practical conditions require a
caller-written model command/closure/metrics wrapper; and the supervised selector
drops `practical.observation_path` when constructing local-worker settings. The
follow-up adds a shipped Codex trial adapter and carries that existing optional
setting through. It does not invent a new grader or claim primary benchmark
qualification for practical results.

Each practical condition may use either its existing pinned `command`, or
`codex: {executable, model, reasoning, task_file, timeout_ms}`. The host supplies
these explicit values from the intended execution environment. Preparation writes
bound adapter settings and source pins, without calling Codex or probing auth.
`task_file` is a relative path in every case's frozen public input inventory.
The configuration rejects a task path that exists only in condition instructions.
Model/reasoning declarations must match the condition context. The adapter uses
the existing Codex session transport and existing root-turn telemetry parser.

Only an approved practical trial invokes the adapter. It records dispatch before
launch, saves its output privately outside the editable workspace, and publishes
job/command/invocation-bound closure and optional root usage. Clean synchronous
CLI completion establishes the declared terminal contract; interrupted/uncertain
execution does not gain closure from local process exit alone. A failed spawn
can establish that no provider invocation started. Missing counters stay null;
no child totals or complete cost are inferred. A task completion is not a quality
pass: the case needs a pinned criterion/grader, otherwise quality remains unknown.

The ordinary worker can consume optional observation counters from a validated
provider receipt. These take precedence over caller-owned workspace counters,
whose provenance stays explicit. Legacy commands and receipts without counters
remain supported. Bad optional workspace counters are recorded as unavailable
without losing execution or grading evidence. Invalid provider evidence is not
replaced by editable workspace claims. AI recovery retains usable partial data and the existing retry
budget; neither missing optional usage nor a poor grade forces a rerun.

Execution-side intake must identify the fresh protected run root, trusted Registry
and exact baseline/asset mappings, public task catalog and pinned criteria, actual
Codex executable/model/reasoning/context, retry/time budget, candidate-authoring
port and intended eventual target. The host AI prepares these files. Humans
approve cases and eventual changes; they are not asked to write runtime JSON.
Do not choose or mutate the active 36-trial workspace as the new run root.

Use the existing condition field in a component/Full practical profile:

```json
{"context":{"cli_version":"DECLARED_VERSION","model":null,"reasoning":null,
 "platform":"DECLARED_PLATFORM","global_context_ref":null},
 "codex":{"executable":"/absolute/path/to/codex","model":null,
 "reasoning":null,"task_file":"task.md","timeout_ms":600000}}
```

The host AI replaces the example declarations, supplies the public task file
and criterion inventory and pins the whole profile with `configure`. Run
`readiness --profile PROFILE` first: it reports the selected trial port and setup
responsibilities without printing local paths or probing provider authentication.
Then use the existing `operate` commands and the two actual human judgments.
The full official runtime checkout supplies the adapter and parser sources.
It creates no extra account, installs no executable and changes no authentication.

For sharing, selected assets can already be exported as a file, received into a
fresh quarantine, previewed for dependencies/duplicates/conflicts and converted
to local candidates. Helper text remains inert. Receiving Eval cases and changes
require their own judgments. Automatic transport/sharing is outside this request;
a receiving team's actual acceptance remains an environment check.

Remaining setup/integration is explicit: normal-work observation emission and
project-specific task/criterion selection need execution-side inputs; formal
primary grading still needs its original protected adapter and qualification,
not a hand-translated practical score. Authenticated actual-model one/repeated
cycles and owner adoption/restore require acceptance after case/change approval.
Claude dispatch/authenticated receipt production remains deferred to its supplied
environment; external-host authoring and host-AI assessment ports are available.

Formal Verification Contract `instruction-loop-standard-execution-verification@1`:
- S-01: settings preparation starts no provider; source/settings and explicit
  context bind the shipped Codex trial command to the approved practical plan.
- S-02: software-only provider fixtures prove automatic prompt, closure and
  partial root-usage capture, no replay and no quality inference from CLI exit.
- S-03: invalid/drifted receipts cannot supply metrics/closure; uncertain execution
  preserves evidence and forbids unsafe retry while useful data remain available.
- S-04: the standard selector wires the adapter and existing observation setting;
  old commands, two human decisions, CI ownership and model-free regressions hold.

Implementation Contract:
- Artifact ID: `instruction-loop-standard-execution-implementation@1`.
- Upstream refs: this specification and next-cycle standard-path instruction.
- Actual change boundary: shipped Codex practical adapter, optional receipt usage,
  supervised configuration/selection and existing Skill/operator guidance.
- Verification attempted / Evidence: source-bound results accompany delivery.
- Selected proof: Formal `instruction-loop-standard-execution-verification@1`.
- Handoff state: implementation in progress; no operational Eval/model/app/owner
  acceptance is claimed.
