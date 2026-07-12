# Execution Envelope Contract

The Execution Envelope is the shared control record for one meaningful workflow boundary. It keeps routing, evidence state, stopping conditions, and the next action together so chained skills do not repeat the same control metadata in every skill-specific artifact.

This document is the human-readable source of truth. The machine-readable shape is mirrored by `schemas/execution-envelope.schema.json`; the schema does not replace the workflow rules in this document.

## Ownership and emission boundary

- Routers, adapters, and session-state handoffs own the envelope for their workflow boundary.
- A chained skill receives the current envelope, updates only the fields affected by its work, and emits its own domain artifact without copying the envelope again.
- An entry router or adapter may emit one envelope at the start, and a meaningful task boundary may emit one final updated envelope. A bare skill invocation does not require a new metrics event.
- The envelope is control metadata. Requirement Contracts, Specs, Verification Contracts, Implementation Summaries, Review Findings, and Handoffs remain skill-specific artifacts.
- `Metrics event candidate` is optional and must be omitted unless adoption metrics are explicitly enabled or requested and the boundary reached a meaningful durable state. It is never required for skill completion.

## Canonical shape

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": {
    "work_mode": "実装",
    "operating_mode": "delivery_quality",
    "user_facing": "実装して検証する",
    "internal": {
      "primary": "controlled-implementation",
      "secondary": ["test-first-verification"],
      "next_if_resolved": "review-router"
    }
  },
  "evidence_status": {
    "checked": ["repository files", "focused test"],
    "missing": []
  },
  "stop_reason": {
    "status": "none",
    "details": [],
    "human_decision_required": [],
    "stop_if": ["required verification is unavailable"]
  },
  "next_action": "run the focused verification"
}
```

The JSON object inside the fenced block is the only accepted serialized Envelope form. A heading or flat `- route: ...` list without a parseable JSON object is malformed and must not pass completion validation.

## Field rules

`route` explains where the work is going. User-facing route text uses work terms; skill names belong under `internal route` for traceability. `work mode` and `operating mode` are separate: the former describes the task intent, while the latter describes the operating layer.

`evidence status` distinguishes what was directly checked from what is still missing. Do not convert missing evidence into a positive claim or hide it in a skill artifact.

When `docs/lifecycle-traceability-contract.md` applies, `evidence_status.checked`, `evidence_status.missing`, and `stop_reason.details` may carry stable artifact or item refs. The Envelope reports control state only; it does not copy acceptance conditions, evidence records, blockers, approvals, or rollback content from the trace chain.

`stop reason` is explicit when work must pause. `human_decision` names the decision owner or decision needed, `insufficient_evidence` names the missing input or check, `capability_missing` names a selected route absent from the active adapter's `selected_skills`, and `risk_gate` identifies the action requiring approval. A `capability_missing` stop must name the missing Skill and the profile or explicit override that can provide it; it must not invent or continue the absent procedure. `none` is valid only when the workflow can proceed. `stop_reason.stop_if` is the sole location for stop conditions; route metadata must not define another stop condition.

`next action` is a concrete work action, not only a skill name. Examples include `run the focused validation`, `implement the scoped change`, `request domain clarification`, or `prepare the final merge decision`.

## Skill-specific artifact boundary

The following belong in the skill artifact and should not be repeated in the envelope unless they directly change the control state:

| Skill | Primary artifact |
|---|---|
| `requirement-grill` | Requirement Contract |
| `spec-driven-development` | Spec behavior delta and acceptance criteria |
| `test-first-verification` | Verification Contract and evidence |
| `controlled-implementation` | Implementation Contract and evidence references |
| `review-router` / review gates | Change signals, required gates, or review findings |
| `review-final-merge-gate` | Final decision and merge evidence summary |
| `handoff-generation` | Next-task handoff and bounded resume state |

These artifacts may contain evidence, blockers, or next-step detail required by their own purpose. They should not reproduce `Selected work mode`, `User-facing route`, `Internal route`, `Route confidence`, `Evidence checked`, `Missing evidence`, and `Next action` as a second control contract when the shared envelope is already present.

## Compatibility

Adapters may keep entry-specific artifacts only when they do not duplicate lifecycle or control fields. They must place the shared `Execution Envelope` at the workflow boundary and must not invent a second route or metrics contract. Codex implementation and verification profiles use their canonical Contract plus Evidence record; they do not add legacy `Changed`, `Verified`, `Not verified`, or `Next` summaries. `next_action` remains owned by the Envelope.
