# Run a practical Eval

This reference travels with the selected Skill on both adapters. The execution
CLI is supplied by the complete ASK runtime checkout, as are the existing
environment and personal-loop CLIs. Resolve that configured runtime location
first; do not assume the adopting project's `scripts/` contains ASK executables.
A consumer uses a pinned official ASK runtime and does not fork ASK or maintain
an ASK development branch. If its source/runtime has been removed, report the
missing capability and restore/configure the runtime before dispatch.

1. Read `docs/practical-evaluation-recovery.md` in that runtime. Choose useful
   public project tasks, success criteria, condition context and a bounded retry
   budget. The caller's own checks, rubric or AI grader are allowed; ASK private
   grading assets are not required. Preserve unknown quality when it is ungraded.
2. Run `node <ASK_RUNTIME>/scripts/practical-evaluation-cli.mjs advance --root RUN
   --config CONFIG`. Present the exact case packet to the human. Supply only the
   actual human approval with `--decision approved --packet DIGEST --reason TEXT`.
3. At `awaiting_ai_recovery`, the AI reads `pending_recovery` and chooses use,
   reference, exclusion, one-trial retry or all-condition case retry. Submit the
   structured JSON with `--assessment FILE`. This routine judgment belongs to
   the AI; do not ask the user to repair the run manually. A configured `assess`
   worker automates the same port.
4. Keep every original and replacement outcome, reasoning, context, comparison
   limit and selected attempt. Use useful incomplete measurements. Do not rerun
   just to improve scores, erase failures, fill missing counters with zero, or
   relaunch a consumed command whose process state is uncertain.
5. Review the report against the real-work goal, including failed/retry costs,
   assessment overhead and uncertainty. Bring it to the existing human
   application decision. No report or recovery judgment installs assets.

For individual Skill/Prompt creation, revision, exclusion, configuration layers
or reviewed incoming assets, select
`component_practical_instruction_loop_profile_v1`. The host fixes allowed
identities, mappings, helpers, permissions and runtime; the AI chooses bounded
instruction changes. Confirmed package imports remain inert until their local
Eval cases are approved. Imported helpers are copied as text, not automatically
executed or granted foreign authority.

Before configuring, inspect selected ports without starting models/cases/auth
probes: `node <ASK_RUNTIME>/scripts/supervised-instruction-loop-cli.mjs readiness
--profile PROFILE`. Its `not_probed` result is a configuration summary, not proof
of executable availability, authentication or actual instruction use. Automatic
authoring and recovery model ports currently support Codex; Claude-format assets
and standalone prepare/import do not supply a Claude application dispatcher.
Use host-AI assessments when no automatic assessor is configured. Do not infer
permission to invoke an unavailable app from a compatible instruction format.

For an already available host AI/app, a component authoring provider can select
`external_host`. At `awaiting_authoring`, use the current cycle root/config with
supervised `authoring-request`, then `authoring-claim --claim FILE`. The AI host
creates the structured files; these are routine work, not a third human judgment.
A real claim uses the existing host model-call grant `--allow-model-calls`.
Only `claim_created: true` reserves a new external execution; after response loss
or a repeated claim, inspect the same execution ID and never relaunch it blindly.
Submit the exact bounded response and positive host-reported closure with
`authoring-complete --submission FILE`, then resume `advance`/`operate`.
If completion is unknown, retain the claim and evidence. This port dispatches no
app, authenticates no provider and bypasses neither case nor change approval.
See the runtime's `docs/instruction-loop-host-authoring.md` for exact JSON shapes.

Prepare the pinned configuration with supervised `configure --profile PROFILE
--root CONFIG_DIRECTORY`. Start/resume `operate --profile PROFILE --config CONFIG
--root OPERATION --cycles N` with an explicit budget of 1..10 cycles. Submit the
actual case/change judgment with the same `--decision`, `--packet`, `--reason`
flags. Completion advances to a fresh cycle's case gate automatically; old
approvals are not reused. `operation-status --root OPERATION` reads status only.
Runtime setup uses canonical absolute local paths; the consumer does not need
an ASK source branch. The host/admin supplies the initial trusted configuration.

Inspect owned completion receipts after response loss. Pending execution or
owner markers and local drift remain explicit; do not blindly retry or alter
user files. A declined restore keeps the actual adopted baseline. A later
restore request needs a new change packet. No-op ends the bounded operation
without inventing trials. Review preserved per-cycle reports and all-attempt
costs; do not pool quality across changing environments.

For scoped source-backed Full Skill revision, select
`full_practical_instruction_loop_profile_v1` with
`policy.evaluation_mode: practical_v1` in the same configured ASK runtime. It
uses the existing generation/Registry/owner lifecycle and the public practical
Eval. The parent's exact case approval is verified and reused by the inner
runner. Submit routine AI judgments through the normal supervised CLI's
`--assessment` option; it returns to the existing result/change gate afterward.
See the runtime's `docs/practical-evaluation-recovery.md` for the profile fields.

Frozen historical primary batches keep their original single-shot policy. New
attempts and a new practical ledger do not rewrite old source, scores or records.

For an existing native fixed source grader, use the runtime's optional
`report.fixedScoring` and pinned `referenceScoringCommand` ports. Preserve partial
credit, exact lower/upper ranges, mandatory/critical findings and runtime Unknown
in their separate reference lane; never translate partial scores into binary
passes. Verify retained source, packet, calculator/dependency source and the
independent review. These are reference judgments, not formal admission or proof
that the evidence is true. See `docs/instruction-loop-fixed-reference-scoring.md`.
A consumed unknown grader is inspected; a local worker exit alone cannot close a
provider. Missing optional judgments retain usable execution evidence as Unknown.

After a positively closed model-free native preparation failure, the host AI can
use `recover-preparation --root OLD_RUN --profile OLD_PROFILE --config OLD_CONFIG
--replacement-profile CORRECTED_PROFILE --output-root FRESH --id NEW_ID` on the
supervised CLI. It prepares only fresh configuration/run paths and preserves the
old failed journal and artifacts. It carries no approval. Resume normal `advance`
or `operate` at the new case gate and obtain the normal result/change judgment.
It refuses model uncertainty, after-case/owner effects, overlap and altered
prepared authority. Use the existing practical runner for individual trial
recovery. See `docs/instruction-loop-failed-preparation.md` for the bounded scope.
