# CI shadow classification and OS boundaries

## Current operation and completion scope — 2026-10-29

All pull requests and manual `Validate repository` runs continue the full job
graph. Selection is intentionally disabled. The fixed `validate` gate requires
the plan and all five workers, and rejects missing, failed, cancelled, skipped,
stale or contradictory completion evidence. The other three workflows and Mac
process, stdio, filesystem, permission and historical-source checks are retained.
Real-model/API evaluation is not enabled by CI; artificial fixtures verify
infrastructure contracts, not LLM quality or native sandbox acceptance.

[PR #449](https://github.com/ist-h-i/agent-spectrum-kernel/pull/449), at its
original head `c140be361b0904426db4d00b6f69089bf79ff957`, supplied the first
eligible `docs-v1`/full observation after #448: five successful receipts, 109
successful required descriptors, matching Git/run/attempt/policy/registry and
the strict gate. The saved outputs reconstruct `docs-shadow-full-pass`; the
rendered step-summary body was not directly retrieved. The legacy `docs`
classifier record has a different scope and is not this comparison. This is one
transport observation, not a general detection-rate or performance guarantee.
The expanded #449 change requires its own final-head checks; that earlier green
run is not reused as evidence for later code.

The retained complete validator now also calls the existing shared capability
claim check with the validation root and that root's capability matrix. This
closes a concrete gap: guide text could trigger a sensor regression while the
previous complete validator accepted it. Focused positive/negative tests cover
both allowlisted guides and matrix/read-error behavior, and run from the existing
repository regression command. No matching rules, jobs or parallel validator
framework are added. Existing parser semantics remain unchanged.

### Intentional deferral of selective execution

The first bounded omission candidate is `repository-tests` alone; common and
personal input domains are not certified omissions. In the saved #449 batch the
repository worker used 28m39s, but common and Mac determined completion, so
removing only that worker has zero wall saving under fixed timestamps. Adding a
whole-source audit/fingerprint framework for this limited benefit is not the
current priority. Keep full execution rather than accumulate an unlimited audit.
This is an efficiency tradeoff, not a claim that all future readers must first
be proved independent or that selective execution has been implemented.

A future narrow implementation can reuse the current two-file content-change
allowlist, retained validator/common/personal owners and plan/gate. It must accept
only the plan's explicit non-selected worker skip, reject selected worker
failure/skip/cancel/missing/stale evidence, and run full for uncertain diff,
unknown/shared/dependency/CI/Skill/core changes, deletion, rename or mixed scope.
Changes to an audited consumer require reviewing its document inputs before
retaining the exception. Broader omissions need their own concrete responsibility
review. No new automatic source approval or unlimited dependency-closure gate is
required. Revisit this work when runner usage or the actual critical path makes
the benefit worthwhile; require focused negative tests and an ordinary reviewed
PR, not repeated CI solely to accumulate green observations.

### Full-run, recovery and measurements

- Normal PR runs already provide full regression coverage. Manual
  `workflow_dispatch` also runs full and is the recovery path for unavailable
  classification evidence. No periodic duplicate full run is added while every
  PR is full. A future selective policy must decide its periodic full cadence
  before enablement; no real evaluation is scheduled by that decision.
- Uncertain classification falls back to full. Invalid execution identity,
  plan or receipt fails the aggregate; it is not converted to a successful
  fallback. Investigate the source/log defect and fix the same PR. Do not disable
  checks, repair unrelated frozen manifests or repeatedly rerun unchanged code.
- Cancellation/concurrency optimization is deferred. If introduced later, scope
  it to obsolete runs of the same PR; never cancel evaluations, another PR or
  an unrelated process. Current runs are not cancelled by this work.
- #450 merged as `999b14a77b27a70f76713e129669fa3312fe36d7`. Its local complete
  build-option comparison was 28m04s to 17m00s (n=1 each), preserving all 33 fresh
  negative cases. On hosted CI the target interval was 11m40.4s to 7m17.5s and
  common 78m44s to 74m20s versus #449. Overall wall instead rose from 79m01s to
  85m18s and unweighted runner total from 228.50 to 241.42 minutes; Mac was the
  final critical job at 80m12s. Different workers, Ubuntu images/regions, load
  and cache state prevent a causal or sustained saving claim. These scopes are
  not added together or converted to billed cost.

The completed foundation is coverage-preserving deduplication, conservative
classification, exact full-run completion checks, one real docs observation and
the concrete retained-validator fix. Selective execution, provisional docs/core
turnaround targets and stable median/p95 improvements remain unmet/deferred.
Issue #433 may be closed as this bounded foundation only after that scope
adjustment and the final PR are accepted; unchecked original goals are not
silently marked complete. Critical-path performance and any selective rollout
are follow-up work, not extra gates for personal V1 or real evaluation.

## Historical verified state after PR #440

Implementation baseline: [PR #440](https://github.com/ist-h-i/agent-spectrum-kernel/pull/440),
reviewed/tested head `d3a67907a089ab16009072bf0be0dbcdff250bdc`, normally merged
as main `331389222488ff296607a3c0b00a0a70b1cde36d` on 2026-10-22 10:46:05 UTC.
The checked merge `5c755dc26e738306d1f35f7c79b3dbea1f232a0b` and merged main
have identical tree `05d6939a2cee11f588036277e867b1fda712a40f`. This is evidence
for that tested composition, not an assertion of later-commit or post-merge CI.
The current implementation follows `SPEC-CI433-3@1`, `FVC-CI433-3@1` and
`IMPL-CI433-3@1`; earlier contracts and local-stage records below are history.

- Validate has 148 registered Node script invocations: 140 inherited from #439
  plus eight controls. Local-eval retains 25. The original 134-command snapshot
  remains intact. See [the current inventory](ci-suite-inventory.md).
- Plan and five independent workers use Ubuntu24.04/Node24.19.0 and full-history
  checkouts. Docs-checks owns the complete validator, whitespace and CI/control
  checks. Fixed validate always requires six predecessors: plan and all five
  workers, with exact success and closed plan/receipt validation.
- All 11 hosted checks passed on the same head, attempt 1:
  [Validate](https://github.com/ist-h-i/agent-spectrum-kernel/actions/runs/39754132064),
  [Local fake](https://github.com/ist-h-i/agent-spectrum-kernel/actions/runs/39754131869),
  [Context](https://github.com/ist-h-i/agent-spectrum-kernel/actions/runs/39754131984),
  [Verification](https://github.com/ist-h-i/agent-spectrum-kernel/actions/runs/39754131833).
  Plan, all five receipts and the actual final gate agreed on checkout
  commit/tree/parents, run/attempt, runtime, policy and registry. The 107 required
  descriptors were common97/docs7/clone1/repository1/CLI1. Their actual step
  completion was checked, and replay against the exact Git diff and current
  policy/registry reproduced the hosted gate JSON. The unchanged failure-only
  diagnostic is excluded from successful-completion receipts, not deleted.
- Local focused controls passed 23/23 with no skips; validator, YAML and
  preservation checks passed. Independent final merge review approved with no
  unresolved findings or missing evidence. No cancellation, manual CI rerun,
  protection change, admin bypass or real-model execution was used.

The single batch took 84m55s from workflow creation to last job completion;
11 jobs totaled 257m07s unweighted runner time (not billed cost). Common took
84m34s and Mac84m14s. These are n=1 absolute values. Different source conditions
and insufficient samples prevent a causal improvement, stable median/p95 or cost
claim. They do not establish the provisional docs/core turnaround targets.

Selection is still disabled (`selection_enabled=false`); every actual worker
runs. This #440 observation proposed full, not docs-v1. There is **no actual
eligible-docs hosted shadow/full observation under this policy/job partition**.
The temporary Git docs-positive fixture proves its tested wiring only. Complete consumer/dependency closure and demonstrated historical regression
retention remain unestablished. Any unexplained failure in a proposed excluded
suite blocks enablement. Real selection/non-selection workflow wiring, sufficient
measurements, periodic full-run/recovery and limited-concurrency policy remain
unfinished. Fake/ordinary-process controls do not qualify real LLM quality or a
native sandbox. None of these CI observations adds a personal-V1/real-evaluation
start gate. Real-model automatic execution stays disabled.

## Historical stage-2 contract — PR #437

Spec `SPEC-CI433-2`, revision 2; upstream: Issue #433 and the approved
2026-10-22 next-stage delegation. Starting main: `7a44f734d72f3080d4005d48308f8adf0e05e564`.

- CI433-SHADOW: record a proposed classification and test-job selection in the
  workflow log and step summary, with base/head/merge-base, checkout commit/tree,
  Node/platform and changed paths.
  Actual execution remains full. No classifier output controls a job or step.
- CI433-FALLBACK: missing/invalid event or Git evidence, incomplete or malformed
  diff, unknown/shared/dependency/CI paths, deletion/rename and multiple scopes
  propose full. A non-current base ancestry also proposes full and is recorded.
- CI433-DOCS: only modified existing files in the closed allowlist
  `docs/usage-ja.md`, `docs/prompt-recipes-ja.md` may propose the docs profile.
  Other documentation, generated docs, contracts and fixtures propose full.
- CI433-OS: inspect actual test bodies before changing Mac ownership. Preserve
  startup, process exit/timeout, path, permission/sandbox and historical source
  boundaries. An unproven OS-independence claim never removes a Mac check.
- CI433-REGISTRATION: after #435/#436 source integration, run both new focused
  commands unconditionally in the existing full common job. Missing files fail;
  no existence-based skip is permitted.

Formal Verification Contract `FVC-CI433-2`, revision 2; upstream
`SPEC-CI433-2@2`. Formal path is selected for regression proof, infrastructure,
multiple actors and a stable merge claim under `ask.verification-proof-policy@1.0.0`.
Obligations: category/deletion/rename/multi-scope/base-delta and malformed-diff
regressions; local real-Git comparison; no-selection wiring/strict aggregate
preservation; OS coverage inventory and hosted exact-HEAD full checks;
both integrated focused suites; independent source/docs/automated/final merge review. Failed or missing evidence
blocks the relevant claim. Unknown old local sessions are not rerun.

Implementation Contract `IMPL-CI433-2`, revision 3; upstream
`SPEC-CI433-2@2`, `FVC-CI433-2@2`. Boundary: classifier, its tests, bounded CI
recording, OS test ownership and this documentation. No runtime product,
generated bundle, classifier-based skip, real-model execution, cancellation,
protection or permission change. Explicit user approval covers this scoped CI
implementation, one PR and ordinary merge after successful checks/review.

The repository implementation-context is a template. Current nearby workflows,
test bodies and the stage-1 inventory provide implementation context instead.
No dependency installation is needed. Shadow records are observations, not
verification reuse, scoring, release admission or proof of no missed regression.

Selection activation remains outside this change. Review proposed exclusions
against completed full-run checks and known historical regression cases, retaining
the exact source/runtime and sample period. A missing comparison is Unknown;
one green run cannot establish recall, median/p95 or a speed/cost improvement.

## Historical Mac ownership audit — PR #437

Read-only independent audit and direct test-body inspection distinguish actual
OS operations from injected transports. Three files move to Ubuntu ownership:

| File | Evidence of common logic | Ubuntu owner with identical Node/flags |
| --- | --- | --- |
| `test-kernel-principles.mjs` | Lines 1–51: AGENTS text, pure render, generation identity and closed conditions; no process/link/mode/timeout boundary | Local eval Ubuntu, `node --test` |
| `test-ask-primary-build-successor-v2.mjs` | Lines 34–80: mock validator, digest/JSON publication and byte restoration; no permission or process boundary | Validate/common, module-mocks `--test` |
| `test-ask-personal-evolution-unattended-policy.mjs` | Line 19 prohibits real reviewer; lines 57–65 inject dispatch; 68–114 check authorization/budget/deadline selection | Validate/personal-cli, module-mocks `--test` |

The following current-HEAD groups remain on Mac, even where portions are common:

| Retained group | Boundary / reason |
| --- | --- |
| authority-v2 / unsafe-actions-v8 / review-archive-v2-scope | Actual Git clone/checkout; chmod fixture metadata; fresh Node and output-parent symlink rejection (archive lines 45–48,82–93). Unsafe-action grading is artificial, not an actual unsafe action. |
| primary-loop / CLI legacy,catalog24,catalog24-v8 / unattended | Artificial population tests also use real Git/filesystem and fresh Node saved-readout (roundtrip helper line 236 onward). Version-specific population equivalence has not been established. |
| codex-generation / source-reviewer | generation lines 185–199 reject real symlink/hardlink/output-root changes; reviewer lines 164–185 launch an artificial mode0700 executable through the CLI. Their injected timeout events alone do not prove OS kill. |
| local-eval / local-codex | Host preflight and empty-PATH fresh reopen; actual mode/link checks, Node bootstrap and zsh prefix. Closed sandbox argument checks prove shape, not real sandbox enforcement. |
| local-codex-time-budget / synthetic-json-pilot | Actual owned Node child/grandchild exit, SIGKILL, residual-child cleanup, pipe drain and umask0600. Preserve whole files. |
| user-comparison-prepare / comparison / logs / unattended | Platform/Node binding, portable paths, Git/link metadata, real independent Node verifier/reporter, owned-child timeout and identity-scoped cleanup. Logs include common UTF-8/redaction logic but remain unsplit. |
| codex-output-observer / single-shot | Observer uses actual child exit/stdin/stream/kill boundaries. Single-shot mocks all I/O and clocks, but remains conservatively included. |
| historical-full-test-root and every historical working-directory suite | Source-isolation/manifest-drift boundaries and a different immutable closure; no ownership reduction or invocation change. |

Mac omission is file-based, with explicit Ubuntu owners and preservation tests;
no test-name regex can silently match zero cases. Stage-1's eleven Ubuntu
duplications remain removed; this delta removes three Mac file invocations only.
The reduction is structural; its runtime effect has not been measured.

## Historical shadow operations — PR #437

Every pull_request and manual workflow continues the full job graph. The common
job records JSON after its focused classifier tests; logs and the step summary
persist it without a new job, workflow, output variable or dependency. Manual
execution, missing event/SHA/object, diff errors/limits, empty diff and invalid
UTF-8 propose full. Git reads the exact event base/head, records their unique
merge-base and uses NUL-delimited rename-aware diff. A base advanced beyond that
merge-base is explicitly `base_delta` and proposes full. No network request or
checkout mutation is performed by the classifier.

Only modified existing allowlisted prose proposes the docs profile (clone and
common); it still executes all jobs. Skill/core categories currently propose
full until dependency coverage is proven. Shared, unknown, dependency, CI,
deletion, rename, type change and multi-scope changes always propose full.
The fixed `validate` aggregate and its four dependencies are unchanged; each
failure, skipped, cancelled or missing result still fails. Context-rollover and
verification-completion retain their separate runtime identities and full runs.

Regression replay includes #434's observed workflow/Node guard failure paths,
process-budget/security paths, schema and Skill changes; all propose every
full-run owner. This checks proposal preservation against known regression
locations, not retrospective proof that a selector detects arbitrary failures.
Future shadow/full comparisons must examine completed exact-HEAD outcomes and
review exclusions; this PR does not enable selection, automatic real evaluation,
periodic real runs, or concurrency cancellation.

## Historical integrated source registration

Revision-2 delta (approved source-owner and coordinator handoffs, 2026-10-22):
#435 merged as `985b4accdfd977b83a5c35c721047e57c68db7f5`; #436 merged as
`318ad1fc06ff11973738badd2f014d29d9ce0716`. A single ordinary main merge brings
both into this CI branch without rebase. Their eighteen source/document/generated
files are inherited unchanged from main; this PR does not regenerate them.
Two unconditional commands are added together to Validate/common:

```sh
node --test scripts/test-ask-personal-evolution-trace.mjs
node --test scripts/test-codex-metrics-collector.mjs
```

Trace reads public artificial fixtures. Metrics exercises a temporary installed
runner with an explicit artificial executable, never a real Codex CLI/provider;
it neither opts the repository into collection nor repairs an external store.
Both exact files exist in the composed tree. No missing-file skip is added.
The previous `4c680085` head's nine hosted successes and mixed/full shadow record
are historical; the composed registration head requires its own full checks and
independent final review. No new-head success is inferred from a source PR's CI.

Implementation revision-3 delta: #427 was subsequently integrated as main
`0b94087bcd99a070a2c61b744df6658aff40e433`. A merge-tree check found
one concrete content conflict in the inventory introduction: #427's 134-command
description overlapped this PR's historical-snapshot clarification. Both are
retained. The workflow combines automatically; the 134-command main inventory
is inherited unchanged, plus five explicit CI additions (including both focused
commands), giving 139 inventoried Node script invocations. This conflict requires one
ordinary main merge and a new tested HEAD; it is not a cosmetic rebase. The
already-running `27d0f381` CI is retained without cancellation or manual rerun,
and its results remain historical rather than new-head evidence.


Prospective performance lifetime follow-up after main `61e32104`: one additional
command runs the execution and lifetime test files in Validate/common on Ubuntu
24.04 and in an explicit Mac-only local-eval step on macOS 15 (Node 24.19.0).
Ordinary owned Node process/group termination and file identity checks justify
both OS owners. The preceding 139 Validate invocations are retained, making 140;
local-eval has 25 invocations (preceding 24 plus the new Mac owner). The strict coverage guard admits only this exact new command in
each owner; the historical snapshot, shadow-only behavior and aggregate remain.
Artificial controls do not qualify a native sandbox or enable its closed gate.

## Historical local stage: docs-checks and strict shadow control

Spec `SPEC-CI433-3@1`, upstream Issue #433 and `DESIGN-CI433-SELECT-1@1`:
CI433-PLAN binds a closed shadow/full execution plan to exact Git identity,
policy and derived workflow inventory. CI433-DOCS moves existing consistency,
whitespace and CI controls into an always-required docs-checks job without
removing any of the 140 inventoried invocations, flags, cwd or source fetches.
CI433-GATE requires every full-run worker, rejects invalid plans and skipped,
cancelled, failed or missing execution, and checks actual required-step outcomes.
CI433-NOSELECT forbids activating selection: candidate docs jobs are observations
only. The other three workflows were unchanged. At this local stage,
publication awaited coordinator integration ordering; the verified #440 result
above supersedes that pending publication state.

Formal Verification Contract `FVC-CI433-3@1`, upstream `SPEC-CI433-3@1`:
formal path under ask.verification-proof-policy@1.0.0 for infrastructure,
regression and multi-actor handoff. Required local proof: exact command multiset
and run-block/cwd/fetch preservation, strict plan/identity/schema cases, each
worker's failure/skip/cancel/missing and false completion, hypothetical planned
skip versus missing, default full on observation failure, validator and YAML
checks, independent source/docs review. At this stage hosted job/output binding
was unverified. The later #440 result above established full-run transport; local
tests alone did not establish merge readiness.

Implementation Contract `IMPL-CI433-3@1`, upstream `SPEC-CI433-3@1`,
`FVC-CI433-3@1`: local CI-only module/tests/workflow/docs, in separate worktree
from main8d6fac7b. No product runtime, generated assets, external permissions,
real models, cancellation or existing unknown sessions are changed.

### Audited consumers and execution ownership

At main `8d6fac7b`, both allowlisted documents are manifest entries. The complete
`node scripts/validate-repo.mjs` is retained in docs-checks: its recipe section
checks (lines897–929), adapter adoption guidance checks (4719–4737), manifest
path/report checks (1595–1620,4100–4131), recursive Markdown stale phrase/count
scan (3982–4062), and Claude Action reference restriction (4703–4711) consume
their bytes or inventory. Link checking alone cannot replace these checks.
The outcome fixture suite reads its own cases, not the recipe's bytes.

Projection inspection found explicit Skill SKILL.md/reference inventories
(`skill-assets.mjs:8–44`), immutable installer assets, and bounded canonical
renderer inputs; listing a document in manifest.docs does not copy every listed
document into the product. Sealed product inventories and the runtime bundle
contain neither target path. This combines inspected mechanisms with inventory
membership checks; a search miss alone is insufficient evidence. No mutation
probe or generator run proves an unchanged digest. Complete consumer closure,
computed reads, external consumers and human instruction correctness remain
unknown. All existing suites still run, and independent document review remains
necessary before any future selection enablement.

### Plan, receipts and limits

The plan job and all five workers run independently on Ubuntu24.04/Node24.19.0.
Docs-checks owns existing CI controls, whitespace, autonomous control tests and
the complete consistency validator, including its original failure diagnostic.
Common retains every remaining regression. The other three workflow files are
unchanged. A derived registry hashes each required step's full run block and cwd,
including flags and fixed Git fetches. A historical step-hash fixture records
the final #439 head `ce89336b` preservation evidence described below. Initial
local work used base `8d6fac7b`; neither baseline is a second execution catalog.

Each worker records the exact required step IDs/descriptors only after GitHub
reports both outcome and conclusion as success. The final fixed validate gate
recomputes the plan and receipt contract from its checkout and binds checkout
commit/tree/parents, run ID/attempt, runtime, policy and registry. Missing,
malformed, extra, stale, skipped, cancelled and failed dependencies fail closed.
A valid final marker or step count alone cannot establish completion. This is
not a hostile-code attestation: repository contributors can change workflow and
control code together; normal source review and branch protection remain needed.
This local-only stage did not establish hosted transport. The #440 full-run
transport proof above does not establish selective execution.

A docs proposal requires exact event base/head, a single merge base equal to
base, checkout merge parents matching base/head, two-sided ordinary100644 blobs,
and the candidate head blob present in checkout. Only modified usage/recipe
allowlist files qualify. Skill, core, CI/control, unknown, deletion, rename,
base drift, missing event, unavailable Git or unverified file types propose full.
An unavailable checkout identity prevents producing a valid plan; workers are
independent of the plan so their full verification is not suppressed.
The hypothetical gate accepts explicit skipped entries only for the proposed
non-selected jobs, while rejecting missing/cancelled entries. It is a fixture-only
export with no CLI activation path. The actual gate always requires every worker.

Future enablement requires consumer closure or explicit conservative ownership,
all negative fixture cases passing, no unexplained excluded-suite failure, an
actual eligible exact-HEAD full run under the same policy and job partition,
reviewed shadow/full comparison, rollback design and independent review. The
three earlier #437 observations were revisions of one mixed/full PR; none is an
eligible docs-positive observation. One future positive observation can prove
wiring, not a statistical miss rate. Skill/core and other workflows remain full;
the local stage established no wall-clock or cost improvement measurement.
The later #440 single-batch absolute values above do not establish improvement.

Required execution syntax is deliberately restricted: unsupported global/job
shell/environment defaults, folded/implicit run syntax, conditional required
steps and unregistered actions are rejected. Checkout/setup-node descriptors are
also included in the registry digest. Candidate documents must be actual regular
files whose disk hash equals the candidate head blob, and tracked checkout
changes force a full proposal and prevent a completion receipt. This detects
ordinary tracked drift, not malicious index flags, hidden ignored/untracked
inputs, or a process that changes and restores bytes between observations.
The isolated CLI fixture commits its own artificial inputs before recording
receipts; the original unfinished worktree was not called clean evidence.


### Local composition with lifecycle PR #439

Composition delta for `SPEC-CI433-3@1` / `FVC-CI433-3@1` / `IMPL-CI433-3@1`:
PR #439 head `ce89336b236c6a8f4d5e144197fabc008cd3b4bb`, based on main
`61e32104b9dd14611502fdb03377c63c34d9cbc9`, is the inherited source boundary.
Its lifecycle command stays exactly once in Validate/common and exactly once
in the Mac-only local-eval owner, with both test files and flags intact.
The 140 inherited Validate invocations plus eight new shadow control invocations
give 148; local-eval retains all 25. The historical 134-command snapshot is
unchanged. The full-run step preservation fixture now records all 107 inherited
run blocks from this exact #439 head, including its failure-only diagnostic.
Other three workflows and lifecycle source/generated files were unchanged
relative to #439. This was a local composition, not #439 CI evidence or a
publication. After lifecycle integration, only its seven-file delta was carried
onto main `e68432bb` and published as #440; the verified result is recorded above.

## Bound comparison record (observation only)

The existing successful `validate` gate now writes a shadow/full comparison to
its GitHub step summary. It reuses the strict full gate: all five actual workers,
exact current descriptors, receipts, policy, registry, run/attempt and checkout
identity must verify before a record can be written. Failed, skipped, cancelled,
missing or stale evidence is rejected. The CLI stdout plan remains unchanged.
`docs-shadow-full-pass` identifies a docs-v1 proposal whose actual full workers
passed within `scope=validate-workers`; it does not attest the separate local-eval,
context-rollover or verification-completion workflows. `full-only` identifies the conservative full fallback and has no proposed
omissions. This is evidence for that run only, not proof of arbitrary consumer
closure, historical regression detection or sufficient observation samples.
Both `selection_enabled` and `selection_ready` remain false. No workflow/job or
skip condition changes. A mixed CI-code PR cannot supply the still-missing actual
eligible-docs observation. No time or runner-minute saving is claimed here.
