# Local eval distribution: route decision and first delivery slice

For a concrete public engineering task, lightweight bypass input and pending
Installed/Activated/Operational worksheet on Mac, see
[first workflow preparation](first-workflow-mac-codex-ja.md). Its local installer
and intentionally failing seed-test check prepare inputs only. They are separate
from the comparison/pilot workflow and do not satisfy this issue's live or OS ACs.

Design/implementation `IMP-LOCAL-EVAL-315-1`, revision 1. Upstream: Issue #315
(distribution), merged #314 at `1eb4b4a6a0d4e7f2306113bb6237006ccc82b145`.
Issue #291 retains all formal ACs, 14 pairs/28 trials, its budgets and #197
authority. This document does not admit a formal experiment.

Current execution adapter: [ordinary trusted-CLI lightweight route](local-codex-admission.md)
in Draft #317, stacked on #316. It uses one model-free tool-sandbox control and
at most two trials with fresh explicit CLI trust/traffic authority. Strict
startup-zero-traffic admission is separate/unavailable and is not required by
ordinary distribution. No guest/VM/Docker implementation or requirement is added.
This correction is source/mock-only; native real-OS verification remains unmet.

## Current priority: Mac value evidence

The three-OS distribution goal remains unchanged. Linux native, Windows WSL2
and optional Docker real-host verification are deferred follow-up work while
[Mac three-condition ASK value screening](mac-kernel-value-screening.md) prepares a bounded
engineering comparison. Cross-platform setup is not a prerequisite for that
investigation. The proposed ASKなし/Kernelのみ/Full ASK conditions are not yet implemented by
the two-slot runner, and do not complete the four-condition ASK portfolio.
Neither CI nor the fixed JSON pilot establishes practical value.
#198, #291 and #285/#286 retain their protocols and acceptance criteria.

## Route decision

Choose a shared Node controller/scorer/store with POSIX process-group cleanup
and small OS-specific sandbox/session adapters. No new dependencies. The first
slice supplies a model-free setup check, synthetic comparison and sealed local
reopen. Real model distribution remains **unadmitted** on every new route.
The older pinned Mac pilot remains available through its original commands and
approval contract; this entry point cannot start it or bind permission.

| Target route | Prerequisites chosen for distribution | This slice | Remaining real-host proof |
| --- | --- | --- | --- |
| macOS POSIX | macOS 14+, native arm64 or x64, Node 24.x, Git | fake entry; current arm64 host smoke | x64 smoke; per-image CLI/sandbox admission; clean-user real pair/reopen |
| Linux POSIX | Ubuntu 22.04/24.04, x64 or arm64, kernel 5.15+, glibc 2.35+, Linux Node 24.x, Git | fake entry and CI target | arm64/22.04 smoke; CLI image/session/sandbox admission; real pair/reopen |
| Windows WSL2 | Windows 11 with already-installed WSL2 Ubuntu 22.04/24.04; x64 or arm64; Linux Node/Git and Linux filesystem | Linux code path, separate route identity; selector tests only | actual WSL2 clean setup, controls, process termination, real pair/reopen |
| Native Windows | PowerShell/Windows Node | unsupported by this entry point | distinct process-tree cleanup, private ACL storage, auth and sandbox boundary design |

Version/architecture coverage in this table is a **planned target**, not a
completed support claim. Fake readiness checks observed Darwin/kernel version,
architecture, Node major, Git, distro and libc. They do not inspect the Windows
host version from inside WSL. Use `wsl --list --verbose` yourself to confirm
version 2; the controller never enables WSL or changes system settings.
WSL1, Windows Node inside WSL, Git Bash, Alpine/musl, 32-bit CPUs, Rosetta,
containers, other Linux distributions and old macOS versions are outside this
slice's declared route. A container may resemble Ubuntu to preflight; readiness
does not certify that it is an admitted host.

Docker is unnecessary for the selected default. It would add installation,
mount, identity and authentication boundaries without proving the current
model-tool denial policy. Optional future container/strict profiles need their
own admission; there is no Docker fallback or requirement here.

