# ADR-0010: Separate one-task effectiveness classification from benchmark scoring, external outcomes, and Evolution authority

- Status: Proposed
- Date: 2026-08-26
- Scope: Issue #233 evidence-backed one-task Skill effectiveness outcomes
- Related contract: `docs/skill-effectiveness-evaluation-contract.md`
- Composes with: ADR-0005, ADR-0006
- Supersedes: None

## Context

The existing Skill effectiveness workflow assigns six unanchored `0-100`
ratings after a task. Those numbers have no frozen metric definitions,
denominators, evidence bindings, or missing-value semantics. They can imply
precision that the completed-task evidence does not provide, turn unknown into
an apparent zero, and allow a favorable average to hide material harm.

The repository already has distinct authorities for benchmark scoring (#197),
external outcomes and ROI (#178), and governed candidate/Portfolio decisions
(#278). Reusing their labels without preserving scope would allow a one-task
retrospective to appear to be benchmark evidence or lifecycle authority.

## Decision

### Record native observations before classification

One-task effectiveness records use a closed v1 workflow/artifact metric
catalog. Each catalog entry fixes its dimension, integer native unit or subunit,
metric definition, and effect rule. Unknown or unavailable measurements keep
`null`, `Unknown`, and a written limitation. Custom metrics, scores,
percentages, aggregates, and ordinals are invalid in v1. No proxy conversion is
defined.

### Separate measurement from effect and derive impact

An observed value does not imply an observed effect. Comparison metrics require
a same-unit reference value, native-unit delta, positive materiality threshold,
rule reference, and effect evidence. The validator recomputes the delta and
derives impact from the catalog direction. Resource measurements without that
closure retain an unknown effect and produce `insufficient_evidence`.

The closed direct rule makes every observed guardrail-violation count with valid
measurement evidence an established effect: zero maps to neutral and non-zero
to harmful. Its effect evidence refs and claim status are bound to the
measurement evidence. Callers cannot make the direct effect unknown, replace
the rule or evidence binding, or assert their own impact. A future anchored
ordinal requires a versioned contract revision and exact level criteria rather
than a free-form metric definition.

### Project dependency-complete semantic runtime from core

The generic JSON Schema engine and the Skill effectiveness semantic CLI are
core-owned immutable runtime assets. The CLI builds and validates the derived
effect, dimension, and recommendation semantics that structural JSON Schema
cannot express. Codex and Claude consume these exact core assets; neither owns
or forks them. Execution Envelope parsing and transport remain adapter-owned.

### Derive seven independent dimensions

Outcome quality, false-positive control, safety, routing quality, evidence
quality, overhead, and reuse value are classified independently as `effective`,
`neutral`, `excessive`, `harmful`, or `insufficient_evidence`. `excessive` is
reserved for disproportionate overhead with non-inferior primary evidence.
Classification and basis are recomputed from bound observations.

### Derive one scoped recommendation with fail-closed precedence

Harm yields `stop` before any other evidence. Missing evidence then yields
`insufficient_evidence`; excessive overhead yields `simplify`; material benefit
in outcome quality, false-positive control, or safety yields `expand`; all
remaining complete cases yield `retain`. Routing, evidence, or reuse benefit
alone cannot expand the workflow.

The recommendation is limited to the next similar task workflow and explicitly
implies no authority.

### Share labels without sharing authority

The overall labels are stored once in
`schemas/effectiveness-decision-vocabulary.schema.json` and referenced by both
the one-task contract and the existing #278 schemas. The shared file defines
spelling only. #278 continues to derive its recommendation from a sealed
experiment, separately trusted evaluator evidence, and its own decision table.
No #233 artifact becomes an Evolution evidence or lifecycle trust root.

## Consequences

- Task evidence remains inspectable in its actual unit instead of being hidden
  behind an unexplained score.
- Metric identity and impact derivation are machine-checkable; free-form labels
  cannot create personnel metrics or self-authorize a favorable effect.
- Missing evidence and harm cannot be averaged away.
- One-task follow-up decisions remain distinct from capability maturity,
  adoption trends, benchmark scoring, product ROI, and Portfolio authority.
- Consumers that need cross-contract translation must introduce an explicit,
  versioned mapping and retain source scope and evidence.
- Generated adapter assets change because the canonical Skill and immutable
  contract inventory change; benchmark and private evaluator fixtures do not.

## Alternatives rejected

### Keep six `0-100` ratings with better prose

Rejected because prose does not create metric definitions, denominators,
missing-value rules, or a deterministic decision function.

### Reject suspicious score or personnel words

Rejected because a denylist is bypassable through aliases, other languages,
or opaque labels, and may reject a future properly anchored metric. The closed
catalog defines allowed semantics instead.

### Accept caller-defined metric rules and impact

Rejected because a caller could write its own threshold or personnel-oriented
definition and then self-assert `beneficial`. Metric direction is catalog-owned,
and comparison/materiality evidence is required before impact is derived.

### Average dimension classifications

Rejected because averaging can mask safety harm and can silently encode unknown
as a numeric value.

### Infer quality from tokens, duration, or tool count

Rejected because those are overhead observations without a validated mapping to
task correctness.

### Feed the one-task recommendation directly into Evolution

Rejected because #278 requires experiment-bound evaluation authority, action
proposal, human decision, and existing Asset/Portfolio transition authority.

## Review triggers

Review or supersede this ADR before:

- #278 machine-consumes a #233 outcome;
- the one-task contract claims a complete external outcome;
- a dimension, classification, or precedence rule changes;
- the closed metric catalog or effect derivation semantics change;
- an ordinal or aggregate score is introduced; or
- the outcome gains Asset, Registry, Portfolio, or Evolution lifecycle effects.
