# Instruction improvement continuity

Implementation scope, acceptance mapping and verification limits:
[delivery evidence](instruction-improvement-delivery.md).

Spec `instruction-improvement-continuity-spec`, revision 2. Upstream: the
owner's eight-item implementation request, #176 and #180, and the existing
`cross-runtime-environment-loop-spec-v1` / supervised loop contracts.

## Behavior and acceptance

Revision 2 closes the integration gaps identified after the first implementation:
component authoring/composition/import are executable supervised candidate stages,
their whole-environment practical result reaches exact local apply/restore, and
a bounded operation advances fresh cycles without another routine human gate.
Portable text helpers remain inert during import and are visible in the exact
reviewed preview. Existing v1 packages and Full/native profiles remain supported.

- AC-CONNECT: a component profile automatically imports only exact confirmed
  local plans, composes host-declared layers, invokes the bounded authoring
  provider for revise/create/exclude, captures both whole environments, evaluates
  them after the case gate, and plans application before the change gate.
  Neither source package authority nor a generated response can approve adoption.
- AC-OPERATE: an explicitly bounded operation automatically prepares/starts its
  next cycle after completion, retaining actual results/baseline and reserving
  unique cycle destinations. Recovery never copies a previous human decision,
  replays a consumed model/owner command, or changes a finished ledger.
- AC-HELPERS: selected, bounded UTF-8 helper files can travel with an instruction
  in a versioned package. Include exact bytes/media type in preview and plan;
  reject unsafe paths, binaries, secrets and unselected dependencies. Import
  does not execute helpers, preserve executable mode, or trust foreign evidence.
  Receiver Eval cases and change decisions still govern execution/adoption.

- AC-FEEDBACK: bounded, explicitly supplied work summaries retain evidence
  digests and applicability, group repeated findings and propose the narrowest
  destination. Only instruction candidates enter instruction generation;
  checks, task-local corrections and other destinations remain explicit work.
  Native generation must consume the exact controller observation, never raw
  work logs or private answers. Selection uses its public tags.
- AC-CONTINUE: a completed digest-chained run can prepare a fresh next-cycle
  policy, carrying its decisions, report, failures, uncertainty and evidence
  digests. Incomplete/uncertain runs refuse. Preparing never dispatches a worker,
  copies approval, reuses trial IDs or changes the original run. New cycles
  retain both human gates. The host supplies a fresh runtime and destinations.
- AC-PORTABLE: explicit selected individual instruction Assets have a local
  deterministic preview, content checks and separately approved export. Packages
  exclude original Registry histories, authority, logs and unselected Assets.
  Imports validate checksums/compatibility, start in quarantine, report duplicate,
  identity and dependency conflicts, and require an exact reviewed plan before
  registering local candidates. No network/transport, automatic activation,
  silent overwrites or implied source authenticity. New local provenance and
  exact dependency remapping are explicit. Original imported identities remain
  provenance digests, not local admission authority.
- AC-COMPOSE: common, specialist, application and personal selections pin exact
  local Asset refs. Multiple specialist layers are allowed; order grants no
  override authority. Different versions/paths conflict until explicitly selected
  or adapted. Compilation reuses the existing compiler and Registry/Portfolio
  admission. Personal Assets are included only by explicit local selection.
- AC-AUTHOR: an exact host-owned environment authoring request can revise
  selected Skills/Prompts, create explicitly inventoried root Assets and exclude
  explicitly removable components. Agent output contains text only. It cannot
  alter descriptors, executable code, dependencies, permissions or evaluation.
  Import verifies the original request/environment, keeps genuine individual
  and bundle lineage and produces locally unevaluated candidates on both
  adapters. Excluding a component never deletes or retires a shared Asset.
- AC-LIFECYCLE: preserve existing two human gates, restore, refusal cleanup,
  at-most-once dispatch and unknown-result stops. Verify them with existing
  artificial runtime/owner suites, including two connected cycles.
- AC-CLAUDE: preserve the existing restricted Claude runtime and imported
  generation path; provide a non-dispatching supervised adapter preparation
  contract. Native Codex-only Full installations must not be mislabeled Claude.
  Authenticated Claude acceptance waits for an owner-provided environment.

Compatibility: existing commands and run journals stay readable. New behavior
is opt-in. A new environment/bundle is evaluated as a whole; per-Asset causality
and real quality improvement cannot be inferred. No new live Eval cases are
approved here and no real owner application is performed.

## Implementation and verification contracts

Implementation `instruction-improvement-continuity-implementation`, revision 2;
upstream `instruction-improvement-continuity-spec@2`. Reuse CAS, Registry,
instruction compiler, Portfolio and supervised host boundaries. Add small local
feedback, continuation, portable-package and composition entry points; do not
change scoring, original evaluations, credentials, runner settings or installers.

