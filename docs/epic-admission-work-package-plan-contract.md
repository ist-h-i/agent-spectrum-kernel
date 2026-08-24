# Epic Admission and Work Package Plan Contract

This contract defines the repository-mutation admission decision and the bounded multi-package control plane introduced by Issue #275 Slice 1. It supplements the lifecycle artifact and traceability contracts. It is not a workflow engine, an implementation approval, a review result, or a merge decision.

## Admission boundary

Before repository mutation, `ask_epic_admission` evaluates current task evidence against a versioned policy and emits one decision:

- `ordinary_execution_allowed`: an epic plan is not mandatory;
- `work_package_plan_required`: repository mutation waits for an accepted, valid current plan;
- `human_decision_required`: contradictory, unresolved, unknown, or authority-insufficient input needs a human decision.

`ordinary_execution_allowed` never waives verification, review, risk gates, approvals, or repository rules. `work_package_plan_required` is a planning precondition, not implementation approval. A `human_decision_required` result maps to the existing Execution Envelope `human_decision` stop state; admission outcomes do not add competing Envelope states.

The policy and decision Schemas are:

- `schemas/epic-admission-policy.schema.json`;
- `schemas/epic-admission-decision.schema.json`.

### Evidence-backed signals

The decision consumes closed signals for configured-epic membership, acceptance-condition count and registry identity, scope-boundary count, ordered dependencies, independent publication units, and scope resolution. Every signal carries an evidence status and a non-whitespace source reference. The current policy accepts only `verified` or `supported` authority signals.

`acceptance_registry_digest` is derived by `deriveAcceptanceRegistryDigest`. The input is the complete array of exact `{ artifact_id, item_id, observed_revision }` records, ASCII-sorted by the tuple `artifact_id`, `observed_revision`, then `item_id`. SHA-256 covers sorted-key canonical JSON of `{ "digest_domain": "ask_epic_admission_acceptance_registry_v1", "acceptance_refs": [...] }`. The count signal alone is not registry authority: same-count identity substitution changes this digest and fails closed.

`independent_publication_units` is an admission trigger that says independently publishable boundaries were observed and planning is required. It is not a direct instruction to create multiple PRs: the Slice 1 topology deliberately integrates all accepted packages into one reconstructable publication unit.

AI-estimated complexity is recorded separately and cannot decide admission. It is never a sole blocking authority, file-count oracle, or opaque complexity score. Configured-epic membership is recomputed from the current policy and must agree with the observed signal.

### Policy and override

The stored decision separates `computed_decision` from `effective_decision`. An override is valid only when the current policy contains the exact transition and an explicit approved authority grant for the exact decision subject and admission basis. The grant binds a stable grant ID, authority kind/reference, immutable evidence reference/digest, repository/goal/task/base/tree/branch subject, observed signals, computed decision, and requested decision. Authority and evidence references must contain at least one non-whitespace character. Its `admission_basis_digest` uses the domain `ask_epic_admission_override_basis_v1`; replay after any bound basis changes fails closed. The canonical repository policy contains no standing grant. The positive override fixture creates a test-only grant for one exact basis. The request must name that grant and give a non-empty reason. A list of recognizable authority identities is not approval. `not_requested` cannot hide populated request or grant fields. Overrides cannot resolve human-owned decisions or weaken required verification, review, risk, CI, or merge gates. Rejected attempts remain visible and result in `human_decision_required`.

A human override is therefore not silent policy weakening.

## Deterministic identity

Policy, decision, validation-context, and plan artifacts use stable logical IDs, positive revisions, and SHA-256 content digests:

- logical IDs are derived from stable subject keys and do not embed a revision or digest;
- policy and decision revisions advance independently when their meaning changes; paired plan/context revisions advance together because each plan digest binds its exact context;
- digests cover sorted-key canonical JSON, including the stable ID and excluding only the artifact's own digest field;
- set-like arrays are normalized before sealing;
- duplicate JSON keys are rejected before Schema or semantic validation.

Work Package Plan Schema `1.2.0` also derives a non-circular plan content digest that excludes only the plan digest and the validation-context digest value. The external context binds that content digest. Re-sealing changed plan meaning under the same logical ID and revision therefore does not establish currentness.

The implementation reuses `stableCanonicalJson`, `canonicalDigest`, and strict JSON parsing from `scripts/content-addressed-store.mjs`. It does not use or change the CAS object layout, publication algorithm, authority, or storage lifecycle.

## Current authority context

Digest integrity does not prove that an artifact is current. `schemas/work-package-plan-validation-context.schema.json` defines caller-supplied current authority containing:

- exact repository, base commit, base tree, and branch;
- current policy and admission-decision references;
- current plan ID, revision, and lifecycle state;
- the exact current plan content digest and explicit predecessor lineage when revised;
- current upstream artifact revisions and acceptance item IDs;
- required full checkpoints and non-overridable gate IDs, procedures, and purposes;
- current blockers, human decisions, and human approvals.

