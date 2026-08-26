# Execution Envelope Contract

The Execution Envelope is the shared control record for one meaningful workflow boundary. It keeps routing, evidence state, stopping conditions, and the next action together so chained skills do not repeat the same control metadata in every skill-specific artifact.

This document is the human-readable source of truth. The control payload is mirrored by `schemas/execution-envelope.schema.json`; the runner-owned transport wrapper is mirrored by `schemas/execution-envelope-record.schema.json`. Neither schema replaces the workflow rules in this document. The core installer projects both as ASK-managed immutable contracts into adopting repositories. Adapter runtime copies are deterministic projections and do not become independent schema sources.

## Ownership and emission boundary

- One runner or explicit compatibility boundary owns the envelope for a meaningful workflow boundary. Chained skills provide domain artifacts and structured control inputs; they do not independently serialize or mutate another envelope.
- A managed runner derives fixed route fields from the validated profile. It accepts dynamic evidence, stop, and next-action fields only from its closed structured result or from runner-observed preflight/process state. Final prose is never an authority source.
- The runner validates one canonical payload, binds it to the exact adapter entry/profile/revision/fingerprint and response digest, then persists one immutable content-addressed record under runtime-owned storage.
- Inline JSON is a visibility projection of that same validated record, not a second mutable source of truth.
- The envelope is control metadata. Requirement Contracts, Specs, Verification Contracts, Implementation Summaries, Review Findings, and Handoffs remain skill-specific artifacts.
- `Metrics event candidate` is optional and must be omitted unless adoption metrics are explicitly enabled or requested and the boundary reached a meaningful durable state. It is never required for skill completion.

## Emission classes

| Class | Boundary | User-visible serialization |
|---|---|---|
| `sidecar` | Managed fixed implementation, investigation, review, or verification with `none` or `completed` stop state | Zero serialized Envelopes in ordinary prose; the validated record is persisted by the runner. |
| `inline_required` | Handoff/resume, `human_decision`, `insufficient_evidence`, `capability_missing`, `risk_gate`, or `blocked` | Exactly one fenced canonical payload rendered by the owner. |
| `diagnostic` | Explicit route/debug request only | Exactly one fenced canonical payload rendered from the same validated record. |

Missing or invalid structured authority fails closed. It must not be reconstructed from phrases such as “tests passed”, “approved”, “ready”, “safe”, or “no missing evidence”. A direct or copied prompt without a runner-owned structured channel uses explicit `inline_required` compatibility and must not claim sidecar support.

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

The JSON object inside the fenced block is the only accepted visible serialization. A heading or flat `- route: ...` list without a parseable JSON object is malformed. Ordinary managed `sidecar` output deliberately contains no visible serialization; its record must validate against `schemas/execution-envelope-record.schema.json` and bind the canonical payload plus response/profile provenance.

## Field rules

`route` explains where the work is going. User-facing route text uses work terms; skill names belong under `internal route` for traceability. `work mode` and `operating mode` are separate: the former describes the task intent, while the latter describes the operating layer.

`evidence status` distinguishes what was directly checked from what is still missing. This checked/missing control object is not the five-value claim truth taxonomy. Claims made about the Envelope use `ask.claim-evidence-status@1.0.0` in their owning artifact. Do not convert missing evidence into a positive claim or hide it in a skill artifact.

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
| `review-router` / review gates | Mandatory baseline, exact-signal additional gates, missing evidence, or review findings |
| `review-final-merge-gate` | Final decision and merge evidence summary |
| `handoff-generation` | Next-task handoff and bounded resume state |

These artifacts may contain evidence, blockers, or next-step detail required by their own purpose. They should not reproduce `Selected work mode`, `User-facing route`, `Internal route`, `Route confidence`, `Evidence checked`, `Missing evidence`, and `Next action` as a second control contract when the shared envelope is already present.

## Compatibility

- Managed Codex runner paths use the runner-owned record policy. The runner passes `codex exec` a closed structured-result schema and does not parse the domain prose for control state.
- Direct/copied Codex prompts and current Claude project, plugin, and GitHub Action paths remain explicit inline compatibility because the repository has not verified an equivalent independent structured channel for them.
- Legacy inline payloads remain readable and schema-valid. They are not silently upgraded to sidecar records, and historical measured prompt fixtures remain unchanged.
- Adapters may keep entry-specific artifacts only when they do not duplicate lifecycle or control fields. Codex implementation and verification profiles use their canonical Contract plus Evidence record; investigation does not add `Verified`, `Unknown / not verified`, or `Next`; handoff does not add a separate `Stop condition`. `next_action` and `stop_reason.stop_if` remain owned by the Envelope.
