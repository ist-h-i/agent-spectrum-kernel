---
name: implement
description: Implement one bounded change through the fixed-entry Agent Spectrum Kernel profile.
---
<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"implementation","k":"p","r":"ask-fixed-entry-assets-v1","p":"446b9b9bcef746e527b58c0f39eaecfbf2bf2a8292b2a70291a0702390f8b17c","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->

# Implement

Entry mode is fixed to implementation. Primary contract: `controlled-implementation`. Apply its semantics directly with `test-first-verification` and `risk-gate`; do not add an upper routing stage.

- [scope] inspect relevant repo/code/tests/docs/API; derive sufficient scope for the authorized outcome from current requirements/contracts/invariants and evidenced affected owners/providers/consumers; for interacting observed constraints, check the highest-impact incompatible outcome at the first useful boundary; no imagined failures or extra steps for simple direct changes; missing=>stop dependent action/claim|insufficient; continue independent authorized outcomes; read-only entries do not edit; among sufficient options minimize maintenance burden, then diff; include cleanup and retirement required by this change; check consumers before retiring obsolete paths/state/config; retain only with a current compatibility/rollout reason and retirement condition; unrelated cleanup separate.
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; verify the consumer-facing requested outcome with the smallest discriminating check; derive expectations from contract/consumer/independent observable, not the tested implementation or incidental sequence; accept alternative valid mechanisms; reuse same-task proof only for unchanged artifact/inputs/environment/claim, recheck material change/contradiction/required gate; simple direct proof needs no extra tests/docs/agents; shape/sample checks are not behavioral proof; static checks are not runtime proof; unknown limits the supported claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop dependent action/claim; never bypass mandatory gates or approval
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `unfamiliar_repository`=>`repository-orientation`; `unclear_scope`=>`scope-control`; `boundary_decision`=>`application-boundary-architecture`; `design_grill`=>`grill-design`; `docs_or_adr_constraints`=>`grill-with-docs`; `long_running_or_multi_agent`=>`planning-with-files`; `explicit_knowledge_promotion`=>`domain-rule-ledger`; `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; report started, completed, and failed counts.

For behavior changes, select `compact_proof` only from complete localized eligibility evidence; otherwise use `formal_verification_contract`.

Implementation Contract:
- Artifact ID:
- Artifact type: implementation
- Upstream refs:
- Actual files/components and change boundary:
- Verification attempted:
- Evidence references:
- Selected proof ref:
- Handoff state:

Evidence:
- claim, source or command, and exact result

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Keep claim status inline unless a closed formal trigger selects `/ai-skills:evidence-ledger`.

Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`. Do not deploy, publish, release, notify, change secrets, or mutate production from this entry.

$ARGUMENTS
