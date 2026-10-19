# Codex source reviewer for personal evolution

Spec `personal-source-reviewer-spec-v1@1` extends
`personal-evolution-unattended-spec-v1@1` RUN-2. Upstream: #379, #385 and the
owner's instruction to connect a real reviewer without a live development run.
The existing reviewer stdin/stdout contract, source approval owner, fixed
evaluation and decision policy remain unchanged.

- SR-1: accept the existing exact source-review input, verify the before/after
  file digests and candidate identity before dispatch, and keep candidate text
  as data. It cannot supply reviewer criteria, argv, model or output paths.
- SR-2: ask the explicitly configured Codex model to review every exact file
  against inherited scope/effects and source safety, using fixed instructions.
  Require a successful completed transport and an exact bound closed response.
- SR-3: preserve approved, declined and needs_action judgments. Missing facts
  needed for source safety must not become approval. Quality, actual use and
  unknown ownership/license are not inferred from a source review.
- SR-4: invalid input/output, missing captures, transport failure, interruption
  or timeout produces no accepted review and is never retried by this adapter.
  The existing composer retains its consumed request and refusal/Unknown rules.
- SR-5: a fresh management input can select this pinned program for the existing
  single mp-data-migration-handoff task, without starting a provider or grader,
  writing an approval/receipt, or changing original assets and execution records.

Verification Contract `personal-source-reviewer-verification-v1@1`, upstream
`personal-source-reviewer-spec-v1@1`. Select `formal_verification_contract`
under `ask.verification-proof-policy@1.0.0`: triggers
`public_api_schema_or_compatibility`,
`state_concurrency_persistence_lifecycle_or_cross_module`,
`security_auth_permission_privacy_financial_or_email`,
`multi_session_multi_agent_or_handoff`, `merge_release_or_stable_trace`.
Fake transport must prove exact prompt/schema/argv boundaries, every-file and
candidate/input binding, refusal/Unknown preservation, malformed/duplicate-key
output, abnormal termination and timeout. The existing composer regression
suite must keep refusing invalid or declined reviews. Static preparation must
verify the real CLI and exact resource/program bytes without execution.
Live semantic review quality and runtime compatibility remain Unknown; fake
transport cannot establish them. Required completion evidence is focused and
surrounding test success, independent review, exact-head CI and the separate
local static preparation record. Missing evidence blocks its corresponding claim.

Implementation Contract `personal-source-reviewer-implementation-v1@1` consumes
the Spec and Verification Contract above. The boundary is one optional Codex
adapter plus reuse of the existing closed review-result validator, tests,
procedure and CI wiring. `executeCodexSession` owns child execution/cleanup;
the existing composer owns request consumption and approval. No new scorer,
review platform, authority, credential reader or global configuration is added.

## Usage

The source review program is
`scripts/ask-personal-evolution-source-reviewer.mjs`. It accepts the existing
review JSON on stdin and emits only its validated review JSON on stdout:

```sh
node /absolute/ask/scripts/ask-personal-evolution-source-reviewer.mjs \
  --codex-bin /absolute/codex --model gpt-6.1-sol --reasoning high \
  --timeout-ms 3600000
```

Configure `sourceReview.command` with that argv. Pin this program's absolute
path and raw digest in `sourceReview.source`; leave `allowExistingApproval`
false. Select a fresh profile/run and confirm its policy digest only after a
new direct human instruction authorizes the real model and transmitted source.
The outer `sourceReview.timeoutMs` must exceed the inner Codex timeout with
startup/cleanup margin (for example inner 3,600,000 and outer 3,660,000 ms).
The adapter creates a private fresh working directory below its caller's cycle,
retains the exact input/schema/final capture and process outcome there, and
does not read CAS, evaluation assets, credentials or global settings.
Codex still owns its ordinary configuration/authentication. No complete context
or filesystem isolation, prompt-injection immunity or model effectiveness is
claimed. Candidate instructions are serialized as data under fixed criteria;
their declared verdicts or commands never authorize execution or acceptance.

The existing primary path accepts a nonempty subset of its nine fixtures. The
single-task comparison reserves 10,000,000 tokens and 67,200,000 ms (18h40m),
with the existing six P/K/F sessions and original grading. Nine tasks/90M tokens
and a ten-day run are not mandatory. Before a dispatch the run must reserve the
full comparison plus configured generation/review time. Keep Unknown usage;
these reservations are not measured total provider cost.

Development and local preparation use fake transport or read-only validators.
No real model, comparison, grader, old-run replay, adoption or Mac installation
is authorized by this document.
