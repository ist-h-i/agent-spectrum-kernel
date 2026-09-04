<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"implementation","k":"c","r":"ask-3.0.0","p":"4409fed5473b1cfea4b8490bb35b129719fe66ceb68c5af837106eb44a050204","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->
---
description: Implement a scoped change through the fixed-entry Agent Spectrum Kernel profile.
---

Fixed implementation entry. Primary contract: `controlled-implementation`; apply it with `test-first-verification` and `risk-gate`.

- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `unfamiliar_repository`=>`repository-orientation`; `unclear_scope`=>`scope-control`; `boundary_decision`=>`application-boundary-architecture`; `design_grill`=>`grill-design`; `docs_or_adr_constraints`=>`grill-with-docs`; `long_running_or_multi_agent`=>`planning-with-files`; `explicit_knowledge_promotion`=>`domain-rule-ledger`; `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; report started/completed/failed.

For behavior change, use `compact_proof` only with complete localized eligibility; otherwise use `formal_verification_contract`. Link upstream refs without copying them.
Use `docs/lifecycle-artifact-contract.md` for the Implementation Contract shape.

Implementation Contract:
- Artifact ID:
- Artifact type: implementation
- Upstream refs:
- Files/components and boundary:
- Verification attempted:
- Evidence references:
- Selected proof ref:
- Handoff state:

Evidence:
- Implementation Contract ref:
- command/observation and exact result:

Emit one fenced JSON `Execution Envelope` using `docs/execution-envelope-contract.md`. No deploy/publish/release/notification/secret/production mutation.

$ARGUMENTS
