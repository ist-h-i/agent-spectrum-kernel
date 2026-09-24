# High-impact sensitivity: result-blind risk-boundary contract

## Decision and scope

Issue #197 owns the evaluation infrastructure, not the measured Product Evidence
owned by #198. Main `b13e75a996dfd6305d0e6ec11d6207aca66c8368` already contains
PR #295's native aggregate v2 and PR #301's reconstructable consumer report,
human-effort sensitivity and exact #276/#277/#278 bridge. Reproducing a complete
`practice_frequency / implementation_verification` group through their real
saved-file verifier chain still produces the historical
`no_high_impact_fixture_in_selected_group` insufficiency. The residual was the
population definition, not execution, raw scoring, native units or a missing
recommendation engine.

The new **companion** policy is
`issue-197-high-impact-risk-boundary-v1`, schema version `1.0.0`, in
`benchmarks/portfolio-high-impact-sensitivity-policy.json`. Its canonical digest is
`sha256:38c8bc08756dcafeb407a19495c42aaf405f85645535990727be7c6e450a4264`.
Both the closed schema and implementation pin the exact policy. It pins the
original public catalog and scoring policy; changing its membership, population,
reduction or conclusion semantics requires a different approved version, not
resealing these bytes or editing a historical result.

**High-impact membership in this version means a declared consequential risk
boundary, not membership in the historical `high_impact` suite and not a measured
severity threshold.** It includes every non-`none` boundary in the frozen catalog:
`approval_required`, `data_integrity`, `external_effect`, `financial_integrity`,
`rollback_required`, and `security_boundary`. Membership is independent of
outcomes, quality scores, measured cost, frequency/impact weights and pilot
classification. Unknown categories fail closed.

This choice was made from public catalog metadata and contract constraints, not
#198 measured outcomes. Synthetic outcomes are used only to test the chosen rule.
No measured #198 result, private evaluator or Prompt measured run is read or run
by this implementation.

| Alternative | Decision |
| --- | --- |
| Independent catalog risk-boundary dimension, same four grouping keys | Chosen: existing input metadata, no pooling, no outcome-dependent subset, no new score |
| Remove `suite` or combine higher-level suite populations | Rejected: changes existing grouping meaning and needs additional task-compatibility authority |
| Membership from practice impact weights | Rejected: #208 lineage weights are a different authority and do not cover every suite |
| Leave-one-out or caller-selected high-impact fixture IDs | Rejected: permits arbitrary/post-result selection rather than a fixed population contract |
| Rewrite frozen B1 / reinterpret #295 or #301 output | Rejected: historical identity and semantics must remain unchanged |

## Exact population and conclusions

The four grouping keys remain `adapter_track`, `comparison_view`, `suite` and
`task_class`. A registration must enumerate the **entire primary catalog group**,
in canonical order, with the frozen repetition count and exact fixture input
digests. A selected subset, duplicate, reordered inventory, different task class
or different policy is rejected. Codex and Claude never pool. Standalone reports
support the existing three B1 comparison views; the Evolution bridge continues
to support only `adaptive_vs_kernel / fixed_b1_exact`.

The frozen group `practice_frequency / implementation_verification` contains:

| Fixture | Catalog boundary | Membership |
| --- | --- | --- |
| `pf-api-pagination-behavior` | `none` | Retained |
| `pf-data-schema-evolution` | `rollback_required` | High-impact, removed in excluded view |

After the existing classification gate, the included view contains all eligible
fixtures. The excluded view removes the high-impact members of that population.
Both the removed cohort and retained cohort must be nonempty. A high-impact-only,
no-high-impact or all-classification-excluded population remains
`insufficient_evidence`; the implementation does not manufacture a contrast for
every group. Classification-excluded fixtures remain in the full source and
membership inventories and in all-population safety evidence.

Both views use the **existing v2 equal-fixture mean of pair means** for native
components and quality. Practice weights remain the existing reviewed
frequency × impact weights. All expected practice fixtures still need reviewed
lineage, including excluded fixtures; unknown lineage stays null/insufficient,
never a zero weight. The report records each weight part, contribution, weighted
numerator and denominator. Native tokens, milliseconds, human-effort samples,
false-positive findings and unmapped FP units are not added together.

