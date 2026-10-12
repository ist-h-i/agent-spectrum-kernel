# Primary evaluation grading export

Status: **implemented offline export; not scoring ready**. This contract adds a
small adapter over `single_shot_v1` comparison receipts. It does not add a new
scorer or issue execution, evaluator, admission or private-asset authority.

Spec `SPEC-PRIMARY-GRADING-EXPORT-1` references
`primary-practical-evaluation-preparation-ja.md`,
`single-shot-user-comparison-contract.md` and the fixed primary fixture recipe.
The observable delta is a digest-pinned grading request and task readout preserving
`plain`, `kernel_principles_v1`, `full_ask` exactly. Core `plain/core/full`, legacy
`kernel_only` and `kernel_principles_v2_candidate` are distinct IDs and are refused.
The separately adopted v2 profile is described below.

Acceptance items: `AC-LINEAGE` binds controller run/plan, the raw fixed public input
manifest, source/task/verification identities, formal fixture task class and
mutable scope; `AC-CHECKS` preserves native command IDs/digests/exits and log
digests; `AC-UNKNOWN` retains missing quality/usage and all five unknown causes;
`AC-NO-DISPATCH` blocks caller readiness assertions before batch consumption;
`AC-REPLAY` refuses substituted exports or changed saved controller evidence.

Implementation Contract `IMP-PRIMARY-GRADING-EXPORT-1` references that Spec and
`VER-PRIMARY-GRADING-EXPORT-1` below. Its allowed scope is the grading adapter,
focused test and this document. Original scorers, schemas, frozen criteria,
private originals and controller execution rules stay outside that scope.

Verification Contract `VER-PRIMARY-GRADING-EXPORT-1` selects
`formal_verification_contract` under `ask.verification-proof-policy@1.0.0`.
Selection `SEL-PRIMARY-GRADING-EXPORT-1` has formal triggers
`public_api_schema_or_compatibility`,
`state_concurrency_persistence_lifecycle_or_cross_module`, and
`multi_session_multi_agent_or_handoff`; compact eligibility is not asserted.
The obligations map `AC-LINEAGE` and `AC-CHECKS` to fake nine-task mapping and
transplant rejection, `AC-UNKNOWN` to missing/failed evidence checks,
`AC-NO-DISPATCH` to factory membership and readiness-negative checks, and
`AC-REPLAY` to digest corruption and untrusted fake-export rejection.
Command: `node --test scripts/test-ask-primary-evaluation-grading.mjs`.
Evidence: `evidence/primary-grading-review-fixes.log` in the local preparation task.
Fourteen checks pass after the export-root regression was added, including pending-plan public binding/export/replay for all
nine fixtures. The saved terminal-reading branch also exports/replays fake local
terminal/artifact files and downgrades changed stderr to missing evidence;
the absence of a controller checkpoint remains explicit. Actual completed
controller execution and private scoring remain unverified; fake tests cannot
support an execution/readiness claim.

`scripts/ask-primary-evaluation-grading.mjs` exports:

- `preflightPrimaryEvaluationGrading(block, {root})`: verifies public/controller
  bindings when available, returns `not_scoring_ready`, unknown private/admission
  authority and explicit blockers. `block.grading.status`, `ready`, `admitted`,
  and caller private-asset availability are never dispatch authority.
  Its exact five-field binding includes the existing fixed public
  `scoring-input-freeze-manifest.json` raw digest. That digest is a metadata pin;
  it does not establish connected scoring or private authority.
- `exportPrimaryEvaluationGradingRequest(block, {root})`: reads the saved plan,
  single-shot report, terminal records, native command requests and artifact
  digests itself. A caller-provided child report is not used as authority.
- `replayPrimaryEvaluationGradingRequest(path, rawDigest, block, options)`:
  checks the raw export digest, re-exports retained evidence and requires exact
  semantic equality. `offline_export_verified` still means not scoring ready.
- `createPrimaryEvaluationGradingAdapter({root})`: frozen batch hook object;
  `preflight(block, loadedPlan)` returns `blocked`,
  `grade(block, childReport, context)` returns `unknown` with null quality.
  Extra batch arguments are ignored. No grader is started; no child completion
  is asserted. The private WeakSet predicate
  `isPrimaryEvaluationGradingAdapter(adapter)` rejects caller labels, copied
  objects and inherited hooks. Membership establishes the factory's identity;
  it does not establish readiness.
