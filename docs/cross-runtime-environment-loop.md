# Cross-runtime instruction environment loop

Spec `cross-runtime-environment-loop-spec-v1`, revision 3.

Native continuation, ENV-9: add an explicit `claude_code_restricted_v1` runtime
contract alongside the existing bespoke artificial CLI contract. It uses official
Claude Code 2.1.318+ in the 2.1 release line, `--restricted`, print mode, an exact
tool allowlist, session-only hook/memory disabling, no MCP/browser/session reuse,
and a private empty config directory. Supported policies are read-only or
workspace-write with strict noninteractive permissions. Only built-in bounded
file tools and Skill are exposed; shell, network, code-running and agent tools
remain unavailable. This is a file-tool boundary, not an OS sandbox claim.
Only passive Skill/command headers (`name` and `description`, single-line
scalars) are supported. Dynamic command preprocessing, fork/agent/hooks metadata,
advanced YAML and linked instruction files refuse before the native process.
Source Skills requiring shell commands retain an explicit unavailable command
evidence status. No global settings are changed and no credentials are copied
from user files. Authentication must be supplied explicitly through a redacted
API-key or OAuth-token environment entry; absence refuses before case allocation.

ENV-9 acceptance: exact runtime/schema/policy identity; native version/help
preflight; bounded strict UTF-8 structured JSON result decoding followed by the
existing output schema/terminal/normalization checks; refusal of authentication
absence, unsafe/unknown config, policy changes, native error envelopes and output
drift; immutable-source fake transport roundtrip and real model-free CLI probes.
Authenticated execution and effectiveness remain separate evidence, and no
formal model comparison may overlap the separate24-task measurements. Rollback
is selection of the unchanged legacy runtime kind; existing runs cannot switch
kind because the runtime identity changes.

Continuation design, revision 2: compile the actual runtime instruction files
into the existing `rendered_prompt_bundle` Asset, with exact individual
Skill/Prompt dependencies and a CAS renderer-input manifest. The environment
bundle is the revision-lineage target; a newly added Skill remains a root Asset.
This is an actual instruction projection, not a fabricated Skill parent or a
new Asset/Portfolio authority. Reuse existing verified engineering result sets
for the saved evaluation bridge. Generalize the existing paired owner lease to
the exact instruction paths while preserving normal installers' other assets.
No live exporter/global/security setting is changed by compilation or leasing.

Additional obligations: ENV-6 covers new root Skill membership through genuine
environment-bundle revision lineage; ENV-7 covers saved engineering-result
verification, six-dimension readout and missing-data holds; ENV-8 covers pinned
normal installer handover, candidate selection metadata, explicit rollback,
exact owner return and partial-write refusal on both adapters.

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
Boundary: environment and usage-evidence modules, a local JSON CLI,
shared saved-evidence projection, model-free runtime inspection, paired normal
installer ownership and shared mutation locking, focused tests, documentation
and CI registration. Existing Asset, Portfolio,
Evolution, CAS and installer lifecycle remain the owners of their contracts.
The source checkout has no `.agents/skills`; canonical Skills are in `skills/`.
Implementation context is the repository's uninitialized template, so current
nearby modules and tests supply implementation evidence.