Verification `instruction-improvement-continuity-verification`, revision 2;
upstream `instruction-improvement-continuity-spec@2`. Selected path:
`formal_verification_contract`, triggers
`state_concurrency_persistence_lifecycle_or_cross_module` and
`multi_session_multi_agent_or_handoff`. Each AC maps to the corresponding new
focused test plus existing supervised/native-host, environment/compiler,
Registry and Portfolio suites. Negative checks cover tampering, duplicate IDs,
missing dependencies, stale approval/plans, path traversal/symlinks, foreign
scope, unsupported adapters and uncertain previous operations. Run repository
validation and an independent diff review. Record actual commands/results in
the delivery report; artificial approvals never confer live authority.

Revision 2 adds real model-free component authoring/import/composition through
whole-environment evaluation and actual temporary-target apply/restore, two
adopted cycles under the bounded operation, public target API bypass negatives,
normal-installer lease chaining, v1/v1.1 package compatibility and unsafe helpers.
These checks supplement, rather than replace, the existing formal Evolution,
native Full, Registry, Portfolio and saved-result regression owners.

Real model quality, effective ambient context, real target adoption/restore and
repeated live operation remain separate acceptance evidence. #176's broader
Golden Rule maturity/effectiveness research is not proven by candidate routing;
#180's contractual permission is never decided by a scanner.

## Operator procedure

The user can ask the host agent to prepare the next cycle, package selected
Assets, or compose their common/team/application/personal configuration. These
operations use local Registry references; a consumer does not fork ASK or manage
source branches. The host/admin sets the initial source, authority and runtime
configuration. The two judgments in a normal improvement cycle remain Eval
approval and change approval. Portability is a separate explicit request with
its own owner and destination; local admission never grants export permission.

All environment commands use
`node scripts/instruction-environment-cli.mjs COMMAND /absolute/input.json`.
Inputs use the exported function's camelCase options. JSON reads are bounded and
reject duplicate keys. Common trust options are the existing `storeRoot`,
`registrySnapshotDigest`, `trustedAssetAuthorityContexts` and, where the baseline
has a Portfolio selection, its existing Portfolio/high-impact trust contexts.

| Command | Required inputs and result |
| --- | --- |
| `feedback` | `findings: [{observation,kind,tags,severity}]`. `observation` is the existing validated personal-observation record. Kinds: `instruction_gap`, `deterministic_failure`, `project_fact`, `design_decision`, `documentation_gap`, `one_off`, `accepted_risk`, `refactor`. Returns ranked destinations and a public instruction observation; no instruction candidate stops instruction generation. |
| `authoring-prepare` | Exact baseline `environmentObjectDigest`, Registry snapshot, `observation`, `editableStableIds`, optional `removableStableIds`, optional `additions: [{descriptor,files:[{source,target}]}]`, and `bundleDescriptor`. Returns a CAS request and bounded agent input. For an existing compiled environment the bundle descriptor names that exact baseline bundle as parent/rollback; for the first bundle it is a root. |
| `authoring-import` | Same exact baseline/trust context, `requestObjectDigest`, and `response: {request_digest,changes}`. A revise/create change is `{operation,stable_id,files:[{path,text}]}`; an exclude change has only operation and stable ID. Returns individual candidates and an environment bundle for the existing Portfolio selection/capture/evaluation flow. No current environment is modified. |
| `composition-plan` / `composition-lock` | `adapter`, `layers: [{id,kind,components}]`, optional `excludedStableIds`. A component is the existing `{asset:<exact ref>,files:[{source,target}]}`. Returns the complete preview and fixed lock digest; lock also publishes to CAS. |
| `composition-inspect` / `composition-register` | `compositionObjectDigest` and original trust context. Register additionally takes the unchanged locked `registrySnapshotDigest` and existing bundle `descriptor`. Registry drift requires a fresh plan. |
| `composition-diff` | Verified `before` and `after` locks; reports add/change/exclude without resolving a conflict by layer order. |
| `package-preview` | Explicit `selectedAssets` (individual exact refs), `intendedScope`, and `portability` keyed by selected stable ID. Include every dependency explicitly. Returns the entire content preview and digest, without writing an export. |
| `package-export` | Same preview inputs plus fresh `outputPath` and host-supplied `approval: {preview_digest,evidence_digest,intended_scope}`. Rebuilds the preview and requires exact approval; writes one inspectable JSON package locally and stops. An identical repeat is idempotent; differing bytes never overwrite. |
| `package-receive` | Explicit local `packagePath` and fresh `quarantineRoot`. Validates schema/checksums before allocation. No discovery, transport or activation occurs. |
| `package-plan` | Quarantine, local Registry/trust context, receiver `intendedScope`, `adapter`, `availableCapabilities`, optional `availableRuntimeProfiles` and `resolutions`. Omitted resolutions retain quarantine. Each selected source ID may `accept`, `adapt` with a new `stable_id`, `reject`, or `quarantine`. Shows complete content, local identities/duplicates, capability/adapter/dependency blockers and Unknown applicability. |
| `package-apply` | The same plan inputs and exact `confirmedPlanDigest`. Registers accepted Assets as new local candidates with remapped dependencies. Identity conflicts require explicit adaptation; it never overwrites existing content. |