Sources checked 2026-10-02: [official Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
documents user installation/sign-in; [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)
documents native support and its administrator-approved setup; [WSL](https://learn.chatgpt.com/docs/windows/wsl)
documents Linux tooling as an alternative. Choosing WSL is an ASK complexity
decision, not a claim that Codex lacks native Windows support.
[Node 24.19.0 platform table](https://github.com/nodejs/node/blob/v24.19.0/BUILDING.md)
lists x64/arm64 macOS and glibc Linux; its WSL note says Linux binaries should
work but WSL-only issues are outside Node's supported-platform promise.
ASK therefore requires its own WSL evidence.

## Setup and model-free use

Use a checkout of this PR/its eventual merged commit. Install Git and official
Node 24 through your normal OS setup; this code performs no installs. No npm
dependencies, Codex installation or sign-in are needed for the first slice.
Within WSL, clone into the Linux home filesystem, not `/mnt/c`, and use Linux
`node` and `git` in a WSL terminal. On Mac/Linux use the normal terminal.

```sh
node scripts/ask-local-eval.mjs preflight
# Choose a NEW canonical absolute evidence directory outside the directory
# containing this checkout (the controller root), not merely outside the repo.
# Its parent must already exist; the last directory must not exist.
node scripts/ask-local-eval.mjs fake /absolute/private-results/new-run
node scripts/ask-local-eval.mjs reopen /absolute/private-results/new-run
```

Preflight is read-only and launches only `git --version`, never Codex. JSON
reports `fake_ready`, reasons, and `live_ready: false`; exit 2 means prerequisites
are unavailable. Execution/reopen refusal exits 1. A completed synthetic result
exits 0, including a recorded failed/stopped outcome; inspect `report.stop` and
the slot states. `summary` gives a short readable interpretation alongside the
machine report. Fake tokens and grading are synthetic, not account consumption.
The path printed by fake is local/private; do not paste the full JSON into an
Issue because private plans contain local paths.

Use the physical/canonical path (resolve symlinks, including macOS `/tmp` to
`/private/tmp`). The fake controller root is the directory containing the
checkout; evidence and temporary workspace parents must be outside it. For
example, clone under `$HOME/projects/ask` and save under a private
`$HOME/eval-results/new-run`; do not clone directly under `$HOME` because that
would make the whole home the controller root. No root is relaxed for live
execution. Preflight checks runtime prerequisites only; final path checks occur
before execution and a refused preparation may leave an unused evidence directory.

Results persist until the user removes them. Directory mode 0700 and files
0600 use the existing pilot writer on POSIX. Choose a private, durable local
parent outside version control, not a cloud-synced/shared directory. Temporary
workspaces remain separate and their recorded paths must remain available for
current pilot reopen. Reopen is read-only, verifies the evidence seal, and makes
no model/CLI/auth calls or current-source comparison. It is an inspection of
saved bytes, not a new scoring run. Renaming/moving the evidence or workspace
roots is not supported. Missing/incomplete evidence fails closed; no hidden
repair, retry or new model call occurs. If interrupted before sealing, retain
the claim/checkpoints as incomplete evidence; do not rerun that directory.

## Comparison and result contract

Reuse #314's JSON aggregation fixture and P1 strict format/P2 expected totals/P3
seed-only workspace grading. Plain then kernel_only receive identical input,
model/reasoning declarations, runtime/argv/env, constraints and scorer. The
intended difference is the exact `AGENTS.md` bytes prepended to the task.
No generated answer code is executed. This fixture is wiring calibration and
cannot establish statistical superiority, token savings or general product value.

`plan.json` records commit/tree, tracked diff and source-file hashes, kernel/task
stdin identities, model/medium reasoning, Node image/version, fixed CLI image
declaration and limits. In fake mode CLI status is explicitly not inspected or
executed. `local-eval.json` adds actual OS/kernel, CPU, distro/libc, Node version,
route/prerequisite observation and entry-file SHA256. It is written **before**
execution and included in the existing evidence seal. `report.json` retains
slot state, grade/final format/process status, known/unknown usage and stop.
`summary` never replaces that machine authority. A source dirty state is
allowed only for synthetic wiring; it is not a release-source claim.

The core preserves complete failure/unscored/not_started/spent_incomplete
outcomes. Unknown usage stays null/unknown; cumulative known tokens are a
partial sum and never establish total consumption when a trial is unknown.
Each slot is create-once; no retry/replacement. Planned per-trial timeout is
120s, output limit 1MiB, answer limit 64KiB; a residual POSIX process group is
terminated and stops continuation. Escaped groups are not detected. Usage stops
at >=30k per completed trial or >=60k cumulative completed known tokens before
the next slot. These are post-completion stops, **not hard token/cost caps**.
Provider stop or unknown accounting also stops. Subscription/API costs and
provider request counts are not inferred from configured limits.

## Safety and future live boundary

The controller, Node and Codex CLI are trusted. Task workspaces contain task.md
and input.json, plus the intended kernel intervention through stdin. Expected
answers, grader implementation and result/session evidence are controller-side,
never seeded as task input. Fake execution is an owned Node program with no
credential access or real sandbox claim. For future live routes, require a
model-free canary proving the chosen CLI's active model-tool read/write/network
policy and session identity for each supported image/route before any pair.
Preserve managed policy and stop on mismatch; do not disable administrator
rules, silently fall back, or inherit old Stage B strict-host requirements.

The Mac pilot's explicit evidence/controller/auth/other-trial denies constrain
model tools; they do not isolate the whole CLI, same-UID processes or hostile
host users. A digest seal detects accidental evidence modification, not an
attacker able to rewrite both evidence and seal. No private content, credentials,
raw sessions or user/machine identifiers are uploaded automatically.

Future live delivery must use the user's own ordinary Codex sign-in and limits,
an admitted CLI version/image digest per OS/CPU, observed session model/config,
and explicit execution authorization. Existing pinned pilot: CLI 0.157.1,
Darwin arm64 image, Node v24.19.0, GPT-6.1 Sol/medium. Merely installing the same
CLI version on another OS is not admission. This task grants no new model run,
auth setup/cache change or consumed-grant reuse.

## #313 source disposition

Inspected #313 `6d221120f87d1caa56f9cf8b3d596841a913642c` against current main
`1eb4b4a6a0d4e7f2306113bb6237006ccc82b145`. **No bytes are copied from #313
in this slice.** Source groups remain available and Draft/open.

| Source candidates | Destination/disposition | Dependency/test evidence |
| --- | --- | --- |
| scripts/ask-benchmark-stable-file.mjs; scripts/ask-benchmark-prompt-successor-usage.mjs | already byte-identical on main; reuse main through #314 | focused pilot tests cover stable reads, malformed JSON/UTF-8, unknown usage |
| scripts/content-addressed-store.mjs | retain main; #313's four-line empty-file handling delta deferred, no consumer requires it | no-replace writer and pilot seal/reopen reused; no shared storage edit |
| scripts/ask-benchmark-execution.mjs | reuse main's exported contained helper through #314; #313's 41-line difference deferred | existing default behavior untouched; focused timeout/output/descendant tests |
| scripts/ask-benchmark-judge-tool-free-reopen.mjs and judge-native/capture/process helpers | no extraction; pilot already provides private capture/reopen/create-once | pilot tamper, once-only, session identity, failure and reopen tests |
| calibration-execution-admission, measured-execution/recovery and llm-judge/qualification/derived-result modules; calibration fixtures/catalogs | retained with #291 | formal #197/private authority and 28-trial dependencies not moved |
| judge-host-bootstrap/controls/live-host-authority and tool-free profile/capture; docs/prompt-successor-judge-host-bootstrap.md | defer strict-host profile outside default distribution | fixed Mac policy/bootstrap/request-capture chain not admitted; historical failures preserved |
| aggregate runtime bundle/workflow/source hashes | regenerate only for actual future extraction | this slice leaves core authority bytes unchanged; adds independent fake-only workflow |

This is group-level disposition for the bounded slice, not complete reconciliation
of all 118 #313 files or permission to narrow/close it. Further selected reuse
must identify exact source/destination and dependency/test closure.

## Verification contract and next acceptance evidence

`VER-LOCAL-EVAL-315-1` selects `formal_verification_contract` under
ask.verification-proof-policy@1.0.0: `state_concurrency_persistence_lifecycle_or_cross_module`
and `merge_release_or_stable_trace` triggers. Obligations: route refusal before
writes; truthful fake/live status; sealed OS identity; no-replace save; immutable
reopen without CLI/model calls; readable unknown/failure states; preservation of
#314's malformed-output, timeout/failure, budget and tamper coverage.

Checks: `node --test scripts/test-ask-local-eval.mjs scripts/test-ask-synthetic-json-pilot.mjs`,
shared usage/delivery regression suites, `node scripts/validate-repo.mjs`,
runtime bundle freshness and `git diff --check`. CI runs fake lifecycle on
Ubuntu 24.04 and macOS 15 with Node 24.19.0; CI cannot establish WSL, real Codex
sandbox, provider/auth or model behavior. Selector fixtures are mocked, not
actual platform verification. See the PR for exact-head observed results.

Next unmet #315 AC: clean setup and actual live pair/save/reopen on **each**
admitted OS route, including WSL2 and CPU coverage; portable live adapter/image
identity and canary admission; user-owned sign-in guidance verified end to end.
Fresh model execution needs separate authorization. No #315 checkbox is
automatically completed by this first slice; #291 remains unchanged.
