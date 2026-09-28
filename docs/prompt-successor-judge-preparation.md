# Judge qualification and native capture preparation

## Decision and scope

This is a source/config revision for Issue #291 before measurement. It adds a
reproducible qualification assessment and exact pre-result bindings, not a live
Judge authorization. `runJudgeSlots` and `runJudgeQualification` still reject
live transport. `openSuccessorMeasuredAuthority` still rejects a real runtime.
No evidence flag, fake adapter, inspected trace, or matching label report opens
those gates.

The repository execution config now references the four existing calibration
verification-command contracts by path and SHA-256. Their contents, shared
fixture inputs, Prompt roles, repetitions, scoring policy and historical commits
are unchanged. A new source/config freeze and reviewed admission are required;
existing external admissions and run namespaces are not updated by this change.
The positive integration test consumes those submitted references rather than
repairing the config in its disposable clone.

## Qualification lifecycle

`ask-benchmark-judge-qualification.mjs` exports four lifecycle operations and a
fixture-set binding operation. All files belong in an external private store.
Use a different store from measured-output judging; qualification requests and
budgets must never consume measured sample slots. The labelled corpus, packet
bytes, protocol and entire request roster are sealed together before any sample
binding exists. Sealing and slot reservation use the same ledger lock.

1. `sealJudgeQualification({storeRoot, protocol, samples, labelSource})` freezes
   the complete inventory. Each sample supplies `fixture_id`, `case_class`,
   `packet` and one expected verdict for every protocol criterion. Its count
   must equal the separately budgeted protocol `max_samples`. Changing labels,
   source data or requests requires a new protocol/store; it cannot continue
   inside the old namespace. Late sealing and unlisted requests fail closed.
2. `runJudgeQualification({storeRoot, planDigest, adapter})` uses the existing
   A/B once-only runner. Only synthetic adapters are currently supported. Labels
   and sample classes are not passed to the adapter. A durable claim is never
   retried, and disagreement never adds a third slot.
3. `reopenJudgeQualification({storeRoot, planDigest})` reads and rederives the
   entire report without an adapter or a model call. Every sample and criterion
   stays in the denominator. It distinguishes decisive matches, explicit
   matching abstentions, false passes, false fails, disagreement, invalid or
   incomplete responses, and unstarted samples. Reused session IDs, including
   reuse across samples, cannot qualify as a match. PID equality alone across
   samples is not used as a reuse test because an OS can reuse process IDs.
   A missing sample binding is `not_run` only when no sample evidence remains.
   Orphaned claim/start/receipt/block files and malformed bindings stop reopening
   and execution without recreating the binding or making another call.
4. `bindJudgeQualificationForFreeze(...)` compares exact plan, report, protocol,
   source, runtime-profile and target-manifest identities with saved evidence.
   `bindJudgeQualificationSet(...)` additionally requires every semantic fixture,
   its exact criterion inventory, current instruction bytes, all six case
   classes, and samples belonging to that fixture.

The default case classes are `paraphrase`, `contradiction`, `missing_content`,
`unsupported_claim`, `prompt_injection` and `uncertain`. Coverage counts are
reported even when zero. `all_expected_matched` means only that all frozen labels
matched and the requested classes were present. It is not a statistically chosen
accuracy threshold, proof of generalization, or approval of the label meanings.
A decisive answer where the label is `abstain` is counted as a false pass or
false fail, according to the returned verdict. Missing or invalid output is
never a correct abstention. A budget or global stop before either slot is
claimed leaves that sample `not_run`; an existing claim without a receipt
remains `invalid_or_incomplete`, not `not_run`. Both stay in the denominator.

`labelSource.kind = independent_candidate` requires source and review digests,
but those strings do not authenticate the reviewer. Reports deliberately retain
`label_review_verified: false`, `live_qualification_established: false`, and
`measurement_authorized: false`. There is no per-output human grading loop in
this assessment. Independent approval of the labelled corpus and the evaluation
contract remains a separate pre-result authority requirement.

## Freeze and provenance integration

`openSuccessorMeasuredAuthority` accepts optional `judgeQualifications`, keyed by
the two semantic fixture IDs. Each entry has `storeRoot`, `planDigest` and
`reportDigest`. Expectations are derived from the verified scoring-input handle,
target manifest and repository Judge instruction, not supplied by a result
caller. Qualification stores must be within each native source's private deny
root. The freeze stores their exact bindings, and every authority re-open
reverifies them. Omitting previously bound evidence or changing stored evidence
rejects the re-open. Result provenance checks the Judge protocol against that
fixture's frozen qualified protocol before reopening its resolution.