`stable` means exact equality of unweighted and applicable weighted quality,
each native component's `(unit, state, value)`, and baseline/challenger safety and
requirement-blocker presence and native unsafe-category count vectors. `changed`
means a difference on that surface. The category counts keep their original raw
count semantics; no rate or scalar conversion is introduced.
Fixture IDs, observation counts and denominators necessarily change when a
fixture is removed; they remain explicit evidence but are not a tautological
reason to label every contrast changed. Both views must have complete required
evidence, as must all-population safety/requirement coverage. Otherwise the
comparison is `insufficient_evidence`, even when the excluded view alone is closed.

These are **descriptive representation comparisons, not significance tests**.
There is no new confidence interval, threshold, tolerance, bootstrap, scalar
utility or causal inference. Each fixture's existing paired quality observations
and variance distribution are copied unchanged. Known violations and unknown
coverage remain separate facts. The separate all-population safety inventory
retains witnesses for both roles even when sensitivity or classification removes
the violating fixture; a consumer must never infer global safety from the
excluded view or the `stable` label.

## Publication, reconstruction and trust

The API is `scripts/ask-benchmark-portfolio-high-impact-sensitivity.mjs`.
All three object kinds are closed, versioned contracts:

- `portfolio_high_impact_sensitivity_policy@1.0.0` is the immutable companion rule.
- `portfolio_high_impact_sensitivity_registration@1.0.0` binds the policy to
  input-side source revision, plan/digest, run ID, group, fixture inputs/repetitions,
  catalog, policy manifest and scoring policy.
- `portfolio_high_impact_sensitivity_report@1.0.0` pins that exact registration
  object and includes the unchanged #301 consumer report, exact original aggregate
  identity, source/classification/lineage inventory, new populations, component
  and paired-quality observations, denoms, exclusions, blockers and evidence limits.

Before outcomes, call `highImpactRegistrationScope(plannedExecution)` and
`publishHighImpactSensitivityRegistration({ storeRoot, scope })`. Independently
record its returned `object_digest` in the controller's pre-result trust context.
Publication is not chronology proof and does not authorize execution. There is no
self-asserted `results_accessed: false` escape hatch. A digest cannot prove when a
controller first saw results; an adversarial controller replacing its own trust
list is outside this in-process boundary.

After the existing full aggregate verifier has issued its return, call
`publishHighImpactSensitivityReport({ storeRoot, registrationObjectDigest,
trustedRegistrationObjectDigests, verifiedAggregate })`. To consume stored bytes,
call `verifyHighImpactSensitivityReport` with the same inputs plus `objectDigest`.
It validates the CAS object, closes the independently pinned registration against
actual verified paired/aggregate identities, and rederives every report field.
Changed adapter, input, plan, run, policy, denominator, membership, variance,
observation, witness or conclusion cannot be authorized just by resealing.

Only the return actually issued by that verifier can enter
`highImpactSensitivityEvidenceIdentity`. Issuance uses a private WeakMap and
recursively frozen values. A builder/publication return or copied/refrozen wrapper
has no such authority. The existing aggregate verifier's private snapshots remain
the only source of paired/policy data; mutable convenience fields are not trusted.
Another process must reverify the underlying files and CAS objects.

### Optional Evolution transfer

Before publishing and independently pinning the existing Evolution experiment,
pass `highImpactRegistrationObjectDigest` to `buildPortfolioEvolutionProjection`.
The unchanged B1 role mapping is retained; the projection's evidence digest also
commits the registration object. The registration thus sits in the same exact
experiment commitment as the original #276 Asset and #277 Portfolio/lock/selection
identities and the runtime/materialization/selection-state bindings.

For the post-result consumer, additionally pass
`highImpactRegistrationObjectDigest`, `highImpactReportObjectDigest`, and
`trustedHighImpactRegistrationObjectDigests` to
`verifyPortfolioEvolutionEvidence`. Both objects are mandatory together. Omitting
or swapping this extension cannot match an experiment that already committed it.
The return includes `high_impact_sensitivity.identity` and the actually issued
`high_impact_sensitivity.verified_report`.

The existing six dimensions, recommendation rules and action/lifecycle engine are
unchanged. Original aggregate and repetition identities remain their authorities;
the exact experiment digest additionally binds the deterministic sensitivity
extension. All-population safety and requirement witnesses still prevent
`expand`/`retain`. A new stable/changed report is not automatic product-value or
causal credit, nor a substitute for uncollected mechanism/external-outcome data.
Recommendation reverification still requires separately trusted exact evaluation
evidence. No evidence is automatically added to that trust list.

