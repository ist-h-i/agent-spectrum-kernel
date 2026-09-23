# Portfolio aggregate v2: verification and sensitivity boundaries

PR #295 progresses Issue #197. It does not close R1-R3 or establish measured
product value. The frozen B1 policy and all historical artifacts remain unchanged.

## Verification authority

`buildPortfolioAggregateResult` is a deterministic builder, not an attestation.
`reportPortfolioAggregateResult` publishes an artifact, not an Evolution authority.
Only a return issued by `verifyPortfolioAggregateResult` in the same module instance
is accepted by `portfolioAggregateEvolutionEvidenceIdentity`. The verifier checks
the saved bytes, policies, classification and lineage sources, rederives the complete
artifact through the existing paired/result-set verification chain, compares it,
and checks the saved file again before issuing the return.

Issuance is tracked by a module-private WeakSet. The returned wrapper is frozen and
its `verified_aggregate_result` is recursively frozen. Cloning, serializing,
spreading, refreezing or recomputing a digest cannot transfer this capability.
Another process or module instance must verify the files again. This is an
in-process API boundary, not isolation from an attacker controlling the JavaScript
runtime. Mutable convenience fields such as `artifact` and `bytes` are not the
source used by the Evolution projection.

The projection supplies an exact artifact identity, not a recommendation, trusted
evaluation grant, Asset admission, Portfolio selection or lifecycle authorization.
The file integration regression tests the existing Evolution inventory API only.
The full dimension/recommendation and applicable Asset/Portfolio/selection binding
proof remains part of #197 R3; an inventory hash is not that proof.

## Empty eligible population

The expected fixture and classification inventory remains present when every
fixture is legitimately excluded. The included inventory is empty, quality values
are null, component values are null with unknown state and zero observations, and
the aggregate and sensitivity conclusions are insufficient_evidence. The absence
of eligible observations is not a measured zero, successful evaluation or exception.
The FP-unit mapping reason remains visible even when its empty-population state is
unknown rather than not_applicable.

## High-impact sensitivity: unresolved R2 contrast

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
new approved policy version. This PR does not select a leave-one-out subset, reuse
practice-frequency impact bands as a new authority, pool suites, change the frozen
policy or apply new rules to historical runs. This is a specification limit, not
merely missing #198/#208 measurements. Keep the R2 acceptance criterion open.

Human-effort sensitivity compares the exact included/excluded component surfaces.
Its stable/changed labels describe that representation, including applicability
and coverage; they are not statistical significance or product-value conclusions.
No cross-unit scalar or post-result decision threshold is introduced.

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
then the applicable legacy, policy, paired, result-set and Evolution regressions.
Test inclusion is not an execution-success claim; PR verification records identify
the actual environment, source and commands run. No real provider, private evaluator
or production run is needed for these synthetic regressions.
