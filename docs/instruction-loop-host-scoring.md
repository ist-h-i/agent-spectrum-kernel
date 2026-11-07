# Connect a host AI to routine reference scoring

Specification and Formal Verification Contract `host-reference-scoring@1`.
Upstream: the two human judgment types and the existing trusted
`report.referenceScoringCommand` port. The execution host has existing private
source-packet preparation and fixed calculators, but no shipped durable way for
the host AI to claim a scoring request and return its reviewed references.

Add a model-dispatch-free worker and command builder using the existing
request/result/inspect transport. It prepares an immutable, job/settings-bound
host request, records one exclusive execution claim, and accepts only a matching
positive closed completion. A small operator CLI reads/claims/completes this
handoff. A repeated claim returns `claim_created:false`; it never authorizes a
new execution, takeover, automatic retry or approval inheritance. Lost claim or
completion responses are recovered from retained receipts and journal digests.
Missing or uncertain closure stays pending. Real host claims require both the
original runtime grant and an explicit host model-call grant. These receipts are
host-reported evidence, not provider authentication or proof of evidence truth.

The host AI owns private packet preparation, isolated anonymous judgment,
independent source review and completion files. Only the existing case and
change/result judgment types belong to humans. The mediator may inspect the full
job but must not pass condition labels, peer results or raw coordinator input to
a blind judge. The bridge neither dispatches a provider nor executes candidates,
copies private grading assets to public workspaces, changes cases, or applies an
owner. Existing calculators and source/archive identity verification remain the
authority for importing fixed references.

Mixed native comparisons can return both `fixed_point_assessments` and optional
`reference_assessments` for the existing binary lane. Each optional lane is
validated as a whole; malformed/missing data retains execution evidence and
Unknown quality rather than selecting a favorable slice. Static binary inputs
remain supported. Duplicate static/dynamic judgments for one trial are ambiguous
and must not select one result by ordering.

H-01: preparation starts no model, produces no quality result, and exposes an
exact host request only inside its configured private grading root.
H-02: real claims require grants, claims are exclusive/idempotent and deleted or
changed checkpointed receipts cannot create a new execution.
H-03: job/settings/source/claim/completion transplants, symlinks, overlapping
paths and missing/negative closure cannot publish an accepted result. Exact
positive completion resumes the same grading job without dispatch replay.
H-04: existing binary and fixed-point judgments can reach one native report;
missing/malformed/duplicate optional judgments remain Unknown without erasing
valid trials. No new human gate or implicit model/provider authority.
H-05: all metadata stays within the existing16MiB ceiling. Source/config pins
and existing runtime once-only behavior remain unchanged.

Implementation Contract:
- Artifact ID: host-reference-scoring-implementation@1.
- Upstream refs: fixed-reference-scoring@1; owner self-improvement requirements.
- Actual change boundary: shipped optional host grading adapter/CLI, existing
  native optional scoring output lanes and Eval Skill guidance.
- Verification attempted / evidence: source-bound software fixtures; actual
  private calculator validation is separate retained-data evidence.
- Selected proof: Formal host-reference-scoring@1 above.
- Handoff state: implementation in progress; no new model/Eval/owner action.

## Host operation

Select `report.scoringProvider:{kind:'external_host'}` in the ordinary native
profile. Do not also set referenceScoringCommand. Fixed source references still
need fixedScoring; binary-only native grading does not require a calculator.
Official configure derives the worker/settings/source pins without writing a
handoff or starting a provider. The private settings fragment is host setup,
not a case approval or a complete operational profile.

Use supervised scoring-request/scoring-claim/scoring-complete with the exact
--root, --profile and --config. Request output contains a pinned job_ref and
its grade_job_digest rather than duplicating a near-limit job. It is private
mediator input. The host AI reads it, prepares blind packets and retained reviews,
and supplies these bounded JSON shapes:

- Claim: handoff_digest, execution_id, provider, evidence_kind. Real host claims
  use host_reported and --allow-model-calls; synthetic software fixtures use
  synthetic and do not dispatch providers. A repeated claim never permits a new
  execution.
- Completion: handoff_digest, claim_digest, status (completed/failed),
  fixed_point_assessments and reference_assessments arrays of {path,digest}, and
  closure:{status,termination_confirmed:true,evidence_ref}. A failed completion
  carries empty reference lists. Host reporting does not prove authentication,
  independent review or evidence truth.

Parent-journal checkpoints are checked on ordinary resume, including cached
nested results. The raw result must equal the exact checkpointed completion;
separate known local transport failures retain their failure/Unknown meaning.
A lost/changed optional quality file does not revoke positive closure. Its pinned
reference is retained and the report importer records an incident/Unknown; it
never authorizes another model call or selects favorable replacement evidence.
