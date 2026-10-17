# Primary saved command evidence v4

Spec: `SPEC-PRIMARY-COMMAND-EVIDENCE-4`, revision 2. Upstream: #379,
#395 and #397; the public parser/consumer contracts merged through #396/#398.
This is prospective public implementation and artificial verification. It
contains no retained response, private rubric, runtime log, or private identity.

## Problem and boundary

The existing finite saved-event parser cannot close some ordinary event
envelopes. A successful command appearing later in a stream cannot repair an
unexplained edit, missing process relationship, or unknown side effect. Fixing
one first rejection without checking the whole stream is insufficient.

Add explicit parser `1.7.0-primary-saved`, producer/scoring-version v4 and the
saved-v4 command schemas. Recognition remains revision 2. Carry the selection
through the existing source-only construction, sealed graph, producer,
normalizer, saved preparation and consumer; preserve their equality checks.
Defaults and v1/v2/v3 retain their existing meanings and fixed records.

No new scorer, generic state machine, authority registry or adoption decision
is introduced. Free-prose scoring, performance rubrics, private assets/admission,
real stream replay, model/CLI/provider calls, real grading, new comparisons,
old-run resume and Mac application are outside this change.

## Closed event contract

One explicit thread header followed by one turn header precedes item activity.
One turn completion follows all action completions. Reject duplicate/restarted
headers, cross-boundary pairs, trailing activity, duplicate IDs, item type drift,
reversed/missing starts or completions, malformed JSON/UTF-8 and stream loss.
An item ID identifies one lifetime; completion order need not equal start order.

`turn.completed.usage` may contain only the existing input/cached/output token
counters plus `cache_write_input_tokens` and `reasoning_output_tokens`. Supplied
values must be non-negative safe integers. These are inert telemetry, never
verification authority. Unknown fields or values remain unavailable.

File changes have matching `item.started`/`item.completed` records, an in-progress
start and completed end, and the same nonempty unique path/kind set. A change
must close to the existing fixture recipe's mutable paths and the complete
already-closed baseline-to-terminal snapshot delta (path and add/update/delete
kind). Observed closed changes must cover that delta exactly once; an unexplained
changed path, repeated edit of one path or net-zero transient history remains
outside this finite scope. A workspace-relative
path may match directly. An absolute path may match only below the exact
retained arm root derived by the existing producer from its closed source;
caller-provided path aliases, suffix matching and filesystem inference cannot
create authority. The pure parser's supplied context is not admission authority.

All changes must finish while no command is active and before any declared
verification invocation starts (including a failed, declined or cwd-unverified
invocation). A command cannot start during an unfinished edit. A change during
or after verification invalidates the whole capture, including earlier success.
Evidence/output writes, out-of-scope paths and unknown mutation tools do not
become candidate edits. There is no partial success salvage after an unexplained
action; the original raw source remains available for separate diagnosis.

Commands pair by stable item ID and identical invocation bytes. Bounded read
commands have no verification authority. Exact public verification renderings
retain their own declared IDs, status and exit code; output prose and claimed
IDs/cwd cannot supply them. Parallel bounded reads and distinct declared checks
may interleave and complete in either order when no edit is active. Overlapping
invocations of the same public verification command remain unavailable because
the existing latest-outcome rule cannot establish their precedence. Later serial
failure/decline continues to override an earlier success.

Only a finite, documented auxiliary-read grammar is retainable. Arbitrary
scripts, loops, heredocs, substitutions, writes and opaque tools remain outside
the supported capture. Unsupported syntax, unsafe operations and malformed
association get distinct unavailable reasons; none is converted into success.
Runtime-observed cwd requirements remain Unknown when the source cannot prove
them. The complete stream must close before any command evidence is projected.

The retained read grammar is `pwd`; `cat` with literal relative path words;
`ls` with an optional one or two `a`/`l` flags and literal relative path words;
`find . -name AGENTS.md -print`; and `rg --files` with optional `--hidden`,
zero or more `-g` literal filters and an optional `--` followed by one relative
path. Filters containing glob metacharacters must be quoted; the finite filter
alphabet is letters, digits, underscore, dot, slash, `!`, `*`, `?`, braces,
brackets and hyphen. These forms can be joined by `&&` or `;`. Traversal,
absolute paths, expansion and extra options remain unavailable. The outer
shell envelope is still one literal word; these strings are never executed by
the parser. This grammar cannot establish a declared verification ID.

## Acceptance and artificial cases

- `AC4-1` selection: exact v4/parser/schema/source agreement through existing
  source-only and sealed constructors; mixed/overridden versions refuse; old
  explicit versions and defaults retain their behavior.