The plan references the exact context ID, revision, and digest. Validation always receives the context separately and checks it against the policy, admission decision, repository target, exact plan content, and plan predecessor. A plan's own `current` boolean would be self-asserted and is deliberately absent.

This external binding is what permits deterministic rejection of stale revisions, hidden blockers, hidden decisions, cross-plan package transplants, and cross-repository package transplants even when a modified artifact is re-sealed.

The context owns each required human approval's status, exact authority reference, and immutable approval-evidence reference/digest. A plan may only mirror that complete record; it cannot promote `required` to `approved`, copy a known identity, or introduce an approval absent from the context. The caller-supplied context is the explicit trust root; this local validator verifies its integrity and its bindings but does not authenticate GitHub or a hosted authority source. Replacing and re-sealing the entire context or policy is an authority change that must be established by repository review or another trusted caller, not something plan validation can prove from self-contained bytes.

## Work Package Plan

`schemas/work-package-plan.schema.json` defines a closed aggregate of lifecycle Work Package-owned fields. The aggregate is not a new lifecycle stage. Each package keeps:

- stable package and Work Package artifact IDs;
- structured upstream refs;
- ordered tasks;
- allowed and forbidden scope;
- expected artifacts and evidence;
- stop conditions;
- target and plan bindings.

Each plan entry carries lifecycle `dependencies` for external or free-form prerequisites. The separate plan-specific `depends_on_package_ids` field is the typed DAG edge and does not reinterpret those lifecycle dependencies. `projectWorkPackagePlanEntryToLifecycleArtifact` deterministically projects the Work Package-owned revision, structured upstream refs with observed revisions, scope, ordered tasks, dependencies, stop conditions, and evidence expectations into the canonical lifecycle shape. The lifecycle fixture and repository validator check that projection surface; `validateWorkPackageLifecycleProjection` rejects drift from the accepted plan entry.

### Acceptance ownership

The current authority context supplies the complete current acceptance-item registry. A plan has exactly one ownership record for every current acceptance ref.

- `exclusive` requires exactly one owner and no shared reason;
- `shared` requires at least two unique owners and an explicit reason;
- unknown owners, duplicate ownership records, stale refs, and uncovered current refs fail closed.

The plan references acceptance meaning; it does not become a second source of acceptance prose.

### Typed scope

Scope entries are closed records with `kind`, `value`, and `match`. Slice 1 supports only `repository_path`, with `exact` and normalized repository-relative `subtree` matching. Path overlap uses exact equality or path-segment ancestry, and an allowed/forbidden overlap is invalid. Capability, Issue, and GitHub-operation scopes are deferred because Slice 1 has no complete semantic consumer for them; exposing those kinds would allow a forbidden logical action to be ignored.

### DAG, stack, publication, and review

Slice 1 supports the deliberately narrow topology used by the Goal:

- one goal;
- one branch;
- stacked Work Packages;
- an explicit topological integration order;
- one reconstructable pull-request publication unit;
- one planned independent exact-head review unit.

Every dependency target must exist, the graph must be acyclic, dependencies must precede consumers, each stacked package must depend on its immediate predecessor, and each package stack base must be the repository base or the immediately preceding package. An observed pre-plan `ordered_dependency: true` must be represented by at least one DAG edge; `false` does not prohibit ordering introduced by the accepted plan. Likewise, `independent_publication_units: true` requires planning but may be consolidated into the contract's single reconstructable publication unit; it does not silently request multiple branches or PRs. The publication unit must contain the exact integrated package sequence and exact planned artifact set. Its review unit must reference the same packages and artifacts. A planned review unit never claims that review occurred or that the candidate is approved.

Every expected artifact path must be normalized, contained by that package's repository-path allowed scope, and outside its forbidden scope. Package IDs, lifecycle Work Package artifact IDs, ordered-task IDs, stop-condition codes, expected artifact IDs, expected artifact paths, blockers, decisions, and approvals are checked for the uniqueness required by their reference boundary. Callers can pass observed publication paths to `validateObservedWorkPackageArtifacts`; missing planned paths and unplanned changed paths fail closed.

This is a closed initial contract, not a generic branching or workflow language.

### Verification cadence

Each package has a focused verification boundary. The trusted context names every required full checkpoint and binds each non-overridable full gate's exact procedure and purpose. Both fields must contain at least one non-whitespace character; matching whitespace-only context and plan values do not define an executable gate. An accepted plan fails validation when a package lacks focused verification, a required checkpoint is absent, a full checkpoint does not bind the complete integration sequence, or a non-overridable gate is absent or redefined.

Expected evidence is a proof obligation only. Executed results, producer authority, reuse coverage, and transferred evidence remain governed by `docs/verification-evidence-contract.md`.

### Executability and fail-closed behavior

