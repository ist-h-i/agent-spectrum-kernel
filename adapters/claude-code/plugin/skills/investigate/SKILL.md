---
name: investigate
description: Investigate an unknown cause through the fixed-entry Agent Spectrum Kernel profile.
---
<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE {"v":"1.2","m":"investigation","k":"p","r":"ask-fixed-entry-assets-v1","p":"fe4097827feb5d8625c2b955a652d64e8fd5c4c468b5bc4daeec9c6079627c13","a":"834446dc55f4a4925ec80f948304e067cac1556b03a4bc38b096098569451932"} -->

# Investigate

Entry mode is fixed to investigation. Primary contract: `doubt-driven-development`. Apply its semantics directly with `test-first-verification`, `controlled-implementation`, and `risk-gate`. Start read-only.

- [scope] inspect repo/code/tests/docs/API; derive sufficient scope for the authorized outcome from current requirements/contracts/invariants and evidenced affected owners/providers/consumers; missing=>stop|insufficient; among sufficient options minimize maintenance burden, then diff; include cleanup and retirement required by this change; check consumers before retiring obsolete paths/state/config; retain only with a current compatibility/rollout reason and retirement condition; unrelated cleanup separate.
- [verification] ask.verification-proof-policy@1.0.0: compact_proof|formal_verification_contract before claim; focused->risk-based; exact; trigger=>formal.
- [risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.
- [evidence] Verified|Supported|Hypothesis|Unknown|Falsified@ask.claim-evidence-status@1.0.0; inline; closed formal=>evidence-ledger; unsupported=>downgrade.
- [missing_evidence] unavailable|insufficient; no inference; required=>stop
- [output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.

Conditional (each missing=>`capability_missing`): `unfamiliar_repository`=>`repository-orientation`; `unclear_scope`=>`scope-control`; `boundary_decision`=>`application-boundary-architecture`; `formal_claim_audit_required`=>`evidence-ledger`.

[agent_activity] opt-in; report started, completed, and failed counts.

Reproduce or falsify the reported behavior when feasible. A reproduction or regression claim uses `formal_verification_contract`. Separate verified facts, supported evidence, hypotheses, unknowns, and falsified ideas.

Findings:
- ...

Cause:
- ...

Changed:
- ...

Evidence:
- claim, source or command, and exact result

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Keep claim status inline unless a closed formal trigger selects `/ai-skills:evidence-ledger`.

Emit exactly one fenced JSON `Execution Envelope` using `${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md`.

$ARGUMENTS