Verification Contract `cross-runtime-environment-loop-verification-v1`.
Selected proof path: `formal_verification_contract`; triggers
`state_concurrency_persistence_lifecycle_or_cross_module` and
`multi_session_multi_agent_or_handoff`. Verify ENV-1–8 with fresh artificial
inputs, both adapter projections, existing Evolution fixtures and negative
tests. Command: `node --test scripts/test-instruction-environment.mjs
scripts/test-skill-usage-evidence.mjs scripts/test-environment-evolution.mjs`.
Also run the target/materialization/compiler/membership-adoption/owner-transfer/
runtime-contract suites in the unconditional common CI step, and the evaluation
and saved-results suites using `--experimental-test-module-mocks`. Saved-results
tests mock native transport boundaries, retain real Registry/Evolution binding
checks, and check refusal of experiment, environment, model and CLI transplants.
The original native grader/verifier implementations retain their own suites.
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
| Compose active instruction files with individual dependency identities | `bundle-register`; existing rendered Prompt bundle, genuine environment revision lineage |
| Inspect individual exact references | `assets`; no promotion or installation |
| Freeze the environment | `capture`; immutable CAS object digest identifies the version |
| Inspect/export exact bytes | `inspect`, `export`; export requires a fresh directory |
| Prepare a candidate generation request | `generation-prepare`; existing personal generation request contract |
| Import reviewed files produced by either agent | `generation-import`; existing exact request/parent import contract |
| Fix a comparison before outcomes | `experiment`; existing experiment draft plus both environment object digests |
| Prepare exact runtime projections | `evaluation-materialize`; existing generic benchmark materializer |
| Check the prepared environment | `evaluation-verify` |
| Inspect installed CLI version/help capabilities without a model | `runtime-inspect`; same preflight as the existing runner |
| Explicitly start an approved comparison | `evaluation-start`; existing contained runner and per-case attempt state |
| Inspect saved execution | `evaluation-status`; execution is not grading |
| Automatically verify original saved grades and project six evidence dimensions | `evaluation-results`; original normalized/result-set/evaluator/scorer verifiers |
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
It cannot enter an evaluation binding. To evaluate new membership, first
register individual root/revised Assets, then `bundle-register` their complete
`components: [{asset, files: [{source,target}]}]` with an explicit existing Asset
`descriptor`. Compilation preserves actual instruction bytes in runtime paths,
sets the exact dependency inventory and records its renderer inputs in CAS.
The first bundle is a root; subsequent bundle revisions name that genuine
environment parent and exact rollback target. The added Skill keeps its own
root lineage. Select the bundle in the existing Portfolio and capture it with
identity source/target mappings. Component identity remains available for usage
evidence and individual export. Registration/compilation grant no safety,
source authenticity, individual admission or efficacy authority. The approved
bundle is the runtime instruction product; component state is not silently
promoted. Removing or revising a component creates another bundle revision.

`experiment` takes `draft` (the existing Evolution experiment draft) and
`environments: {baseline: <digest>, challenger: <digest>}`, explicit
`evidenceKind` (`synthetic` or `observed`) and, for saved grading consumption,
`gradingBindings` covering each fixture's exact `evaluator_bundle_digest`,
`scoring_input_freeze_manifest_source_digest`, and `scoring_policy_digest`.
Its selected changed
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
Environment dispatch sets the original runner's opt-in `firstAttemptOnly`
guard. Interrupted, active or otherwise attempted cases cannot allocate another
attempt, including after explicit stale-claim recovery. Generic runner retry
behavior remains unchanged for callers that do not select this guard.
Original runtime capability, sandbox, permission, identity, failure and
containment checks remain active. Unavailable capabilities stay unavailable;
this entry does not relax them to make a Claude run pass. Inspect existing
attempt state after uncertainty; do not reset/retry it.

Use the original independent graders for execution artifacts. `evaluation-results`
takes both roles' existing `execution` options, `resultSet` verification options
(or null when uncollected), and original `grading` descriptors keyed by case and
attempt. For environment-only execution set `resultSet.mode` to
`environment_scope`, provide its `normalizedResultsPath`, and each grading
descriptor's original public engineering `resultPath`. This verifies the exact
registered full_ask inventory and terminal attempts without requiring unrelated
conditions to execute. Every selected result re-enters the original full
evaluator/scorer and matches the re-derived bytes, run, plan and snapshot.
Omitting the mode retains the original complete four-condition result-set
verification; no partial set is relabeled as that aggregate. Independently pin the original grade receipt
digests in `trustedSavedEngineeringResultDigests`, and pin the pre-result
experiment separately. Per-role execution overrides accept only plan/materialized/
selection/run/runtime paths, adapter track and admission evidence; they cannot
replace the common experiment or trust context. Each role must match that
experiment's exact environment, and its saved model/observed CLI must match the
frozen runtime. Grading descriptors cannot replace that verified execution
context. Grades must match the frozen criterion inventory.
The returned evidence uses the same descriptive six-dimension projection as
the existing personal pair. Uncollected variance, mechanism and external outcome
remain unavailable, and missing native effort/cost never becomes zero.
`recommend` still requires independent evaluation trust; returned records never
insert themselves into that trust list. This connection neither aliases the
new pair to a historical Codex-primary run nor re-executes a grader or model.

