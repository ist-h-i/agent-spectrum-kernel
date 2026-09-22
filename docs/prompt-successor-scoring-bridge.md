# Successor calibration scoring connection

Scope: PR #290 / #289, before any separately authorized #235 measured run.
Status: implementation and synthetic tests authored; exact submitted-revision
execution evidence must be recorded separately. This document grants no approval.

## Decision: canonical identities before execution

Successor preparation revision 1.1.0 uses the four catalog identities as native
execution fixture identities. `source_fixture_id` identifies the old directory
and input-manifest entry, not an alternate result identity. The native plan,
request, normalized result, requirement, evaluator reference and engineering
result consequently use the same catalog identity. No result is renamed after
execution. Changing the config and preparation changes the plan/case namespace.

| Native/catalog identity | Frozen source directory and input entry |
|---|---|
| cal-session-refresh | pr-session-refresh-medium-hard |
| cal-export-lease | pr-export-lease-hard |
| cal-atomic-rule-batch | impl-rule-batch-medium-hard |
| cal-concurrent-transfer | impl-transfer-hard |

The shared mapping is closed to these four pairs, their original task classes and
3/3/3/5 repetitions. An alias is invalid outside `calibration` or with
`aggregate_eligible=true`. Ordinary configs without `source_fixture_id` retain
their original lookup behavior. The existing #197 planner's config digest binds
the mapping; the materializer verifies the same frozen input bytes. This is not
an assertion that a calibration input is valid primary product evidence.

Historical #234, its CAS, input manifest and physical source fixtures are not
modified. Previous successor 1.0 preparation/results are not relabeled as 1.1.
The old 1.0 source checkout and its evidence remain the way to inspect that run.
No legacy measured result is read by this implementation's tests.

## Pre-result public scoring inputs

`buildSuccessorScoringInputManifest` describes the execution config and all four
public scoring-input sets. Each set has eight exact file references: catalog,
policy manifest, scoring policy, admission record, requirement record, output
contract, evaluator public reference, and scoring-input freeze. References bind
portable repository-relative path, raw digest and byte count. The complete
manifest has one canonical semantic digest; preparation 1.1 includes it before
case identity generation. This is reference binding, not human authorization.

`openSuccessorScoringInputs` checks the actual loaded clean implementation, the
historical parent, frozen input manifest and unchanged common policy bytes. It
then invokes `verifyPortfolioScoringInputs`, a narrow exported wrapper over the
existing #197 `readScoringInputSources`. Its schema, freeze, requirement and
admission checks are unchanged; there is no second scoring implementation.
Missing or mismatched files fail without creating a capability. The returned
opaque handle remains bound to the full preparation identity. Per-case use
rereads its public references and prevents caller-supplied path overrides.

The existing #197 public-input API anchors these files to its repository root.
An externally stored real package must first have its public metadata supplied
through that supported boundary; this code does not pretend that an arbitrary
external directory is already supported. Private bundles remain outside every
repository and execution root and are only used by the separate verifier path.

An unscored preparation may retain `scoring_input_manifest_digest=null` for
transport/preparation checks. It cannot create a full provenance report. A
non-null digest does not make inputs admitted or authorize a model call. Pending
admission stays pending. Missing real evaluator packages are still a measured-run
blocker; no placeholder approval or oracle is created by the production API.

## Existing verifier/scorer connection

`verifySuccessorSourceProvenance` requires the opaque public-input handle and
checks its execution config before reading result sources. For every case it
uses the pinned public inputs, the real execution and normalization evidence,
the existing evaluator verifier, existing admission resolver and existing raw
engineering scorer. It records the public-input manifest identity in provenance.
The two-role report uses genuine provenance handles; plain objects or caller
assertions cannot confer that capability. All entrypoints remain synthetic-only
and non-activating. No new measured launcher, raw scorer or lifecycle is added.

## Synthetic integration and its limits

`test-ask-benchmark-prompt-successor-scoring.mjs` creates a separate **local clone**
of its exact clean source revision. It commits generated synthetic public input
metadata only in that clone because the real native implementation requires a
clean Git tree. The original worktree and branch are not changed. It does not
push. The generated test commit is explicitly separate from the source revision;
both are written to external verification evidence.

The test uses the existing compiled native fake, executes all 28 selected cases
in two native runs, and keeps the other native-plan cases pending. It passes the
real execution, normalizer, public-input, evaluator-envelope, admission and raw
score validators, then calls the full two-handle report API. Disposable private
bundle metadata is isolated outside the clone. It contains no real oracle.

Synthetic requirement/evaluator envelopes deliberately have **pending admission**
and unknown quality observations. A generated `completed` synthetic envelope is
not an actual evaluator-process result. The test uses the existing generic
legacy-profile verifier, not the private binary-scope evaluator execution path.
The expected report is `insufficient_evidence`, never synthetic adoption. This
proves contract integration only when executed successfully; it does not prove
real four-fixture scoring readiness, oracle validity, effective sandbox control,
provider availability, observed tokens, or actual model/Prompt efficacy.

The test also rejects unbound/forged input capabilities, wrong experiment/role
handles, caller path overrides and later public-input changes. It uses the same
preparation/runtime for both arms, separate native run IDs, and the exact frozen
source inputs. No real credentials or provider executable are used.

## Verification commands

In a clean commit of the candidate (Node 24; a C compiler for process tests):

```sh
node --test scripts/test-ask-benchmark-calibration-source.mjs
node --test scripts/test-ask-benchmark-prompt-successor-scoring-inputs.mjs
node --test scripts/test-ask-benchmark-prompt-successor-delivery.mjs
node --test scripts/test-ask-benchmark-prompt-successor-report.mjs
node --test scripts/test-ask-benchmark-prompt-successor.mjs
node --test scripts/test-ask-benchmark-prompt-successor-integration.mjs
node --test scripts/test-ask-benchmark-prompt-successor-scoring.mjs
node scripts/validate-repo.mjs
```

Before a merge decision also assess changed ordinary materialization/planning,
#197 public-input/scorer regressions, updated F3, historical #234 compatibility
and bundle freshness. An unchanged historical log is not a current-HEAD run.
Select reusable evidence by unchanged source/dependency content, not test name.
The new full-chain test supplements rather than substitutes those regressions.
Do not rerun a long suite merely to publish a checkpoint.

## Remaining real-run gates

The four real requirement/evaluator packages and their actual review/admission
references are not supplied by these tests. Complete that input work under #289,
then verify a scoring-ready path using those exact approved authorities. Keep
private evaluator execution, public-envelope reconstruction, approval and model
measurement as separate evidence claims. Required host controls, runtime-bound
Portfolio/Evolution selection, usage collection, explicit execution/result-access
permission and budget remain before #235. Independent review of the final source
and proof remains required. Neither this document nor the test changes a default
Portfolio, closes an Issue, makes the PR Ready, or grants merge permission.
