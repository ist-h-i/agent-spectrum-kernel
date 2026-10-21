# SQLite startup observation V3

SPEC-P24-SQLITE-DIAGNOSTICS-V3-1; Refs #379, #426.
Formal Verification Contract VERIFICATION-P24-SQLITE-DIAGNOSTICS-V3-1.

The consumed V2 observation established a fatal startup-text class, not the
failing file, DB role, operation, syscall or cause. Public Codex0.162.1
092d3acd6bec3e3a14bdc7e7a2810ab628ab759d wraps StateRuntime init with a home
context; app-server formats the outer error with Display, losing its inner
chain. SQLite init precedes the stderr tracing subscriber. Repeating V2 or
adding RUST_LOG cannot be assumed to recover the missing fields.

D1: Add a separate V3 pure projection. Only the exact anchored fatal/context
wrapper with one repeated, identical, unambiguous absolute home text may yield
`default_codex_home_text`, `within_declared_output_parent_text`, or
`other_absolute_text`. No realpath, config, DB, home enumeration or permission
probe is performed. Default comparison uses a plan-pinned digest; parent
comparison is lexical segment containment. Neither class proves the effective
resolved location, access rights or failed syscall. Unknown/mismatched/injected
wrappers remain unknown. Inner DB role/phase/cause are not invented.

D2: Fatal and recovery text always stop. The first exact pre-existing PATH
warning is the sole continuing stderr case; V2 behavior is unchanged. Unknown,
ANSI/control/BOM/invalid UTF8/oversize/truncation/repeated warnings stop. Dynamic
paths, lengths, hashes of observed paths, error tails and raw logs never leave
the bounded in-memory parser. Recovery text is not proof a backup completed.

D3: Reuse the existing ordered collector and process owner. V3 plans/results
have distinct kinds/policy/source pins and fix the unused output root. Only
initialize -> initialized -> model/list is possible; no model turn/config/read,
DB connection/query/repair, authcopy, environment/home/provider override or
permission exception exists. Timeout, unknown output and cleanup uncertainty
remain unavailable. Old V1/V2 outputs are not rewritten or reclassified.

D4: A source-reviewed fresh plan can be prepared without launching Codex. Its
confirmation is an integrity digest, not human authorization. A later live
operation requires explicit permission for normal startup DB directory/file
creation, read-write/WAL, migrations, conditional backup/move/rebuild, existing
auth/state updates and background traffic. Startup effects can precede the
collector's abort. No secret/auth/DB content is inspected by this collector.

D5: Artificial normal/boundary/secret/spoof/chunking/transport tests and an
independent source review are required. They do not qualify genuine runtime,
native behavior, model availability or scoring. Success only establishes the
limited initialization/catalog observation. Failure with a home text class
narrows a policy hypothesis; role/phase/syscall remain unknown and no automatic
retry or repair follows. Failure without new finite information stops further
repetition and requires a separately reviewed observation method.
