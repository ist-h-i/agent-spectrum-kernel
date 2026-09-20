# ADR-0006: Separate claim truth from authority, lifecycle, and formal audit activation

- Status: Proposed
- Date: 2026-08-26
- Scope: Issue #229 claim evidence taxonomy and Prompt v2 static candidate
- Related contract: `docs/claim-evidence-status-contract.md`
- Composes with: ADR-0001, ADR-0003, ADR-0004, ADR-0005
- Supersedes: None

## Context

ASK currently names five truth statuses in the Kernel and compact controls, six in the Evidence Ledger because it adds `weak`, and six or seven in durable knowledge schemas because `Human-confirmed`, `Deprecated`, and `Contradicted` share an `evidence_status` field. Adapter entry points also request a formal Evidence Ledger for ordinary work even though their inline workflow artifacts already require evidence and missing-evidence reporting.

These overlaps create two different problems. A copied status list can drift and silently strengthen imported evidence. A capability installed for high-value audits can be mistaken for a requirement to generate a separate ledger on every claim. Neither content identity nor lifecycle/authority metadata resolves the truth strength of a claim.

## Decision

### One revisioned claim status contract

`ask.claim-evidence-status@1.0.0` is the single machine-readable source for `Verified`, `Supported`, `Hypothesis`, `Unknown`, and `Falsified`. Direct writer schemas reference it. Legacy lowercase fields reference its read-only compatibility definition rather than repeating the enum.

### Read-only, non-upgrading migration

Import normalization returns a new migration result and leaves source bytes unchanged. `weak` maps only to `Supported` when structured direct/indirect evidence and an evidence reference exist; otherwise it maps to `Hypothesis`. It never maps to `Verified`. Historical human confirmation maps to `Supported` while retaining separate human-authority metadata. Deprecation and contradiction move to record lifecycle metadata; contradiction maps the claim to `Falsified` and requires correction.

### Inline discipline is the ordinary path

Existing implementation, investigation, verification, review, and handoff artifacts own ordinary claim evidence inline. The formal `evidence-ledger` Skill remains installed and available, but is selected only by one generated direct trigger when one of five closed audit reasons applies. Static projection tests distinguish capability availability from task activation.

### Preserve independent state machines

Verification evidence, Execution Envelope, adapter capability, benchmark result, Asset, Portfolio, Evolution, authority, approval, and release states remain independent. Referencing the claim contract for a statement about an object does not reinterpret the object's operational status.

## Alternatives considered

### Keep copied five-status enums

Rejected. Existing drift demonstrates that documentation-only alignment does not provide one revision or deterministic compatibility behavior.

### Retain `weak` as a sixth status

Rejected. It overlaps both `Supported` and `Hypothesis`, and a historical import could choose a stronger interpretation without a closed evidence-strength input.

### Make every high-value word activate a formal ledger

Rejected. Ordinary domain artifacts already carry evidence, while word matching conflates inline discipline with a separate audit artifact and recreates the measured overhead.

### Add runner/runtime-event claim fields

Rejected for this static contract slice. Existing projection fields can express conditional selection. External runtime application remains unavailable evidence and must not be invented by a schema addition.

## Consequences

- Direct consumers must reference one revision and validators must reject copied/drifting claim taxonomies.
- Legacy imports require a structured migration result and cannot be silently reserialized as stronger evidence.
- Generated adapter fixtures and digests change, but existing #276/#277/#278 CAS fixtures remain byte-identical.
- Prompt v2 remains a local candidate. This ADR does not activate it, mutate a Portfolio, or grant merge/release authority.
