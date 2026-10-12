# Primary evaluation grading export

Status: **implemented offline export; not scoring ready**. This contract adds a
small adapter over `single_shot_v1` comparison receipts. It does not add a new
scorer or issue execution, evaluator, admission or private-asset authority.

Spec `SPEC-PRIMARY-GRADING-EXPORT-1` references
`primary-practical-evaluation-preparation-ja.md`,
`single-shot-user-comparison-contract.md` and the fixed primary fixture recipe.
The observable delta is a digest-pinned grading request and task readout preserving
`plain`, `kernel_principles_v1`, `full_ask` exactly. Core `plain/core/full`, legacy
`kernel_only`, and a future candidate condition are distinct IDs and are refused.

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
Evidence: [primary-grading-tests.log](../../evidence/primary-grading-tests.log).
Thirteen checks pass, including pending-plan public binding/export/replay for all
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

The scorer seam remains explicit and unimplemented. The request names existing
`verifyEvaluatorAuthority` and `scoreEvaluatorResult` exports but supplies
`options:null`. The old boundary requires private bundle, fixed scoring inputs,
sealed materialization/selection/run roots and normalized result lineage;
a single-shot receipt is not those authorities. Native private original bundles
are unavailable for all nine fixtures at this preparation stage. No private
worker, model, CLI, start, resume or ownership recovery is invoked here.

The smallest proposed future profile follows the existing Core additive pattern:
eight new primary schema variants for normalized result/run, evaluator envelope,
engineering result, original workspace, terminal workspace, diff and command
evidence; a synchronous scoped selector in `ask-benchmark-schema.mjs`; a scoped
three-condition coverage selector in `ask-benchmark-normalized-results.mjs`; and
an independent controller binding guard around `verifyEvaluatorAuthority`.
Base schemas and raw scoring calculations must remain unchanged. All selectors
must be inactive outside externally pinned primary controller authority, preserve
exact actual IDs and reject Core/primary mixed scopes. A bare enum extension,
caller pin or fixture mapping cannot establish that authority. Those shared
seams are proposed, not implemented. Before actual scoring, a separately reviewed
controller conversion must connect retained terminal/workspace/command bytes to
the existing sealed normalized lineage and independently bound scoring freeze,
and the adopted private originals must be restored. Until all are verified,
batch preflight remains blocked before dispatch.

The offline CLI accepts `preflight BLOCK.json`,
`export BLOCK.json NEW_OUTPUT.json`, and
`replay BLOCK.json SAVED_OUTPUT.json RAW_DIGEST` only. Export is exclusive-create
and must be outside retained controller/public/source authority roots. There is
no CLI command to score, execute, retry or resume.
