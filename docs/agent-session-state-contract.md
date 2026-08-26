# Agent Session State Contract

This contract defines the smallest durable state needed to resume Agent Spectrum Kernel work. It is not a lifecycle engine, not a stage taxonomy, and not proof that work is correct.

The shared control metadata for a resumable workflow is the [Execution Envelope](execution-envelope-contract.md). Managed session state references the latest runner-owned record under `execution_envelope_ref`. Unmanaged compatibility may embed one payload under `execution_envelope` only when that is the boundary's sole serialization.

## Applicability

Write or refresh session state only when at least one condition applies:

- non-trivial work may need safe continuation,
- a handoff is being produced,
- work was interrupted,
- work is risk-gated or waiting for approval.

Do not require session state for trivial edits, one-shot answers, or simple local fixes where the final response fully captures the state.

## Record Shape

Use ASK-native terms and truth-model labels.

```json
{
  "task_intent": "Implement the scoped change or continue the named issue.",
  "execution_envelope_ref": {
    "record_id": "execution-envelope-record-<sha256>",
    "logical_path": "ask-runtime/execution-envelopes/<record-id>.json"
  },
  "current_phase": "Verification Contract | Implementation Contract | implementation | verification | handoff | waiting for approval",
  "evidence_details": [
    {
      "status": "Verified",
      "evidence": "Command, file, test, log, or user-provided input that was directly checked.",
      "source": "relative/path or command name"
    }
  ],
  "open_assumptions": [
    {
      "status": "Hypothesis",
      "assumption": "What is assumed and why it is reversible."
    }
  ],
  "resume_context": "Bounded non-control context needed to continue safely.",
  "updated_at": "2026-07-08T00:00:00+09:00"
}
```

## Evidence Rules

- `execution_envelope_ref` identifies the sole runner-owned record for route, evidence presence, stop reason, human approval requirement, and next action. Its record and payload must conform to the two Execution Envelope schemas. Unmanaged compatibility may use `"execution_envelope_ref": "inline_boundary"` or one embedded `execution_envelope`, but never both or a second independently edited payload.
- `evidence_details` must use `ask.claim-evidence-status@1.0.0`: `Verified`, `Supported`, `Hypothesis`, `Unknown`, or `Falsified`. It holds detailed proof or uncertainty that does not fit the bounded Envelope lists.
- A session-state record does not prove readiness, safety, correctness, no regression, or production suitability.
- Missing verification remains in the referenced Envelope's `evidence_status.missing` and/or `evidence_details`; do not convert it into an assumption.
- `stop_reason.stop_if` is the sole stop-condition field. Do not add parallel `blocked_reason`, `required_human_approval`, `resume_instruction`, or `stop_conditions` fields.

## Storage Boundary

Do not store:

- raw prompts,
- secrets, credentials, tokens, keys, or environment values,
- full command output,
- full file contents,
- customer data, personal data, or payment data,
- unrelated chat history.

The record may be embedded in a handoff, saved by a project-specific operation layer, or used as a bounded local JSON artifact. The generic kernel does not require a global session-state file for every task.
