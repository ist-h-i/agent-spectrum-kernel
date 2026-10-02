# Split Mac admission and evaluation (Issue #315)

The v2 adapter in Draft #317 separates preparation, probes, evaluation and
offline replay. New plans require the `owned_external_runtime_v1` layout.
The current runtime-storage correction is source/fake-only; it performs no
native CLI/probe/model/auth/chmod/OS policy operation. **Native admission and
evaluation are disabled**: the known nested Seatbelt launch cannot be enabled
by a fresh approval alone. See [the non-nested design](local-codex-single-sandbox-design.md).

The authorized Mac Phase A on head46a815c used four invocations: version/exec
help/sandbox help passed; the canary failed with exit71 and `sandbox_apply:
Operation not permitted`. Models/evaluation/retries were zero. CLI helper
symlinks under evidence caused inventory rejection after the raw report was
saved; the original record remains incomplete/unsealed. The earlier head31129d8
version SIGABRT remains a separate historical unknown. Runtime separation does
not establish an EPERM fix. Old plans/evidence remain readable and untouched;
consumed permissions cannot start the corrected source/plan.

## External runtime ownership and replay

The descriptor requires `runtimeRoot`: a pre-created empty canonical directory,
current-user owned, owner-only, without unknown ACLs. Also provide `privateRoot`
and `workspaceParent`. Runtime must be outside evidence, workspace parent,
controller and existing CODEX_HOME, with no containment in either direction.
Preparation binds device/inode/owner, versioned layout and canonical root in
the plan, writes an exclusive runtime-owner claim bound to the plan digest,
and adds the root to the closed model-tool deny policy. Runtime is never chmodded
or reused. Permission and probe report bind the same runtime contract; source/plan
changes require new authorization, never reuse the consumed Phase A grant.

Probe HOME/CODEX_HOME lives at `runtimeRoot/connection-probe/home`. Trial HOME,
SQLite and log roots live at `runtimeRoot/{plain,kernel_only}/home`; evaluation
CODEX_HOME remains the existing separately admitted store. Phase directories
are exclusively created, preventing runtime reuse. Ordinary CLI helper links
may exist in runtime; they are never followed/copied into evidence. Evidence
continues rejecting arbitrary symlinks/hardlinks. Runtime is not model input;
the existing narrowly checked CLI-helper session exception is unchanged.

Offline replay validates saved plan/report/seal bytes and path/binding shape
without opening runtime or executing it. Missing, changed or removed runtime
cannot alter sealed results. Execution validates current runtime identity and
ownership; replay is not an execution admission. Historical plans lacking the
layout retain read-only replay but refuse new execution. Old unsealed records
remain incomplete: this change does not repair or re-seal them.

## Implemented entrances

1. `prepare DESCRIPTOR.json` creates a v2 plan without starting Codex. Canonical image bytes, source, host, home directory identity and a closed command are sealed. The Mac native image must be specified directly, rather than the npm wrapper. Native preparation requires committed clean source.
2. `probe ROOT PROBE_PERMISSION.json` runs at most four Codex invocations with zero model trials and no existing-store access. The permission must equal the closed `codexPhasePermission(plan,"probe",newApprovalRef)` envelope. This pure builder describes approved actions; it does not itself grant authorization. `probe-simulation ROOT` performs the owned-fake route without a live permission.
3. `reopen-probe ROOT` reads the sealed result without commands. Interrupted/unsealed results are incomplete/unknown and cannot admit evaluation. Evidence checks cover the complete probe directory, saved permission/claim/report, exact plan/source/CLI/command/host/guard and mode.
4. `evaluate ROOT EVALUATE_PERMISSION.json` consumes that verified probe admission, runs zero new probes, and starts at most plain then kernel_only. Its distinct envelope uses `codexPhasePermission(plan,"evaluate",newApprovalRef,canonicalDigest(admission))`. Real admission must be from the same real plan and host, successful, and less than one hour old. `evaluate-simulation ROOT` cannot be promoted by a live permission.
5. `reopen ROOT` verifies final evidence without Codex, credentials, model calls or regrading. A second probe or evaluation against a spent directory refuses. The convenience `simulate` combines only owned fake phases; combined live execution refuses.

Approval references are nonsecret references to fresh human authority. Local digest seals detect mutations, not malicious rewriting by an actor who controls all evidence files. They are not signatures or substitutes for human authorization. There is no automatic permission writer or reuse of prior experiment grants.

## Probe scope and enforcement

