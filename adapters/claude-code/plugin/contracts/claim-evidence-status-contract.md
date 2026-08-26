# Claim Evidence Status Contract

- Contract: `ask.claim-evidence-status@1.0.0`
- Schema: `schemas/claim-evidence-status.schema.json`
- Scope: the truth/evidence strength of an individual claim
- Issue: #229

## Canonical writer vocabulary

Writers emit exactly one of:

- `Verified`: directly observed in repository bytes, documentation, a completed command/test, runtime output, or explicit current user input.
- `Supported`: relevant indirect evidence exists, but the claim is not fully proven.
- `Hypothesis`: plausible investigation input with an explicit missing-evidence or next-check reference.
- `Unknown`: not inspected, unavailable, ambiguous, or outside the observed evidence.
- `Falsified`: direct evidence contradicts the claim; the output must correct it and retain the contradictory evidence reference.

`Unknown` or missing evidence never means pass, zero, neutral, or absence. `Hypothesis` cannot authorize completion, merge, release, permission, activation, or any equivalent terminal decision. A protected completion/readiness decision needs direct verification; importing metadata cannot provide that authority.

## Inline default and formal audit

Ordinary implementation, investigation, verification, review, and handoff attach the status and concise evidence or missing evidence to their existing domain artifact. They do not emit a separate Evidence Ledger merely because a response uses words such as correct, fixed, maintainable, or improved.

The installed `evidence-ledger` capability is activated only when the contract selects `formal_ledger` for at least one closed trigger:

- `explicit_claim_audit`
- `multiple_material_claims`
- `high_stakes_readiness`
- `cross_artifact_synthesis`
- `stable_claim_ids`

The machine-readable descriptions in the schema are authoritative. Adapter installation availability is not evidence that a task selected or applied the formal ledger.

## Compatibility import

Compatibility normalization is read-only and records the original value, canonical value, mapping basis, separated authority status, and separated record state. It never rewrites an imported artifact in place.

| Legacy input | Canonical status | Separated metadata | Rule |
| --- | --- | --- | --- |
| lowercase five-status alias | matching Title Case status | none | case-only normalization |
| `weak` with a direct/indirect strength and at least one evidence ref | `Supported` | none | maximum is `Supported`; never `Verified` |
| other `weak` | `Hypothesis` | none | no qualifying evidence means an investigation input only |
| `Human-confirmed` | `Supported` | `authority_status=human_confirmed` | historical import does not re-observe the human statement |
| `Deprecated` | `Unknown` | `record_state=deprecated` | lifecycle state is not truth strength |
| `Contradicted` | `Falsified` | `record_state=contradicted` | retain the contradictory evidence and correct the claim |

New current observations write a canonical status directly. They do not obtain a stronger status by passing through a legacy mapping.

The #276 sample registry intentionally pins the pre-#229 `test-first-verification` Skill bytes at revision `656edf1ac611890a3ae5a93a90e9076f50ee2488`. Its historical `Human-confirmed` wording is compatibility input, not a sixth canonical writer status. The generated Prompt candidate consumes this contract without rewriting that stored Asset; rollback remains byte-exact until a later authority activates or replaces the candidate.

## Consumer bindings

- Kernel, Skills, compact controls, and both adapter projections use the canonical Title Case writer vocabulary.
- Existing #275 admission and #276 Asset records keep their stored lowercase representation through `#/$defs/lowercase_status`; their fixture bytes are not migrated in place.
- #274 verification evidence, #197 evaluation/scoring records, and #278 Evolution objects keep their own verification/result/decision states. When they make a prose or metadata claim about those objects, the claim status references this contract revision; their operational enums do not become claim statuses.
- Durable knowledge ledgers use the canonical claim status and keep human authority, deprecation, contradiction, and freshness in separate fields.

## Separate domains

This contract does not redefine verification evidence levels, Execution Envelope checked/missing controls, adapter support, benchmark result status, Asset lifecycle, Portfolio selection/activation, Evolution recommendation/action/decision, authority, approval, or release state. Missing values in those domains remain governed by their own fail-closed contracts.