Qualified synthetic authority evidence is version `1.2.0`. Historical synthetic
freezes without this optional evidence retain version `1.1.0` and their exact
shape. Neither branch admits a real runtime. The newly added option is exercised
through the actual synthetic admission/freeze path, not a mock authority handle.
No host preflight CLI accepts this as permission to start live measurement.

## Native interface and capture inspection

`ask-benchmark-judge-native-capture.mjs` provides bounded inspection only:

- `inspectNativeJudgeCli` pins a regular native executable's bytes and version,
  then runs only `--version` and `exec --help` with an empty temporary HOME and
  CODEX_HOME, an explicit minimal environment, no shell and no credentials. It
  reports advertised flags and output digests. Help text is not proof that
  tools are unavailable in a model session.
- `inspectNativeJudgeCapture` checks an external JSONL/session/final-response
  capture against one ordered completed turn, exact model/provider/version/cwd,
  read-only/no-network/never-approve policy records and the existing closed Judge
  response parser. Tool or unknown events, contradictory session messages,
  incomplete items, duplicate keys, invalid UTF-8, altered final bytes and
  incomplete process state are rejected. Exactly one assistant response item
  and one matching final-message event must occur after the turn starts and
  after its context, and before completion. A missing, duplicate or pre-turn
  response item is not accepted. Either ordering of the response item and
  final-message event is accepted within those boundaries. Usage uses the existing successor
  parser and preserves unknown values.

This parser recognizes an explicitly bounded event shape. It is not verified
against the target host's actual Codex version. Captured bytes are caller input;
structural validation does not authenticate their origin or prove runtime tool
isolation. Inspection results cannot be supplied as native ledger receipts and
always deny transport and measurement authorization.

## Formal Verification Contract

ID: `FVC-313-JUDGE-PREPARATION-20260928`.
Upstream: Issue #291, PR #313 at `9906f23c`, F313-01..03, and the checked-in Judge,
scoring, admission and execution contracts. The separately referenced
`03-AC-AND-TESTS.md` was not available in this continuation; this contract does
not claim certification against its unseen content.

| AC | Executable proof |
|---|---|
| Q1: Entire labelled/request inventory is fixed before claims, rejects drift and late sealing. | qualification suite: sealing, lock, transplant and private-root controls |
| Q2: Existing once-only A/B execution; no labels in adapter arguments; read-only reopening. | qualification suite: full run/reopen, disagreement, ambiguous/invalid response controls |
| Q3: Full denominator, absent coverage and errors remain visible; no admission manufactured. | qualification suite: error classification, missing coverage, unknown tokens, session reuse |
| Q4: Exact fixture/protocol/source/runtime/target/report freeze bindings; no downgrade on reopen. | qualification binding suite and actual pre-trial freeze integration mode |
| N1: Pinned native-interface inspection uses only model-free commands without credentials. | compiled native fake inspection test; target-host inspection remains unrun |
| N2: Captured response, ordered session and usage are checked; no origin/isolation claim. | native capture suite with tool, drift, byte and process controls |
| C1: Submitted config binds the four existing command contracts. | calibration source suite and positive integration preparation |
| R1: Existing failure, safety and causal-command gates remain intact; live gate stays closed. | existing focused Judge/derived-result suites and full synthetic scoring regression |

Focused source tests:

```sh
node --test scripts/test-ask-benchmark-judge-qualification.mjs \
  scripts/test-ask-benchmark-judge-native-capture.mjs \
  scripts/test-ask-benchmark-llm-judge.mjs \
  scripts/test-ask-benchmark-judge-derived-result.mjs \
  scripts/test-ask-benchmark-calibration-source.mjs
```

Actual pre-trial integration without the 28 synthetic trials:

```sh
node scripts/test-ask-benchmark-prompt-successor-scoring.mjs --qualification-freeze-only
```

This mode executes the actual synthetic private admission, a separate fake host
diagnostic, 24 scripted qualification calls, and measured-freeze seal/reopen
checks, then verifies zero native trial attempts and no journal. It is not the
full scoring E2E. The default scoring test still executes all 28 fake trials and
the #197 provenance/comparison path. Both modes require a clean Node 24 checkout
and use disposable synthetic inputs, not actual evaluator approval.

## Remaining activation work

Implement and verify the native transport's actual all-tools-disabled mechanism
on the exact target binary/config. Bind its invocation and capture origin rather
than accepting a caller-controlled callback or a no-tool-use trace. Independently
review the labelled corpus/rubric and its applicability; establish live A/B
qualification under an explicitly authorized separate budget; then bind reviewed
qualification, current private evaluator admission, target-host evidence and a
new result-blind freeze. The corpus must not use measured outputs as labels.
Do not delete the live guards merely because the source tests pass. Real model
calls, evaluator admission, measurement, and merge remain separate actions.
