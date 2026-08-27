<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"review","k":"c","r":"ask-3.0.0","p":"17633e22f76df8564dc056ad294a61bf577c6d2f8d29ee4373c7c23007c7312e","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->
---
description: Review a target through the fixed-entry Agent Spectrum Kernel profile.
---

Fixed review entry. Primary contract: `review-router`. Read `schemas/review-signal-gate-map.json`.

Produce one `review-ai-quality` baseline. Add gates only for exact signals; run `review-final-merge-gate` last only when `$ARGUMENTS` requests a final decision. Keep one impact-ordered Findings list.

- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; report started/completed/failed.

Baseline review:
- Gate: review-ai-quality
- Status: pass | pass_with_comments | fail | insufficient_evidence
- Evidence: target/evidence

Additional required gates:
- <gate>: status=<pass|pass_with_comments|fail|insufficient_evidence>; evidence=<text>; signals=<exact IDs>

Missing evidence:
- input/gate: affected judgment; next check

Findings:
- Finding ID:
  Severity:
  Merge blocker:
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: optional

Only for a requested final decision:

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Use `- none` for empty sections. Emit one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`.

$ARGUMENTS
