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

`FVC-PRIMARY-LITERAL-WORD-5`, revision2, upstream `SPEC-PRIMARY-LITERAL-WORD-5@1`; policy `ask.verification-proof-policy@1.0.0`, formal triggers `public_api_schema_or_compatibility`, `state_concurrency_persistence_lifecycle_or_cross_module`, `bug_reproduction_or_regression`, `multi_session_multi_agent_or_handoff`, `multiple_specialized_checks`.

- O-WORD supports AC5-1/2: RED before implementation, then exact positive/negative finite-word and invalid-byte controls with no shell/eval invocation.
- O-AUTH supports AC5-1/5/7: independent rendered-digest/body/witness forgery controls and explicit privacy/schema checks; no opaque authority assertion.
- O-CHAIN supports AC5-3/4: combined artificial producer-normalizer roundtrip and isolated fake saved consumer preserve references, success/failure1 and Unknown/partial outcomes.
- O-VERSION supports AC5-5/6: current-HEAD explicit selection/source-only graph/schema closure, producer/normalizer/fake saved consumer, cross-version refusal, old focused regressions, generated schemas, repository validation and adapter-runtime freshness; immutable Full/Core product compatibility in the existing digest-verified historical context; required CI on the exact PR head. Bind the two contexts as specified below.
- O-REVIEW supports AC5-1..7: independent review with observed required gates, resolved blocking findings, Draft PR and terminal CI on its exact head. Parent owns Ready/merge.

### O-VERSION contexts and evidence

Revision2 clarifies revision1's ambiguous `repository/core-bundle validation`
phrase under the FVC owner's decision on 2026-10-17. It applies the existing
PR330 boundary, introduced at `d4ad39ead0f13965aeaf5aa919ef35f830a50e26`:
[local-eval CI](../.github/workflows/local-eval.yml) treats immutable Full/Core
as historical compatibility and validates the current distribution separately.
The [Core product contract](ask-core-bundle-implementation.md#product-and-reuse-boundary)
retains the original Full inventories and exact source pins. This revision
keeps the generator, assertions, tests and failed observations; it changes no
manifest, product identity, source hash, guard or skip policy.

| Context | Required checks and binding |
| --- | --- |
| Current PR HEAD | Run the explicit v5 selector/source/schema/producer/normalizer/fake saved-consumer and older-version regressions, repository validator and adapter-runtime freshness from the clean reviewed checkout. Bind each command/exit and source inventory to that HEAD/tree; historical overlays cannot supply this evidence. |
| Immutable Full/Core compatibility | Use the unchanged `scripts/prepare-historical-full-test-root.mjs` from that clean HEAD, with the two unchanged inventories below. Bind their raw digests and declared source commits, caller HEAD/tree, context commit/parent/tree, expected and observed changed/deleted paths, and actual generator/test command/exits. Every PR400 changed file must retain its caller bytes in the context. |

The historical inputs are `docs/mac-ask-full-static-inventory.json`
(`sha256:3634c9ef3801067636d990a63f1793c268390ccb4012a1e2f1c4ac2e5b566bed`,
source `f65a24c910135f160cfdec0bb35f9c6546d563de`) and
`docs/mac-ask-full-reference-supplement.json`
(`sha256:466da3374a9d2311a335ebf7113288dccd1d1c25c9a5b9e278f4d03e61a05b5f`,
source `b68dc5d168f16a495e9f9eea85bbfa863e8abbae`). Verify the complete
declared source set against those Git blobs. Only exact sealed source overlays
and selected Skill assets absent from that set may change in the new context.
Compare the actual context delta with this expected set and retain the caller's
clean HEAD/status. Confirm the frozen inventories, Core product/builders,
historical helper/test and local-eval workflow are unchanged by this PR.

In the resulting context run `node scripts/generate-ask-core-bundle.mjs --check`
and `node --test scripts/test-ask-core-bundle.mjs`. Retain the local context
identity/delta and command exits; record clean context status and unchanged
commit/tree before and after each command. Link PR-event-head CI run/job/step observations
for the unchanged historical preparation and Core checks, separately from the
current-HEAD checks. Record the actual checkout commit/tree/parents separately
from the PR event head and historical context parent. For a synthetic PR merge
checkout, show its parent mapping to the reviewed PR head and identical reviewed
tree/helper/input bytes; do not require the two commit IDs to be identical.
A local context ID is not a claimed CI context ID. Any context identity not
emitted by CI remains unobserved; the unchanged helper's parent/source assertions
and the observed checkout mapping bind that CI execution's construction contract.

The earlier direct current-checkout command's exit1/`legacy_full_source_drift`
on the PR and base is retained as failed history. The guard correctly refuses
current-development bytes against an immutable product. Historical compatibility
success does not turn that command into a pass, establish Core generation from
the current checkout, adopt v5 into the Core product, or grant runtime/grading
admission. A new current-source product would require its own reviewed version
and source identity. F-V5-BUNDLE-PROOF remains unresolved until revision2's
evidence and independent review are complete; Ready/merge remains with the parent.

## Implementation decision to review

`IMPL-PRIMARY-LITERAL-WORD-5`, revision2, upstream `SPEC-PRIMARY-LITERAL-WORD-5@1` and `FVC-PRIMARY-LITERAL-WORD-5@2`. Revision2 changes the verification-context declaration only; the implementation bytes and behavior below remain unchanged. Keep one finite word parser shared by runtime classification and manifest validation. A v5-only nullable `literal_word_encoding` is a closed grammar trace, not raw command text. Trace alphabet: `l` copies one Unicode code point from the already public registered script, `e` prefixes its next point with a backslash, `n` encodes an escaped newline, and `s`/`d` encode single/double quote delimiters. Reconstruction must consume the entire public body, reparse to the same body and trace, and reproduce the actual rendered digest in the exact Bash-lc envelope. Unmatched auxiliary commands retain null. This preserves `privacy.raw_command_stored=false` and avoids a new authority registry or reinterpretation of the rendered digest field. The trace and source are evidence, never standalone admission or execution permission.

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
