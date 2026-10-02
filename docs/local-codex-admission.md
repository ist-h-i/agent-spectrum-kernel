# Ordinary trusted-CLI local evaluation (Issue #315)

New v2 plans select `trusted_cli_lightweight_v1`: one model-free model-tool
sandbox control, then plain and kernel_only once each. This restores #314's
ordinary trusted CLI + model-tool sandbox approach, while retaining the newer
closed tool manifest and external runtime/evidence separation. **The code route
is implemented; this revision performs no actual CLI/probe/model/auth/chmod/OS
operation and has no completed real-OS verification.** Strict admission is a
separate unavailable native route; its success is not required for ordinary eval.

## Trust, traffic and comparison boundary

The pinned CLI, Node and controller are trusted ordinary user host processes.
There is no outer Seatbelt, whole-CLI filesystem isolation or guarantee of zero
CLI startup external traffic. No parent egress/domain filter is enforced; the
approved vendor traffic describes intended operations, not a whole-CLI egress
guarantee. Empty fresh HOME/CODEX_HOME for the control, a
closed environment without API keys, file-store configuration and per-command
disabled analytics/feedback/update/memories reduce unintended effects; they do
not replace that trust assumption. Model-free means zero model trials, not zero
configuration/authentication/network activity. The evaluation permission explicitly
allows OpenAI model/authentication/managed-configuration traffic and CLI existing
file-store token read/refresh/writeback and new session/index/helper writes.
Controller inspection never reads/copies/hashes/links credential bytes.

Model tools use root `/` deny, a fixed explicit system/runtime read manifest,
one trial workspace write grant and network denial. Evidence/grading materials,
other trials, runtime, existing auth store and unrelated host paths stay outside
those grants. No inherited `:workspace` profile or general home, `/tmp`, `/etc`,
`/proc`, `/bin` or `/usr/bin` read grant is added. The control alone has three
literal public worker-module read grants; trials do not. The existing narrowly
checked pinned CLI-helper session exception remains unchanged. Unlisted dynamic
runtime dependencies fail closed rather than widening the manifest.

Both conditions use the same model, reasoning, provider, task/input/schema,
time/usage policy and model-tool sandbox; only kernel_only receives the kernel
AGENTS payload. Scoring answers stay in controller evidence, outside the task.
This is a lightweight local pair, not proof of ASK superiority or Issue #291's
formal 14 pairs/28 trials.

## Ordinary entrances and fresh authority

1. `prepare DESCRIPTOR.json` seals image/source/host/home/command/runtime/trust
   identities without starting Codex. Native preparation requires committed clean
   source and a canonical reviewed image, not the npm wrapper.
2. `evaluate ROOT EVALUATE_PERMISSION.json` requires the exact new
   `ask_local_codex_lightweight_permission_v1` envelope from
   `codexPhasePermission(plan,"evaluate",newApprovalRef)` with no admission digest.
   Old strict/v1/pilot grants, changed traffic/trust/counts/source/plan/image and
   simulation promotion refuse. This pure builder describes authority; it cannot
   create human authorization. There is no automatic permission writer.
3. The evaluation claim spends the whole one-control/two-trial envelope. The
   controller creates a fresh external control HOME/CODEX_HOME, runs one ordinary
   Node worker -> one CLI `sandbox` -> one canary child. Codex chooses Seatbelt on
   Mac or its Linux sandbox for Linux/WSL; no outer guard is started. The worker
   validates the exact profile before files/sockets/CLI, positively opens synthetic
   negative-canary files and connects IPv4/IPv6 loopback listeners, then verifies
   allowed workspace read/write, denied synthetic grading/other-trial/auth-like/
   unrelated-file reads, denied other-trial write and denied model-tool TCP for
   both families. Only EPERM/EACCES proves denial; refusal/timeout/unsupported is
   unknown. This tests the exercised tool boundary, not all IPC/egress protocols.
4. Failure/unknown stops before model trials. The control has 10 seconds and each
   trial 120 seconds, SIGKILL/process-group cleanup and 1 MiB streams. Control
   exceptions persist an explicit failed/unknown terminal result; there are no
   hidden retries. Passing fake controls remain `synthetic_only`. Native passing
   labels describe only the observed host operations, never another OS/CPU.