Each portability entry supplies these bounded public summaries: `title`,
`rationale`, `applicability`, `non_applicability`, `exceptions`, `verification`,
`refresh_condition`, `validation_summary`, and `evidence_status`. Original source
scope/ref identities are digests. Original logs, Registry/approval histories,
owner identifiers and unselected files are not packaged. The conservative
scanner rejects obvious secrets, URLs, email/absolute paths and code blocks;
it cannot recognize every confidential name or establish contractual permission.
Redact and review before export. Rendered bundles export through their individual
components so renderer input/dependency authority cannot be smuggled as claims.
Asset Markdown is the explicitly selected product, not a default dump of raw
work source or conversation material.

Packages containing text helpers use contract `1.1.0`; Markdown-only `1.0.0`
packages remain readable and are still the default without helpers. A v1.1 file
adds an exact `media_type`. Supported UTF-8 helper types include JavaScript,
TypeScript, Python, shell, JSON, YAML, TOML, text and SQL within the selected
instruction's directory. Explicit `.agents`/`.claude` instruction namespaces
are supported; hidden configuration, binaries, archives, traversal and symlinks
are refused. Helper bytes and media types are shown in preview/import plans.
v1.1 permits code fences in selected files; metadata and files still undergo
secret/identifier checks, including quoted JSON secret keys. The scanner is
conservative and is neither malware analysis nor proof of lawful portability.

Import writes helpers as inert text without executable mode and does not run
them. The receiving `component_practical_instruction_loop_profile_v1` can consume
an exact confirmed import plan, map every accepted Asset into explicit local
layers and evaluate the resulting complete environment before change approval.
Only a caller-owned approved Eval command can execute a helper in its fresh
workspace; adoption copies it into the owner and does not execute it. External
runtime/dependency requirements must be declared and locally checked, not
automatically installed or inferred from source claims.

Import's `ready` means ready to register *candidates*, not ready to execute or
adopt. Adapter/runtime/capability constraints remain explicit. Source applicability
summaries are retained as untrusted package metadata; project/model/domain
applicability and evidence must be established at the destination. The receipt's
`rollback_snapshot_digest` is the unchanged previous Registry snapshot: select it
to undo the candidate import. No mutable current pointer is changed by import,
and its CAS history/quarantine remain available. Reject/quarantine write no local
Asset. A failed multi-Asset import can leave immutable candidate objects, but
cannot activate them or alter the original snapshot; retry of the same complete
input reconstructs the same local source commits and snapshots. Do not treat
that retry rule as permission to repeat a consumed model or owner operation.

## Repeat a Full/native cycle

After the previous run is completed, with no pending/uncertain operation:

```sh
node scripts/supervised-instruction-loop-cli.mjs next \
  --root /absolute/previous/run --profile /absolute/previous/profile.json \
  --config /absolute/previous/config.json --id cycle-two \
  --output-root /absolute/protected-host/cycle-two \
  --feedback /absolute/public-feedback.json
```

The command verifies the old policy/runtime/profile pins, writes a fresh profile
and config, and reports a fresh `run_root`. It preserves the native preparation
depth and workspace permission boundary by allocating siblings of the previous
native/work roots. It updates Registry state, takes the applied candidate as the
new baseline only after actual adoption, carries the previous public reasons and
numeric report metrics, and drops archive-bound judgments from the next report.
When no new feedback file is supplied it keeps the original public goal alongside
the latest reasons/results. Old reports and journals remain unchanged. No worker
is dispatched. A partial preparation is visible and is not overwritten.

Advance with the returned config/run paths through the existing CLI. New model
calls require the existing host authorization/budget; new Eval/change packets
require new human decisions. A custom runtime can use `next-policy --config`
to derive only the next policy, but must bind/rebuild its own worker config to
that observation; it must not reuse a native profile with changed policy data.

## Claude and evidence boundary

The adapter-neutral authoring handoff and component/portable/composition flows
accept `claude_code` environments and `.claude` mappings. This prepares exact
candidate requests and imports for an authenticated Claude host without changing
its app configuration or obtaining credentials. The existing restricted Claude
evaluation/runtime and saved-result verification remain separate contracts.
The component pipeline supports Claude-shaped authoring requests, composition,
packages, local evaluation/application and normal-owner leases. Its subprocess
authoring and automatic-assessor model ports are currently Codex ports; an
authenticated Claude host can use the standalone adapter-neutral request/import
handoff, which is not connected to automatic component generation.
No authenticated Claude-app dispatch or real-model cycle is claimed here.
The retained Full/native reference runner remains Codex-specific; a Claude
handoff is not mislabeled as a completed Full/native Claude run. Automatic Claude
app dispatch and app-specific closure capture are not implemented. The additive
[`external_host` component port](instruction-loop-host-authoring.md) now retains
preparation, one execution claim and a bound completion inside the supervised
loop. The host AI supplies the response and host-reported closure; this port
neither launches nor authenticates a Claude app. Authenticated end-to-end
acceptance is separately unperformed until the owner supplies that environment.
See [the implementation/acceptance audit](instruction-improvement-readiness.md).
No live comparison or installation
was performed by these commands' implementation tests.
