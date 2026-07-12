# ASK Adapter Deployment Governance

This document defines the supported deployment profiles and operating responsibilities for Agent Spectrum Kernel adapters. It is the governance companion to `docs/adapter-conformance-contract.md`; conformance describes adapter behavior, while this document describes when a deployment can be called installed, activated, and operational.

## Deployment States

| State | Minimum evidence | Not enough |
|---|---|---|
| Installed | Core or adapter installer completed, install state exists, managed files match recorded hashes, and `ask-doctor` installation health is not failing. | File copy alone. |
| Activated | A human or project policy has selected the profile, hooks or commands are enabled for that profile, and required approval gates for external effects are resolved. | Installed assets that nobody invokes. |
| Operational | A governance judgment supported by one bounded task run, no unresolved current runtime-health issue, appropriate evidence capture, and unsupported-claim downgrade. `ask-doctor` reports the underlying machine evidence; it does not infer human profile approval or declare Operational by itself. | Passing projection checks, policy keys, or a smoke event without task evidence. |

Do not report deployment completion from file copy alone. A deployment can be Installed without being Activated, and Activated without being Operational.

## Profile Transition Integrity

Manifest pack profiles are strict discovery boundaries. Shrinking Claude or Codex from `full` / `organizational` to `daily` requires `--prune`; without it the adapter installer fails before writing. Prune removes only unchanged adapter-managed files. A modified excluded Skill is preserved and blocks the transition for explicit owner resolution.

Install state separates requested availability from physical discovery: `selected_skills` and derived `selected_planes` govern routing, while `installed_skills` and derived `installed_planes` report files that remain discoverable. `selected_projection_pack` is present only when the selected Skill set exactly matches a manifest pack. `--skills` sets `selection_mode: custom`. Routers fail with `capability_missing` when a destination is absent from `selected_skills`; they do not infer the missing workflow.

## Supported Deployment Profiles

| Deployment profile | Install / required assets | Compatible adapters | Unsupported combinations | Observability and external effects | Validate | Update | Detach |
|---|---|---|---|---|---|---|---|
| Local minimal | `install-kernel.mjs`, selected core skills, optional Codex `minimal` profile. | Core kernel; Codex projection. | Claude hooks without runtime; shared PR review; plugin-only metrics without project runtime. | Local files only; no hooks required; no external publication. | `ask-doctor`; adapter installer `--check`; repository tests. | Pull ASK, rerun installer with same profile. | `install-kernel.mjs --detach`; Codex `--detach` if installed. |
| Local observed | Core installer plus Claude project adapter, runtime scripts, `.claude/settings.json` managed hooks, `docs/ai/observability-config.yml`. | Claude project adapter; optional Codex projection for prompt use. | `--skip-runtime` with metrics hooks; external webhooks by default; treating hook writes as proof of correctness. | Project-local JSONL events and runtime-health only; no raw prompts, secrets, customer data, personal data, full file contents, or full command output by default. | `ask-doctor --runtime-probe`; `adapter-runtime-smoke.mjs --adapter claude`; event schema checks. | Rerun core then Claude installer; use `--check` before updates in controlled repos. | `install-claude-adapter.mjs --detach`; preserve ledgers/reports unless project policy deletes them. |
| Shared PR review | Claude project adapter plus Pattern B GitHub Actions template and explicit repository approval for Actions permissions. | Claude project adapter. | Always-on `pull_request` trigger; fork PR execution without explicit allow; auto-merge, deploy, release, publish, or external notification. | External CI execution is approval-required; event/report publication remains local unless separately approved. | Workflow dry review, `validate-repo`, PR head SHA/diff capture checks, trusted actor guard checks. | Update workflow from adapter template and rerun validation. | Remove workflow or disable trigger; run Claude adapter `--detach` if local project adapter is also removed. |
| Plugin distribution | Claude plugin package plus project runtime where metrics are desired. | Claude plugin, with or without Claude project adapter. | Plugin hook relying on PATH; plugin metrics hook claiming operational metrics when project runtime is absent; duplicate hook ownership. | Plugin hook resolves through `CLAUDE_PLUGIN_ROOT` and no-ops when project runtime is absent. External publication remains unsupported by default. | Plugin hook wrapper smoke; `ask-doctor` in each project that has project runtime. | Update plugin package and project adapter separately; project adapter owns project-local runtime. | Uninstall plugin; project adapter `--detach` only when removing local execution surfaces. |
| Codex projection | Core installer plus Codex adapter installer, selected `.agents/skills`, prompts, commands, and runner scripts. | Codex projection; can coexist with Claude project adapter. | Claiming hooks, telemetry, shared PR workflow, or automatic metrics from Codex projection; prompt references outside selected profile closure. | No hooks or telemetry are shipped. Runner evidence reaches `executed` only after captured output and sensors; business correctness remains unproven. | `install-codex-adapter.mjs --check`; `codex-exec-runner.mjs --dry-run`; `ask-doctor --runtime-probe`. | Rerun Codex installer with same profile; profile closure must pass before writing. | `install-codex-adapter.mjs --detach`; preserve non-managed project files. |