- `exportPrimaryEvaluationGradingForTest(input)`: pure synthetic fixture mapper,
  rejects observed inputs, marks `test_only:true`, cannot create a batch adapter
  identity and cannot issue scoring/admission authority.

The request retains controller history/terminal checkpoint digests, raw terminal
digests, fixture formal class and runner class, allowed scope, observed scope,
usage metrics and completeness, model stdout/stderr artifact digests, all native
command IDs, canonical command and input digests, native request/spawn digests,
cwd, exit status and separate native stdout/stderr/view artifact digests. Missing
slots remain rows with null quality and unknown authority. A command exit of zero
is structural public evidence; it does not establish semantic quality. Redacted
`patch.diff` and `changes.json` retain their original artifact identities; this
adapter does not manufacture a terminal workspace authority or full diff.
No answer, transcript, session ID, credential or authentication content is
copied into the request/readout. Saved artifacts are hashed for integrity.
Native stdout artifacts use `verification-N.stdout.log`; model JSON output keeps
`stdout.jsonl`. Public requirement IDs and digests start with unknown judgment,
null quality and empty evidence refs separately for each condition. Public
requirement record, output contract, evaluator reference and scoring freeze
retain their paths, IDs or revisions, raw digests and existing semantic digests;
freeze raw pins are checked against these files. This metadata is only for later
readout/review and is never inserted into the shared model prompt.

Readouts keep these causes unknown: model implementation failure, ASK procedure
or judgment problem, task ambiguity or unsolvability, evaluator false positive
or negative, execution environment failure. No tied-score/all-failed cause can
be inferred without grading. Future posthoc candidates are a readout concern,
not a new startup gate. Public command checks never substitute for private
grader logs or private requirement evidence.

The original export still names `verifyEvaluatorAuthority` and
`scoreEvaluatorResult` with `options:null`. The continuation below implements the
separate conversion and original API adapters; the export itself grants no
authority. Private originals for the fixed nine remain unavailable, so actual
scoring readiness remains unknown/blocked. No private worker, model, CLI, start,
resume or ownership recovery is invoked by the conversion.

The offline CLI accepts `preflight BLOCK.json`,
`export BLOCK.json NEW_OUTPUT.json`, and
`replay BLOCK.json SAVED_OUTPUT.json RAW_DIGEST` only. Export is exclusive-create
and must be outside retained controller/public/source authority roots. There is
no CLI command to score, execute, retry or resume.

## Normalized connection continuation

Spec `SPEC-PRIMARY-NORMALIZED-CONNECTION-1` references
`SPEC-PRIMARY-GRADING-EXPORT-1` and the delegated continuation scope. The delta is
a primary-only additive condition profile, faithful saved-byte conversion and
thin adapters to the original normalization, terminal-candidate, private
constructor, verifier and scorer APIs. The fixed fixture set is closed; the new
PR341 fixture, other threads and new private sources are excluded. A v2 candidate
is not registered or accepted as an alias.

Implementation `IMP-PRIMARY-NORMALIZED-CONNECTION-1` owns
`ask-primary-evaluation-producer.mjs`, `ask-primary-evaluation-scope.mjs`, the
primary schema generator, producer test/helper, eight `primary-*.schema.json`
variants and this contract. Approved shared seams are limited to
`ask-benchmark-schema.mjs`, `ask-benchmark-normalized-results.mjs`,
`ask-benchmark-execution.mjs`, and `ask-benchmark-evaluator-boundary.mjs`.
The base schema bytes, scorer calculations, partial-credit policy, scope,
blockers, frozen admissions and original private-worker bytes are unchanged.

Verification `VER-PRIMARY-NORMALIZED-CONNECTION-1` selects the formal path for
public compatibility, cross-module lifecycle and multi-agent handoff. Acceptance
obligations are saved checkpoint/run/plan binding; baseline plus changed bytes
closing to the whole after inventory; exact actual condition IDs; unmodified
model command parsing; unavailable/failed results and missing usage preservation;
scope revocation and mixed-profile rejection; source/artifact/mode tamper
rejection; faithful plain-response format; and original non-ready scoring
calculation. Run
`node --test scripts/test-ask-primary-evaluation-producer.mjs` and
`node scripts/generate-ask-primary-grading-schemas.mjs --check`.
Current evidence is [primary-normalized-integration-tests.log](../../evidence/primary-normalized-integration-tests.log)
(16 producer and three existing pure alias tests, all 19 pass) and
[primary-schema-verification.log](../../evidence/primary-schema-verification.log)
(schema check exit zero).
These are synthetic/local tests. Actual completed native execution, restored
private originals, admitted review authority, positive original private
constructor and original worker compatibility remain unverified.

