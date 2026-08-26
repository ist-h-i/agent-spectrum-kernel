# ADR-0007: Make the Execution Envelope record runner-owned

- Status: Proposed
- Date: 2026-08-26
- Scope: Issue #228 Execution Envelope ownership and emission
- Related contract: `docs/execution-envelope-contract.md`
- Composes with: ADR-0006
- Supersedes: None

## Context

All fixed Codex prompts currently ask the model to serialize route, evidence, stop, and next-action control fields in final prose. Sensors parse that prose, while risk-gate preflight can stop before any visible Envelope exists. The same prompt is also usable directly, and Claude collectors currently receive only `last_assistant_message`. A prompt-only removal of inline JSON would therefore lose authority in unmanaged and Claude paths.

## Decision

Keep `execution-envelope.schema.json` as the single canonical control payload. Add a closed, versioned record wrapper containing emission class, runner authority source, exact Codex entry/profile/revision/fingerprint binding, canonical payload digest, response digest, and structured-control-input digest.

The managed Codex runner obtains dynamic control through a closed machine-only result schema and derives fixed route fields from the validated compact profile. It persists one content-addressed record under runtime-owned storage. Ordinary successful fixed-mode output uses `sidecar`; protected and handoff output renders one inline projection; `diagnostic` requires an explicit option. Prose never supplies or upgrades control state.

Direct Codex prompts and current Claude project/plugin/GitHub Action paths remain explicit inline compatibility until an equivalent authoritative structured channel is verified. Legacy inline payloads are read-only compatibility artifacts and are not silently rewritten as sidecars.

## Consequences

- Output validation becomes emission-aware and profile-bound.
- Invalid structured results, duplicate representations, stale bindings, and digest disagreements fail before accepted output publication.
- Runtime records survive adapter rollback/detach as runtime data; managed projections remain replaceable.
- Normalized runtime events remain separate evidence projections. Sensor pass is output-shape evidence, not a passed verification command.
- External Codex/Claude runtime application and Prompt v2 effectiveness remain unverified by this repository slice.
