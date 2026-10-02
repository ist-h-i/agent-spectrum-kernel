# Local Codex connection implementation (Issue #315)

This slice is stacked on Draft #316 (`10a9dbb9d9a2d2039d000f660c2e5c0ae8ead71e`). It implements the execution adapter, then exercises it with an owned Node simulation. **No real Codex command, model request, authentication operation, Windows host or WSL host was exercised.** Implementation availability and execution admission are separate.

## Shared core and platform boundaries

`scripts/ask-local-codex.mjs` reuses #314's immutable plan, task fixtures, kernel intervention, strict native session parser, machine grader, usage parser, process containment and evidence inventory. The only core parser extension permits a read-only pinned CLI helper directory beneath an explicitly declared existing `CODEX_HOME` deny root. It does not allow general access to that root. The adapter pins Codex CLI 0.157.1 and the reviewed executable's byte digest; changing CLI versions requires reviewing the session/config contract again.

The POSIX command is identical on macOS and Linux. The pinned official CLI selects Seatbelt on macOS and Landlock on Linux for `codex sandbox`; it has a Windows implementation, but this adapter deliberately rejects native Windows Node. See [pinned official CLI source](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/cli/src/main.rs) and [sandbox implementation](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/cli/src/debug_sandbox.rs). On Windows the entry remains existing WSL2 Ubuntu with Linux Node and Linux CLI. A Linux test does not verify Windows or WSL2. Docker is optional and unnecessary for this slice.

| Route | Implementation | Evidence in this slice | Real execution admission |
|---|---|---|---|
| macOS 14+, x64 / arm64, Node 24 | POSIX launch / Seatbelt selection | owned simulation; local Mac and CI fake host checks | not exercised |
| Ubuntu 22.04 / 24.04, x64 / arm64, Node 24 | POSIX launch / Landlock selection | platform-independent tests and Ubuntu CI simulation | not exercised |
| Windows 11, existing WSL2 Ubuntu | Linux launch; explicit WSL route identity | synthetic host descriptor only | not exercised |
| Windows native | rejected | refusal contract | unsupported |

CPU, kernel and glibc prerequisites remain those in [distribution design](local-eval-distribution.md). `live_ready` stays false even after synthetic success. The host fingerprint, route, CLI image, source identity and complete command are bound into the connection plan.

## Authentication and execution boundary

Preparation accepts canonical absolute paths for `privateRoot`, `workspaceParent`, existing `codexHome`, and a separately reviewed native `executable` plus `imageDigest`. It does not invoke Codex. It checks directory metadata, not credential bytes, and never changes permissions. The existing home must be owned by the current user, mode 0700, and disjoint from the controller, evidence and trial workspaces. Existing authentication availability is **unknown**; there is no login, credential reader, copy, link or auth writer in this adapter.

Trials use a new empty `HOME` and the user's explicitly admitted existing `CODEX_HOME`. Only the future approved CLI can read or refresh its own credential store. This avoids the old pilot's authentication link mechanism. It also means a future run's authorization must explicitly include CLI access/refresh to that existing store. The task's filesystem policy denies that entire directory, allowing only the pinned runtime helper exception. Session logs that the CLI writes there are selected by the newly returned thread ID, exact filename suffix, start time, regular-file identity, workspace, version, model, reasoning, provider and permission profile. Only that selected log is saved in the private evidence; unrelated history is never copied.

Four model-free checks have their own empty HOME/CODEX_HOME: version, exec help, sandbox help, and sandbox canaries. The canaries check denied reads of controller/private/other-trial roots and the existing home directory. They do **not** prove network or write enforcement, credential availability, or real sandbox behavior when simulated. Network admission is separately required before any future live invocation.

