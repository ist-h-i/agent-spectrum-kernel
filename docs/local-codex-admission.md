# Split Mac admission and evaluation (Issue #315)

The v2 adapter in Draft #317 implements two separate execution entrances. Only owned simulation has been exercised. No real CLI, probe, network listener, model trial, credential refresh, chmod or credential copy/link was performed while implementing it. v1 saved connection evidence remains readable; old/consumed live permissions cannot start a v2 phase.

## Implemented entrances

1. `prepare DESCRIPTOR.json` creates a v2 plan without starting Codex. Canonical image bytes, source, host, home directory identity and a closed command are sealed. The Mac native image must be specified directly, rather than the npm wrapper. Native preparation requires committed clean source.
2. `probe ROOT PROBE_PERMISSION.json` runs at most four Codex invocations with zero model trials and no existing-store access. The permission must equal the closed `codexPhasePermission(plan,"probe",newApprovalRef)` envelope. This pure builder describes approved actions; it does not itself grant authorization. `probe-simulation ROOT` performs the owned-fake route without a live permission.
3. `reopen-probe ROOT` reads the sealed result without commands. Interrupted/unsealed results are incomplete/unknown and cannot admit evaluation. Evidence checks cover the complete probe directory, saved permission/claim/report, exact plan/source/CLI/command/host/guard and mode.
4. `evaluate ROOT EVALUATE_PERMISSION.json` consumes that verified probe admission, runs zero new probes, and starts at most plain then kernel_only. Its distinct envelope uses `codexPhasePermission(plan,"evaluate",newApprovalRef,canonicalDigest(admission))`. Real admission must be from the same real plan and host, successful, and less than one hour old. `evaluate-simulation ROOT` cannot be promoted by a live permission.
5. `reopen ROOT` verifies final evidence without Codex, credentials, model calls or regrading. A second probe or evaluation against a spent directory refuses. The convenience `simulate` combines only owned fake phases; combined live execution refuses.

Approval references are nonsecret references to fresh human authority. Local digest seals detect mutations, not malicious rewriting by an actor who controls all evidence files. They are not signatures or substitutes for human authorization. There is no automatic permission writer or reuse of prior experiment grants.

## Probe scope and enforcement

Four invocations: version, exec help, sandbox help, sandbox canary. Each has ten seconds, SIGKILL/process-group cleanup and 1 MiB streams. Failure/unknown aborts the phase; there are no retries. A new owner-only HOME/CODEX_HOME and a closed environment omit API keys, keyring settings and ordinary auth paths.

On Mac every invocation is wrapped by the fixed `/usr/bin/sandbox-exec` image and a temporary process policy. It permits selected runtime files/libraries, the owned probe home/workspace and literal synthetic canaries. It denies other file data and external IP/DNS; loopback is deliberately allowed to test the nested policy. Securityd/keychain agent lookups are denied. This does not change persistent OS settings and is not a claim of complete Mach/service isolation. Linux and WSL real parent-guard admission are not implemented yet; their simulation route remains distinct and real invocation refuses.

The fourth guarded Node worker first opens the negative filesystem canaries outside the nested sandbox, then proves connections to its live IPv4/IPv6 loopback listeners. It invokes one nested Codex sandbox with the same endpoints. The nested child checks allowed workspace read/write, denied reads/write, and denied TCP connection for both families. Only EPERM/EACCES proves denial; connection success fails, timeout/refused/unsupported is unknown. Listener cleanup is bounded by the ten-second containing process group. There is no external test server or model endpoint. Fake results carry `synthetic_only`, even when every simulated canary passes.

The command does not inherit `:workspace` filesystem defaults. Root `/` is deny, with explicit read grants for selected system libraries/data, individual shell utility executables, the exact Node/CLI images, and one trial workspace write grant. No general home, `/etc`, `/tmp`, `/proc`, `/bin` or `/usr/bin` read grant is made. Probe workers have three extra literal public source-file grants only for that canary; evaluation does not receive them. The native session verifier accepts the exact declared entries and at most the pinned CLI's named arg0 runtime helper. Extra paths, grants or duplicates fail. Runtime dependencies outside the manifest fail closed; the inspected nodebrew Node links only system libraries, but actual startup inside Seatbelt is still unverified. Homebrew or other dynamic runtimes need a reviewed dependency manifest rather than a broad user-directory exception.

The file-data boundary is implemented, not a claim that all host IPC protocols or every possible egress channel were tested. Real admission proves the exercised filesystem operations and loopback TCP IPv4/IPv6 controls on the selected host/profile. It is not Windows/WSL evidence or ASK-superiority evidence.

## Existing authentication without blanket chmod

