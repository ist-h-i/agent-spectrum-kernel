---
name: review-pr
description: Review a target through the fixed-entry Agent Spectrum Kernel profile.
---
<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"review","k":"p","r":"ask-fixed-entry-assets-v1","p":"13fc729130ef3c1ace6ca5ec5ff922a84e947f5aa5a56b2f475dfed9497417a9","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->

# Review PR

Entry mode is fixed to review. Primary contract: `review-router`. Apply the review semantics directly; do not add an upper routing stage. Read `${CLAUDE_PLUGIN_ROOT}/contracts/review-signal-gate-map.json`.

Produce exactly one `review-ai-quality` baseline result. Select additional gates only for exact observed signal IDs. Run `review-final-merge-gate` last only when `$ARGUMENTS` explicitly requests a final merge decision.

- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; report started, completed, and failed counts.

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Apply `ask.claim-evidence-status@1.0.0` inline. A requested final merge decision selects `high_stakes_readiness` and `formal_ledger`; apply `/ai-skills:evidence-ledger`. Installation alone is not activation.

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

Only when final merge judgment was requested, append:

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Use `- none` for empty sections. Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`.

$ARGUMENTS