`runCodexConnection(root, permission)` implements future native invocation but there is no live CLI command and no permission writer. A new `ask_local_codex_permission_v1` record must bind the exact plan/source/image/route and explicitly authorize four probes, two trials, zero retries and existing-home CLI read/refresh. It must also reference independently obtained real-host image/network admission for the exact source, executable and host. These approval/reference fields are trusted operator assertions, not cryptographic proof or automatically generated admission. Historical experiment grants, synthetic admission and #291 budgets cannot satisfy this gate. No such permission was created or used in this work.

## Evidence, interruption and budget contract

Each condition has a separate workspace, schema/final-output location, process log, session capture, usage evidence and immutable spent claim. Task inputs contain input.json/task.md; grading answers and kernel-controller materials stay outside the workspace. Both conditions share model/settings, with kernel bytes as the sole intended intervention. Session identity is checked independently of task correctness.

The reused executor enforces 120 seconds, forced process-group termination and a 1 MiB output limit. Trials never retry. Process failure, interruption, surviving descendants, unknown usage, provider stop, identity/boundary faults or a post-trial 30,000-token threshold stop subsequent trials. The cumulative ceiling is 60,000 tokens, checked after completed usage capture. These are post-trial spending controls, not guaranteed hard provider billing limits. Known-token sums are explicitly partial when usage is unknown. A wrong or malformed answer remains a machine grading failure rather than a transport failure.

Claims are written before invocation. Raw output and any selected session survive verifier failure. All newly written evidence uses owner-only files and no-replace persistence. A final seal binds the inventory. `reopen` verifies and reads it without commands, credentials, regrading or model calls; an interrupted unsealed directory is returned as incomplete/unverified, never silently resumed or repaired. A second invocation against a spent directory is refused. Existing experiment records are untouched.

Simulation requires a new empty owned home. Its marker binds that home to the plan, and it refuses a pre-existing credential/session-containing home. Its Node fixture writes only synthetic sessions, has no network/auth implementation, and is selected explicitly in the immutable plan. Fault tests cover normal execution, wrong/malformed answers, unknown and threshold usage, provider/error exit, timeout/interruption, missing/reused/mismatched sessions, denied canary, evidence mutation and historical-grant refusal. The original pilot regressions protect the shared parser's default behavior.

## Next unmet acceptance criteria

Before a real run, separately authorize fresh model usage and CLI access/refresh to the existing authentication store, obtain exact-host sandbox/network admission, and verify the pinned image on that host. Then exercise each real OS/CPU route and record observed rather than inferred results. This slice does not supply those grants, claim three-OS support, establish ASK superiority, relax formal Issue #291's 14 pairs/28 trials, transplant Draft #313, or force its strict Stage B diagnostics into ordinary distribution. #313 remains Draft/open and its evidence is preserved.

## Verification Contract

- Artifact ID: issue315-local-codex-connection-v1.
- Artifact type: verification; formal path because this change crosses session identity, process lifecycle and persistent evidence boundaries.
- Upstream refs: Issue #315, #314 shared core, Draft #316 distribution boundary; Issue #291 and Draft #313 are preserved exclusions.
- Behavior to prove: only owned simulation executes in current authorization; declared existing-home boundary; isolated grading/trials; fail-closed identity/usage/process outcomes; spent claims and verified read-only replay.
- Focused checks: `node --test scripts/test-ask-local-codex.mjs scripts/test-ask-local-eval.mjs scripts/test-ask-synthetic-json-pilot.mjs`; shared usage/delivery regressions; repository validation; adapter bundle freshness; diff check.
- Evidence required: tests on frozen source, independent review of final diff, exact submitted-head CI on Ubuntu and macOS. PR comments record the head, results and review disposition.
- Insufficient-evidence conditions: synthetic host selection, fake canaries and CI Node processes do not verify real CLI, authentication, network enforcement, WSL or Windows. A source-drift failure during concurrent edits is not final-source success evidence.
- Evidence required before completion claim: passing focused checks and exact-head CI establish this implementation slice only. End-user real-route acceptance remains unknown until separately authorized real-host validation.