A directory mode0700 rule conflated directory listing privacy, credential confidentiality and safe output writes. The v2 existing home may be 0755/0750: it must be canonical, current-user owned, owner-writable, not group/other writable, and have no ACL whose confidentiality is unknown. Preparation and probes check only this directory metadata, never auth contents.

Before evaluation, the metadata-only inspector requires existing `auth.json` to be a regular current-user file, exact0600, nlink1, no symlink or ACL. It never reads/hash/copies/links that file. Existing rollout directories must be owned, not writable by others and free of unknown ACLs. Historical rollout contents are neither inspected nor rewritten and their file modes are not changed. The newly selected session is separately checked for private file metadata before its bytes are captured. These checks do not establish token availability or validity.

Native subprocesses inherit temporary umask077. SQLite and runtime logs are redirected with per-command `sqlite_home` and `log_dir` to each owned private trial HOME; history persistence, analytics, feedback, update checks and memory generation/use are disabled per command. Existing databases/logs are not chmodded, copied or required to change mode. The native home-scoped session index, if present, must already be0600 because the pinned CLI can append session names there. Auth refresh and new rollout/index/runtime-helper writes remain possible CLI effects under the evaluate envelope. Persistent configuration/login/keyring settings are not changed.

Read-only investigation of this Mac found home0755 and auth0600, but existing `session_index.jsonl` is0644. The current evaluation guard therefore stops at that exact file. Neither changing the home to0700 nor changing unrelated existing DB modes is requested by this implementation. If the same home is to be used, a separately authorized file-mode change of this index to0600 is needed, or a verified CLI route that avoids that index. No such change was performed. ACL/ownership/session-directory failures discovered later also stop with their concrete metadata target.

The CLI can read and refresh its existing token and persist updated credentials. If credential writeback remains forbidden, real evaluation cannot proceed. Authentication-file confidentiality checks are metadata evidence only, not successful login evidence.

## Evaluation envelope and next actual run

The next proposed Mac run is: prepare an exact native v2 plan on the reviewed clean head; authorize one probe phase (four invocations, ten seconds each, one bounded guarded worker with IPv4/IPv6 loopback listeners, models0, retries0); inspect its sealed observed result; resolve the index metadata blocker; then separately authorize one evaluate phase (at most two execs,120 seconds each, retries0, existing-store token read/refresh/writeback and new session writes). Do not start any of these real phases from the current development authorization.

The model is `gpt-6.1-sol`, reasoning medium. Per-trial30,000 and cumulative60,000 tokens are post-trial stopping thresholds, not hard billing caps. Unknown usage, provider/process/timeout/identity/scope/privacy failure stops subsequent trials. Incorrect task output is graded separately. Two execs can contain more than two model HTTP requests due to tools; auxiliary authentication/managed-config traffic is not a bounded request count.

Planned model inputs are the public task (817 bytes), input.json (188), schema (2,515), and, only for kernel_only, AGENTS.md (12,249) plus separators (stdin13,068 total). CLI built-in instructions, workspace paths, commands and tool outputs may also be sent. Explicit system/runtime read data remains within the manifest; this is not an assertion that only the three public fixture files are readable. Grading answers/private evidence/other trials/personal home data are outside the declared grants. Local saved session/output data is0600 and not uploaded. Provider target is the fixed ChatGPT Codex endpoint; token refresh and managed configuration can use auxiliary vendor endpoints.

## Verification contract and source rationale

Formal verification applies to phase authority, process lifetime, privacy and persistence. Required evidence: frozen-source connection/distribution/pilot regressions, shared usage/delivery tests, repo validation and bundle checks; independent semantic/architecture/output/adversarial review; exact-head Mac/Ubuntu fake CI. Tests cover split phase counts/no repeated probes, seal corruption/incomplete records, source/mode/refusal, positive/deny unknowns, unwanted grants, privacy modes/links/ACL parser, fake faults and historical replay. These do not complete real-OS admission.

Pinned primary sources:

- [Permission profiles](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/permissions_toml.rs): optional inheritance and explicit filesystem maps allow removing broad parent defaults.
- [Config construction](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/config/mod.rs), [types](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/types.rs): independent SQLite/log roots, disabled history/memory settings.
- [Session index](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/rollout/src/session_index.rs): home-scoped append-only names can require existing-file confidentiality even when other logs move.
- [Auth manager](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/login/src/auth/manager.rs), [sandbox bootstrap](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/cli/src/debug_sandbox/cloud_config.rs): token refresh can persist; model-free startup can load managed configuration, motivating the separate parent guard.

Issue #291's formal14 pairs/28 trials and all ACs, Draft #313 and historical experiment records are unchanged. No merge is requested.
