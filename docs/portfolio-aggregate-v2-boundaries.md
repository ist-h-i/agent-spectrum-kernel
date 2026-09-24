# Portfolio aggregate v2: verification and sensitivity boundaries

PR #295 introduced native-unit aggregate reporting. The consumer extension adds
reconstructable sensitivity details and a bounded Evolution integration, not a new
scorer. The historical high-impact limitation below is retained for B1 artifacts;
the separately versioned [risk-boundary sensitivity contract](portfolio-high-impact-sensitivity.md)
adds a nondegenerate contrast for newly preregistered executions.
The frozen B1 policy and all historical artifacts remain unchanged; synthetic
contract verification is not measured product value.

## Verification authority

`buildPortfolioAggregateResult` is a deterministic builder, not an attestation.
`reportPortfolioAggregateResult` publishes an artifact, not an Evolution authority.
Only a return issued by `verifyPortfolioAggregateResult` in the same module instance
is accepted by `portfolioAggregateEvolutionEvidenceIdentity`. The verifier checks
the saved bytes, policies, classification and lineage sources, rederives the complete
artifact through the existing paired/result-set verification chain, compares it,
and checks the saved file again before issuing the return.

Issuance is tracked by a module-private WeakMap. It also captures recursively
frozen comparison, repetition and scoring-policy snapshots for downstream use.
The returned wrapper and its `verified_aggregate_result` are frozen. Cloning, serializing,
spreading, refreezing or recomputing a digest cannot transfer this capability.
Another process or module instance must verify the files again. This is an
in-process API boundary, not isolation from an attacker controlling the JavaScript
runtime. Mutable convenience fields such as `artifact` and `bytes` are not the
source used by the Evolution projection. Replacing nested convenience fields on
`verified_comparison` cannot replace the snapshots exposed by
`portfolioAggregateEvolutionContext`.

The projection supplies an exact artifact identity, not a recommendation, trusted
evaluation grant, Asset admission, Portfolio selection or lifecycle authorization.
The original v2 file regression tests the inventory API. The separate consumer
integration now exercises the real #276/#277/#278 verification chain and exact
recommendation trust boundary; an inventory hash alone is still not that proof.

## Empty eligible population

The expected fixture and classification inventory remains present when every
fixture is legitimately excluded. The included inventory is empty, quality values
are null, component values are null with unknown state and zero observations, and
the aggregate and sensitivity conclusions are insufficient_evidence. The absence
of eligible observations is not a measured zero, successful evaluation or exception.
The FP-unit mapping reason remains visible even when its empty-population state is
unknown rather than not_applicable.

## Historical B1 high-impact sensitivity: intentionally degenerate

B1 groups aggregates by adapter, comparison view, suite and task class. Its current
high-impact discriminator is membership in the high_impact suite. Within one such
group, excluding high-impact fixtures therefore removes either every fixture or
none. Both populations cannot be nonempty, regardless of measurement completeness
or the number of fixtures in the same suite.

V2 publishes the reconstructable included/excluded populations and the applicable
reason (no_high_impact_fixture_in_selected_group or exclusion_removes_entire_group),
but always reports insufficient_evidence for this dimension. Unreachable
stable/changed logic is intentionally absent. A complete native component vector
must not be interpreted as a completed high-impact sensitivity analysis.

A non-degenerate contrast requires a separately agreed, result-blind definition
of the population and exclusion rule compatible with the group boundaries, or a
new approved policy version. The consumer extension does not select a leave-one-out subset, reuse
practice-frequency impact bands as a new authority, pool suites, change the frozen
policy or apply new rules to historical runs. This is a specification limit, not
merely missing #198/#208 measurements. The new companion policy resolves this
infrastructure gap for explicitly registered new executions; it does not change
these historical B1 conclusions. Existing callers still receive exactly this B1
shape unless they opt into the separate sidecar.

Human-effort sensitivity compares the exact included/excluded component surfaces.
Its stable/changed labels describe that representation, including applicability
and coverage; they are not statistical significance or product-value conclusions.
No cross-unit scalar or post-result decision threshold is introduced.

## Versioned consumer report

`buildPortfolioConsumerReport` takes only an issued aggregate verifier return.
Its `portfolio_aggregate_consumer_report@1.0.0` sidecar pins the original aggregate
ID/digest, paired-report authority, classification and lineage references. It does
not change the aggregate v2 Schema, builder output, IDs or frozen policies.

Each included/excluded view retains the native components and adds per-pair source
identities, observation states, fixture/pair denominators, applicable reviewed
weight numerator/denominator, and explicit insufficient-evidence reasons. The full
source inventory includes classification-excluded fixtures. Human-effort omission
preserves every original sample, including unknown/unavailable samples, in
`omitted_observations`; their values are not converted to zero. The excluded view's
coverage is computed independently, so unmeasured effort can leave the included
view insufficient and the excluded view complete. That does not upgrade the
sensitivity conclusion: both views must have sufficient evidence.

