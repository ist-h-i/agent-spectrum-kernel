# Prompt successor: native fake-process verification

Issue #289 / PR #290, Finding F3. Candidate evidence is the exact Git commit
containing this test; `e6db9604ed0d66b11289b2f6ceb768657e245849` is its predecessor,
not a claim of execution against the new test. This document specifies checks;
it does not record an unexecuted check as passed.

## Purpose

Exercise `prepareSuccessorPortfolioSource`, an authentic
`openSuccessorPromptInput` capability, and `executePortfolio` with that capability.
The same production materializer, selection validation, native-format guard,
execution runner, terminal verification, and normalizer are used. No validator,
spawn function, timer, or capability constructor is mocked or replaced.

`test-fixtures/prompt-successor-fake-codex.c` is a test-only POSIX executable.
The test compiles it into a newly created external temporary directory. It has
version/help responses and closed execution modes, but no provider transport,
network connection, shell command execution, or credential/evaluator reader.
Its synthetic model name must never be sent to a real provider.

The synthetic runtime's `api_key` authentication class is only a closed-enum test
value. No actual authentication is attested. Its HOME is a new empty directory,
and its child environment excludes real credentials and the operator's CODEX_HOME.

## Identity and source constraints

Run from a clean committed candidate with Node 24 on macOS or Linux and a local C
compiler. Wrong Node version, unsupported platform, missing compiler, dirty
checkout, or failed production validation is a failure, not a successful skip.

The checked-in test config selects the four existing calibration fixtures with
3/3/3/5 repetitions, retains both ordinary adapter tracks and all four conditions,
and does not rewrite the historical #234 config or freeze. Source materialization
therefore contains 112 native cases. Selection artifacts for the Adaptive cases
are constructed by the existing selection API but those cases are not executed.

Both Prompt roles get separate native run IDs, one shared successor experiment
ID, and the same config, native executable, materialization, command and environment.
Each role maps all 14 native full_ask cases; the success test executes only its
review and implementation representatives. This is a partial **synthetic** run,
not completion of the 28-case measured experiment.

The fake captures actual stdin and NUL-delimited argv. Expected stdin is composed
independently by byte-splicing the frozen template read through `git show`, not
by accepting caller-provided hashes or echoing a replacement spawn callback.
Additional genuine Prompt-input handles independently reconstruct the expected
request projection. Input handles are never fabricated to bypass validation.

## Required command and observations

```sh
node --test scripts/test-ask-benchmark-prompt-successor-execution.mjs
```

Ten named subchecks cover preparation without case launch; both Prompt roles and
both task types; exact stdin/argv; request/result/terminal-workspace linkage;
single consumption; case/maxCases/retry rejection before spawn; partial native
normalization; explicit process failure; and residual-child rejection/cleanup.
The final control uses the same compiled executable and ordinary contained-runner
path with a 1,200ms timeout. It asserts actual timeout failure, no final output,
and child/workspace cleanup despite a completion-looking JSON event.

**Timeout scope:** the successor's 900,000ms contract is not shortened or changed
for this test. Its exact propagation is checked in the authentic successor calls.
The shorter elapsed-time control is explicitly the ordinary path through the
shared timer/cleanup implementation; it is not evidence that a full 900,000ms
successor deadline was allowed to elapse. Existing ordinary execution regressions
remain relevant to that unchanged shared implementation. Do not describe this
control as measured Codex sandbox or timeout proof.

The compiled child's residual mode has an independent finite lifetime; the test
still requires the runner to terminate it promptly and refuses to treat its
presence as successful terminal-workspace capture. Permission errors are not
interpreted as process disappearance. Temporary test files are retained outside
the checkout for diagnosis, with a printed `verification.json` path. The record
contains the exact target, compiled source/image identity, checks, native capture
references and limits. It contains no real model responses or private evaluator.

## Limits and subsequent review

A passing F3 test is native-process integration evidence for this runner seam.
It is not real Codex isolation, authentication, provider acceptance, token-usage
availability, scored effectiveness, Portfolio authority, or merge permission.
It does not close F1's separate positive test of two genuine full provenance
handles through `buildSuccessorComparisonFromProvenance`; that path additionally
requires the evaluator/admission/scorer evidence chain.

After a pass, review the exact changed candidate and evaluate remaining F1/F2/F3
criteria. Do not resolve all findings solely because the pure identity/unit tests
or this partial transport test pass. Historical suites and main integration must
retain their separate recorded status.