Four invocations: version, exec help, sandbox help, sandbox canary. Each has ten seconds, SIGKILL/process-group cleanup and 1 MiB streams. Failure/unknown aborts the phase; there are no retries. A new owner-only HOME/CODEX_HOME and a closed environment omit API keys, keyring settings and ordinary auth paths.

On Mac each invocation is wrapped by the fixed `/usr/bin/sandbox-exec` image.
The **trusted runtime parent** permits ordinary host file reads, including
system/library loader dependencies and unrelated user files, except the
explicitly declared existing CODEX_HOME, whose file reads/writes are denied.
It retains writes only to owned probe HOME/workspace, literal synthetic
canaries and /dev/null, loopback-only network rules, and denied securityd /
security agent Mach lookups. This is not isolation of personal files or every
credential store from the trusted CLI. Empty HOME/CODEX_HOME, closed env and
per-command file-store config remain separate controls. No persistent setting
changes or complete IPC/egress guarantee is claimed.

The source-bound `probe_parent_policy` in new plans states that host read scope.
Missing or changed parent contracts refuse before a probe claim. This policy
is never copied into the model-tool filesystem grants. Linux/WSL real parent
admission is still unimplemented and refuses. The specific OS resource behind
the old SIGABRT is unknown; no guessed dyld/OS alias allowlist was added.

This is a correction to the trusted CLI/controller threat model already stated
in distribution docs. The old deny-default whole-CLI read whitelist
unnecessarily inherited #313-style strict host bootstrap. A future real probe
needs **new approval** explicitly acknowledging the broader parent host read
scope and the unchanged closed model-tool scope, after pinning the new clean
head, image and plan. Source authorization here is not execution authority.

The fourth guarded Node worker validates the explicit model-tool filesystem/network profile and managed-config flag before any file/socket/CLI operation. It then opens the negative filesystem canaries outside the nested sandbox, then proves connections to its live IPv4/IPv6 loopback listeners. It invokes one nested Codex sandbox with the same endpoints. The nested child checks allowed workspace read/write, denied synthetic grading / other-trial / auth-like / unrelated-file reads, denied other-trial write, and denied TCP connection for both families. No real credential bytes or unrelated user file is used as a canary. Only EPERM/EACCES proves denial; connection success fails, timeout/refused/unsupported is unknown. Listener cleanup is bounded by the ten-second containing process group. There is no external test server or model endpoint. Fake results carry `synthetic_only`, even when every simulated canary passes.

The **model-tool** command does not inherit `:workspace` filesystem defaults. Root `/` is deny, with explicit read grants for selected system libraries/data, individual shell utility executables, the exact Node/CLI images, and one trial workspace write grant. No general home, `/etc`, `/tmp`, `/proc`, `/bin` or `/usr/bin` read grant is made. Probe workers have three extra literal public source-file grants only for that canary; evaluation does not receive them. The native session verifier accepts the exact declared entries and at most the pinned CLI's named arg0 runtime helper. Extra paths, grants or duplicates fail. Runtime dependencies outside the manifest fail closed; the inspected nodebrew Node links only system libraries, but actual startup inside Seatbelt is still unverified. Homebrew or other dynamic runtimes need a reviewed dependency manifest rather than a broad user-directory exception.

Both trial and sandbox launch builders require the exact generated closed
model-tool command and closed read manifest. Missing root deny, profile or
network policy, inherited defaults, extra host read grants, and v1 execution
refuse. The guarded worker separately rejects malformed/missing filesystem,
network, profile or managed-config settings. The worker payload and expected
filesystem string come from the trusted controller; this is an accidental
policy-loss guard, not authentication of arbitrary hostile worker payloads.

Metadata version/help checks prove version/flag compatibility only. Official
[arg0 startup](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/arg0/src/lib.rs)
can read CODEX_HOME .env and prepare helpers before Clap parsing; model-free
does not mean filesystem-free. Reports distinguish metadata compatibility,
filesystem enforcement and network enforcement. Unrun canaries are
`not_exercised`, failed/unknown checks are not admission, and fake successes
are `synthetic_only`. Historical fixed filesystem labels remain archived
unchanged and must not be interpreted as successful canary observations.

The file-data boundary is implemented, not a claim that all host IPC protocols or every possible egress channel were tested. Real admission proves the exercised filesystem operations and loopback TCP IPv4/IPv6 controls on the selected host/profile. It is not Windows/WSL evidence or ASK-superiority evidence.

## Existing authentication without blanket chmod

A directory mode0700 rule conflated directory listing privacy, credential confidentiality and safe output writes. The v2 existing home may be 0755/0750: it must be canonical, current-user owned, owner-writable, not group/other writable, and have no ACL whose confidentiality is unknown. Preparation and probes check only this directory metadata, never auth contents.

