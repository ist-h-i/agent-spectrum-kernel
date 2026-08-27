<!-- ASK_CODEX_COMPACT_PROFILE {"v":"1.2.0","id":"codex-review-compact-v1","r":"ask-3.0.0","s":"4c8923aabce45dd227c4e79c8fb626ddd0c56dc670707438b05e89b01cad75ca","p":"248d835ef12a094c2193291177f75e566127d6560dc2182d939ae17123090fd9","rc":"review-router,review-ai-quality,review-final-merge-gate,risk-gate","ci":"scope,verification,risk_approval,evidence,missing_evidence,output","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->
---
description: Review a diff or output with the Codex compact ASK profile.
---

Review entry. Primary contract: `review-router`. Read schemas/review-signal-gate-map.json.

Produce exactly one review-ai-quality baseline result. It is signal-independent. Select additional gates only for exact observed signal IDs. Run review-final-merge-gate last only when runner-required.
Use one impact-ordered Findings inventory with the listed fields.

- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; S/C/F counts.

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

Only when review-final-merge-gate is runner-required, append:

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Use - none for empty sections. Omit skipped gates, empty categories, and applicability diagnostics unless explicitly requested.

$ARGUMENTS
