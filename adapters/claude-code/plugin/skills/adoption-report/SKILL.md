---
description: Generate a local adoption and debt movement report from project-local AI metrics.
---

# Adoption Report

Use `skill-adoption-metrics`, `docs/metrics-event-contract.md`, and `docs/ai/adoption-report-template.md`.

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. This report audits multiple material claims, so the exact `multiple_material_claims` trigger selects `formal_ledger`; apply `/ai-skills:evidence-ledger`. Installed capability availability alone is not activation.

Read project-local evidence only:

- runtime-owned `ask-runtime/metrics/events.jsonl`
- `docs/ai/improvement-ledger.md`
- explicit validation reports or review outputs referenced by the user

Generate a weekly, monthly, or custom report under `docs/ai/reports/`. Do not publish externally. Do not include raw prompts, secrets, customer data, personal data, full file contents, or full command output.

$ARGUMENTS
