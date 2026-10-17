# Primary saved literal command words v5

Spec: `SPEC-PRIMARY-LITERAL-WORD-5`, revision 1. Upstream: #379 and the explicit same-Bash-lc implementation request; inherits the event/edit contract from `SPEC-PRIMARY-COMMAND-EVIDENCE-4@2`.

## Behavior delta

Select parser `1.8.0-primary-saved`, producer/scoring-version v5 and the saved-v5 command schemas explicitly. Defaults and explicit v1/v2/v3/v4 retain their behavior and fixed records.

An invocation in the exact declared `/bin/bash -lc` envelope may spell its one argument by concatenating finite single-quoted, double-quoted and literal segments. Decode that word without executing or evaluating it. Only the complete restored script equal to one existing public command can establish that command's authority. Preserve the actual rendered invocation digest. Do not normalize script whitespace, Unicode, command ordering or trailing bytes; do not infer cwd.

No shell/flag equivalence, nested shell, new auxiliary-read family, external absolute read or unknown mutation is added. Expansions, substitutions, unquoted shell operators, redirections, extra words/commands, malformed quoting and NUL remain unavailable. Literal characters protected by quoting/escaping are distinct from expansion. Double-quote escape rules preserve backslashes before non-special characters. Invalid UTF-8 remains rejected by the complete stream reader. Failure exit1 stays failure evidence.

V5 requires the exact Bash-lc envelope for auxiliary reads too; another shell
or flag invalidates the whole capture. V4's older unmatched-read behavior stays
under v4. An explicitly declared direct-argv command keeps its existing exact
authority and carries no literal-word trace.

## Acceptance criteria

- AC5-1: independently authored literal spellings with quote concatenation, exclamation, spaces, escapes and Unicode restore exactly the registered public body under the same Bash-lc envelope; changed characters, whitespace or trailing body bytes cannot match.
- AC5-2: expansion/substitution/redirect/extra command or word, malformed/incomplete quoting, invalid UTF-8, different shell/flags and nested shell retain reasoned whole-capture unavailable evidence. External SKILL reads and unexplained changes remain outside this slice.
- AC5-3: a combined artificial stream has headers, finite reads, a matching edit pair and complete scoped snapshot delta, two distinct concurrent checks and terminal usage. Item IDs/lifetimes remain paired; post-verification editing invalidates the capture. A failed check with exit1 never becomes success.
- AC5-4: the artificial representative reaches the existing producer, normalizer and saved consumer with genuine normalized command evidence references. Fake grading only; numeric0/manual-null and partial/Unknown remain distinct. No production callback or fake resource becomes execution authority.
- AC5-5: declared-body, literal spelling, rendered digest, evidence identity and processing/source/schema bindings close together. A forged or changed witness/digest/body/ID and mixed processing versions refuse.
- AC5-6: explicit older parser/schema/producer/scoring selectors and default behavior preserve their existing semantics and bytes where promised.
- AC5-7: tests contain newly authored artificial content, generic event/stream identities and public fixture contracts only. No retained raw, real answer, private rubric, private asset copy, real grading, model/CLI/provider, Mac application or old-run reuse occurs.

## Formal Verification Contract

`FVC-PRIMARY-LITERAL-WORD-5`, revision1, upstream `SPEC-PRIMARY-LITERAL-WORD-5@1`; policy `ask.verification-proof-policy@1.0.0`, formal triggers `public_api_schema_or_compatibility`, `state_concurrency_persistence_lifecycle_or_cross_module`, `bug_reproduction_or_regression`, `multi_session_multi_agent_or_handoff`, `multiple_specialized_checks`.

