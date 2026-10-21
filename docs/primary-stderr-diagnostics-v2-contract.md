# Versioned private stderr diagnostic projection

SPEC-P24-STDERR-DIAGNOSTICS-V2 / VERIFICATION-P24-STDERR-DIAGNOSTICS-V2 is a formal
diagnostic follow-up to #425, not a runtime qualification or scoring change.
The first live probe remains unavailable and its original bytes are preserved.

## Evidence and falsification

The saved first result records252 output bytes, zero stdout lines/replies and
one known104-byte PATH warning. The other148 bytes were intentionally dropped.
They cannot be recovered or retrospectively classified. EPERM is not established
as the cause; ABORT_ERR reports the collector's own cancellation, not an OS
syscall from the child. No new live command is run by this change.

Pinned public OpenAI Codex source092d3acd6bec3e3a14bdc7e7a2810ab628ab759d:

- `codex-rs/arg0/src/lib.rs`, blobc3467367190389297406c1aefd40d42ca503b6b5,
  lines184–190 explicitly continue after alias preparation failure; lines368–371
  continue after stale temporary directory cleanup failure. These are known
  nonfatal warning sites, not evidence that the dropped148 bytes used them.
- `codex-rs/app-server/src/lib.rs`, blob896aa6623b690bff7789a830699ae498f1a3b6dc,
  lines523–530/576–581/639–650/661–668 define finite startup error message sites;
  lines715–764 configure variable stderr tracing and config warnings. An ERROR
  log may accompany fallback configuration; log level alone grants no permission.
- `codex-rs/app-server/src/stderr_logging_tests.rs`, blobeae2e7504adc9fd3e9828c217d4d04fb1d60785b,
  verifies nonfatal tracing warnings and span logs. Generic INFO/WARN/JSON/ANSI
  output is therefore possible, but is not accepted as safe by a level regex.
- CLI main is blob8d062a23979eb6df4725af30b93269210229c240 at that same revision;
  source declarations are distinct from the installed binary's emitted events.

Artificial repeated exact alias warnings demonstrate that the old one-warning
policy can stop on source-known nonfatal text. A single known warning alone is
already accepted by V1. That counterexample does not explain the actual first
result, prove a healthy runtime, or authorize bypassing an unknown stderr stop.

## Closed boundary and requirements

- R1: V2 plan/result kinds and policy/source pins are explicit. Fresh plan/output
  are required. No old plan/run is repinned and no previous unavailable becomes
  success. Existing fixed three RPCs, auth/env/sandbox and cleanup bounds remain.
- R2: a pure bounded parser exports only finite kind/severity/os_error_text
  enums, count and policy. No paths, user names, dynamic errors, raw text/hash,
  arbitrary errno, cursor, stack, timestamp, config or secret values leave it.
- R3: classify only an exact previously observed warning or anchored finite
  public-source message prefixes; dynamic tails never become output/authority.
  Permission/missing-resource text categories mean text matched, not actual
  syscall/cause/actor proof. Unknown/malformed/multiline/control/ANSI/generic
  structured logs remain unknown. No general warning/error redaction whitelist.
- R4: preserve the V1 continuation policy: only the first exact alias warning
  continues. A repeated exact warning is typed but stops; the known nonfatal
  cleanup site is typed but stops for review. All startup-error/unknown classes
  stop, discard catalog matches and preserve unavailable/runtimeunknown.
- R5: incremental line framing handles split/coalesced bytes; maximum line4096
  and total stderr64KiB. Fatal UTF8, oversize or incomplete EOF stop without
  retaining raw fields. No callback or caller boolean turns a class into permit.
- R6: model-free fixtures cover every rule, unknown/control/UTF8/size/EOF,
  spoofed prefixes, split Unicode, secret sentinels, unchanged RPC sequence and
  rejection after known warning. Independent review precedes any new observation.

The next proposed minimal observation is the same no-turn one-process handshake
with this V2 diagnostic projection, a fresh pinned plan and unused output. Its
scope stays normal permissions, initialize/initialized/model-list only, no
config/read or task/model request, bounded timeout and owned-group cleanup.
It needs a new specific one-shot live decision because the first approval was
consumed. This implementation does not request or execute another launch, outer
exception, authentication copy, environment/provider switch or setting change.
If the result is a source-known warning stop, review that evidence before any
continuation-policy change; unknown stays unavailable. Asset-only scoring
preparation is a separate lane and cannot supply missing runtime authority.