The async `producePrimaryEvaluationArtifacts(block, newOutputRoot)` initially
uses the existing saved comparison readers. It requires the approved single-shot
plan and exact public grading bindings. Captured terminals require a matching
saved controller checkpoint, consumed start, released controller state and known
direct-child completion. It does not probe PIDs or resume execution. Pending
slots produce pending normalized rows without invented attempts.

`control/patch-workspaces/<condition>` contains changed files only. The producer
uses unchanged baseline bytes plus saved changed bytes, removes deleted paths
through the saved after inventory, preserves modes and compares every resulting
file's digest and byte count. Missing or changed bytes refuse conversion. The
post-verification workspace is never substituted as a terminal snapshot.
Existing `captureTerminalWorkspaceInventory`, `buildTerminalWorkspaceAuthority`,
`readVerifiedTerminalWorkspaceAuthority`, `normalizePortfolioExecution`, and
`materializeVerifiedTerminalCandidate` perform the derived checks. The producer
pins its source code/import closure, base/additive schemas, controller raw files,
copied snapshots and derived artifacts; synchronous replay rechecks original
file bytes/modes and all derived records. Original saved evidence must remain
available. It is not a portable replacement for those originals.

Model stdout is passed unchanged to `buildCodexCommandEvidence`. Parsing failure
uses the existing unavailable-command manifest. Missing, declined or failed model
checks stay missing, declined or failed. Native controller verification remains
supplemental readout evidence and does not become a model-executed check. No
Codex events are manufactured. The old command parser and capture semantics are
unchanged.

The profile uses the Core additive-schema pattern with exact IDs
`plain/kernel_principles_v1/full_ask`, without Core owner-attestation or recovery
protocols. A synchronous verified producer scope supplies execution inspection
and terminal authority to existing helpers. A schema-build scope only selects
schemas and cannot verify/score an evaluator result. Scopes expire before async
descendants; Core/primary mixed authority is rejected. Original schemas and
defaults remain selected outside primary scope.

The saved `last-message.txt` was sanitized by the original controller. Its exact
saved bytes/digest are preserved as `primary-response.txt` with the explicit
format `primary_plain_utf8_response_v1`. They are neither reconstructed provider
originals nor an invented `agent-output` JSON record. The primary-only final
evidence seam first retains the original normalized lineage/byte/digest bounds,
then rechecks the producer's attempt and strict UTF-8 bytes. Without a verified
primary scope the original JSON/`agent-output.schema.json` requirement remains
mandatory. The sealed evidence transport retains its original logical evidence
key; the primary profile explicitly treats its bytes as the saved text format.
Redaction and truncation limits are inherited. No status, success or schema is
synthesized from the reply text.

`buildPrimaryEvaluationScoringInputs` separates `frozenSourceRoot` from the
current converter code root and maps the original public freeze paths to that
source root. The four existing admission decision/review/archive arguments are
forwarded together to the unchanged scorer API. Public metadata pins do not
resolve effective admission; `admission_pending` is preserved. No pending
record is rewritten to admitted and `verifyEvaluatorResult` is unchanged.
`verifyPrimaryEvaluationResult` and `scorePrimaryEvaluationResult` wrap the
original verifier/scorer with independently reverified producer lineage and
the primary schema scope. The pure engineering calculation test keeps unknown
scores null and the blocker gate `not_scoring_ready`.

`createPrimaryEvaluationSealedEvaluatorExecution` connects the original
constructor after original terminal candidate/final evidence, public authority
anchor, original private bundle, exact bundle digest and hidden asset checks.
The original constructor does not impose a separate all-commands-success gate;
this adapter adds none. The original scorer decides the meaning of missing or
failed model commands. It does not start a worker. Original deterministic runs
and before/after consistency checks remain intact. Parent-process scope is not assumed to propagate to a
historical worker or hidden module. The public runner passes verified normalized
bytes and workspace evidence to the immutable hidden function; whether that
missing original hidden function reads the saved response or revalidates an old
condition/JSON schema remains unknown. This format compatibility change is not
a scoring-criteria revision.

Catalog `registered_repetitions` and registered `aggregate_eligible` remain
unchanged lineage metadata. Actual repetition is one and the outer producer,
plan and scoring-input readout explicitly declare
`formal_aggregate_eligible:false` and a practical three-condition comparison.
No formal aggregate API is called. Actual grading remains blocked by missing
private/admission evidence. Runtime compatibility is unknown until an authorized
original run; it is not a permanent gate after valid assets are restored.

