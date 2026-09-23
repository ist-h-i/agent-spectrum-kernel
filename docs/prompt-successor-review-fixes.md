# PR #290 review repairs

Implementation: `IMPLEMENTATION-290-REVIEW-REPAIRS@1`.
Formal verification: `VERIFICATION-290-REVIEW-REPAIRS@1`.
Upstream: #289; PR #290 at `fb52c80c54f3b57d32f1d3204f469481871aee75`;
inline review comment 4072595164. The submitted candidate is the commit containing
this document. Preparation remains distinct from admission and measured execution.

## Frozen compatibility and current implementation are different checks

Actions run 35733858089 failed in the documentation/config fixture suite:
`mn-doc public evaluator source identity source bytes drift at
scripts/ask-benchmark-evaluator-boundary.mjs`. Its source identity correctly
requires the registered dependency bytes, not the evolving PR checkout.

`test-frozen-evaluator-fixture.mjs` supplies an explicit historical compatibility
context for the eight frozen fixture suites and six review-archive suites. It
keeps the current test and public fixture files, restores only the registered
module/schema dependencies from their exact Git revision, and verifies every
source byte count and digest. The real frozen verifier then recomputes its complete
dependency graph before the unchanged test runs. Both execute in a separate local
clone with a test-only commit whose sole parent is the source candidate. The
original checkout, remote branches, public authority, admission and oracle remain
unchanged. There is no retry-on-failure fallback or successful skip.

The log identifies the source candidate, frozen evaluator revision, separate test
context commit, current test digest and restored paths. Such a pass establishes
historical compatibility only; it does not certify the PR's changed evaluator as
an approved replacement for the old evaluator. A real private evaluation still
requires the corresponding frozen execution source or separately approved
successor authority. The strict production source validator is unchanged.

The existing current-HEAD general runner, normalization, evaluator, raw scorer and
admission-invariance gates remain in the workflow. A separate early step runs
successor and repair regressions at current HEAD. Neither set of checks substitutes
for the other. Actions triggers, required checks and failure handling are not
weakened. The long synthetic scoring/process suites remain separately runnable;
this repair does not automatically add them to every CI run.

## Async inputs are owned before yielding

Repository preparation/validation, Prompt delivery, public scoring-input opening,
scoped result reading and provenance reconstruction detach caller-owned records
before their first `await`. Opaque scoring-input capabilities retain their actual
object identity; they are not cloned or reconstructed from digest-shaped objects.
Nested changes made by a caller after starting an operation cannot change the
snapshot that is validated or recorded in the returned evidence.

`test-ask-benchmark-successor-input-snapshot.mjs` exercises actual library readers
with disposable synthetic data and mutations of run IDs, nested case bindings,
preparation identities, source paths and runtime fields. It requires Node 24 and
does not read measured results or invoke a provider.

## A process cannot relabel cached code with a later checkout

The repository module captures its clean source session at module evaluation,
not at the first later API call. Capture errors are retained. Identity checks
reject changed HEAD/tree, dirty source and file drift; source bytes are read with
the existing stable-file reader. The pinned Git bytes are private to the session.
Identity checks around asynchronous loading prevent a checkout change during the
operation from producing a new verified input capability. Restart the process
from the intended committed checkout instead of updating its pin in place.

This is a trusted-process consistency guard, not attestation of a hostile module
loader, provider, operating system or every dynamically loaded dependency. The
regression actually keeps revision A imported in a child process, changes its
checkout to clean B, and requires refusal on the child's first API check.

## Terminated does not mean reaped

The native fake-process test now records child execution termination separately
from process-table reaping. `ESRCH` establishes absence. On Linux, an inspected
`/proc/<pid>/stat` state of `Z` establishes terminated execution but is recorded as
`reaped: false`, never as disappearance. Live states, permission errors, malformed
records and ambiguous lookup races remain failures. Other platforms still require
absence. The test helper performs no cleanup or authority mutation.

The production runner's behavior is unchanged: a detected residual descendant
still invalidates the attempt, final output is not accepted, and terminal-workspace
evidence is unavailable. The 1,200 ms ordinary-runner timeout control remains
separate from the unchanged 900,000 ms successor deadline. A zombie owned by a
non-reaping container PID 1 is reported as a host-reaping limitation, not successful
complete cleanup. This clarifies the child assertions in the earlier F3 document.

## Executed and pending verification

Executed in the ChatGPT Linux x64 environment with Node v22.16.0 against the
submitted source files and unchanged CAS blob
`50d943b037d8e1a6e8bf6f73679e3a839ebc5546`:

```sh
node --test scripts/test-ask-benchmark-source-session.mjs \
  scripts/test-successor-process-state.test.mjs \
  scripts/test-frozen-evaluator-fixture.test.mjs
```

Result: 28 tests passed, zero failed or skipped. These are synthetic Git/session
and process-observation tests, not a full repository checkout or Node 24 proof.
All 13 changed/added JavaScript modules passed `node --check`. Workflow YAML parsed;
all existing step names/order were retained, with one additional current-HEAD step
and 14 explicitly historical invocations. Existing-file baseline bytes were checked
against their Git blob IDs before editing. No full-CI success is claimed.

Still required on the exact submitted clean revision with Node 24:

```sh
node --test scripts/test-ask-benchmark-successor-input-snapshot.mjs
node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-doc-config-correction.mjs
node --test scripts/test-ask-benchmark-prompt-successor-execution.mjs
node --test scripts/test-ask-benchmark-prompt-successor-scoring.mjs
```

Also run the remaining historical contexts and current shared regressions in the
workflow, then review the exact final diff and logs. The previous owner-run scoring
proof and previous Actions successes are historical, not executions of this repair.
The native Linux zombie scenario and full frozen-fixture graph/execution have not
been rerun here. Keep the PR Draft while this evidence is missing. No benchmark
model call, measured-result access, real private-evaluator execution, independent
review, manual Actions dispatch/rerun, merge or issue closure was performed.
