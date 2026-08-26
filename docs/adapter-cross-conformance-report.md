# Cross-Adapter Conformance Report

Evidence date: 2026-08-26 JST

## Decision

Claude Code and Codex pass the same nine fixtures at the `projected` evidence level. Each result is derived independently from that Adapter's generated command or prompt bytes and is validated against `schemas/adapter-runtime-event.schema.json` before comparison. The fixtures confirm deterministic entry and required-contract coverage with the same normalized risk, evidence, approval, verification, stop, handoff, knowledge-promotion, projected agent-activity, and derived claim-evidence-mode meaning. They do not establish external runtime loading or behavioral conformance.

## Fixture result

| Scenario | Claude Code | Codex | Claim evidence mode | Normalized meaning |
|---|---|---|---|---|
| Localized implementation | pass_projected | pass_projected | inline | Scoped implementation; no approval or agent activity required. |
| New behavior | pass_projected | pass_projected | inline | Verification contract required before completion. |
| Unknown root cause | pass_projected | pass_projected | inline | Doubt-driven investigation plus verification. |
| PR review | pass_projected | pass_projected | formal_ledger | Selective review routing, final merge gate, and high-stakes readiness audit. |
| Destructive/external action | pass_projected | pass_projected | formal_ledger | Risk gate; specific-action approval missing; stop. |
| Missing repository/diff/test evidence | pass_projected | pass_projected | inline | Insufficient evidence; no inferred readiness. |
| Handoff/resume | pass_projected | pass_projected | inline | Evidence-bounded handoff contract. |
| Explicit knowledge promotion | pass_projected | pass_projected | formal_ledger | Organizational profile, stable claim IDs, and explicit knowledge-plane route. |
| Lightweight task | pass_projected | pass_projected | inline | No agent activity required; heavy routing is not part of the normalized requirement. |

Command: `node scripts/test-adapter-cross-conformance.mjs`

The same command also runs fail-closed cases for empty Adapter sets, substituted scenario IDs, missing expected values, schema-reference drift, missing contract minimums, unconditional formal-ledger activation, and mutations that remove the claim-contract reference, formal route/condition, or Codex specific-action approval/stop control.

## Cost and over-processing

| Measure | Evidence |
|---|---|
| Projected assets | Recorded per adapter/profile in `docs/fixtures/adapter-runtime-bundle.json`. |
| Codex compact prompt bytes / route depth | Behaviorally verified by `scripts/test-codex-runtime-profile.mjs`; this is a proxy, not token or latency evidence. |
| Claude/Codex latency | Unknown; no paired external runtime run is captured. |
| Token/cost difference | Unknown; no paired external runtime run is captured. |
| Agent/subagent overuse | Unknown at runtime. Generated projection bytes explicitly prohibit implicit agent activity and the fixtures verify zero projected counters where no trigger exists. |
| Senior correction effort | Unknown; requires Checkpoint C human/automated evaluation. |

## Residual evidence gap

Checkpoint C in #171 must run representative fixtures after merge and attribute architecture, model, CLI, adapter, and repository changes separately. Projection conformance must not be reported as runtime effectiveness, correctness, safety, readiness, mergeability, or no regression.