5. `evaluate-simulation ROOT` / `simulate ROOT` use owned fake processes only;
   `reopen ROOT` checks sealed local results without CLI/auth/model/regrading.
   A spent directory cannot run again. Local digest seals detect mutation but
   are not signatures against an owner who rewrites all records.

## External runtime and private persistence

`runtimeRoot` must be a pre-created empty canonical current-user owner-only
no-unknown-ACL directory, outside evidence/workspace parent/controller/existing
CODEX_HOME without containment either way. Preparation binds device/inode/owner
and writes an exclusive plan-bound runtime claim. Execution rechecks that identity.
Runtime is never chmodded or reused; phase directories are created exclusively.
Control HOME/CODEX_HOME is `runtimeRoot/lightweight-control/home`; trial HOME,
SQLite and log roots are `runtimeRoot/{plain,kernel_only}/home`. Evaluation
CODEX_HOME is the separately checked existing store. CLI helper links remain in
runtime and are never followed/copied into evidence. Evidence still rejects
arbitrary symlinks/hardlinks and keeps private regular files only.

Replay checks saved source/plan/report/seal bindings without opening runtime.
Removed/changed runtime does not change saved results or trigger new calls.
Historical plans retain read-only replay and refuse new execution; unsealed
records stay incomplete/unknown and are never repaired or re-sealed.

## Strict admission archive: separate and unavailable

`probe ROOT PROBE_PERMISSION.json` is explicitly unavailable for native execution.
Its historical four-invocation parent-guard design sought model-free startup
external-network restriction, a stricter condition than ordinary distribution.
Owned `probe-simulation` and `reopen-probe` remain for regression/replay. Neither
successful nor failed strict evidence is ordinary evaluation authority or an
ordinary prerequisite. Strict metadata/guard contracts do not gate ordinary eval.

The spent Mac Phase A on head46a815c passed version/exec help/sandbox help and
failed the outer Seatbelt -> worker -> CLI sandbox -> inner Seatbelt canary with
exit71 `sandbox_apply: Operation not permitted`; exact OS denial cause is unknown.
Models/evaluation/retries were zero. Runtime helper symlinks inside evidence
caused inventory rejection after the raw report was saved. The original stays
incomplete/unsealed. Earlier head31129d8 version SIGABRT is separate historical
unknown evidence. Neither failure is evidence that ordinary #314-style evaluation
cannot work. Runtime separation fixes the storage collision in mocks, not proof
of an actual EPERM fix. No old failed record or consumed grant is reused.

[Separate strict design history](local-codex-single-sandbox-design.md) retains
an optional guest candidate only. Ordinary distribution has no VM/guest/Docker
implementation or requirement; strict conditions do not become its defaults.

## Existing authentication without blanket chmod

A directory mode0700 rule conflated directory listing privacy, credential confidentiality and safe output writes. The v2 existing home may be 0755/0750: it must be canonical, current-user owned, owner-writable, not group/other writable, and have no ACL whose confidentiality is unknown. Preparation and probes check only this directory metadata, never auth contents.

Before evaluation, the metadata-only inspector requires existing `auth.json` to be a regular current-user file, exact0600, nlink1, no symlink or ACL. It never reads/hash/copies/links that file. Existing rollout directories must be owned, not writable by others and free of unknown ACLs. Historical rollout contents are neither inspected nor rewritten and their file modes are not changed. The newly selected session is separately checked for private file metadata before its bytes are captured. These checks do not establish token availability or validity.

Native subprocesses inherit temporary umask077. SQLite and runtime logs are redirected with per-command `sqlite_home` and `log_dir` to each owned private trial HOME; history persistence, analytics, feedback, update checks and memory generation/use are disabled per command. Existing databases/logs are not chmodded, copied or required to change mode. The native home-scoped session index, if present, must already be0600 because the pinned CLI can append session names there. Auth refresh and new rollout/index/runtime-helper writes remain possible CLI effects under the evaluate envelope. Persistent configuration/login/keyring settings are not changed.

Read-only investigation of this Mac found home0755 and auth0600, but existing `session_index.jsonl` is0644. The current evaluation guard therefore stops at that exact file. Neither changing the home to0700 nor changing unrelated existing DB modes is requested by this implementation. If the same home is to be used, a separately authorized file-mode change of this index to0600 is needed, or a verified CLI route that avoids that index. No such change was performed. ACL/ownership/session-directory failures discovered later also stop with their concrete metadata target.