Physical application supports exact fresh/manual baselines and full normal
Codex/Claude installations. For a normal owner, pass the independently reviewed
raw owner-state digest as `ownerStateDigest` on every leased mutation. The
baseline must cover all normal instruction files (active bindings plus explicit
unchanged support), and the reviewed source/projection must match. Only the
reviewed bound instruction paths transfer; other files, owner states, settings
and managed hook subsets stay protected. The delegated normal state advertises
the actual selected Skill names while ordinary Kernel/adapter mutations are
blocked by the shared lock/owner state. Restore requires separate fresh rollback
authority and returns the exact original owner bytes. Unrelated project files
are preserved. An immutable local operation history prevents replay of a
consumed adoption receipt after restoration. Partial journals/markers block
automatic retry and retain both owner snapshots for separately reviewed recovery.
Other profiles or source-version migrations fail closed; do not remove owner
state to bypass refusal. The historical Codex five-Prompt lease is unchanged.

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

The installed Codex CLI is `codex-cli 0.162.1`. `runtime-inspect` passed the
existing version and required execution-help contract with zero model calls.
That proves available CLI surfaces, not Skill-event emission, full environment
execution or quality. Official Claude Code `2.1.318` was temporarily installed
under `/tmp` with npm install scripts disabled; global installation, authentication
and user settings were untouched. The legacy bespoke contract's preflight returned
`availability: unavailable`, `reason: help_contract_mismatch`, with zero model
calls. That legacy Claude runtime contract requires `--benchmark-output`,
`--benchmark-task` and explicit sandbox/permission arguments that this official
CLI does not provide. The new explicit native contract passed the same actual
CLI version/help probe with zero model calls (binary SHA256
`677a2ea7bf576cedd20e191d973914ed8a41796f53a63b1923381ddc4d5b5e7d`).
This proves required CLI surfaces, not actual enforcement, Skill activation,
authenticated execution or quality. API-key and OAuth-token environment entries
are absent on the selected host, so model execution remains unverified. Existing
login files are not copied or used as implicit authentication.

To select it in the existing runtime configuration, set:

```json
{
  "adapter": "claude",
  "expected_executable_version": "2.1.318 (Claude Code)",
  "sandbox_policy": "workspace-write",
  "permission_policy": "strict",
  "claude_cli": { "kind": "claude_code_restricted_v1" },
  "environment_allowlist": ["PATH", "ANTHROPIC_API_KEY"],
  "environment_value_allowlist": []
}
```

Keep the remaining required runtime fields and explicit unsupported command
evidence contract. Set authentication locally; never put credential values in
this JSON or logs. `CLAUDE_CODE_OAUTH_TOKEN` can replace the API-key entry;
supplying both actual credentials is refused. `runtime-inspect` is model-free;
evaluation start still requires its independently bound experiment and explicit
confirmation. No automatic authentication, exporter, hook or security-policy
expansion occurs. [Official CLI flags](https://code.claude.com/docs/en/cli-reference)
and [working-directory boundaries](https://code.claude.com/docs/en/permissions#block-file-tool-reads-and-writes-outside-the-working-directories)
are upstream contracts; these restrictions do not cover arbitrary host code.

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
