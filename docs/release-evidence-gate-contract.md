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

Every required gate and every claim has its own result and reason codes. Open blockers remain explicit. `not_ready` exits the CLI successfully because the assessment completed. Invalid JSON, schema violations, or malformed evidence/reference contracts fail the CLI. Valid records with stale revisions or missing, unreadable, or digest-mismatched artifacts produce `not_ready` with reason codes.

Assessment IDs and reason codes use locale-independent code-unit ordering. Changing the host locale does not change canonical CLI output for identical inputs.

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

Only optional claims can be `excluded` without making unrelated optional features mandatory. A release-required claim that remains `experimental`, `unknown`, `falsified`, or `excluded` keeps the assessment `not_ready`. In particular, `release_required: true` with `disposition: "excluded"` produces `release_required_claim_excluded`; exclusion never removes a required claim.

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

### Complete evidence and review sets

Except for optional excluded claims, the assessment checks both the matrix's `evidence_refs` and primary catalog records whose `claim_ids` bind that claim. An unlisted primary record produces `claim_evidence_reference_missing`; its status, scope, revision, and artifact are still checked and its ID remains visible in the claim result. Review/approval records are not required to be duplicated in the matrix's primary-evidence list. An optional excluded claim does not acquire dependencies through these inverse references.

Every qualifying primary record used by a supported claim must have valid independent review. Reviewed primary evidence must identify a `producer` with a non-null SHA-256 identity; an unknown producer or a different authority role cannot establish independence. The reviewer identity must differ from that producer identity.

Assessment checks all independent reviews bound to the evidence and the assessed gate or claim. A `passed` review cannot hide a bound `failed`, `not_checked`, `not_applicable`, stale, wrong-scope, or corrupt review. Result evidence references include the assessed reviews, including adverse ones. v1 has no implicit supersession: a later passing review does not by itself invalidate an earlier adverse review. Reviews not bound to the assessed gate or claim are not used to decide that target.

A gate's `independent_review_required: false` waives only the need to supply a review. It does not waive validation of a supplied review bound to that gate and its evidence. Such reviews still need passing status, valid source/artifact/scope, and producer/reviewer separation, and remain visible in the gate result. No review is still acceptable for these gates; a supplied adverse or invalid review is not. Formal approval remains separate from primary producer evidence and cannot become a valid review subject by virtue of this optional policy.

Positive support and adverse evidence have different boundaries. Evidence below a claim's required strength cannot prove that claim, but its bound reviews are still assessed. Missing review of a non-qualifying auxiliary record does not create a new proof requirement; a supplied adverse or invalid review cannot be hidden by filtering that record out of positive support.

For supported outcome claims, every bound controlled-benchmark or adopting-project record must pass quality, safety, lower-tail, and variance guardrails, even when it cannot independently support a stronger adopting-project or ROI claim. Publication permission and measured human effort remain required for the qualifying evidence used to support the corresponding claim class; auxiliary controlled benchmarks are not promoted to adopting-project or ROI proof.

### Risk acceptance

An accepted-risk reference is not proof of acceptance by itself. Its review/approval record must have the required authority role and passing status, the assessed source revision, and a readable repository-bounded artifact with a matching digest. An independent-review acceptance also verifies the reviewed subjects' revisions, artifact integrity, scope, and producer/reviewer separation.

Acceptance with invalid source, artifact, scope, or independence produces `risk_acceptance_*` reason codes and `not_ready`; the affected risk is not emitted in `accepted_risks`. Other valid accepted risks remain visible. Accepting a risk does not waive required gates, required claims, or open blockers.

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

The focused suite also covers the PR #298 review regressions: required-claim exclusion, conflicting/incomplete review sets, unknown producer identity, inverse-only claim evidence, invalid risk acceptance, adverse lower-strength auxiliary evidence/reviews, supplied reviews on gates where review is optional, and byte-identical CLI output across English, Turkish, and Japanese locales. Positive controls preserve multiple valid reviews, reciprocal references, valid risk acceptance, and optional exclusion. CLI checks verify that successful and rejected invocations leave input bytes unchanged.

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
