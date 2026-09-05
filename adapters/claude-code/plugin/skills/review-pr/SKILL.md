---
name: review-pr
description: Review a target through the fixed-entry Agent Spectrum Kernel profile.
---
<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"review","k":"p","r":"ask-fixed-entry-assets-v1","p":"c61e020fc0c7127e7a3412405f86b5e9848fc4ed49f8cede26893d89215316b7","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->

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
- {"gate_id":"<exact insufficient_evidence gate>","missing_input":"<non-empty missing input>","affected_judgment":"<non-empty affected judgment>","next_check":"<non-empty next check>"}

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

Missing evidence is canonical closed JSONL: one exact four-field record per `insufficient_evidence` gate in gate order; no others; `- none` iff no gate is insufficient. Reject missing/extra fields and unknown/duplicate/unmatched/partial gate IDs. Use `- none` for other empty sections. Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`.

$ARGUMENTS
