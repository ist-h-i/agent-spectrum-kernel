# Primary command evidence processing v3

Spec `PRIMARY-COMMAND-EVIDENCE-3`, revision 3. Upstream: [#395](https://github.com/ist-h-i/agent-spectrum-kernel/issues/395), limited evidence connection for [#379](https://github.com/ist-h-i/agent-spectrum-kernel/issues/379).

## Observable contract

The explicitly selected `1.6.0-primary-saved` parser retains an independently
declared verification invocation across a finite set of auxiliary reads. It
uses the existing command manifest, primary producer and normalizer. Default,
1.4 and 1.5 parsing retain their existing behavior. A new `producer_v3` record
pins its parser and source/schema bytes through the existing producer inventory.
The option is prospective: a fixed v2 scoring selector remains fixed to 1.5 and
refuses a 1.6 override. This change does not introduce a new fixed grading selector.
Original source-pinned records still require their original implementation;
legacy parser compatibility does not bypass an old record's source digest.

The evidence unit is a unique runtime item with matching start and completion
events, exact public command authority, and a consistent terminal status/exit.
Public command ID, shell/envelope, script and required cwd evidence are not
inferred from prose, output, an auxiliary operation, or a caller-supplied ID.
Failure and decline remain distinct from success. Missing required invocations
remain unavailable. An explicitly required but unobserved cwd stays unverified.

Auxiliary reads are retainable only in a closed, syntactically read-only
grammar: the existing bounded reads, a literal unquoted `pwd`, bounded
`rg --files -g <filename>` filters, and `find . -name AGENTS.md -print`.
They remain `unmatched` and never satisfy a verification requirement. This
grammar is recognition of saved event text, not shell execution or proof of
the contents read. Unknown command meaning is not evidence of safe reading.

The surrounding stream must be complete and unambiguous. A dangerous or
writing auxiliary command, unknown relationship, malformed/expanding envelope,
event drop, missing/duplicate/reversed/drifting association, or overlapping
command execution makes capture unavailable with its reason. Do not salvage a
passing check from such a stream. Existing unavailable manifests keep zero
records; no partial-manifest or generic execution-state framework is added.
V3 also requires lossless UTF8 decoding before parsing JSON, so distinct invalid
raw item IDs cannot collapse into the same replacement-character ID. Such a
stream is unavailable with `malformed_jsonl`; valid Unicode IDs remain valid.
Unlike v2, an exact declared body under a different shell/envelope cannot be
retained unless it independently qualifies as a bounded read. Known script
bytes alone do not establish an independent invocation's semantics or effects.

V3 also checks non-command event meaning. Only closed known metadata/message
forms are accepted; opaque tools and unknown event/item variants are unavailable.
Optional thread/turn start headers must precede all item activity and may appear
only once, with thread before turn when both exist. A duplicate or late header
cannot silently change an item's association namespace and makes capture
unavailable with `unsupported_event`.
A completed file-change notification is accepted only before the first declared
verification **start**, outside any active command, and for an exact canonical
fixture-relative path in the existing public recipe's mutable paths. This
includes the `workspace/` prefix: absolute paths, basename/suffix matching and
inferred cwd mappings are not accepted. The producer obtains this scope from
`buildPrimaryFixtureRecipe` and rederives it; callers cannot override it. The
low-level parser defaults to no permitted changes when no context is supplied.
Failed/declined/cwd-unverified checks also close the editing boundary. Evidence
or authority writes, edits after verification, failed/ambiguous edits and opaque
side effects make the whole capture unavailable, even if the final snapshot
restores the earlier bytes. No new operation ledger is introduced.

Select prospectively with
`producePrimaryEvaluationArtifacts(block, freshOutputRoot, { commandEvidenceParserRevision: '1.6.0-primary-saved' })`.
The externally pinned `ask_primary_evaluation_producer_v3` record selects the
revision again during verification. Scope selects one of the two additive
`primary[-k2]-saved-v3-portfolio-command-evidence` schemas. Check their generated
bytes with `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v3 --check`.
An auxiliary record's `unmatched` state and null command ID express its lack of
verification authority. Refused streams use the existing closed
`capture_invalid:<code>` reason; v3 adds `missing_command`,
`overlapping_commands`, `unsupported_event` and `unverified_file_change`
reasons. It does not add per-record unavailable fields.

## Acceptance items

- AC1: a synthetic declared check before or after each newly supported read
  reaches the existing normalized command inventory with its exact command ID.
- AC2: success, nonzero failure, decline, missing check and unobserved required
  cwd remain distinct. Auxiliary status/text/claimed command IDs confer no credit.
- AC3: malformed envelopes, expansion, evidence writes, dangerous/unrelated
  commands, non-command side effects and forged prose cannot produce unsupported
  verification success. Only public-scope task edits before verification start
  can be retained; transient restored evidence writes remain unavailable.
- AC4: incomplete/duplicate/drifting/reversed/overlapping events, restarted or
  late thread/turn headers, and malformed or truncated streams remain unavailable
  with a bounded reason.
- AC5: v3 is explicit through producer/schema selection and source pins;
  mismatched fixed selectors fail. Existing default/v1/v2 behavior remains covered.
- AC6: a public artificial `mn-doc-config-correction` fake-runner roundtrip
  reaches command evidence and normalization without model/provider/grader calls.

## Verification Contract

- Artifact ID: `VC-PRIMARY-COMMAND-EVIDENCE-3`, revision 3.
- Artifact type: verification.
- Upstream refs: `PRIMARY-COMMAND-EVIDENCE-3@3`, AC1–AC6; #395.
- Selected path: `formal_verification_contract` under
  `ask.verification-proof-policy@1.0.0`; triggers
  `bug_reproduction_or_regression`, `public_api_schema_or_compatibility`, and
  `multi_session_multi_agent_or_handoff`.
- Focused checks: the new artificial v3 parser/producer/normalizer suite,
  existing command-evidence and primary recognition/producer/profile suites.
- Broader checks: processing descriptor/source-graph, saved preparation,
  generated schemas, repository validator and required CI jobs.
- Evidence required: failing reproduction before implementation; passing
  acceptance/negative/legacy cases afterward; independent review of final head;
  completed exact-head CI. Record exact commands/results in the delivery record.
- Insufficient evidence: unexecuted or failed checks, source/profile mismatch,
  unresolved review findings, incomplete CI, or an unobserved runtime property.

## Operational boundary

Public verification uses independent artificial events and fake execution only.
It neither reprocesses an existing saved session nor changes fixed task inputs,
grading criteria, private assets, CAS, admission, consumption records or scores.
No model, real Codex CLI/provider, comparison, grading/regrading or live target
operation is authorized by this processing selection. Operational compatibility
and any future use on saved evidence require their separate authorized step.