- O-WORD supports AC5-1/2: RED before implementation, then exact positive/negative finite-word and invalid-byte controls with no shell/eval invocation.
- O-AUTH supports AC5-1/5/7: independent rendered-digest/body/witness forgery controls and explicit privacy/schema checks; no opaque authority assertion.
- O-CHAIN supports AC5-3/4: combined artificial producer-normalizer roundtrip and isolated fake saved consumer preserve references, success/failure1 and Unknown/partial outcomes.
- O-VERSION supports AC5-5/6: explicit selection/source-only graph/schema closure, cross-version refusal, old focused regressions, generated schemas, repository/core-bundle validation and required CI.
- O-REVIEW supports AC5-1..7: independent review with observed required gates, resolved blocking findings, Draft PR and terminal CI on its exact head. Parent owns Ready/merge.

## Implementation decision to review

`IMPL-PRIMARY-LITERAL-WORD-5`, revision1, upstream Spec/FVC above. Keep one finite word parser shared by runtime classification and manifest validation. A v5-only nullable `literal_word_encoding` is a closed grammar trace, not raw command text. Trace alphabet: `l` copies one Unicode code point from the already public registered script, `e` prefixes its next point with a backslash, `n` encodes an escaped newline, and `s`/`d` encode single/double quote delimiters. Reconstruction must consume the entire public body, reparse to the same body and trace, and reproduce the actual rendered digest in the exact Bash-lc envelope. Unmatched auxiliary commands retain null. This preserves `privacy.raw_command_stored=false` and avoids a new authority registry or reinterpretation of the rendered digest field. The trace and source are evidence, never standalone admission or execution permission.

Public follow-up exclusions remain shell/flag variants, nested shells, broader reads, external instruction reads and command-contained writes without the existing edit/delta proof. Artificial compatibility does not prove retained-runtime compatibility or semantic scoring.

## Artificial verification and human handoff

The representative uses the existing public build-option contract, freshly
authored event IDs and spellings, an artificial candidate edit and the matching
baseline/terminal delta. Two distinct checks overlap and complete in reverse
order. The producer and normalizer retain their real evidence references; the
saved consumer's grading factory is mocked in its isolated test process.
Fake numeric zero, manual-null, failure exit1 and partial results exercise
transport only. They supply no semantic score, admission or adoption claim.

Run these non-model controls from the reviewed checkout:

```sh
node --test scripts/test-ask-primary-command-literal-word-v5.mjs
node --experimental-test-module-mocks --test scripts/test-ask-primary-saved-scoring.mjs
node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v5 --check
```

Explicit v5 selects `1.8.0-primary-saved`, `ask_primary_evaluation_producer_v5`,
`ask_primary_scoring_version_v5` and the two saved-v5 schemas. Recognition
stays at revision 2. The processing descriptor pins the command parser, public
recognition helper and exactly those schema bytes. The existing source-only
constructor and static writers preserve their distinction between resource
construction and accepted/admitted execution authority.

For a future real one-shot, follow the existing
[saved processing handoff](primary-saved-scoring-processing-v3.md#human-one-shot-handoff)
with these v5 selectors and a fresh identity. A human must first name the
reviewed commit/tree, exact readonly input and resource pins, fresh disjoint
output roots and the intended operation in a new direct instruction. Fresh
private source construction, independent review, acceptance/admission and any
retained-input replay or real grading need their own explicit scope. A public
code change or artificial test does not upgrade old or pending resources.
Do not reuse a historical start mark or prepare a full retained collection
merely to test this parser.

| Remaining form | v5 result / next boundary |
| --- | --- |
| Same declared Bash-lc, one finite literal word, exact body | Supported by artificial controls; real retained compatibility remains Unknown. |
| Bash-c, zsh-lc or different flags | No verification authority; requires a separate envelope contract. |
| Nested shell | Unavailable; no recursive shell interpretation. |
| External instruction/SKILL read | Unavailable; no new read authority. |
| Unexplained change, unknown operation or edit after a check | Whole capture unavailable; a later success cannot repair it. |
| Missing cwd, semantic quality or private admission | Unknown or blocked under the existing owner; never inferred from quoting equivalence. |

This is partial #379 progress. It does not close the broad personal-evolution
Issue, reinterpret earlier comparisons or authorize Ready/merge or a real run.
