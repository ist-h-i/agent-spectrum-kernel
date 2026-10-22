# CI optimization: first safe slice of Issue #433

Upstream: [#433](https://github.com/ist-h-i/agent-spectrum-kernel/issues/433),
[#379](https://github.com/ist-h-i/agent-spectrum-kernel/issues/379).
Scope: full-run Ubuntu deduplication and independent suite parallelization.
[Suite/dependency/OS inventory](ci-suite-inventory.md).

## Spec and verification contract

`SPEC-CI433-1@1`: preserve original validate commands/flags and Mac test coverage;
remove only equivalent current-HEAD Ubuntu invocations after pinning both Node
24.19.0 and Ubuntu 24.04. Split two self-contained fixture suites into independent
checkouts. Fixed validate accepts only success from all four predecessors,
including on skipped/cancelled/missing/failed predecessors. No change selection
is enabled and no partial diff can reduce test coverage.

`FVC-CI433-1@1`: formal verification is selected for regression, performance and
stable merge evidence. Obligations: command coverage regression; aggregate success
and each dependency's failure/skip/cancel/absence plus extra/malformed results;
YAML parse; repository validator; both moved suites locally; independent diff
review; exact-head hosted PR checks before ordinary merge. Stable change refs
CI433-RUNTIME, CI433-DEDUP, CI433-PARALLEL and CI433-GATE map to runtime pins,
Mac-only duplicate steps, independent jobs and fixed aggregate respectively.
All four require focused regression and exact-head CI; the parallel change also
requires moved-suite local evidence. Rollback is an ordinary revert of this PR.

`IMPL-CI433-1@1` references that Spec and Verification Contract. Actual boundary:
two workflows, focused test and original-command fixture, inventory and this note.
No runtime product code, model workflow, protection, auth or billing change.

## Observed baseline

Period: 2026-10-21 20:55:36–23:18:55 UTC; one PR head,
8d9844c292b0bfdc903fc8348c5c81b2f0f7ca47 (Issue #433's checkpoint).
Latest main inspected before implementation:
a6d71c6c81973f585fe1aa27e4524a5a62889846.
Durations use latest-attempt job completed_at minus started_at; queue is job
started_at minus workflow created_at, from GitHub Actions REST runs/jobs.
Rounded billing and OS multipliers are not measured.

| Job | Run ID | Duration | Queue |
| --- | --- | ---: | ---: |
| validate | 39674507030 | 143m15s | 3s |
| independent-local-clone | 39674507030 | 7s | 3s |
| fake Ubuntu | 39674506971 | 40m52s | 3s |
| fake Mac | 39674506971 | 86m27s | 8s |
| context-rollover | 39674507024 | 1m49s | 3s |
| verification-completion | 39674507001 | 3m13s | 3s |

Total unweighted runner duration: 275m43s (16543 seconds). Workflow completion
envelope: 143m19s including queue/finalization. With n=1 the empirical median
and nearest-rank p95 equal the single observation; population median/p95,
change-type strata, variability, retries and failure rates remain insufficient
evidence. All six observed jobs succeeded; this is not a complete retry audit.
Docs-only/core targets remain unproven.

Three wholly duplicated Ubuntu steps took 5m22s + 17m58s + 1s = 23m21s.
Synthetic JSON took 1m04s in validate, but its isolated local-eval Ubuntu cost is
unknown because it shared a Node invocation. Moved repository-tests took 27m44s;
personal-cli took 28m40s. Subtracting them from the serial job gives an 86m51s
common-path estimate before new setup/gate/queue overhead and variability.
This is a projection, not measured post-change improvement. Mac is preserved and
may become the limiter. Extra jobs add setup overhead; latency and total runner
duration must be compared separately after exact-head CI.

Actual baseline logs subsequently established that old validate used Ubuntu
26.04 image 20261012.163.1 and Node 24.21.0. Its historical duration and arithmetic
projection cannot be used as a same-condition speedup comparison against the
pinned Ubuntu 24.04 / Node 24.19.0 workflow. Old local-eval Ubuntu used image
20261012.334.1 and Node 24.19.0; a descriptive comparison of that narrower job
requires checking the current image, source and suite scope as well. The baseline
8d9844c and starting main a6d71c6 have no file differences.

Initial eae70ba6 local-eval Ubuntu completed successfully in 18m38s. Logs confirm
Node 24.19.0 and Ubuntu 24.04, but image version 20261018.339.1 differs from the
baseline 20261012.334.1. These absolute observations do not isolate this PR's
latency effect; no causal percentage or steady-state saving is claimed. The
verified structural reduction is eleven duplicate file invocations.

## Verification status and interruption

Verified before connection loss: focused regression 3/3, Ruby YAML parsing of both
workflows, repository validator exit 0, independent source review without unresolved
findings and whitespace check. The focused check covers each dependency's
skip/cancel/failure/missing rejection. These are source checks, not hosted runtime
or performance claims.

The two moved local suites were launched once. After reconnection their logs
had no terminal test result; original execution sessions returned Unknown process
id. Completion remains Unknown. They have not been stopped or rerun. Hosted CI
and merge readiness are not established by this note. Independent automated gate
remains insufficient evidence pending local results and exact-head hosted checks.
Later verified evidence belongs in the PR record.

Approved proof delta: equivalent-or-stronger hosted proof at the final PR HEAD
may discharge the moved-suite obligation. Local Unknown is not converted into
success and is not a permanent merge prerequisite. The mapping is:

| Unknown local invocation | Hosted proof | Limit |
| --- | --- | --- |
| Node 24.19.0 repository fixture suite | repository-tests: identical command/Node and independent full-history Ubuntu checkout | Intended Ubuntu CI relocation; Darwin-specific synthetic fake-package tuple is not newly proven |
| Node 24.19.0 seven-file CLI command with module-mocks flags | personal-cli: identical seven files/flags/Node; Mac fake retains five-file overlap | Recovery/rejection add fake state/identity checks without Darwin-specific branches; no new Mac-runtime or real-model claim |

Initial hosted run at eae70ba6: repository-tests passed; common failed at the
autonomous-development workflow guard because it expected floating Node "24".
The guard now checks the explicit 24.19.0 pin, preserving the check. This cheap
guard is moved before long suites so future workflow-shape drift fails early.
All original common commands remain present once. Initial failed/unfinished
results remain historical evidence; they are not treated as final-HEAD success.

## Operation and remaining work

PR triggers remain unconditional full-coverage runs. Manual full runs use
workflow_dispatch on both changed workflows. Local-eval alone no longer supplies
those Ubuntu checks: run Validate repository as well. Existing Mac/Ubuntu local
eval checks remain required alongside fixed validate; protection is unchanged.
Failed jobs stay failed; diagnose before a necessary targeted rerun. Do not cancel
existing runs or introduce automatic reruns.

Later #433 work must characterize Mac-specific boundaries before narrowing its
suites; resolve remaining runtime parity; add shadow classification without
skipping tests; cover docs/Skill/core/unknown/shared/deps/CI, deletions, renames,
mixed scopes and comparison-base failures. Incomplete/unavailable diffs must
retain full-run. Selection stays disabled until shadow/full and past-regression
comparisons establish retained detection. Change-independent scheduled full-run
and PR-only obsolete-run concurrency remain future work. CI optimization does
not become an extra gate for personal V1 real evaluation.

Fake/synthetic tests establish infrastructure behavior only. No real model,
Codex CLI diagnostic, DB repair, auth/permission change or session 22878 action
is introduced.
