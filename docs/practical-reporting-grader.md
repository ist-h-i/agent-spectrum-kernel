# Standard caller-reference reporting grader

New practical profiles can select the reporting-policy v3 adapter through
`practical.cases[].reporting_grader`. The standard selection stage generates its
pinned settings and command; the unchanged practical worker executes it and
validates the resulting quality receipt. No private host copy or manual import
is needed. Existing `grader` commands and cases without a grader are unchanged.
Supplying both selectors is rejected.

The supported fixture IDs are:

- `easy-ordinary-refund-review`
- `ordinary-frontend-review-evidence-gap`
- `mp-frontend-state-review`

This is caller-reference scoring, not the sealed primary evaluator, native
verification acceptance, or permission to apply a candidate. Existing result,
application, execution-authorization and model-call gates remain in force. No
saved run or frozen configuration is migrated or repinned.

## New-run recipe

Use a **new** Full practical profile, state root, evaluation root and run ID.
Keep the already-approved case files, original requirement and command-contract
references, original binary weights, model conditions and public-check commands.
For each supported case, replace its external `grader` property in that new
profile with this selector:

```js
caseSpec.reporting_grader = {
  kind: 'caller_reference_reporting_v3',
  config: {
    model: selectedGradingModel,       // explicit model string or null
    reasoning: selectedReasoning,     // explicit effort string or null
    requirements: originalSettings.config.requirements,
    evidence_map: originalSettings.config.evidence_map,
    verification_contract: originalSettings.config.verification_contract,
    checks: originalSettings.config.checks,
  },
  backend: {
    kind: 'codex',
    executable: {path: selectedCodexExecutable, digest: executableSha256},
    timeout_ms: 900000,
  },
};
delete caseSpec.grader;
```

All reference objects have `{path, digest}` with an absolute path resolved on the
current executor and a `sha256:` digest of the exact bytes. Do not copy settings
or paths from a different computer. The original public input inventory must
still match the approved catalog. The easy and evidence-gap fixtures may be
caller-owned; this adapter does not publish them or manufacture replacement
criteria. The formal fixture's public contract is available under
`benchmarks/fixtures/checkpoint-b2/mp-frontend-state-review/`.

Continue through `createFullPracticalInstructionLoopConfiguration` and the
normal supervised loop. Its selection stage calls
`createPracticalReportingGraderCommand`; do not construct the grader argv or
rewrite existing settings yourself. Settings retain the conventional argv
positions 2 and 3 for settings path and digest. Generation reads and pins inputs
but starts no model. Execution requires the existing model authorization.

The generated command pins its repository module import closure, selected
executable, original authority records and public inputs. Pins are rechecked
before dispatch. Its settings also bind each selected condition's task command.
The Codex backend reuses the standard session runner with a read-only sandbox,
an ephemeral session and bounded timeout. It makes at most two calls: primary
and visible-primary independent audit. It does not retry the task or start a
third grader call. Observed root token counters and session duration are retained; missing
counters remain null rather than estimated. Complete descendant cost and native
acceptance remain unknown. Transport errors (including reconnect notices),
interaction requests, malformed/unknown events or an absent final
`turn.completed` conservatively prevent completion, even after exit zero and a
written answer. This adapter does not promote recovered reconnects to success.

## Evidence and scoring boundaries

The adapter captures only the current attempt's `task-codex-provider.json` and
`task-codex.stdout.jsonl`, bound to its request, task command and invocation. It
checks closed task completion and unchanged protected inputs. An absent,
truncated or invalid command capture is recorded as missing; it never becomes
proof that a command did not run. A foreign receipt rejects grading before any
backend call. The full capture is retained outside grader capsules. Only a literal single-path `cat` instruction read is omitted from the grader's
selected view; omission counts remain visible. Mixed read-and-check commands,
quoted paths and unfamiliar command bodies stay intact so their verification
evidence is not lost. They may reveal instruction context, so this view is not
guaranteed condition-blind. This selection is not command-equivalence or
execution verification.

Both grader capsules receive the unchanged original reporting requirements and
complete command contract. Optional cwd proof stays optional; the formal
fixture's original eleven-file digest followed by validator remains mandatory
in its historical command contract. The fresh public checks use only pinned
public scripts and candidate JSON in an isolated copy. They are not evidence
that the task ran those checks, and a full 10-point result still requires the
original successful fresh-public-check guard.

Reporting evidence is a separate typed sidecar. Missing evidence permits only
Unknown. Fail requires a concrete counterexample with exact quotes from allowed
existing sources; an audit must explicitly correct an invalid primary result.
Only formal `evidence-and-review-precision` with
`source_reference_contradicted` may cite fresh host diagnostics for a current
invalid candidate source path, line or structural reference. Execution and
outcome counterexamples still cannot use fresh host diagnostics as historical
evidence. Quote presence does not establish semantic contradiction or command equivalence:
the independent audit still owns those judgments. Original weights and the
inner judgment schema are unchanged.

New per-attempt outputs include `reporting-command-capture.json` when valid,
`reporting-task-evidence.json`, private primary/audit capsules,
`private-grade/final-reporting-evidence.json`, `grade-summary.json`, and the
worker-bound `grade-reporting-provider.json`. Preparation failures and invalid
judgments report Unknown quality, never a successful process exit as Pass.
Source-reference results do not imply formal acceptance.

## Model-free verification

```sh
node --test scripts/test-practical-saved-command-observation.mjs \
  scripts/test-practical-reporting-policy.mjs \
  scripts/test-practical-primary-grading.mjs \
  scripts/test-practical-reporting-grader.mjs
```

The integration tests generate standard settings for all three fixture IDs,
run the actual worker and adapter using fresh synthetic inputs, and validate
quality receipts. They cover missing-only primary failures, audit corrections,
missing/truncated captures, foreign receipts, selector conflicts, input drift,
external/no-grader compatibility, all-pass 10/10 and failed-public-check guards.
The fixture backend is accepted only with `evidence_kind: synthetic`; it cannot
be used for observed runs. The Codex transport is checked with an injected fake
session. No real model, saved shell body, old task, or private fixture data is
executed by these tests.
