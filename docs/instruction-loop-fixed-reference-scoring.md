# Preserve fixed partial-credit source judgments

Specification and Formal Verification Contract `fixed-reference-scoring@1`.
Upstream: stopped standard native run; original fixed source grading/calculator
and independent-review evidence must reach the standard report without converting
partial credit or uncertainty into binary pass/fail. No private rubric is bundled.

Add an optional `report.fixedScoring` port with absolute `python`, pinned
`calculator`, `dependencies`, `scale_maximum` (exact nonnegative fraction), and
`assessments` (pinned `fixed_point_reference_input_v1` JSON files). Each input binds
trial/fixture/archive identity and pins its existing packet, assessment,
independent_verification and review_document. The packet's explicit source
inventory is re-derived from regular retained archive entries without extraction
or candidate execution. Candidate, public-input and policy identities must match
assessment identity. The host-owned pinned calculator's `validate` is rerun; its
result must equal the independent-review receipt, whose selected assessment and
review hashes are checked. This is reference evidence, never formal admission,
provider authentication, evidence-truth verification or runtime acceptance.

Keep exact lower/upper fractions, partial/undetermined item statuses, mandatory,
critical, observation and runtime-unknown fields in a separate typed report lane.
Binary report fields remain binary. Missing judgments stay unknown. Once execution
closure is confirmed, missing/null/malformed or excessive optional reference
lists remain Unknown with a fixed issue and bounded report limit; no partial or
favorable slice of a malformed list is selected. The raw result/digest is kept.
Malformed static entries become JSON-safe incidents while separately verified
judgments remain usable. Job binding, source pins, model grants and unknown
provider closure are not relaxed. Next-cycle
feedback retains a bounded point/range/mandatory/critical summary without private
rubric bodies, source code, raw assessment reasons or local paths.

An optional pinned `report.referenceScoringCommand` implements the existing
request/result/inspect worker protocol, producing fixed_point_assessments refs.
The normal report stage owns its reservation, records evidence and checks an
explicit model grant if the configured worker makes model calls. Only positive
completed receipts permit recovery; unknown grading work is inspected, never
re-dispatched. The host AI supplies routine grading configuration and files;
only case and change judgments belong to humans.

F-01: source/packet/archive/calculator/independent-review identity mismatches
refuse import without altering original results or inventing quality.
F-02: partial/exact fractions, ranges and mandatory/critical/runtime unknowns
survive report and bounded continuation; old binary imports remain compatible.
F-03: configured grading is model-grant-aware, runs once and resumes only from
its exact completed receipt; no new human gate and no candidate code execution.
F-04: bounded archive inspection rejects traversal, links selected as source,
duplicates, changed source bytes/modes and excessive capture. Private grading
assets stay in caller-owned paths and are never copied into public workspaces.

Implementation Contract:
- Artifact ID: `fixed-reference-scoring-implementation@1`.
- Upstream refs: `native-loop-continuity@1`, stopped standard-path handoff.
- Actual change boundary: typed fixed reference import, report/continuation,
  optional trusted scoring transport and existing source pins/CI owner.
- Verification attempted / evidence: software fixtures and independent review.
- Selected proof: Formal `fixed-reference-scoring@1` above.
- Handoff state: implementation in progress; no new real Eval or owner application.
