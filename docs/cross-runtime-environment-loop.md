# Cross-runtime instruction environment loop

Spec `cross-runtime-environment-loop-spec-v1`, revision 1.

An evaluation compares two complete, explicitly bounded instruction environments
on one adapter at a time. Individual Skill and Prompt Assets remain independently
registered and exportable. An environment contains exact Asset references,
explicit source-to-runtime path mappings, frozen supporting instruction files,
and declared runtime identity. It does not infer global settings or installed
plugins. Unknown ambient inputs remain an evaluation limitation.

Acceptance obligations:

- ENV-1: freeze and reconstruct exact Skill/Prompt bytes for Codex and Claude
  Code using the existing Registry and CAS, including Skill references. Reject
  path traversal, collisions, missing dependencies, mismatched adapters and
  changed bytes. Registration/selection do not imply runtime use.
- ENV-2: retain complete baseline/challenger environment digests with an existing
  pre-result Evolution experiment. Reuse Portfolio selection, recommendation,
  human decision and receipt verification. Reject environment/role transplants.
  Mechanism observations cannot substitute for outcome evidence.
- ENV-3: keep detected invocation, tool success/failure, command expansion and
  LLM self-report distinct. No event means unobserved. Never infer quality
  effects or successful reads from an invocation event. Minimize imported data.
- ENV-4: export into a fresh directory only; reuse installer lifecycle planning
  and rollback for approved local environment application. Refuse local drift,
  links, stale/foreign closure and unresolved partial operations.
- ENV-5: no model execution, remote publication, global configuration, exporter
  changes or security-policy changes during these model-free checks. Existing
  Codex primary evaluation remains unchanged. Actual dual-runtime model and
  provider acceptance requires a separate observed run.

Implementation Contract `cross-runtime-environment-loop-implementation-v1`.
Upstream: the spec above; source `9068e22a`.
Boundary: additive environment and usage-evidence modules, a local JSON CLI,
focused tests, documentation and CI registration. Existing Asset, Portfolio,
Evolution, CAS and installer lifecycle remain the owners of their contracts.
The source checkout has no `.agents/skills`; canonical Skills are in `skills/`.
Implementation context is the repository's uninitialized template, so current
nearby modules and tests supply implementation evidence.

Verification Contract `cross-runtime-environment-loop-verification-v1`.
Selected proof path: `formal_verification_contract`; triggers
`state_concurrency_persistence_lifecycle_or_cross_module` and
`multi_session_multi_agent_or_handoff`. Verify ENV-1–5 with fresh artificial
inputs, both adapter projections, existing Evolution fixtures and negative
tests. Command: `node --test scripts/test-instruction-environment.mjs
scripts/test-skill-usage-evidence.mjs scripts/test-environment-evolution.mjs`.
Run affected existing Registry/Portfolio/Evolution/installer checks and repository
validation. Artificial approval and evidence are never actual owner approval.

Runtime acceptance, effectiveness, causal attribution and practical feedback
remain Unknown until independently observed. No live comparison is authorized
by this implementation contract.

## Operator interface

Run `node scripts/instruction-environment-cli.mjs COMMAND /absolute/input.json`.
Inputs use the existing API's camelCase option names; saved objects keep the
canonical snake_case fields. Every read uses bounded, duplicate-key-rejecting
JSON. This is an explicit operator workflow, not a replacement for the existing
personal Prompt CLI's one-time configuration.

| Step | Command / existing owner |
| --- | --- |
| Register a new Skill/Prompt or complete revised text | `registry-create`, `register-asset`; existing Asset descriptor/lineage contract |
| Inspect individual exact references | `assets`; no promotion or installation |
| Freeze the environment | `capture`; immutable CAS object digest identifies the version |
| Inspect/export exact bytes | `inspect`, `export`; export requires a fresh directory |
| Prepare a candidate generation request | `generation-prepare`; existing personal generation request contract |
| Import reviewed files produced by either agent | `generation-import`; existing exact request/parent import contract |
| Fix a comparison before outcomes | `experiment`; existing experiment draft plus both environment object digests |
| Prepare exact runtime projections | `evaluation-materialize`; existing generic benchmark materializer |
| Check the prepared environment | `evaluation-verify` |
| Explicitly start an approved comparison | `evaluation-start`; existing contained runner and per-case attempt state |
| Inspect saved execution | `evaluation-status`; execution is not grading |
| Import independent evaluation and derive policy result | `recommend`; existing six-dimension evidence and separately trusted evaluation authority |
| Prepare action and record human judgment | `propose`, `decision`; decision recording does not authenticate itself |
| Apply approved Portfolio action / close approved no-op | `portfolio-apply`, `noop`; existing authority verifiers |
| Review/apply physical environment change | `apply-plan`, `apply`; exact `confirmedPlanDigest` required |
| Restore | `restore`; separately trusted fresh `rollbackLockDigest` required |
| Inspect personal candidate/closure | `status`; existing preparation and ordered artifact references |
| Retain the next cycle | fresh `generation-prepare` with the previous recommendation/decision/receipt in observation evidence refs |

A capture input has `storeRoot`, `sourceRoot`, `environmentId`, `adapter`
(`codex` or the existing selector ID `claude_code`), `runtime` with
`cli_version`, `model`, `ambient_config: "Unknown"`, `registrySnapshotDigest`,
`selectionObjectDigest`, `bindings`, `supportPaths`, and independently supplied
existing trust arrays. Each binding is `{asset: <exact Asset ref>, files:
[{source: <registered package path>, target: <runtime path>}]}`. All files of
each active Asset and the complete Portfolio-selected instruction set must be
mapped. Dependencies remain in the verified Registry closure; registration of a
dependency does not activate it. Explicit supporting file paths freeze Kernel,
contracts and runtime helpers as needed; they are not discovered from session
history or global configuration. Preserve an explicit complete environment
inventory when claiming a whole-environment evaluation.