An `accepted` plan is invalid while it or the trusted context contains an unresolved or unknown human decision, a non-approved human approval, an open or unknown blocker, or an admission decision that still requires a human. Approval status and immutable evidence must exactly mirror the context. Before computing an admission outcome, `evaluateEpicAdmission` applies the closed decision input Schema plus non-whitespace authority-reference checks to caller-supplied subject, signals, revision, and override request. Invalid input throws `EPIC_ADMISSION_INPUT_INVALID` with sorted `{ code, path, message }` issues; it cannot produce an allowed decision that a caller might consume before validation. Plan validation preflights the required admission decision and predecessor artifact shapes before using their subject, reference, or lineage fields. A predecessor's own revision controls its lineage shape: revision 1 forbids `supersedes_*` and `revision_reason`, while revision 2 and later require them, so the first valid revision 1 to revision 2 transition remains executable and a self-consistent but Schema-invalid revision 1 predecessor fails closed. Current Schema 1.2 predecessors must satisfy the complete current Schema; the immutable 1.0/1.1 audit predecessors are accepted only through their known legacy version and revision-aware shape before exact byte, digest, binding, and lineage checks. Repository validation applies the same boundary to checked-in decision and historical artifacts. Missing/unknown fields, valid-JSON malformed dependencies, malformed or partial artifacts, identity/digest mismatch, stale context, and semantic contradictions return fixed-order typed issues instead of raw runtime exceptions.

The validator pipeline is:

1. bounded stable read with duplicate-key rejection;
2. closed Schema validation;
3. evaluator input preflight and current policy/decision/context binding;
4. pinned canonical digest, repository-byte hash, and r1-to-r2 lineage validation;
5. deterministic current ID, digest, exact-content, revision-lineage, and canonical-order validation;
6. policy recomputation and override checks;
7. package/DAG/integration validation;
8. current AC closure and ownership validation;
9. scope overlap validation;
10. stack, publication, and review reconstruction;
11. focused/full verification closure;
12. blocker, human-decision, approval, and lifecycle checks.

Issues use `{ code, path, message }` and sort by code, path, then message. Unknown input never becomes success.

## Dogfood plan

The bootstrap plan used before this validator existed is planning evidence only. It is not retroactively validated.

After the minimum Schema and validator existed, the remaining WP3-WP6 topology was materialized as:

- context: `docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json`;
- plan: `docs/fixtures/issue-275-slice-1-work-package-plan.json`.

The first accepted plan was `WPP-6f1ea8476454bf3f97969d36@1` with digest `sha256:11adfda1e0a27c5aee8460807ef26f77b65ebd13ed26835b9e1e3af7654bb65d`. Independent adversarial and test-gap review then found two material planning/authority gaps: r1 did not bind exact plan meaning, and its expected publication inventory named an unchanged traceability document while omitting the required immutable-plan test update.

The original r1 plan and context bytes are preserved at:

- `docs/fixtures/issue-275-slice-1-work-package-plan-r1.json`;
- `docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r1.json`.

They were not rewritten. The accepted r2 plan/context are likewise preserved at:

- `docs/fixtures/issue-275-slice-1-work-package-plan-r2.json`;
- `docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json`.

R2 is `WPP-6f1ea8476454bf3f97969d36@2` with digest `sha256:e97a2ef854ab5350d11ca00e305aaf44eb01939744500513bfee313ff94b8e3f`. A second review found material authority and lifecycle compatibility gaps: approval outcome was not context-owned, and the aggregate omitted a deterministic lifecycle Work Package projection. Those findings required an explicit successor rather than rewriting r2.

The current accepted artifact is `WPP-6f1ea8476454bf3f97969d36@3` with digest `sha256:15adac3986e07a1fe230df472180c31cabd7bc1aaee3001e52df15afd0643cdf`. It binds exact-basis approved authority grants, context-owned approval evidence, distinct lifecycle dependencies, revision-preserving projection fixtures, and the 34-path publication/review inventory. Historical r1 and r2 remain audit evidence under the earlier `1.0.0` and `1.1.0` contracts; the repository validator pins both their embedded and recomputed canonical digests, exact checked-in byte hashes, pair bindings, stable identities, and r1-to-r2 supersession references. Current repository mutation uses only the validated `1.2.0` r3 artifact.

## Non-equivalences and deferred scope

These boundaries are normative:

```text
epic admission != implementation approval
Work Package Plan validation != correctness proof
plan validation != independent review != merge readiness
ordinary_execution_allowed != permission to skip verification
human override != silent policy weakening
#275 plan state != #274 verification evidence
Slice 1 != context rollover
```

Slice 1 does not implement repository snapshots, checkpoint/resume, context rollover, runtime telemetry, matched efficiency evaluation, adapter portability evidence, or Product Evidence Run measurements. It makes no claim about token use, elapsed time, model calls, automatic rollover, production value, or ROI.
