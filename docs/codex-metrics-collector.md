# Codex managed-runner local metrics

Issue #386 adds an opt-in collector at the existing `codex-exec-runner.mjs`
completion/stop boundary. Model-free fixtures verify this bounded entry; they do
not establish live operation or improvement effectiveness. Ordinary Codex app
conversations, arbitrary CLI sessions and historical sessions are unsupported.
The collector never scans conversation/session directories or databases.

## Install, enable and disable

Install/update core and the Codex adapter using the existing project-local
installer procedure in [the adapter README](../adapters/codex/README.md). The
adapter projects the collector and shared recorder/summarizer dependencies; it
does not enable collection. Create `.agent-spectrum-kernel/codex-metrics.json`
in the adopting project only when collection is desired:

```json
{"schema_version":"1.0.0","enabled":true}
```

Set `enabled` to `false` or remove this configuration to stop new collection.
Existing records are retained. No global config, credentials, environment
variables, scheduler or network service is needed. Missing config is disabled;
malformed config degrades with a sanitized reason.

After an actual child execution attempt, the managed runner collects its own
structured result before returning its original exit decision. Dry runs and
preflight-only paths do not record a task. The collector does not launch a model
or CLI, and there is no per-prompt instruction to write metrics.

## Boundaries and identity

One runner invocation owns a fresh task ID and run ID. The runner freezes its
source digest before preflight/child execution. The collector requires this
execution-start source; delayed ingestion never substitutes the installed
collector-time source. Identity combines adapter, task, run and source. Replaying
the same boundary updates the same event; identical results from other tasks or
runs remain distinct. The original boundary timestamp governs period filtering.

Input reports must pass the canonical normalized mapper and schema checks. The
privacy projection also passes normalized type and semantic validation. If
filtering unknown contract names removes all applied contracts, the projected
claim is downgraded to insufficient evidence. Metrics events are separately
validated against the existing metrics schema and written with the shared locked,
atomic recorder. The normalized event and metrics event are different types.

Only controlled contract/gate identifiers survive projection. Free-text evidence,
raw IDs and source bytes become digests. Raw prompts, command/output text,
conversation contents, credentials, customer/personal data, and full source are
not stored. Digests are references, not recoverable evidence content or an
anonymization guarantee; do not intentionally place sensitive content in input.

Storage uses `resolveObservabilityPath`: for Git repositories it is runtime-owned
under the Git directory, outside tracked/user work files; standalone
projects use the existing local runtime fallback. Read-only tasks do not dirty
the tracked tree. Collection failures return `degraded` and attempt to write a
sanitized `ask-runtime/metrics/codex-health.json`; health write failure is also
non-blocking. They never upgrade approval, completion, review or exit decisions.

## Inspect, aggregate and transfer evidence

Run these commands from the installed project (or pass its path):

```sh
node scripts/codex-metrics-collector.mjs inspect /path/to/project
node scripts/codex-metrics-collector.mjs aggregate /path/to/project
```

Both print JSON without writing reports. The event store logical path is
`ask-runtime/metrics/codex-events.jsonl`, separate from Claude records. Aggregate
output names `adapter_id: codex` and returns period-filtered event/task IDs,
event digests and evidence references for #176. Consumers can retain those
references without loading raw conversation data. Candidate selection, causal
attribution, approval, adoption and application remain outside this collector.

The supplementary ingestion entry accepts a caller-supplied canonical runner
report and its original boundary as JSON on stdin:

```sh
node scripts/codex-metrics-collector.mjs capture /path/to/project < boundary-report.json
```

The input object has `report` and `boundary`; boundary contains `task_id`,
`run_id`, ISO `occurred_at` and the frozen
`source:codex-exec-runner:sha256:<64 hex characters>` reference. This is a trusted
local handoff, not an authentication mechanism. Do not manufacture a boundary
from output paths or the currently installed source for an old result. Missing
source/boundary is degraded. Supplementary capture alone is not evidence of
automatic collection.

A runner completion is not proof of business success or model Skill usage.
`skills_used` stays empty in the stored metrics event; unobserved business,
validation, gate execution, command, review and debt counts are `null` in the
shared report whenever Codex observations are included. `observation_gaps` names
these gaps, including empty skill/gate collections; mixed aggregates also retain
these gaps rather than presenting partial totals as complete observations. Usage,
cost, duration, corrections and quality remain Unknown. Neither token counts nor
runner status imply quality or a cause.

## Model-free verification and acceptance mapping

```sh
node --test scripts/test-codex-metrics-collector.mjs
node --test scripts/test-claude-metrics-collector.mjs scripts/test-adapter-runtime-event.mjs
node scripts/test-codex-runner-execution-envelope-conformance.mjs
```

| Issue acceptance | Fixture evidence |
| --- | --- |
| AC-CM-1, AC-CM-10 | opt-in, installer projection, no-execution skip; entry/limits documented above |
| AC-CM-2 | canonical mismatch/invalid report/boundary/config, post-privacy semantic validation |
| AC-CM-3 | replay, other task/run, concurrent subprocesses, delayed frozen-source capture |
| AC-CM-4 | deterministic write failure isolation; clean read-only Git fixture |
| AC-CM-5 | secret exclusion from persisted/event/health output; disabled collection retains records |
| AC-CM-6 | unknown fields absent; shared/mixed aggregate null assertions |
| AC-CM-7 | shared record/summarize roundtrip; existing Claude regression |
| AC-CM-8 | capture → inspect → aggregate identity/digest/evidence reference roundtrip |
| AC-CM-9 | combined focused negative and regression fixtures above |

These commands exercise artificial local fixtures, not protected logs, real model
execution, actual Codex CLI sessions or an operational rollout.

## Implementation and formal verification record

Implementation Contract `IMPL-CM-386`, revision 1, consumes Issue #386 observed
2026-10-22 at base `a6d71c6c81973f585fe1aa27e4524a5a62889846`. Its change
items are `CM-COLLECT` (collector/runner terminal boundary), `CM-CONSUME`
(shared recorder/summarizer), `CM-INSTALL` (runtime projection and derived
fixtures), and `CM-DOC` (procedure and capability limits). No workflow, auth,
permissions, session/database access or live execution is part of these items.

Formal Verification Contract `VERIFY-CM-386`, revision 1, is selected under
`ask.verification-proof-policy@1.0.0`: resumed failed checks, a cross-module
persistence boundary and an intended merge require the formal path. Its stable
obligations are `CM-BOUNDARY` (AC-CM-1/2/3), `CM-ISOLATION` (AC-CM-4/5),
`CM-MEANING` (AC-CM-6/7/8), and `CM-DELIVERY` (AC-CM-9/10). The acceptance
table above maps each obligation to its concrete focused fixture. The model-free
focused/Claude/normalized batch passed 16/16 after the review fixes, including
installed main-path recording, frozen-source replay, nested gate-diagnostic
Unknown handling and source-read failure isolation.

Broader closure requires the production fixture writer, verification-policy test,
bundle check and repository validator to succeed, then exact-head hosted CI and
independent final review before ordinary merge. The initial local installed-runner
conformance execution exited 1 at its existing exact-risk-approval fake sandbox
case (child exit 71, line 1066). Its cause is not established by that result and
it is not counted as a pass. That sandbox operation is not retried or bypassed;
the equivalent check must succeed in hosted CI at the same final HEAD. No older
head's green check substitutes for that evidence.
