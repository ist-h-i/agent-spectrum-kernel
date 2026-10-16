# Prospective primary evidence and public review recognition

Spec `SPEC-PRIMARY-EVIDENCE-RECOGNITION-2`, revision 2, references the authorized
ASK development continuation, #391 and #379. This is a prospective implementation,
not permission to start a comparison, a model, a provider or a private grader.
All examples and regression inputs in this change are newly authored synthetic
public data. No retained private response, hidden rule or answer is an input.

## Acceptance and scope

- `AC-RENDER`: opt-in `1.5.0-primary-saved` matches only a finite set of literal
  renderings generated from the public canonical script and its exact declared
  shell. Preserve the actual rendered digest. Do not equate shell executables,
  login flags, scripts or working directories. Ambiguous command IDs refuse.
- `AC-STREAM`: retain complete event pairing, ordering, terminal, exit-status,
  byte-limit and strict JSON checks. Bounded auxiliary reads remain unmatched;
  unknown, malformed, expanding or dangerous commands do not gain verification
  credit or disappear from the stream. This slice adds no partial-state schema.
- `AC-CONTEXT`: required runtime cwd evidence stays unavailable when the adapter
  does not expose it. A claimed cwd or command ID in an event or response does
  not substitute for the existing public command authority.
- `AC-VERSION`: parser 1.3/1.4, old primary schemas and default producer behavior
  remain unchanged. A new producer kind pins explicit 1.5 selection and derives
  it again during verification. Use separate additive schemas, not new condition
  aliases or changed frozen task/requirement/evaluator assets.
- `AC-PROSE`: a versioned public helper retains identifier punctuation such as
  `event.preventDefault()` and recognizes bounded observed-result statements
  beside unrelated explanation. Target-bearing unrecognized clauses, quotations,
  conditions, ambiguity and contradictions remain Unknown. Recognition is not
  scoring, source truth, authorization or independent evaluator admission.

The existing public target-requirement helper is a consumer seam, not the frozen
private review matcher. Synthetic consumer tests can verify its inputs and
Unknown behavior. Private consumer adoption, source closure, a separately fixed
processing/evaluator version and independent review/admission remain separate
work. No old evaluator or old score is rewritten by a public helper change.
Performance confidence and citation-contract failures are not converted to
success by this work.

## Explicit selection and remaining limits

The offline producer API accepts a third argument:

```js
producePrimaryEvaluationArtifacts(block, freshOutputRoot, {
  commandEvidenceParserRevision: '1.5.0-primary-saved',
});
```

The resulting `ask_primary_evaluation_producer_v2` record pins that revision;
verification reads the selector from the externally pinned record, not from an
unverified replay option. Omitting the argument retains producer v1/parser 1.4.
The two additive `primary[-k2]-saved-v2-portfolio-command-evidence` schemas are
selected only in that explicit scope. Generate/check them with
`node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v2 --check`.
Old schema generation and condition IDs stay unchanged.

The auxiliary grammar permits only `pwd`, `rg --files`, simple relative `cat`
and `ls` reads (and their bounded `&&`/`;` sequences). It is not a general shell
parser or safety classifier. An unsupported read, an unknown script or a true
integrity error still prevents a usable whole-stream manifest; no event is
silently discarded. A different shell/flag is retained as unmatched only when
its decoded body is exactly a declared public script. This does not establish
its cwd, equivalent semantics, authorization or safety.

Public review consumers explicitly use
`classifyTargetRequirement(text, target, { revision: '2' })` and
`classifyObservedVerification(text, subject, { revision: '2' })`.
Target aliases are literal bounded data; all qualifiers needed for a remedy
belong in the selected alias. Target-bearing unfamiliar clauses remain Unknown.
Targetless prose is not assumed irrelevant: only bounded source-structure counts,
source inspection notes and presentation-preservation instructions are accepted
as independent explanations. Other prefixes, corrections, conditions and quoted
blocks stay Unknown, including when separated from the target by a newline.
This intentionally leaves unsupported prose Unknown rather than inferring its
relationship to the recognized statement.
Observed-result recognition returns passed/failed/incomplete/unknown; it does
not decide whether the claim is true. The fake consumer test compares it with
an independently supplied artificial fact and rejects conflicting state labels.
Unrelated explanation handling does not validate the truth or citations of that
explanation. A future private consumer still owns those independent judgments.

## Verification Contract

- Artifact ID: `FVC-PRIMARY-EVIDENCE-RECOGNITION-2`, revision 2.
- Upstream: `SPEC-PRIMARY-EVIDENCE-RECOGNITION-2`, observed revision 2.
- Policy: `ask.verification-proof-policy@1.0.0`, formal path; triggers
  `bug_reproduction_or_regression`, `public_api_schema_or_compatibility`, and
  `multi_session_multi_agent_or_handoff`.
- `O-RENDER` -> AC-RENDER/CONTEXT: new artificial JSONL positives and negatives
  for quotes, shells, command IDs, cwd, auxiliary reads and unsafe suffixes.
- `O-STREAM` -> AC-STREAM: missing/duplicate/drifting/unterminated events,
  malformed JSON, expansions and contradictory exit status remain refused.
- `O-VERSION` -> AC-VERSION: synthetic producer -> saved manifest -> verifier ->
  normalized command projection; selector/digest substitution refuses. Existing
  parser/producer tests and byte checks protect old schemas and frozen assets.
- `O-PROSE` -> AC-PROSE: new artificial result/requirement statements, mixed
  explanation and dotted identifiers, plus false/ambiguous/adversarial controls.
- `O-REVIEW`: fresh independent code review, scoped repository/bundle checks and
  exact-head CI. Fake tests do not establish live runtime compatibility.
- Insufficient evidence: any failed obligation, unclosed processing identity or
  missing independent review; model effectiveness and private adoption Unknown.

Implementation `IMPL-PRIMARY-EVIDENCE-RECOGNITION-2`, revision 2, references this
Spec and Verification Contract. Executed evidence and remaining limitations are
recorded in the linked Draft PR; no new result ledger or scoring platform exists.