The original normalized `outcome` projects `attempt.result.status`, the model
CLI outcome. A confirmed CLI exit zero therefore stays `completed` when the
independent controller slot is `verification_failed`; the saved controller state,
scope and native checks remain distinct evidence. Nonzero or unknown model exit
stays failed. The original candidate/diff/scope guards are unchanged. This mapping
does not assign semantic success to a candidate. Requested model/reasoning labels
remain in the derived adapter record, while resolved model/reasoning telemetry,
thermal state and ordinary global/provider permission policy remain typed
unknown. `workspace-write` records the requested sandbox argument. No provider or
global configuration is inspected or reconstructed.

## Original private pipeline connection

Spec `SPEC-PRIMARY-PRIVATE-PIPELINE-1` connects one produced condition to the
original sealed constructor, original worker, original envelope/record adapters
and original score API. It introduces no evaluator callback, registration,
criterion, cached verification or alternative grader. All output paths must be
new and separated from original resource roots. Missing assets, unknown child
completion, capture/persistence failure, timeout or cancellation stops the
pipeline and prevents a completed result. Actual private worker/model execution
is outside this implementation verification.

Implementation is `ask-primary-evaluation-private-grading.mjs`.
`preflightPrimaryEvaluationGradingResources(block, resource)` is read-only and
does not require terminal, run or normalized markers. It checks the closed nine
fixtures and exact actual profile/binding, original public freeze closure,
historical Git/source/dependency graph, anchor and private asset closure, then
uses the original four-file review/archive resolution to require genuine
effective admitted authority. `verifyPrivateEvaluatorResourceAssets` extracts
the existing bundle byte/schema/source/independence/reference checks. The existing
full bundle API still requires all original isolation markers and private-material
publication scans. Resource `ready` means static resources/review verified;
`execution_isolation_authority:false` and runtime compatibility unknown remain
explicit. Frozen `admission_pending` bytes are never rewritten.

Current default dependency-graph authority paths contain eager-read schemas
introduced after the original source closures. Applying those defaults to an
original historical root asks for files absent from its immutable revision.
The primary-only selector instead reconstructs the original graph's parameters
from pinned public data: its exact five entry paths, `authority_data` node paths
and `private_entry_import` targets. It does not accept a declared graph as proof.
The existing derivation still reads every source byte, verifies immutable Git
revision bytes, discovers all imports/edges and requires full graph and source
inventory equality. Explicit caller graph parameters are rejected in this scope.
Current adapter source pins remain separate from the old worker graph.

For preflight, `withPrimaryHistoricalEvaluatorResources` uses a separate
synchronous source-only context. It requires the closed nine fixture/profile
binding and exact current repository freeze/reference raw pins, then rechecks
matching historical-root bytes and the original revision on every selection.
This context supplies no producer, additive schema, scoring, admission or start
authority. The verified producer context selects the same original parameters
for constructor and record revalidation; all reference/freeze pins remain checked.
Outside these primary contexts the original/current default graph is unchanged.
Tests rederive all nine historical public graphs and reject altered source or
reference, changed root/revision, explicit graph arguments and async leakage.

`runPrimaryEvaluationPrivateGrading(producerOptions, runtimeInputs, controls)`
calls the original constructor and two deterministic worker runs, saves the
original canonical fragment plus exact captured stdio, constructs the original
evidence/envelope/private record fields from actual returned execution states,
and calls `scoreEvaluatorResult` once. That scorer's original private-record
verifier performs two additional runs. All four runs retain their original
before/after and deterministic checks. No separate preliminary result verifier
adds extra runs. The temporary zero record digest is a memory-only envelope
cycle placeholder, as in the existing public test fixture; it is never saved or
passed to the scorer. The actual current adapter source digest comes from the
reverified producer source pins, separately from the immutable historical worker
source identity. The record is not constructed from caller-reported execution.

The primary-only module-owned stdio recorder verifies the producer and
condition/run/normalized binding and requires a canonical private log directory.
It exclusively creates private stream and receipt files. Streams preserve the
original Node child boundary's UTF-8 capture encoding. Successful and failed runs
retain bounded receipt refs/digests/status; caught error messages and private
stdio content never cross the public API. A private WeakMap carries only
module-owned receipt summaries on exceptions. Saving failure or unknown
termination throws before the next run. Resource checks and receipts do not
grant evaluator/admission authority. No caller child/stdio callback is accepted.

