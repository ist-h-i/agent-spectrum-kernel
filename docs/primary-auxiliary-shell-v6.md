# Primary auxiliary read shell contract v6

Spec `SPEC-PRIMARY-AUX-SHELL-6`, revision 1. Upstream: #379, #395 and
`SPEC-PRIMARY-LITERAL-WORD-5@1`. This is an explicit saved-processing successor,
not execution, private scoring or adoption permission.

## Behavior delta and finite boundary

Select `1.9.0-primary-saved`, producer/scoring-version v6 and the saved-v6 schema
pair explicitly. Defaults and v1–v5 keep their rules and command-evidence wire
shape. Old schema bytes, fixed bundles, selectors and saved records are not
rewritten. A changed current source has a new source identity; it cannot repin
an old record or stand in for its own frozen runtime.

Public verification uses the unchanged v5 rule: an exact declared `/bin/bash`
with `[-lc]`, one finite literal argument, and byte-exact registered public body.
Keep the actual invocation digest and reconstructable literal trace. A public
body under zsh, Bash-c, different flags or a nested shell is not rescued as an
unmatched auxiliary operation, even if that public body itself is a read.

V6 auxiliary reads use a separate small grammar, without v2/v3/v4 inheritance:

| Form | Declared effect and target |
| --- | --- |
| `pwd` | Working-directory metadata only; never establishes cwd evidence. |
| `cat [--] FILE...` | Read exact public files. FILE is a portable relative word, optionally wholly single/double quoted, with exact manifest membership. No path normalization rescue. |
| `rg --files [-g FILTER]... [-- DIRECTORY]` | Enumerate paths at `.` or an exact parent directory of a declared public file. FILTER is a plain filename or a quoted finite filename glob; no `/`, expansion or negation. |

The outer envelope is exactly `/bin/zsh -lc` or `/bin/bash -lc`. Its one literal
argument is decoded as data, never shell-executed. The inner forms have literal
single-space separators. Paths use ASCII letters/digits/underscore/dot/slash/
hyphen; filters additionally admit quoted `*?{}[]`. There is no shell/flag
equivalence rule, recursive shell interpretation, `--hidden`, ls/find, unknown
option, unquoted glob, chained command, substitution, expansion, redirect or
unknown effect. Anything outside the grammar remains unavailable.

`auxiliaryReadInputManifest` supplies the exact raw public input-manifest bytes.
The parser checks their SHA256 against the validated command contract's
`fixture_input_digest`, selects its exact `fixture_id`, and checks unique portable
`task.md` / `workspace/**` paths. Producer derives these bytes from that fixed
public fixture and supplies the original canonical arm-root context on generation
and re-verification. A saved whole-tree inventory or caller path array cannot add
managed SKILL/AGENTS files. Caller context overrides remain refused.

This proves only classification of the recorded operation and target vocabulary.
Actual cwd, actor, startup/source-loaded behavior and filesystem access remain
Unknown. Auxiliary commands stay unmatched with a null authority literal trace.
No command string is run to validate this contract.

## Failure diagnosis

V6 `capture.failure_diagnostic` is null for an executed capture. Unavailable
captures can retain a closed reason and the observed one-based JSONL line,
closed event type, event-line digest, item-ID digest and actual invocation digest.
Event-line digest hashes the original valid UTF-8 line bytes excluding LF
(including CR if present); invocation digest hashes the event's actual command
string, never a canonical replacement. Unknown event type is null.

Whole-stream, context and EOF failures without a local event have null locators;
the last good event is not blamed. Raw message/stack, command, output and absolute
path text are not stored. An unavailable manifest still has zero command events
and `commands:[]`; diagnostics cannot supply a verification match or repair the
capture. V1–v5 do not acquire this field. Existing observation-only diagnostics
remain a separate way to retain partial facts.

## Acceptance and verification

- AC6-1: explicit selector/source/schema/producer v6 closes together; defaults,
  older semantics, golden command wires and immutable historical identities stay separate.
- AC6-2: public authority retains exact Bash-lc/body/digest/trace checks; wrong
  envelopes and forged witnesses cannot become auxiliary or matched authority.
- AC6-3: finite auxiliary syntax/effect/path positives pass as unmatched; expansion,
  added operations, unknown options, hidden traversal and external/aliased paths refuse.
- AC6-4: raw manifest digest/fixture/path/root context closes on producer generation
  and re-verification; auxiliary reads with missing context, changed supplied
  context and caller override refuse.
- AC6-5: observed refusal reason/location/digests close without raw disclosure or
  invented EOF location; unavailable retains no command authority.
- AC6-6: fresh artificial combined reads/edit/parallel literal checks/terminal
  reach producer, normalizer and isolated fake saved consumer. Failure exit1,
  fake numeric0, manual-null and partial/Unknown stay distinct.

Formal Verification Contract `FVC-PRIMARY-AUX-SHELL-6`, revision 1, upstream
`SPEC-PRIMARY-AUX-SHELL-6@1`; policy `ask.verification-proof-policy@1.0.0`.
Formal triggers: `public_api_schema_or_compatibility`,
`bug_reproduction_or_regression`,
`state_concurrency_persistence_lifecycle_or_cross_module`,
`multi_session_multi_agent_or_handoff` and `merge_release_or_stable_trace`.

| Obligation | Coverage and required evidence |
| --- | --- |
| O-GRAMMAR | AC6-2/3/4: independent artificial positive/negative script/path/context and wrong-envelope controls. |
| O-DIAG | AC6-5: exact observed reason/line/digests, unknown event privacy, null non-local locators and forged diagnostic controls. |
| O-CHAIN | AC6-2/4/6: combined producer/normalizer and fake saved consumer under both primary schema profiles. No real grading/model/provider. |
| O-VERSION | AC6-1/4/5: explicit source/version/schema closure, cross-version refusals, older regressions, generated schemas, repository validation and runtime freshness. Current HEAD evidence and unchanged historical Full/Core compatibility follow the two-context procedure in `FVC-PRIMARY-LITERAL-WORD-5@2`; all files changed by this PR must retain reviewed bytes in the historical context. Historical success is not current-source Core generation/adoption. |
| O-REVIEW | AC6-1..6: independent required gates, resolved blockers, Draft PR and terminal CI tied to exact reviewed head/tree. Parent owns Ready/merge. |

Implementation `IMPL-PRIMARY-AUX-SHELL-6`, revision 1, references that Spec/FVC.
Keep one existing event lifetime/edit owner; add only the v6 auxiliary branch,
public-manifest vocabulary and nullable failure diagnosis. No new framework,
scorer, ledger, real-input preparation or authority registry is introduced.

```sh
node --test scripts/test-ask-primary-auxiliary-shell-v6.mjs
node --experimental-test-module-mocks --test scripts/test-ask-primary-saved-scoring.mjs
node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v6 --check
```

These are artificial non-model controls. Real retained command content, v6
compatibility, quality, application/restore and admission remain unverified.
A real replay or scoring run needs a new direct human instruction naming its
reviewed source, exact inputs and fresh disjoint outputs. Do not infer missing
command text, reuse an old start mark, rewrite a frozen version or prepare an
entire retained collection to test this parser. This is partial progress for
the linked Issues, not their broad completion or permission to merge.