The CLI can read and refresh its existing token and persist updated credentials. If credential writeback remains forbidden, real evaluation cannot proceed. Authentication-file confidentiality checks are metadata evidence only, not successful login evidence.

## Evaluation envelope and next actual run

No real plan or execution is authorized by this source change. Before the next
run, pin a fresh clean head, CLI/Node image identities, canonical fresh evidence /
workspace / external runtime roots, existing-home metadata and exact plan digest.
Review `codexPhasePermission(plan,"evaluate",newApprovalRef)` and explicitly
approve its changed trusted-CLI/traffic scope. Old strict grants and failed records
cannot authorize it. Existing index0644 remains a concrete precheck blocker;
this turn performs no chmod, auth, native CLI/probe/model or OS setting operation.

Approval wording (fill exact identities before approval, not an authorization):

> Approve the new `trusted_cli_lightweight_v1` plan at HEAD `<head>`, plan digest
> `<digest>`, reviewed CLI/Node images `<digests>`, and listed canonical roots.
> Trust the CLI/controller as ordinary user host processes. Permit one model-free
> sandbox control (10 seconds) and at most two Codex exec trials (120 seconds each),
> plain then kernel_only, with zero retries. CLI startup external traffic is not
> guaranteed zero; permit OpenAI model, existing-token read/refresh/writeback and
> managed-configuration traffic. The model-tool filesystem manifest and network
> denial remain closed. Stop on control failure/unknown, process/identity/privacy/
> usage failure or post-trial token thresholds. Save private local evidence and
> replay without new calls. Do not reuse prior grants or repair prior records.

This envelope counts CLI control/exec starts, not HTTP requests. A fresh approval
alone does not override failed existing-home metadata or an unavailable host route.
No VM/guest/Docker setup or implementation is required by ordinary evaluation.

The model is `gpt-6.1-sol`, reasoning medium. Per-trial30,000 and cumulative60,000 tokens are post-trial stopping thresholds, not hard billing caps. Unknown usage, provider/process/timeout/identity/scope/privacy failure stops subsequent trials. Incorrect task output is graded separately. Two execs can contain more than two model HTTP requests due to tools; auxiliary authentication/managed-config traffic is not a bounded request count.

Planned model inputs are the public task (817 bytes), input.json (188), schema (2,515), and, only for kernel_only, AGENTS.md (12,249) plus separators (stdin13,068 total). CLI built-in instructions, workspace paths, commands and tool outputs may also be sent. Explicit system/runtime read data remains within the manifest; this is not an assertion that only the three public fixture files are readable. Grading answers/private evidence/other trials/personal home data are outside the declared grants. Local saved session/output data is0600 and not uploaded. Provider target is the fixed ChatGPT Codex endpoint; token refresh and managed configuration can use auxiliary vendor endpoints.

## Verification contract and source rationale

Formal verification applies to phase authority, process lifetime, privacy and persistence. Required evidence: frozen-source connection/distribution/pilot regressions, shared usage/delivery tests, repo validation and bundle checks; independent semantic/architecture/output/adversarial review; exact-head Mac/Ubuntu fake CI. Tests also cover parent/model policy separation, missing/broadened policy refusal before launch, worker entry refusal before files/sockets/CLI, explicit canary evidence states and old-plan read-only replay. Tests cover one ordinary control plus two trials, strict-grant rejection before claims, unchanged strict records, seal corruption/incomplete records, source/mode/refusal, positive/deny unknowns, unwanted grants, privacy modes/links/ACL parser, fake faults and historical replay. These do not complete real-OS admission.

Pinned primary sources:

- [Permission profiles](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/permissions_toml.rs): optional inheritance and explicit filesystem maps allow removing broad parent defaults.
- [Config construction](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/config/mod.rs), [types](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/types.rs): independent SQLite/log roots, disabled history/memory settings.
- [Session index](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/rollout/src/session_index.rs): home-scoped append-only names can require existing-file confidentiality even when other logs move.
- [Auth manager](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/login/src/auth/manager.rs), [sandbox bootstrap](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/cli/src/debug_sandbox/cloud_config.rs): token refresh can persist; model-free startup can load managed configuration, requiring explicit ordinary CLI trust/traffic disclosure; strict startup-zero-traffic admission remains separate and unavailable.

Issue #291's formal14 pairs/28 trials and all ACs, Draft #313 and historical experiment records are unchanged. No merge is requested.