Initial worker runs and persisted-record reruns both retain the verified immutable
bundle-owned execution_budget_ms. Callers cannot override it with a shorter timeout.
The existing original schema permits at most 900000ms; the adopted historical focused
regression public generator declares 660000ms, seven others declare 120000ms, and the
build-option original manifest budget remains Unknown. Public generator definitions
are not restored private manifest evidence. Each condition reserves four original
worker budgets; plans conservatively reserve 185 minutes per three-condition fixture
(4 x 3 x maximum 15 minutes + five minutes conversion/save) and 84 hours overall.
Older 48/60-hour plans are not rewritten or eligible for new start.

Verification `VER-PRIMARY-PRIVATE-PIPELINE-1` uses formal synthetic/negative tests
for missing assets and deadline/cancellation before child zero, source/binding
checks, exact private stream capture, exclusive writes, async scope revocation,
transplant rejection, unknown termination and partial capture receipt summaries.
Run `node --test scripts/test-ask-primary-evaluation-private-grading.mjs` alongside
producer/export tests. The local historical public resource test uses the
independently prepared scoring runtime if present and otherwise skips explicitly.
No original private worker is executed. Positive original constructor/worker,
hidden raw-response/condition compatibility, original fragment acceptance and
complete numeric scoring remain unverified because the originals are missing.
All six focused private-connection tests pass, including exact public graph
rederivation for all nine historical roots and original-assets-missing blocking;
see [primary-private-grading-tests.log](../../evidence/primary-private-grading-tests.log).

Independent review found the r3 five-minute worker cap truncated an existing eleven-minute
fixture budget. The r4 connector fixes only scheduling: actual worker budgets, raw scorer,
criteria and old protocol remain unchanged. A pure budget regression covers 660000,
120000, the existing 900000 maximum and rejected invalid values; no private worker starts.

## Separate K-principles v2 grading profile

`SPEC-PRIMARY-K2-CONNECTION-1` revision 1 and
`IMP-PRIMARY-K2-CONNECTION-1` revision 1 add the closed
`primary_principles_v2_single_shot_v1` profile. Its actual IDs are exactly
`plain`, `kernel_principles_v2`, `full_ask`, in that order. The existing
`primary_single_shot_v1`, its condition exports and eight `primary-*` schema
files retain their v1 behavior and serialized bytes. Eight separate
`primary-k2-*` schemas select v2; generator writes only those new files with
exclusive creation and checks both families.

The saved plan kernel selects the public binding, request and factory grading
loop. Producer conversion selects the same profile from the saved request:
request profile, binding profile, ordered conditions and ordered slot IDs must
match. Saved kernel/arm/snapshot keys are checked against that profile. Mixed
IDs, condition aliases and unknown profiles refuse. Producer source pins include
the profile module, both schema families and the existing unchanged base
schemas; retained evidence includes v2 metadata and its renderer closure.

Schema and condition selectors derive their profile from a reverified producer,
or from an explicit synchronous builder profile. Builder and historical public
resource scopes grant no producer, scoring or start authority. The historical
resource scope accepts either closed profile and still verifies the same public
freeze and original evaluator graph. Original worker construction, scoring,
admission, criteria and budgets are unchanged. Missing original assets keep
quality null and compatibility unknown; synthetic evidence cannot prove original
hidden-worker compatibility.

Focused verification for `FVC-PRIMARY-K2-CONNECTION-1` revision 1 obligation O4:
`node --test scripts/test-ask-primary-evaluation-profile.mjs scripts/test-ask-primary-evaluation-producer.mjs scripts/test-ask-primary-evaluation-grading.mjs scripts/test-ask-primary-evaluation-private-grading.mjs`.
These checks use retained synthetic controller records and public frozen source
only. They start no model or original private worker.

Verification evidence for this profile addition:
`../../evidence/primary-k2-grading-focused.log` records the first 49 checks
(44 passed, five v2 saved-history failures). Those failures identified the
execution-state reader's old condition-selector import. After that registration
fix, `../../evidence/primary-k2-grading-affected-rerun.log` records all 29 affected
producer/private checks passing with no failures or skips. The 20 unaffected
profile/public-grading checks passed in the first run. Schema generation check
and diff whitespace check passed. Original private worker compatibility and
numeric evaluation remain unknown; these logs contain no original worker run.
