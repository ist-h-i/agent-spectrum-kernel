---
name: review-architecture-impact
description: Review structural and boundary impact in a diff, PR, commit, patch, or generated code. Use when review-router detects possible dependency direction, module boundary, layer, public contract, persistence, infrastructure, ownership, lifecycle, coupling, abstraction, or hard-to-reverse architecture impact. Reuse application-boundary-architecture for detailed boundary mechanics and adr-review for durable architecture records.
---

# Architecture Impact Review

## Goal

Find architecture issues that should not be hidden inside local implementation-quality review, while keeping ADR need and boundary-mechanics decisions separate.

This gate reviews structural impact in a review target. It does not replace `application-boundary-architecture`; use that skill when a finding requires detailed boundary mechanics such as ownership, dependency direction, external I/O, DTO/error trust boundaries, async lifetime, feature public API, usecase/repository/port/adapter/mapper necessity, ID boundaries, or architecture guard rollout.

It also does not replace `adr-review`; use `adr-review` when the architecture finding implies a durable decision should be recorded, updated, or superseded.

## Use when

A review target affects or may affect:

- dependency direction,
- module or feature boundaries,
- layer violations,
- public API or data contract stability,
- persistence boundaries,
- infrastructure leakage,
- abstraction level,
- lifecycle or ownership boundaries,
- cross-module coupling,
- hard-to-reverse structural change,
- application boundary mechanics covered by `application-boundary-architecture`.

## Do not use when

- The change is purely mechanical formatting, generated output, or copy.
- The architecture layer was evidence-backed skipped by `review-router`.
- The only issue is local readability or implementation quality; use `review-ai-quality`.
- The only unresolved question is whether to record an ADR; use `adr-review`.
- The task is implementation design before code exists; use `application-boundary-architecture` directly when boundary mechanics are unresolved.

## Review stance

Review architecture impact from repository evidence, not preference. A finding needs a file/line or artifact reference, the affected boundary, impact, and required fix. Avoid prescribing new layers unless the change creates a real boundary, ownership, dependency, lifecycle, or contract problem.

## Severity

| Severity | Meaning |
|---|---|
| `blocker` | Must fix before merge; creates critical boundary, contract, persistence, infra, auth/security, or hard-to-reverse structural failure. |
| `major` | Likely architecture regression, unstable public contract, new dependency violation, DTO/error leak, ownership split, or cross-module coupling that should not merge as-is. |
| `minor` | Structural issue with limited blast radius or missing boundary evidence that should be addressed or explicitly accepted. |
| `nit` | Optional architecture clarity note; must not block. |

## Process

1. Read the review target in architecture context.
   - changed files and imports,
   - public APIs, package exports, schemas, routes, commands, or data contracts,
   - nearby boundary patterns,
   - persistence and infrastructure access patterns,
   - relevant docs or ADRs when structural intent is documented.

2. Classify architecture impact.
   - no architecture impact,
   - architecture-preserving implementation change,
   - explicit architecture change,
   - implicit architecture change,
   - architecture violation,
   - insufficient architecture evidence.

3. Check boundary areas without duplicating the full boundary rule set.
   - Identify whether ownership, dependency direction, external I/O, DTO/error trust boundary, async lifetime, feature public API, usecase/repository/port/adapter/mapper, ID boundary, or guard rollout is affected.
   - If yes, check the finding against `application-boundary-architecture` or route that detailed review there.
   - If no, state why boundary mechanics were not needed.

4. Separate architecture review from related gates.
   - Domain meaning change -> `review-domain-impact`.
   - Durable architecture record needed -> `adr-review`.
   - Risky action such as dependency, infra, auth, secret, production, migration, or external effect -> `risk-gate`.
   - Unsupported correctness, readiness, reliability, security, performance, cost, or maintainability claim -> `evidence-ledger`.
   - Local implementation quality -> `review-ai-quality`.

5. Decide required action.
   - pass,
   - pass with comments,
   - fail,
   - insufficient evidence.

## Output

```text
Architecture impact gate:
- Gate status: pass | pass with comments | fail | insufficient evidence
- Architecture area:
- Boundary affected:
- Dependency direction:
- Public contract impact:
- Persistence / infrastructure impact:
- Boundary mechanics reviewed by application-boundary-architecture: yes | no | not needed
- ADR needed: yes | no | update | supersede

Findings:
- [severity] file:line - issue
  Evidence:
  Impact:
  Required fix:

Routed signals:
- Application boundary:
- ADR:
- Domain:
- Risk:
- Evidence:

Residual architecture risk:
- ...
```

## Exit criteria

- Architecture impact classification is explicit.
- Boundary mechanics are delegated to or checked against `application-boundary-architecture` when applicable.
- ADR need is detected without treating ADR recording as the architecture review itself.
- Domain, risk, evidence, and local quality signals are routed instead of folded into this gate.
- Each blocking or major architecture issue has evidence, impact, and a required fix.
- Final merge decision is left to `review-final-merge-gate`.

## Failure modes

| Failure | Correction |
|---|---|
| Hiding architecture findings in generic quality review | Route them to this gate and return a gate status. |
| Duplicating the full boundary rule set | Reference or invoke `application-boundary-architecture` for boundary mechanics. |
| Treating every architecture issue as an ADR | Use `adr-review` only when durable architecture memory is needed. |
| Adding layers by preference | Require evidence of boundary, ownership, dependency, lifecycle, or contract pressure. |
| Approving the PR directly | Report architecture gate status only. |