Before evaluation, the metadata-only inspector requires existing `auth.json` to be a regular current-user file, exact0600, nlink1, no symlink or ACL. It never reads/hash/copies/links that file. Existing rollout directories must be owned, not writable by others and free of unknown ACLs. Historical rollout contents are neither inspected nor rewritten and their file modes are not changed. The newly selected session is separately checked for private file metadata before its bytes are captured. These checks do not establish token availability or validity.

Native subprocesses inherit temporary umask077. SQLite and runtime logs are redirected with per-command `sqlite_home` and `log_dir` to each owned private trial HOME; history persistence, analytics, feedback, update checks and memory generation/use are disabled per command. Existing databases/logs are not chmodded, copied or required to change mode. The native home-scoped session index, if present, must already be0600 because the pinned CLI can append session names there. Auth refresh and new rollout/index/runtime-helper writes remain possible CLI effects under the evaluate envelope. Persistent configuration/login/keyring settings are not changed.

Read-only investigation of this Mac found home0755 and auth0600, but existing `session_index.jsonl` is0644. The current evaluation guard therefore stops at that exact file. Neither changing the home to0700 nor changing unrelated existing DB modes is requested by this implementation. If the same home is to be used, a separately authorized file-mode change of this index to0600 is needed, or a verified CLI route that avoids that index. No such change was performed. ACL/ownership/session-directory failures discovered later also stop with their concrete metadata target.

The CLI can read and refresh its existing token and persist updated credentials. If credential writeback remains forbidden, real evaluation cannot proceed. Authentication-file confidentiality checks are metadata evidence only, not successful login evidence.

## Evaluation envelope and next actual run

There is no next runnable Mac plan yet. A non-nested launch boundary with an
independent model-free external-network restriction must be designed, reviewed
and implemented before proposing a real probe. The known nested route is
refused before any phase claim or invocation. Only then can a fresh source/plan
and separate probe authorization be considered. Existing index0644 remains an
evaluation blocker; no chmod/auth operation is included in this correction.

The model is `gpt-6.1-sol`, reasoning medium. Per-trial30,000 and cumulative60,000 tokens are post-trial stopping thresholds, not hard billing caps. Unknown usage, provider/process/timeout/identity/scope/privacy failure stops subsequent trials. Incorrect task output is graded separately. Two execs can contain more than two model HTTP requests due to tools; auxiliary authentication/managed-config traffic is not a bounded request count.

Planned model inputs are the public task (817 bytes), input.json (188), schema (2,515), and, only for kernel_only, AGENTS.md (12,249) plus separators (stdin13,068 total). CLI built-in instructions, workspace paths, commands and tool outputs may also be sent. Explicit system/runtime read data remains within the manifest; this is not an assertion that only the three public fixture files are readable. Grading answers/private evidence/other trials/personal home data are outside the declared grants. Local saved session/output data is0600 and not uploaded. Provider target is the fixed ChatGPT Codex endpoint; token refresh and managed configuration can use auxiliary vendor endpoints.

## Verification contract and source rationale

Formal verification applies to phase authority, process lifetime, privacy and persistence. Required evidence: frozen-source connection/distribution/pilot regressions, shared usage/delivery tests, repo validation and bundle checks; independent semantic/architecture/output/adversarial review; exact-head Mac/Ubuntu fake CI. Tests also cover parent/model policy separation, missing/broadened policy refusal before launch, worker entry refusal before files/sockets/CLI, explicit canary evidence states and old-plan read-only replay. Tests cover split phase counts/no repeated probes, seal corruption/incomplete records, source/mode/refusal, positive/deny unknowns, unwanted grants, privacy modes/links/ACL parser, fake faults and historical replay. These do not complete real-OS admission.

Pinned primary sources:

- [Permission profiles](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/permissions_toml.rs): optional inheritance and explicit filesystem maps allow removing broad parent defaults.
- [Config construction](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/core/src/config/mod.rs), [types](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/types.rs): independent SQLite/log roots, disabled history/memory settings.
- [Session index](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/rollout/src/session_index.rs): home-scoped append-only names can require existing-file confidentiality even when other logs move.
- [Auth manager](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/login/src/auth/manager.rs), [sandbox bootstrap](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/cli/src/debug_sandbox/cloud_config.rs): token refresh can persist; model-free startup can load managed configuration, motivating the separate parent guard.

Issue #291's formal14 pairs/28 trials and all ACs, Draft #313 and historical experiment records are unchanged. No merge is requested.
