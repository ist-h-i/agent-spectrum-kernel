# ADR-0011: Compose Prompt v2 result-blind canary identity and authority

- Status: Proposed
- Date: 2026-08-27
- Scope: Issue #234 Prompt v2 canary preregistration
- Related contracts: `docs/asset-registry-contract.md`, `docs/portfolio-manager-contract.md`, `docs/evolution-loop-contract.md`
- Composes with: ADR-0001, ADR-0003, ADR-0004, ADR-0005
- Supersedes: None

## Context

Issue #234 must freeze a reconstructable comparison between `current_prompt`
and `prompt_v2` before any measured comparison output is accessed. A Prompt
template or static adapter projection does not identify the complete bytes a
runtime would receive. Conversely, storing exact rendered bytes does not prove
that a runtime selected, loaded, executed, or benefited from them.

The existing authority planes already have distinct responsibilities. #276
owns exact Asset identity and lifecycle state, #277 owns immutable Portfolio
selection and activation, #278 owns candidate lineage and the result-blind
experiment seal, and #197 owns the four-condition raw scorer/report authority.
Adding another CAS, Registry, Portfolio manager, Evolution state machine, or
scorer would create competing identities and authority.

The #197 condition vocabulary is exactly `plain`, `kernel_only`,
`adaptive_ask`, and `full_ask`. Prompt revision is an orthogonal two-role
comparison. Relabeling `current_prompt` and `prompt_v2` as different #197
conditions would conflate Prompt attribution with product-condition
attribution. Treating both roles as the same exact selection would erase the
Prompt change instead.

## Decision

### Represent rendered adapter output in the existing Prompt Asset union

Add `rendered_prompt_bundle` as a closed extension of the existing `prompt`
Asset type. It contains one adapter, the complete ordered multi-file runtime
entrypoint inventory, renderer ID/version/input identity, the exact projected
file-inventory digest, and `runtime_application_implied: false`.

The content package remains the authority for exact public output bytes. The
projection digest is recomputed from its ordered `{path, raw_digest}` inventory.
The renderer-input digest is an exact producer-supplied identity retained for
separate reconstruction; Registry validation does not infer unseen renderer
inputs from output bytes.

The Asset record's adapter applicability is bounded to the extension adapter.
A full-content rendered-bundle revision directly derives from the exact prior
bundle with the same stable ID and Asset type, and its maintenance rollback
target is that byte-identical direct parent. These references preserve identity
and reconstruction only. They are not Asset or Portfolio rollback authority.

### Seal Prompt roles separately from the #197 scoring condition

For `projection.mode: prompt_v2_exact`, the Evolution baseline role means
`current_prompt` and the challenger role means `prompt_v2`. Both project to the
existing `full_ask` raw-scoring condition. No Prompt role is added to the four
#197 product conditions.

The mapping digest freezes that role-to-condition rule. A second projection
digest freezes the exact role records: Prompt-role name, common condition,
Asset, Registry snapshot, Portfolio, lock, selection object, and semantic
selection digest. The two roles must retain distinct exact Assets, Portfolio
manifests/locks, and selections. Full verification additionally resolves both
Assets as `rendered_prompt_bundle` records for the experiment adapter and
closes the candidate record's direct parent and rollback target.

### Use the existing pre-result experiment authority

The preregistration seal uses the candidate-reserved
`external_evolution_experiment_authority` and remains `phase: pre_result` with
`results_accessed: false`. It creates no separate preregistration authority
kind. The authority is supplied and trusted independently of candidate
generation.

Experiment authority does not become #197 evaluation authority, recommendation
authority, human-decision authority, Asset lifecycle authority, Portfolio
activation authority, high-impact approval, or rollback authority. A stored
candidate, shadow Portfolio lock, pre-result selection, projection digest, or
rollback target cannot create those later authorities.

### Stop before result-derived or lifecycle objects

Issue #234 may persist exact candidate and pre-result experiment objects. It
does not execute a measured comparison, inspect measured output, derive a
recommendation, create an action proposal or human decision, publish an
application receipt, transition an Asset, or activate/roll back a Portfolio.
Candidate-only and projected evidence cannot be reported as runtime application
or quality evidence.

## Alternatives rejected

### Register only the canonical Prompt v2 template

Rejected because a template does not reconstruct adapter-specific rendered
runtime files or the historical/current comparison bundle.

### Add Prompt roles as fifth and sixth #197 conditions

Rejected because Prompt revision and product-condition attribution are
different questions. It would change the frozen scorer vocabulary and risk a
second scoring interpretation.

### Give the two Prompt roles the same Asset or selection identity

Rejected because a common `full_ask` scoring condition does not erase the exact
material difference being compared.

### Let preregistration, recommendation, or a rollback target authorize mutation

Rejected because a result-blind seal, evidence interpretation, and lifecycle
transition establish different claims. #276/#277 exact caller-supplied contexts
remain required for any later transition.

### Create a Prompt-specific store or comparison scorer

Rejected because the shared CAS, Registry, Portfolio, Evolution, and #197
authorities already supply the required boundaries.

## Consequences

- Each adapter can register independently reconstructable current and Prompt v2
  bundles without implying runtime application.
- Prompt comparison identity remains outside the four-condition #197
  vocabulary while reusing `full_ask` raw scoring.
- Exact digest construction is deterministic and transplant-resistant, but
  callers must retain the complete Asset, Portfolio, selection, experiment, and
  authority closure.
- Direct parent and rollback identity are stricter for rendered Prompt
  revisions; producers cannot select a different convenient rollback revision.
- Static preregistration remains insufficient evidence for execution, quality,
  safety, efficiency, adoption, or organizational activation.

## Review triggers

Revisit this decision before:

- adding or changing a Prompt comparison role or a #197 product condition;
- permitting different raw-scoring conditions for the two Prompt roles;
- changing the rendered-bundle inventory or digest basis;
- allowing templates, projected proxies, or provider-cache metadata to stand in
  for exact rendered bytes;
- permitting result access before the experiment seal;
- pooling adapter tracks or substituting one unavailable adapter for another;
- deriving recommendation, activation, or rollback authority from the
  preregistration; or
- introducing another storage, lifecycle, comparison, or scoring authority.

## Deferred work

This ADR does not materialize adapter bundles, execute the comparison, inspect
private evaluator content, score results, select a winning Prompt, activate a
Portfolio, authenticate organizational authorities, or replace Product
Evidence Run #198. Those later steps must consume the exact identities frozen
here and preserve the authority separation.