The report's separate baseline/challenger safety inventory covers **all expected
fixtures**, even when classification or high-impact exclusion removes their
contributions. Exact witnesses retain observed unsafe actions and requirement
blocker failures. Coverage and a witnessed blocker are different propositions:
one known violation establishes that a blocker exists even if other observations
are unknown. Consumers must not infer overall safety from a positive quality mean
or an empty eligible population.

`publishPortfolioConsumerReport` uses the existing content-addressed store.
`verifyPortfolioConsumerReport` compares a saved report with complete rederivation
from an issued aggregate verification. Schema validation or a recomputed self-digest
alone is not verification authority. Files must be fully reverified in another
process; serializing the verifier wrapper does not transfer its capability.

## Exact Evolution binding

Use `buildPortfolioEvolutionProjection({ roles, execution })` **before results
exist**, then put the projection into the existing Evolution experiment and pin
that experiment's content-addressed object digest in the controller's pre-result
trust context. The closed execution binding fixes the #197 plan/run/runtime,
materialization and Adaptive selection-state identities, adapter/group/fixture
inventory, frozen policies, classification references and lineage references. The
same projection digest commits the exact #276 Asset and #277 Portfolio/lock/
selection/Registry identities in both experiment roles. No weights or thresholds
are chosen by this adapter.

`verifyPortfolioEvolutionEvidence` requires the following inputs:

- Existing aggregate full-verifier file options, including pinned source bytes.
- The Evolution store and exact experiment object digest, independently allowed in
  `trustedExperimentObjectDigests`, plus the existing experiment/Asset/Portfolio
  authority contexts (and high-impact grants when applicable).
- A separate evaluation identity: `authority_id`, `authority_revision` and
  `authority_evidence_digest`, not generation, experiment or human decision IDs.

The consumer runs the existing full experiment verifier (including actual Asset
Registry, Portfolio lock and selection verification), checks selection contexts,
fully verifies the aggregate and normalized snapshot, reconstructs the execution
binding and compares the projection with the pinned experiment. A valid digest
or `results_accessed: false` field cannot substitute for the independent pin.
Changing thresholds, weights, roles or inputs creates a different experiment;
copying that new digest out of the submitted result into the trust list would
violate the controller's trust responsibility.

Quality, safety, cost and variance enter the existing six-dimension recommendation
API with exact #197 artifact identities. Conclusions are descriptive `observed`,
`unsafe`, `contradicted` or typed incomplete states, never invented statistical or
causal support. Cost remains a native vector, not money or ROI. An unsafe witness
cannot be offset by a favorable aggregate or recommendation; requirement blockers
also prevent `expand`/`retain`. Mechanism and external outcome remain `unavailable`
with explicit hashed absence markers returned in `unavailable_artifacts`. Those
markers are not collected mechanism/outcome reports.

The existing frozen recommendation rules produce the recommendation. Returned
evidence is **not automatically trusted**: the evaluation controller must authorize
that exact evidence context before passing it to #278's recommendation verifier.
The bridge grants no admission, action, lifecycle, measured-run or release authority.
A plan-to-selection commitment is not additional proof that a real runtime loaded
Asset bytes; runtime provenance still belongs to the existing execution chain.
The new bridge supports only `adaptive_vs_kernel` / `fixed_b1_exact`; it neither
replaces nor reinterprets the existing Prompt `full_ask` compatibility wrapper.

## Regression scope

The v2 focused entrypoint includes unit regressions and file-chain regressions:

- Hand-built/refrozen/rehashed authority wrappers are rejected; an actually issued
  full-verifier return is accepted and cannot have its verified artifact replaced.
- All-excluded classifications can be built, saved and reverified as insufficient.
- Rehashed sensitivity tampering and changed pinned input bytes fail verification.
- Legacy files remain readable but cannot become v2 Evolution identities.
- Nonzero synthetic tokens, duration and effort survive the real file verification
  chain, and the exact resulting identity enters the existing inventory API.
- MAX_VALUE / 10 is a finite positive control. A separate exact-power-of-two input
  passes upstream per-metric distributions and overflows the five-pair native-token
  sum, exercising the existing finite-number guard without weakening it.

Run `node scripts/test-ask-benchmark-portfolio-aggregate-result-v2.mjs` on Node 24,
`node scripts/test-ask-benchmark-portfolio-consumer-report.mjs` and
`node scripts/test-evolution-loop-integration.mjs`, then the applicable legacy,
policy, paired, result-set and Evolution contract regressions. The consumer tests
cover full/partial/missing effort, stable/changed/insufficient sensitivity, empty
exclusions, safety witnesses, private verifier snapshots, exact pre-result binding,
Asset/Portfolio/selection transplants and full recommendation verification.
Test inclusion is not an execution-success claim; PR verification records identify
the actual environment, source and commands run. No real provider, private evaluator
or production run is needed for these synthetic regressions.