Without the optional extension, #295 aggregate IDs/digests, #301 report and
projection bytes and the existing Evolution return shape remain unchanged. Old
aggregate v1/v2, B/B2/C migration and Prompt `full_ask` wrappers keep their original
policies and meaning. There is no backfill or automatic reinterpretation.

## #197 closure audit and formal verification contract

Contract ID: **ASK-197-HI**. Route: controlled implementation with design and
test-first verification. Proof path: `formal_verification_contract`, required by
the public versioned interface, cross-module exact-identity transfer and regression
claims. Authorized side effects are this branch, commits and PR publication;
merge, #198 execution, admission, lifecycle action and history rewrite are excluded.

| #197 acceptance area | Re-audit disposition and evidence |
| --- | --- |
| Four conditions, pre-result Adaptive selection, lightweight bypass, 3/5 repetitions, adapter separation | Existing execution/normalization foundation; not reimplemented; execution, repetition and pairing regressions remain authoritative |
| Evaluator joining, raw quality/safety/cost evidence | Existing result-set/raw-score authorities; this report consumes their full verified file chain |
| Mechanism and practice reports / R1 native vector | Existing mechanism and #295 v2; unknown/unavailable stay null, weights retain exact reviewed lineage |
| Ceiling/floor/leakage and classification gates | Existing fail-closed admission/classification; new membership never overrides admission; classification-excluded witnesses preserved |
| R2 human-effort sensitivity | Existing #301, unchanged; default consumer regressions verify compatibility |
| R2 nondegenerate high-impact sensitivity | New companion definition and actual mixed-group stable/changed/insufficient file-chain regressions |
| R3 exact #278 consumer and applicable #276/#277 chain | Existing bridge plus optional exact registration binding; actual registry/Portfolio integration harness exercises the new mixed population and recommendation reverification |
| Legacy B/B2/C and old v2 readability | Existing legacy/migration/v2 regression suites; frozen files are unchanged |
| Final tests, schema, repository, bundle, whitespace checks | Required at the submitted tree; actual run outcomes and environment are recorded in the PR, not inferred from test inclusion |

The implementation resolves #197's identified contract gap. A closure claim also
requires successful applicable verification of the submitted tree. Absent real
#198 measurements or #208 practice lineage do not constitute missing engine code:
production evidence correctly remains insufficient until its owners supply it.
No measured adoption, runtime Asset-loading proof, mechanism collection, external
outcome, provider call or private evaluator execution is claimed here.

Focused commands (Node 24 is the target):

```sh
node scripts/test-ask-benchmark-portfolio-high-impact-sensitivity.mjs
node scripts/test-evolution-loop-integration.mjs --high-impact-population
node scripts/test-ask-benchmark-portfolio-consumer-report.mjs
node scripts/test-ask-benchmark-portfolio-aggregate-result-v2.mjs
node scripts/test-evolution-loop-integration.mjs
node scripts/test-ask-benchmark-portfolio-aggregate-result.mjs
node scripts/test-ask-benchmark-portfolio-policy.mjs
node scripts/test-ask-benchmark-portfolio-result-set.mjs
node scripts/test-ask-benchmark-portfolio-repetition-report.mjs
node scripts/test-ask-benchmark-portfolio-paired-comparison-report.mjs
node scripts/test-ask-benchmark-portfolio-directional-outcome-report.mjs
node scripts/test-ask-benchmark-portfolio-mechanism-scorecard.mjs
node scripts/test-ask-benchmark-portfolio-legacy-calibration-migration.mjs
node scripts/test-evolution-loop.mjs
node scripts/test-json-schema-validation.mjs
node scripts/validate-repo.mjs
node scripts/adapter-runtime-bundle.mjs --check
git diff --check
```

Proof limits: synthetic file-chain data is not real Product Evidence; controller
pre-result trust must be established externally; module-private issuance is not
protection against a compromised JavaScript runtime. The metadata-based definition
is intentionally coarse and does not estimate severity. All/no-high-impact groups
remain legitimately insufficient. Do not broaden grouping or select a new subset
in response to their results; any further policy requires new result-blind review.