- `AC4-2` combined success: independent artificial headers, overlapping reads,
  matching scoped edit pair, interleaved distinct checks and extended usage
  reach producer, normalizer and existing consumer with genuine declared
  success references. Use newly authored content, generic IDs and generated
  synthetic paths; never transform or replay a real raw stream.
- `AC4-3` outcomes: failed/declined checks, a later serial failure, absent checks,
  fake success output/claimed IDs/cwd, manual/Unknown and partial consumer results
  remain distinct. Unknown never supplies numeric success.
- `AC4-4` associations: valid completion permutations retain their own IDs.
  Duplicate/reused/type-switched IDs, missing action ends, completion without start, overlapping same check,
  thread/turn restarts, repeated terminal, activity after terminal and unfinished
  edits refuse with a stable reason.
- `AC4-5` mutation: unbound/absolute-outside/traversal/symlink-like aliases,
  start/end path or kind drift, evidence writes, hidden writes in opaque or inert
  items, edits during a command or after verification, and unknown side effects
  invalidate the capture. A later successful check does not cure them.
- `AC4-6` representation: malformed/duplicate-key JSON, bad/truncated UTF-8,
  missing newline, invalid usage types/counters and unknown fields fail closed.
  Supported telemetry and relative/anchored path forms have positive controls.

Each boundary gets an isolated control and participates in the combined stream.
The producer/normalizer tests use the existing independent synthetic source
helper; the saved consumer uses fake grading only. No private evaluator, model,
provider or real saved input runs. A synthetic success establishes only this
finite public contract, not compatibility with every runtime or real answer.

## Formal Verification Contract

`FVC-PRIMARY-COMMAND-EVIDENCE-4`, revision 2, references this Spec revision 2.
Policy: `ask.verification-proof-policy@1.0.0`, formal path. Selection evidence:
the new explicit schema/version, command/edit lifetimes, cross-module consumer
connection and independent handoff activate `public_api_schema_or_compatibility`,
`state_concurrency_persistence_lifecycle_or_cross_module`,
`bug_reproduction_or_regression`, `multi_session_multi_agent_or_handoff` and
`multiple_specialized_checks` from the canonical policy vocabulary.

- `O-EVENT`: RED artificial combined stream on the old implementation, then
  positive/negative finite parser and projection controls for AC4-2/3/4/5/6.
- `O-CHAIN`: synthetic editing-to-verification producer/normalizer roundtrip,
  original-adapter preparation with zero dispatch, fake consumer with retained
  numeric/manual/partial states and repeat/concurrency refusal.
- `O-VERSION`: finite v4 selector, exact source/schema closure and actual static
  writer controls; old version regressions and mixed-version refusal.
- `O-REVIEW`: appropriate local tests, generated-schema check, repository and
  core-bundle validators, independent review with findings resolved, and
  terminal CI for the final PR head.

Verification commands and results belong in the PR/handoff. Real replay/grading,
private acceptance/admission and exhaustive runtime compatibility stay outside
the proof. The Draft PR references partial #379 progress; it does not close that
Issue or authorize Ready, merge, a new real run or reinterpretation of old data.

## Human one-shot handoff

Use the existing [saved processing handoff](primary-saved-scoring-processing-v3.md#human-one-shot-handoff)
and [configuration contract](primary-saved-scoring-processing-v2.md), selecting
parser `1.7.0-primary-saved`, a new `ask_primary_scoring_version_v4` identity and
the saved-v4 schemas throughout. Record the reviewed implementation commit/tree,
fresh source closure and all nine fixture/resource pins. Independent private
review, acceptance and admission must bind those exact new bytes. Selection
cannot upgrade old or pending admission.

Bind the original readonly retained export and both role resource files by raw
digest, with fresh disjoint outputs. The existing prepare-only command is:

```sh
node scripts/ask-primary-saved-scoring.mjs prepare /canonical/new-v4-input/config.json /canonical/new-v4-preparation
```

Retain its returned output root and external digest, then reopen with
`verifyPrimarySavedScoringPreparation` from the pinned implementation. Inspect
all nine paired bindings, processing/schema pins and every resource preflight.
Stop on a changed digest, unclosed source, blocked preflight or an existing or
overlapping output. Keep missing evidence Unknown and preserve useful partial
results. Use new inputs and destinations to resolve a blocker; never rewrite or
resume an old record.

Real raw replay and actual grading remain separate future operations. The user
must directly authorize Codex for the exact new preparation/digest, scope and
fresh destinations before invoking `gradePreparedPrimarySavedScoring`. No such
operation is part of this implementation or its artificial proof.

Implementation `IMPL-PRIMARY-COMMAND-EVIDENCE-4`, revision 1, references
`SPEC-PRIMARY-COMMAND-EVIDENCE-4@2` and `FVC-PRIMARY-COMMAND-EVIDENCE-4@2`.
Executed evidence and review/CI results belong in the linked PR and handoff.
