# Review Finding Contract

Contract revision ask.review-finding@1.0.0 defines the one ordinary review finding inventory shared by the baseline semantic review, signal-selected additional gates, and the final merge gate. The canonical field shape is schemas/review-finding.schema.json. The route and ordering authority is schemas/review-signal-gate-map.json.

## Responsibility boundary

- Review gates emit findings; they do not create separate category reports.
- The router collects current gate results and preserves each Finding ID.
- The final merge gate consumes the same inventory and alone decides merge status when a final decision was requested.
- Metrics retain only bounded gate/decision summaries. They never store the full finding inventory or upgrade review quality.

## Closed actionable fields

Every blocker or actionable finding has:

- finding_id: stable and unique inside the current review artifact, using `F-` followed by uppercase letters, digits, or hyphens;
- severity: blocker, major, minor, or nit;
- merge_blocker: explicit boolean merge consequence;
- practical_impact: concrete user, caller, data, operation, or maintenance impact;
- trigger_or_failure_trace: the observed condition and path to the failure;
- evidence_location: the smallest useful file/line, test, command, log, or artifact location;
- required_post_fix_condition: the observable condition that must hold after repair.

Category is optional metadata. Empty category sections are not an output.

Severity `blocker` always requires `merge_blocker: true`. This is a Finding-level semantic invariant, independent of whether a final Decision was requested. Other severities retain their explicitly authored merge consequence; they are not promoted to merge blockers by severity alone.

## Impact order

Order the complete inventory deterministically:

1. merge_blocker true before false;
2. severity in blocker, major, minor, nit order;
3. Finding ID in code-unit order.

This ordering is a decision-impact presentation rule. It does not infer severity or merge consequence. The producing gate remains responsible for those judgments.

## Missing and duplicate data

- Missing required fields make the finding contract invalid.
- Duplicate Finding IDs make the current inventory invalid.
- Unknown fields are rejected rather than becoming an adapter-specific extension.
- Missing evidence needed to judge a possible finding remains insufficient evidence; it is not synthesized as a finding.
- Suggestions with no actionable post-fix condition are not findings. Omit them from ordinary review output unless a separate follow-up handoff was explicitly requested.

## Ordinary output

Ordinary review output uses one Findings section. It omits empty category sections and skipped-heavy-gate boilerplate. Complete gate applicability and skipped-layer details are emitted only for explicit diagnostic/debug requests.

## Compatibility

Historical review text remains readable. New Prompt v2 projections use this contract prospectively and do not rewrite benchmark oracles, private evaluator artifacts, historical metrics, or immutable pre-compact prompt fixtures.
