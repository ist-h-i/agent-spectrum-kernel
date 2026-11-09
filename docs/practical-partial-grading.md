# Partial grading evidence without invented scores

Spec `practical-partial-grading@1` extends the existing optional practical quality
port. A closed grading call can contain useful reported observations while its
complete judgment is unusable. Preserve those as unconfirmed diagnostics, not a
pass, a fixed score or a claim that individual facts were independently checked.

A reproduced producer mismatch allowed `undetermined` rows without `reason` in
the source response schema, while its fixed validator required nonempty reasons.
The response normalizer did not remove them. Whole-answer verifier abstention
also retained its review artifact but no typed partial report. Neither incident
requires repeating the original Task.

Formal Verification Contract:

- PG01: Fixed-schema projection requires a non-whitespace reason when an object
  declares both status=undetermined and a string reason property. No private weights,
  coverage IDs, deductions or domain aggregation rules are added. Original input
  schemas and saved judgments are immutable; normalization never fills reasons.
- PG02: Optional diagnostics are bounded, artifact-bound, nonnumeric and
  explicitly unconfirmed. They can coexist only with outcome Unknown and a null
  fixed reference. Unknown keys, excessive payloads and unbound refs are invalid.
- PG03: The AI recovery packet carries usable partial diagnostics while complete
  quality stays Unknown. Bound partial evidence permits ordinary continuation
  without a missing-quality Task retry. Existing closure, retry, model grants and
  human case/application decisions remain unchanged. A partial report cannot
  turn an unresolved call into a completed one.
- PG04: All-attempt reports preserve diagnostics, original results and separate
  Task/grading costs. An AI may use/reference incomplete grading and continue
  still-unattempted approved rows without repeating Tasks or picking high scores.
- PG05: Next-cycle input receives only bounded counts and opaque evidence
  digests as grading incidents. Private criterion IDs, reported statuses,
  reviews, answers and diagnostic bodies do not enter authoring input. Existing
  reports/summaries without diagnostics stay readable.
- PG06: A caller helper preserves per-criterion reported states as unreviewed;
  validator incidents and whole-verifier abstention never certify those states.
  Missing fields and contradictory meanings are not repaired into scores.

Implementation boundary: response schema helper, optional quality validation,
recovery packet, report/feedback projection, their model-free tests and Skill
instructions. No new universal scoring framework, private grading dependency,
Task runner, third human gate, automatic retry or owner mutation is introduced.
The caller-owned grader still binds its fixed rules and captures raw evidence;
it must attach diagnostics through the existing verified artifact port.

Verification: synthetic row-schema checks; malformed/unbound diagnostics;
worker-to-recovery-to-next-row/report integration; privacy and old-summary
regressions; affected runtime pin/CI compatibility and repository validation.
These checks prove software behavior only, not model grading accuracy, runtime
acceptance or candidate effectiveness. Current frozen Eval assets are unchanged.

## Caller integration

Write the raw summary/replies to a verified provider artifact first. If grading
is closed but a full judgment is invalid or the verifier abstains, attach:

```js
const refs = [{path: 'grade-summary.json', digest: summaryDigest}];
const grading_diagnostics = unconfirmedPracticalGradingDiagnostics({
  rows: reportedRows.map(row => ({
    criterion_id: row.id, reported_status: row.status
  })),
  evidence_refs: refs,
  issue_codes: ['incomplete_fixed_judgment']
});
const quality = {
  kind: 'practical_quality_observation_v1', scope: 'source_reference',
  outcome: 'unknown', fixed_reference: null, evidence_refs: refs,
  grading_diagnostics
};
```

The helper is exported by `scripts/practical-quality-observation.mjs`. It marks
all supplied rows unreviewed, caps observations at 128 with an explicit omitted
count, and accepts up to 64 bounded issue codes. The raw artifact retains omitted
or malformed content. `reported_status` is an inert caller label, never parsed
as a score, verdict, independently confirmed fact or runtime observation.
A label saying `pass` is still an unconfirmed report. Do not infer item agreement
from an unstructured verifier review, fill missing reasons or choose high scores.
All diagnostic references must be bound verified artifacts; a single quality
observation uses at most 16 unique artifacts and a 64 KiB diagnostics budget.
Malformed optional diagnostics leave original execution/cost/artifacts intact
and enter existing recovery as unusable quality rather than a false pass.

A normally completed partial grade with reported observations retains outcome
Unknown but supplies useful scoped quality evidence. Diagnostics containing only
incidents and no observed criterion states remain missing quality and use the
existing AI recovery path; an error artifact is not a quality judgment. The existing runner continues still-approved rows; a
remaining execution/usage/closure incident still uses normal AI recovery. Unknown
provider closure still blocks another root. No new model call is dispatched by
a diagnostic, report, summary or reference. A complete valid low/range fixed
judgment keeps the existing fixed-reference path instead of diagnostics.

For already saved partial results, the model-free retained-grade inspector may
return optional `grading_diagnostics` per entry with `fixed_reference:null`.
References are relative to its verified artifacts, not unbound original paths.
The normal selection/report-revision path preserves it and creates a new human
result packet; it grants neither grading calls nor owner changes.

Only counts, omitted counts, review-state counts and opaque artifact digests
enter next-cycle feedback. Criterion IDs, raw status labels, issue codes, paths,
private rubrics and review bodies remain in the report/evidence, not author input.
The fixed schema projection's reason requirement is only a producer constraint;
models may still violate it. These diagnostics support progress with useful
incomplete evidence rather than promising failure-free grading.

The closed diagnostic data shape is:

```text
kind: practical_grading_diagnostics_v1
observations: [{criterion_id, reported_status, producer, review_state, evidence_refs}]
issues: [{code, criterion_id, producer, evidence_refs}]
omitted_observation_count: nonnegative integer
```

`producer` is primary/verification/validator; `review_state` is
unreviewed/disputed/undetermined, never confirmed. Criterion IDs and reported
labels are bounded strings (512/128 characters), not private evaluator authority.
Observation identity is unique per criterion/producer. Each observation or
issue has nonempty refs; issues use bounded codes and nullable criterion IDs.
Additional fields, numeric score fields and unbound references are rejected.
