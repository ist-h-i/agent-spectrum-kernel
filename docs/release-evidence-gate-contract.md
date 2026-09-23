# Release Evidence Gate Contract

- Contract family: `ask.release-claim-matrix@1.0.0`, `ask.release-evidence-catalog@1.0.0`, `ask.release-assessment@1.0.0`
- CLI: `scripts/release-evidence-gate.mjs`
- Scope: Issue #202 early slice — release claim/evidence representation and deterministic offline readiness assessment

## Purpose

This contract answers one bounded question: given an exact repository revision, which release claims are supportable by the supplied evidence, and which required release conditions still prevent v1.0 readiness?

It does not publish a release, create a tag, contact a provider, execute a benchmark, mutate a Portfolio, approve a release, or turn missing external state into a pass. A successful CLI invocation may return `not_ready`; that is a valid assessment result rather than a command failure.

The release gate consumes existing ASK truth, traceability, verification-evidence, Asset, Portfolio, Evolution, adapter, and review boundaries. It does not create another general workflow engine or evidence store.

## Three separate inputs and outputs

### Claim matrix

`schemas/release-claim-matrix.schema.json` records externally visible claim wording and its exact scope:

- stable claim ID and wording;
- capability, task class, adapter, and Profile scope;
- exact source revision;
- evidence references;
- limitations, invalid inference boundaries, and residual work;
- release disposition: `supported`, `experimental`, `unknown`, `falsified`, or `excluded`;
- whether the claim is required for this release.

The matrix records what the release intends to say. It does not prove the claim.

### Evidence catalog

`schemas/release-evidence-catalog.schema.json` keeps evidence domains separate:

- implementation existence;
- static verification;
- synthetic fixture;
- runtime execution;
- controlled benchmark;
- adopting-project evidence;
- independent review;
- formal release approval.

Every passed or failed evidence record must point to an exact repository-relative artifact and SHA-256 digest. Evidence also binds the repository source revision, claim/gate scope, and authority role. Outcome evidence carries quality, safety, lower-tail, variance, human-effort, and publication-permission fields so a favorable average cannot hide an insufficient or harmful subgroup.

### Assessment

`schemas/release-assessment.schema.json` is deterministic for the same claim matrix, evidence catalog, repository bytes, source revision, and built-in gate policy. It returns only:

- `ready`
- `not_ready`

Every required gate and every claim has its own result and reason codes. Open blockers remain explicit. `not_ready` exits the CLI successfully because the assessment completed; malformed input, unreadable artifacts, or contract violations fail the CLI.

## Fixed required release gates

The caller cannot remove required gates to manufacture a pass. v1.0 assessment always includes:

1. repository validation;
2. verification-evidence store/coverage;
3. epic admission / Work Package boundary;
4. Asset Registry;
5. Portfolio Manager;
6. governed candidate lifecycle;
7. guided setup / first run;
8. evaluation/report authority;
9. measured activation/bypass decisions;
10. clean install and upgrade;
11. supported adapter runtime evidence;
12. benchmark/report publication state;
13. documentation claim consistency;
14. rollback/migration notes;
15. semantic version/changelog state;
16. explicit human release approval.

Optional claims can be `excluded` without making unrelated optional features mandatory. A release-required claim that remains `experimental`, `unknown`, or `falsified` keeps the assessment `not_ready`.

## Evidence strength and inference boundaries

The gate rejects these shortcuts:

- a `supported` disposition with no qualifying evidence;
- synthetic evidence used as controlled-effect, adopting-project, production, client-value, or ROI evidence;
- runtime evidence transplanted from another source revision, adapter, Profile, or task-class scope;
- a digest string whose referenced file bytes do not match;
- contradictory or incomplete evidence for the same required gate or supported claim, including `passed` mixed with `not_checked`;
- semantic claims without an independent review record from an authority identity distinct from the evidence producer;
- controlled outcome claims whose quality, safety, lower-tail, or variance guardrail is not passing;
- adopting-project claims without publication permission;
- ROI claims without measured human effort;
- release readiness without explicit release-owner approval evidence.

Schema validity, artifact integrity, semantic support, independent review, and release approval are separate checks. Passing one does not imply the others.

## Current repository fixture

The checked fixture under `docs/fixtures/release-evidence-gate/` binds `main@756c72b3fba158fbbc33642128bf5ab87097914b`.

It intentionally returns `not_ready`. At that revision, release-required work remains open, including the final #274 coverage, #275, the real #278/#291 candidate lifecycle, #173 setup, #197 report authority, and #192/#198 measured activation/bypass decisions. Closed implementation foundations such as #276 and #277 are not promoted to release-supported claims until exact release-scoped evidence and review records are projected into this contract.

The fixture also references the real `schemas/claim-evidence-status.schema.json` bytes so the integration path exercises repository-file integrity rather than only in-memory synthetic data.

Run it offline with:

```bash
node scripts/release-evidence-gate.mjs assess \
  --matrix docs/fixtures/release-evidence-gate/current-main-756c72-claim-matrix.json \
  --evidence docs/fixtures/release-evidence-gate/current-main-756c72-evidence.json \
  --source-revision 756c72b3fba158fbbc33642128bf5ab87097914b \
  --root .
```

The expected decision is `not_ready`; the CLI emits a deterministic assessment for the same source and inputs.

## Synthetic all-pass example

`scripts/test-release-evidence-gate.mjs` builds an isolated synthetic repository and complete synthetic evidence graph to prove the validator's positive path. It then mutates one condition at a time to exercise missing gates, stale source, tampering, scope transplant, duplicate IDs, contradictory evidence, missing independent review, arbitrary `supported`, synthetic overclaiming, optional exclusion, lower-tail regression, and open blockers.

That all-pass fixture proves only that the gate can distinguish valid and invalid contract states. It must never be cited as evidence that the real ASK repository, a real adapter, or v1.0 is ready.

## Read-only boundary

Assessment reads local files only and writes its assessment to stdout. It performs no network request, provider/model call, GitHub mutation, tag/release creation, installation, configuration update, or repository write. The CLI intentionally has no file-output option so the assessment entry point remains read-only.

External current state is not inferred. If current CI, approval, publication permission, runtime execution, or benchmark evidence has not been captured in a compatible evidence record, the corresponding required gate remains `not_ready`.

## Validation

Focused contract verification:

```bash
node scripts/test-release-evidence-gate.mjs
node --check scripts/release-evidence-gate.mjs
node --check scripts/test-release-evidence-gate.mjs
```

Repository-level validation remains the higher-level integration check. This slice does not weaken Node, source-identity, generated-artifact, or existing validation guards to make the release gate pass.

## Remaining Issue #202 scope

This foundation is not v1.0 release completion. Issue #202 still owns the final product-facing documentation, quickstart consuming #173, runnable evaluator/demo path, real benchmark and decision material, compatibility/privacy/migration/rollback guide, final claim projection, semantic version/release notes, and explicit human go/no-go before any tag or GitHub Release.