## Coexistence And Precedence

Claude project adapter and Claude plugin can coexist. The project adapter owns project-local commands, hooks, runtime scripts, install state, local metrics config, and ledgers. The plugin owns distributable entry points and delegates to the project runtime when it exists.

Precedence rules:

- Project-local `.claude/settings.json` managed hooks are the hook source of truth for a repository.
- Plugin hooks must resolve through `CLAUDE_PLUGIN_ROOT` and must no-op when `scripts/ai-metrics-record.mjs` is absent.
- Do not install two owners for the same hook command identity.
- Codex projection can coexist with Claude surfaces, but it does not activate Claude hooks or metrics.

## Ownership And Approvals

| Area | Owner | Approval required before |
|---|---|---|
| ASK version and installer revision | Repository maintainer or platform owner | Updating many repositories, changing install-state schema, or changing adapter default profile. |
| Project overlays and domain rules | Project technical owner | Adding durable project rules, domain-rule ledgers, or constraints that affect future delivery. |
| Review gates and routing policy | Engineering quality owner | Removing required review gates, narrowing profile closure, or weakening evidence requirements. |
| Hooks and metrics policy | Repository owner plus privacy/security owner where applicable | Enabling external publication, raw prompt storage, personal data storage, full command output storage, webhooks, or HTTP hooks. |
| Ledgers and debt lifecycle | Project owner | Archiving, deleting, or changing status policy for improvement/debt ledgers. |
| GitHub Actions and permissions | Repository admin | Enabling comment-triggered review, fork PR execution, elevated token permissions, external notifications, or publishing artifacts. |

Risk-gated approval is required for destructive, irreversible, credential-sensitive, production-facing, external, auth, billing, email, dependency, migration, infrastructure, publish, release, deploy, or notification actions.

## Observability Lifecycle

Default observability is local-first. The `lifecycle` fields in `docs/ai/observability-config.yml` are **policy declarations, not enforced by the current recorder runtime**:

- `commit_events_to_git: false`; event stores are project-local runtime data, not source artifacts by default.
- `retention_days`, `report_retention_days`, `rotate_when_bytes`, `schema_mismatch_action`, `quarantine_dir`, `deduplication_key`, and `schema_migration` describe the adopting project's required operational policy. They do not prove rotation, retention, quarantine, deduplication, or migration enforcement.
- `detach` removes managed execution surfaces and adapter-owned hooks while preserving project-owned metrics, reports, and ledgers.
- `purge-runtime-data` is a separate destructive, project-approved manual operation for event, health, and report data. ASK does not currently provide an automatic purge command.

Runtime hook failures are non-blocking, but not invisible. Non-blocking recorder failures append a sanitized local health entry under the adopting project root at `.agent-spectrum-kernel/runtime-health.jsonl`. Repeated failures preserve `first_seen_at`, update `last_seen_at` and `occurrence_count`, and are atomically bounded by `runtime_health.max_entries`. A later successful non-blocking recorder run writes a recovery entry. `ask-doctor` uses `last_seen_at`, warns only for unresolved entries inside `runtime_health.freshness_hours`, and reports older unresolved entries as historical; malformed entries are reported without preventing valid entries from being read. Health entries omit raw prompts, secrets, customer data, personal data, full command output, and full error messages.

## Event Semantics

`command_attempt` records that a shell command was attempted. It is not verification evidence and sets `classified_as_verification: false`.

`verification_attempt` is only for commands that match the verification command classifier or carry an explicit evidence linkage. A generic Bash hook must not classify every command as verification.

`task_stop`, `report`, and `ledger_refresh` summarize durable task or operation boundaries. They do not prove correctness, readiness, safety, or business impact by themselves.

## Metrics Governance

ASK metrics are for adoption support, workflow improvement, and capability evaluation. They must not be used for HR, compensation, promotion, personnel evaluation, individual productivity rankings, or individual performance scoring.

Rules:

- Avoid personal identifiers unless a project privacy policy explicitly approves them.
- Do not rank individuals.
- Separate adapter capability evaluation from runtime activity volume.
- State the purpose, access boundary, retention, opt-out path, and unsupported evidence before publishing a report.
- Treat adoption effect as signal or correlation unless stronger causal evidence exists.

## Success And Withdrawal Criteria

Adoption reports should include value and cost signals:

- re-review count,
- missed blocker rate,
- false positive rate,
- unsupported completion or readiness claims,
- scope deviation count,
- review duration,
- senior correction effort,
- token/time cost,
- routing success without manual skill naming.

Reports must include an `Unknown` or unsupported-causality section when evidence cannot connect ASK use to business outcomes.

Reduce, redesign, or remove a deployment profile when any of these persist after one improvement cycle:

- unsupported completion/readiness claims increase,
- missed blocker rate does not improve,
- false positives dominate reviewer time,
- routing requires frequent manual skill naming,
- hook/runtime health warnings remain unresolved,
- privacy or approval boundaries cannot be enforced,
- senior correction effort or token/time cost exceeds the value signal.
