# One-task Skill effectiveness evaluation contract

Contract ID: `ask.skill-effectiveness-outcome@1.0.0`

This contract evaluates one completed task workflow and its artifacts. It does
not score a person, calculate longitudinal adoption or capability maturity,
replace benchmark scoring, calculate product ROI, or authorize an Asset or
Portfolio change.

## Observation first

Record the task evidence in its native unit before classifying it. Examples
include valid or missed findings, false-positive findings, satisfied
requirements, scope deviations, unsupported claims, route decisions, tokens,
duration, tool calls, artifacts, participating agents, and measured human
correction or rework.

Every observation binds:

- a stable observation identifier and a metric identifier from the closed v1
  workflow/artifact catalog;
- the catalog-owned dimension, exact native unit, value type, metric
  definition, and effect rule;
- `observed`, `unknown`, or `unavailable` measurement status;
- the native value, or `null` when it is not known;
- source and evidence references;
- the canonical measurement-evidence status and any measurement limitation;
- a separately evidenced effect with its comparison/reference value,
  native-unit delta, materiality threshold and rule reference, derived impact,
  and effect limitation.

The v1 catalog contains non-negative integer counts and integer native subunits
such as milliseconds and US-dollar micros. Custom metrics are invalid. Scores,
percentages, aggregates, and ordinals are not v1 observation metrics; a future
anchored ordinal requires a versioned contract revision with closed level
criteria. There is no aggregate effectiveness score, weighting, percentage,
or inferred conversion from tokens, duration, tool calls, or artifact counts
to quality.

`unknown` and `unavailable` retain a `null` value, `Unknown` claim status,
an unknown effect and impact, and explicit measurement/effect limitations.
They are never zero, neutral, retained, rejected, or silently omitted.

Measurement and effect are separate. An observed token, duration, tool-call,
artifact, agent, correction, rework, or cost value does not establish whether
the workflow was better, neutral, or excessive. Comparison metrics require a
same-unit reference value, a positive materiality threshold, a rule reference,
and effect evidence. The validator recomputes `delta = value -
reference_value` and derives impact from the catalog direction. Without that
closure, the measurement remains observed while its effect is `unknown` and
the dimension is `insufficient_evidence`.

The one direct v1 rule is `guardrail_violations`: an observed count with valid
measurement evidence always establishes its direct effect. Zero is neutral and
non-zero is harmful. The builder binds the direct effect evidence refs and claim
status to the measurement evidence, fixes the catalog-owned rule reference, and
does not accept an unknown direct effect. Callers cannot substitute another
rule, evidence binding, or impact. All other v1 metrics require an evidenced
comparison.

## Dimension decisions

Classify each dimension independently:

| Dimension | Typical native evidence |
| --- | --- |
| `outcome_quality` | valid or missed findings, requirements satisfied, measured task correction |
| `false_positive_control` | rejected findings or unsupported alerts |
| `safety` | guardrail violations, unsafe or prohibited effects |
| `routing_quality` | route correctness, under-processing, over-processing |
| `evidence_quality` | unsupported claims, overclaims, missing proof |
| `overhead` | tokens, duration, tool calls, artifacts, agents, measured rework |
| `reuse_value` | artifacts accepted for a later workflow |

The closed classifications are:

- `effective`: observed material benefit;
- `neutral`: observed no material change;
- `excessive`: disproportionate observed overhead, only when outcome quality,
  false-positive control, and safety are non-inferior;
- `harmful`: observed material harm or guardrail loss;
- `insufficient_evidence`: an unknown, unavailable, or otherwise material
  evidence gap.

The semantic validator first checks each metric against the closed catalog,
recomputes comparison delta and impact, then derives the classification and its
basis from the bound observations. A caller cannot assert a different impact
or classification, define its own metric, or reference an observation from
another dimension.

## Overall recommendation

The recommendation is derived, not averaged:

1. Any `harmful` dimension yields `stop`.
2. Otherwise, any `insufficient_evidence` dimension yields
   `insufficient_evidence`.
3. Otherwise, `excessive` overhead yields `simplify`.
4. Otherwise, an `effective` `outcome_quality`,
   `false_positive_control`, or `safety` dimension yields `expand`.
5. Otherwise, yield `retain`.

An effective routing, evidence, or reuse dimension alone cannot yield `expand`.
The recommendation applies only to the next similar task workflow, carries
`authority_implied: false`, and cannot mutate an Asset, Registry, Portfolio, or
Evolution state.

## Authority boundaries

- Issue #233 owns this one-task workflow/artifact retrospective and its narrow
  follow-up recommendation.
- Issue #197 owns benchmark evaluator joins, raw scoring, deltas, variance,
  mechanism evidence, and aggregate reports.
- Issue #178 owns external outcomes, unit cost, causal attribution, and ROI.
- Issue #278 owns experiment-bound recommendations, action proposals, human
  decisions, and governed Portfolio mutation.

The shared recommendation labels are vocabulary identity only. A #233 outcome
is not #197 evaluation authority and cannot be supplied as bare #278 lifecycle
authority. A future consumer must define an explicit, versioned mapping and
retain the original evidence scope.

## Validation assets

- Machine schema: `schemas/skill-effectiveness-outcome.schema.json`
- Shared labels: `schemas/effectiveness-decision-vocabulary.schema.json`
- Semantic builder/validator CLI: `scripts/skill-effectiveness-outcome.mjs`
  - `node scripts/skill-effectiveness-outcome.mjs build <input.json|->`
  - `node scripts/skill-effectiveness-outcome.mjs validate <outcome.json|->`
- Positive and negative cases:
  `docs/fixtures/skill-effectiveness-outcome-cases.json`
- Focused test: `node scripts/test-skill-effectiveness-outcome.mjs`

The positive matrix covers every dimension classification and overall
recommendation, including an observed resource value whose effect remains
unknown. The negative matrix rejects root- and observation-level
pseudo-precision, unregistered aliases, personnel metrics/definitions,
metric/unit/type/dimension drift, missing comparison/materiality/effect
  evidence, caller-supplied delta/impact drift, an unknown or evidence-drifted
  direct effect, unknown-to-zero conversion, harm-masking recommendations,
  routing-only expansion, and unbound evidence.
