# Operation Automation Contract

`operation_automation` is an execution layer, not a normal delivery skill.

The core skill set can define report shapes, metrics schemas, and safety boundaries. It must not become a scheduler, deployment system, notification system, or external telemetry service.

## Layer Boundary

Allowed in this repository:

- report templates,
- metrics event contracts,
- improvement ledger lifecycle contracts,
- local runtime scripts,
- adapter templates,
- static validation for safe defaults.

External operation layer examples:

- manual operator routine,
- Claude Code hook,
- GitHub Actions workflow copied into an adopting repository,
- cron job,
- ChatGPT automation,
- team reporting cadence.

These execution layers decide when to run. The core skills decide what a valid result must contain.

## Defaults

All operation automation defaults are local-first:

- project-local event store,
- project-local reports,
- no external publication,
- no raw prompt storage,
- no secrets or personal/customer data,
- no production mutation,
- no deploy, release, email, or notification side effect.

## Risk Gate Triggers

Explicit approval is required before enabling operation automation that:

- publishes events or reports externally,
- sends notifications,
- writes to remote systems,
- changes GitHub repository settings or secrets,
- deploys, releases, or publishes packages,
- runs destructive commands,
- stores raw prompts or sensitive data,
- handles credentials, tokens, or `.env` values,
- changes auth, permission, billing, payment, email, telemetry, production config, or infrastructure.

Safe alternatives:

- dry-run,
- local report generation,
- checked-in template without installation,
- documented copy step,
- static validation,
- fixture-based tests.

## Weekly And Monthly Reports

Weekly and monthly reports are reporting modes over project-local evidence. They are not separate skills.

The report generator may consume:

- `docs/ai/metrics/events.jsonl`,
- `docs/ai/improvement-ledger.md`,
- validation reports,
- explicit review outputs or task summaries.

Scheduling a report is outside the core skill set and must be handled by an external operation layer.

## Publication Boundary

Local observability and external publication are distinct:

| Concern | Local observability | External publication |
|---|---|---|
| Default | enabled only when local adapter config opts in | disabled |
| Storage | project-local files | external system |
| Credentials | none | required and risk-gated |
| Safety | omit raw/sensitive data | approval and destination review required |
| Validation | static config and fixture checks | preflight plus owner approval |

Static validation can confirm safe defaults and required files. It does not prove that Claude Code, GitHub Actions, or a scheduler actually ran.
