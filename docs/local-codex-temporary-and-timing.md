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

New controls require the closed v5 shape described below, all six stages pass, no failure/error,
all five shell predicates true, and matching public-payload/empty-output lengths
and digests. Missing, contradictory or additional fields cannot grant admission.
The one control, 10-second outer/2-second inner limits, protected denies, trial
budgets and usage stops remain unchanged. Historical v1–v4 validation remains
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


## Conservative stderr message classification

The current `ask_codex_canary_v5` adds exactly one shell field,
`stderr_classification`. It records only `empty`,
`temporary_file_denial_message`, `command_not_found_message`, or `unknown`.
Classification happens in memory before the raw stderr is discarded. The two
message classes recognize a complete single C-locale zsh line: inability to
create a here-document temporary file with permission denied/operation not
permitted, or command not found for the public `cat` command. An optional numeric
line label and one final newline are accepted. Paths, other command names,
additional text/lines, localized or missing output and any ambiguous form return
`unknown`. No matching captures, raw messages, paths or environment values are
stored. Existing bounded byte counts/digests remain unchanged.

These labels describe message patterns; they do not prove an OS denial, its
location or a root cause. Classification never changes the five success checks,
stage outcomes, shell command, heredoc payload, timeout, permissions or denies.
A new control requires the exact v5 shape and `stderr_classification: "empty"`
together with all previous admission conditions. Missing/unknown/malformed,
contradictory and extra raw fields are rejected. Explicit v4 validation remains
available without the classification flag; saved replay continues to validate
sealed historical reports without new calls or reinterpretation.

Implementation `issue315-stderr-classification-implementation@1` references
`issue315-canary-diagnostics-implementation@1`; C6 adds message recognition and
strict v5 admission, C7 adds synthetic regressions and saved replay checks.
Formal Verification `issue315-stderr-classification-verification@1` retains
upstream O1–O11 and policy `ask.verification-proof-policy@1.0.0`. O12 proves
conservative closed classification and no raw information in emitted diagnostic
JSON. O13 proves strict new admission, explicit v4 validation and sealed replay
compatibility. Evidence is model-free inline I/O mocks, synthetic lifecycle and
shared tests, repository validation and independent review. This local slice
makes no real-host, root-cause, performance, CI or merge-readiness claim and
includes no real calls, old-evidence changes, host/auth changes or publication.

## Mac control heredoc prefix

The `/bin/zsh` control branch passes a `zsh` filename prefix inside its existing
unique `canary-*` directory as a positional argument. An independent checked
`TMPPREFIX="$1" || exit 1` assignment precedes the unchanged quoted heredoc.
The path is never interpolated into shell code; spaces, quotes, substitutions
and newlines remain argument data. The `/bin/sh` command is unchanged. This
applies only to the model-free control shell, not model-generated trial commands.

The [official zsh parameter documentation](https://zsh.sourceforge.io/Doc/Release/Parameters.html#index-TMPPREFIX)
defines `TMPPREFIX` as a filename prefix, with default `/tmp/zsh`. In upstream
[zsh 5.9 heredoc handling](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/exec.c),
`getherestr` calls `gettempfile(NULL, ...)`; the
[temporary-file implementation](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/utils.c)
uses `TMPPREFIX`, rather than `TMPDIR`, `TMP` or `TEMP`, on that path. Setting
the shell parameter in the command after startup files avoids relying solely
on an imported environment value. This supports the routing choice, but does
not establish the actual host binary's behavior or repair of a host failure.

Cleanup and all five success predicates remain required. No deny, filesystem
grant, heredoc payload, diagnostic schema, time limit or retry policy changes.
Saved v1–v5 records retain explicit validation and sealed replay semantics.
Mocks inspect generated arguments, shell failure/unknown and cleanup without
launching a real shell. They cannot verify real Mac, Linux or WSL execution.

Implementation Contract: `issue315-zsh-prefix-implementation@1`, upstream
`issue315-stderr-classification-implementation@1`; C14 is limited to this zsh
command generation, synthetic tests and documentation. Formal Verification
Contract: `issue315-zsh-prefix-verification@1`, retaining O1–O13 and policy
`ask.verification-proof-policy@1.0.0`. O14 proves positional prefix delivery,
independent assignment before intact heredoc and unchanged Linux invocation.
O15 proves failure/unknown rejection, single invocation, cleanup and saved
diagnostic compatibility. E14–E15 are inline I/O mocks; final-source lifecycle
tests, validator, independent review and submitted-head CI complete development
evidence. Real shell/CLI/control/model runs, grants, host settings and old
experiment mutation are excluded; actual host effectiveness remains unknown.
