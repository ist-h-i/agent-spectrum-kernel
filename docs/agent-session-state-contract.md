# Agent Session State Contract

This contract defines the smallest durable state needed to resume Agent Spectrum Kernel work. It is not a lifecycle engine, not a stage taxonomy, and not proof that work is correct.

The shared control metadata for a resumable workflow is the [Execution Envelope](execution-envelope-contract.md). Session state may embed the latest envelope under `execution_envelope`; the envelope contract remains canonical for route, evidence status, stop reason, next action, and optional metrics behavior.

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
  "selected_mode": "delivery_quality",
  "selected_skill": ["skill-router", "controlled-implementation"],
  "execution_envelope": {
    "schema_version": "1.0.0",
    "route": {
      "work_mode": "実装",
      "operating_mode": "delivery_quality",
      "user_facing": "実装して検証する",
      "internal": { "primary": "controlled-implementation" }
    },
    "evidence_status": { "checked": [], "missing": [] },
    "stop_reason": {
      "status": "none",
      "details": [],
      "human_decision_required": [],
      "stop_if": []
    },
    "next_action": "run the focused verification"
  },
  "current_phase": "Verification Contract | Implementation Contract | implementation | verification | handoff | waiting for approval",
  "last_verified_evidence": [
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
  "not_verified": [
    "Specific behavior, command, integration, or claim that remains unchecked."
  ],
  "blocked_reason": null,
  "required_human_approval": {
    "required": false,
    "action": null,
    "approval_needed": null
  },
  "resume_instruction": "Concrete next safe action.",
  "stop_conditions": [
    "Stop before destructive, external, production, auth, secret, migration, dependency, infra, billing, email, telemetry, permission, or global machine-state changes without explicit approval."
  ],
  "updated_at": "2026-07-08T00:00:00+09:00"
}
```

## Evidence Rules

- `last_verified_evidence` must use `Verified`, `Supported`, `Hypothesis`, `Unknown`, `Falsified`, or a clearly mapped ASK truth-model label.
- A session-state record does not prove readiness, safety, correctness, no regression, or production suitability.
- Missing verification must remain in `not_verified`; do not convert it into an assumption.
- Required approval must name the specific action and approval needed.

## Storage Boundary

Do not store:

- raw prompts,
- secrets, credentials, tokens, keys, or environment values,
- full command output,
- full file contents,
- customer data, personal data, or payment data,
- unrelated chat history.

The record may be embedded in a handoff, saved by a project-specific operation layer, or used as a bounded local JSON artifact. The generic kernel does not require a global session-state file for every task.
