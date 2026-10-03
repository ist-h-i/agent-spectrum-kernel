# Workspace temporary storage and advisory trial timing

Shell here-documents and ordinary temporary-file APIs may need writable
temporary storage. A workspace-only write profile does not imply that a
host-global temporary directory is writable. An answer file may be correct
even when the process is stopped before its final response or usage event.
These are separate outcomes; extending a timeout is not this change.

Each new trial and control receives its own pre-created owned0700 `.ask-tmp`
directory inside its existing writable workspace. `TMPDIR`, `TMP`, and `TEMP`
all select that directory. No filesystem grant, deny, network policy, host
setting, authentication behavior, retry, or token/process limit is widened.
The grader permits only this explicitly seeded directory, checks its identity,
canonical location, owner, mode and ACL, and requires it empty at completion.
Leftovers, replacement, links and arbitrary sibling outputs remain boundary
failures. This does not relax grading of the answer or original task inputs.

The inline control checks a temporary-file round trip and a shell here-document
with the same environment, in addition to existing read/write/network checks.
The temporary check must be pass; failure or unknown prevents trials. Ordinary
control remains one invocation. Historical canary records retain their original
shape and replay semantics.

New sealed timing evidence reports process start/completion and, when present,
the first session record, task start, first assistant message/tool call, last
tool result, answer file mtime, final assistant response and task completion.
It contains timestamps and elapsed milliseconds only, never message contents,
commands, paths, usage or credentials. Missing, invalid or out-of-process-window
timestamps are explicitly unknown. Answer mtime is an advisory file observation,
not proof of model completion. Timing never promotes usage, changes grading,
authorizes a retry or affects identity validation. Offline replay returns the
saved report without new calls or recomputing historical records.

The interval before the first saved session record is observable but does not
identify CLI, host or network causes. Workspace temporary storage does not
establish a repair of launch overhead or a performance improvement. Actual
shell/sandbox behavior and real-OS improvement remain unverified by mocks.

Implementation Contract: `issue315-temporary-timing-implementation@1`, upstream
`issue315-session-selection-implementation@1`. C1 adds workspace temporary
environment and strict empty-scratch grading; C2 adds the fail-closed control;
C3 adds advisory saved timing and synthetic regressions. No real invocation,
authentication, runtime grant or existing host mode changes in this delivery.

Formal Verification Contract: `issue315-temporary-timing-verification@1`, policy
`ask.verification-proof-policy@1.0.0`. Regression, protected-boundary and lifecycle
changes retain formal verification. O1–O6 remain upstream obligations. O7 proves
per-workspace temporary routing, strict seeded empty-directory identity, no
permission widening and rejection of leftover/link/replacement cases. O8 proves
temporary control success/failure/unknown with in-memory I/O/shell mocks and
conditional fail-stop. O9 proves bounded advisory milestone parsing, absent and
invalid events, completed/incomplete outcomes and saved replay. E7–E9 are focused
mock regressions; final-source lifecycle/shared/execution tests, independent
review and exact-head-associated CI are required for implementation completion.
Real-host improvement is outside that completion claim.

## Bounded shell diagnostics

A normal control-process exit does not prove that a shell started by the control
succeeded. The new `ask_codex_canary_v4` result adds `temporary_diagnostics`:
environment, directory creation, file write/read, shell and cleanup stages;
the failing stage; and closed error-code values. A returned shell result includes
exit status, a closed error-code/signal value, stdout/stderr UTF-8 byte counts
and SHA-256 digests, and five separate predicates (exit zero, no error, no signal,
stdout matches the public fixed payload, stderr empty). Missing shell results
stay null. Exceptions and cleanup faults retain unknown outcomes. Unexpected
error codes/signals become `OTHER`; messages, raw output, commands, environment
values, paths and credentials are never copied into these diagnostic fields.
Digests describe bounded shell outputs and do not establish their contents.

New controls require the closed v4 shape, all six stages pass, no failure/error,
all five shell predicates true, and matching public-payload/empty-output lengths
and digests. Missing, contradictory or additional fields cannot grant admission.
The one control, 10-second outer/2-second inner limits, protected denies, trial
budgets and usage stops remain unchanged. Historical v1–v3 validation remains
explicitly selectable; sealed offline replay does not reinterpret or recompute
historical canary evidence and never starts new calls.

Implementation Contract: `issue315-canary-diagnostics-implementation@1`, upstream
`issue315-temporary-timing-implementation@1`. C4 adds closed v4 diagnostic capture
and admission; C5 adds independent in-memory predicate/stage regressions and
synthetic lifecycle rejection/replay checks. Formal Verification Contract:
`issue315-canary-diagnostics-verification@1`, retaining O1–O9 and
`ask.verification-proof-policy@1.0.0`. O10 requires each shell predicate and each
pre-shell/cleanup failure to be distinguishable without raw output or exception
messages. O11 requires strict new admission and retained historical validation
and offline replay. E10–E11 are mocked inline-code and owned synthetic lifecycle
tests; final source lifecycle/shared/execution checks, independent review and
exact-head-associated CI close development evidence. They do not establish any
real shell/sandbox result, root cause or performance improvement. Existing
private experiment records are unchanged; no real CLI/control/model/authentication,
execution permission, host configuration or external private-result publication
is part of this development slice.