An authoring capture uses `selectionObjectDigest: null` and may export a single
new candidate Skill, including `SKILL.md` and `references/`, on either adapter.
It cannot enter an evaluation binding. Existing Evolution candidate lineage
still compares revisions of one stable Asset ID; proposing an entirely new
Asset and evaluating/adopting its new membership needs an explicit Portfolio
and lineage design. This implementation does not invent a parent for a root
Asset or equate registration with adoption.

`experiment` takes `draft` (the existing Evolution experiment draft) and
`environments: {baseline: <digest>, challenger: <digest>}`. Its selected changed
Asset can be a Skill or Prompt. Models/CLI versions must agree with both
environments. A declared one-factor revision also retains identical supporting
files and other Asset mappings. Compare Codex and Claude in separate experiments;
do not pool their outcomes. The existing policy retains quality, safety, cost,
variance, mechanism and external outcome as separate dimensions.

Evaluation inputs additionally carry the existing generic runner's `root`,
`config` (including its resolved `_configPath` and `_protocolPath`), `planPath`,
`repositoryRevision`, `materializedPath` / preparation `outputPath`,
`selectionState`, `runDir`, `runtimeConfigPath`, `agentBin`, and explicit `role`.
The complete generic plan still has its four established conditions. Only that
role's selected adapter/full_ask cases are dispatched by this entry. It verifies
actual projection bytes, fixture population, task classes, repetitions, source,
model and expected CLI version. `evaluation-start` additionally requires
`confirmedExperimentObjectDigest` equal to the inspected exact experiment.
Original runtime capability, sandbox, permission, identity, failure and
containment checks remain active. Unavailable capabilities stay unavailable;
this entry does not relax them to make a Claude run pass. Inspect existing
attempt state after uncertainty; do not reset/retry it.

Use the original independent graders for execution artifacts. The new CLI does
not synthesize full-verifier authority from raw stdout, self-report or usage
events. Automatic conversion of these new environment pairs into the existing
Codex-primary saved-result pipeline is not implemented; `recommend` requires
independently verified, separately trusted six-dimension evidence. Missing
native evidence remains insufficient rather than a manufactured score.

Physical application currently supports fresh/manual environment targets whose
baseline bytes exactly match the snapshot. It refuses any normal installer
owner and preserves unrelated project files. General Skill/Claude transfer from
an existing normal installation is not implemented. The existing Codex-specific
five-Prompt ownership-transfer path remains separate. Do not remove owner state
to bypass this refusal. Pending lifecycle markers block automatic retry; inspect
the retained state/snapshots and use a separately reviewed recovery procedure.

## Optional Skill evidence

`usage-import` takes the environment context, `runId`, `sessionId`,
`producerVersion`, `captureState` (`available`, `disabled`, `unsupported`,
`unknown`), `input` (a local record array or OTLP JSON resourceLogs), and optional
`selfReportedSkillIds` (registered stable IDs; null means no report). Only
registered Skill runtime entry names are matched. Unresolved plugin aliases and
redacted `custom_skill` values remain unmatched/redacted; they are not guessed.
Source session identity must match. Run/session/version identifiers are stored
as digests. Prompts, command arguments, outputs, email and unrelated attributes
are discarded. Per-run presence is retained rather than an unreliable invocation
count. `usage-list` filters CAS usage objects by environment digest and run ID.

The optional `instruction-environment-hook.mjs /absolute/reviewed-hook.json`
reads a single Claude hook input on stdin. Its explicit config is the same usage
context with `enabled: true`. Invoke it from the full ASK checkout in opt-in
Claude `PreToolUse`, `PostToolUse`, `PostToolUseFailure` matchers for `Skill`, and
optionally `UserPromptExpansion` for direct prompt-type commands. The latter is
expansion evidence, not proof that a Skill completed. The hook emits no model
context or allow/block decision and never blocks the task on collection failure.
It requires the source checkout/CAS to remain available. Default adapter hook
installation and telemetry settings are unchanged.

Codex import recognizes `codex.skill_invocation`; Claude import recognizes
`claude_code.skill_activated` / `skill_activated` and the documented Skill hooks.
These imports are local handoffs, not producer-authentication mechanisms.
No exporter is enabled, no log destination is changed, and no
`OTEL_LOG_TOOL_DETAILS` setting is enabled by ASK.

Compatibility evidence checked 2026-11-05:

- Codex's [v0.162.1 OTEL source](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/otel/README.md#skill-invocation-logs)
  documents explicit injection and best-effort implicit/read detection with
  per-turn deduplication. Its exporter sends other existing events too. The
  first supported release and the installed runtime's actual emission were not
  established here; do not infer support from a configured adapter name.
- Claude's [monitoring specification](https://code.claude.com/docs/en/monitoring-usage#skill-activated-event)
  documents activated events and redaction of custom names unless tool details
  are enabled. The [hook specification](https://code.claude.com/docs/en/hooks#userpromptexpansion)
  distinguishes direct expansion from agent Skill tool calls. Those sections do
  not establish a minimum release in this inspection. Record the actual
  producer version and test its event surfaces; unsupported older clients stay
  unobserved.

Invocation, successful tool return, loaded instructions, internal cognitive use
and quality effect are different claims. None is upgraded by matching a name.
