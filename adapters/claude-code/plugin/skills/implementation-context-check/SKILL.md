---
description: Check whether implementation context is initialized, stale, or only a template before implementation work.
---

# Implementation Context Check

Inspect `docs/ai/implementation-context.md` when present.

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Apply `ask.claim-evidence-status@1.0.0` inline. Do not activate `/ai-skills:evidence-ledger` merely because the plugin bundles it; only a closed formal-audit trigger may select `formal_ledger`.

Report:

- `context_status`,
- whether it is usable evidence,
- missing commands or boundaries,
- whether `implementation-context-generation` is recommended,
- verification commands that are directly supported by repository evidence.

Treat `context_status: template` as missing durable context. Treat `context_status: stale` as insufficient evidence for affected claims until refreshed.

$ARGUMENTS
