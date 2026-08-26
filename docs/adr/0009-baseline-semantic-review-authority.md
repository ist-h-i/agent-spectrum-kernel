# ADR-0009: Separate mandatory baseline semantic review from signal-selected additional gates and final merge authority

- Status: Proposed
- Date: 2026-08-26
- Scope: Issue #230 Prompt v2 review routing candidate
- Related contracts: schemas/review-signal-gate-map.json and docs/review-finding-contract.md
- Composes with: ADR-0006, ADR-0007, ADR-0008
- Supersedes: None

## Context

The review router has a strong controlled map for heavy gates, but ordinary semantic review is only an optional prose route. Fixed Codex and Claude review entries can therefore omit review-ai-quality while still appearing contract-complete. The opposite compensation is also unsafe: selecting every specialized gate would add untriggered work and would blur domain, architecture, output, adversarial, risk, and approval authority.

Review output also splits findings into fixed category sections. That makes merge consequence and practical impact harder to scan, permits incompatible gate field shapes, and requires empty skipped/category boilerplate in normal output.

The decision crosses the Kernel router, review gates, Codex and Claude projections, installer capability closure, normalized route evidence, and final merge authority. No earlier ADR owns this boundary. ADR-0006 separates claim truth from formal audit activation, ADR-0007 keeps the Execution Envelope runner-owned, and ADR-0008 owns verification proof selection; none makes review-ai-quality mandatory or changes final merge ownership.

## Decision

Adopt schemas/review-signal-gate-map.json revision 2 as the one machine review-policy registry.

Every evaluative review request has exactly one logical review-ai-quality baseline result. A concrete target with sufficient applicable evidence can produce pass, pass with comments, or fail. A missing target or required target evidence produces one explicit insufficient-evidence baseline result. The contract does not claim a physical model invocation count unless a runtime later supplies authoritative invocation evidence.

The baseline is signal-independent and is not a heavy gate. It never appears in signal_to_gates and cannot be classified as over-processing.

Every additional specialized gate is selected only through an exact signal in the same registry. Heavy gates remain the over-processing subset. Automated evidence uses the controlled automated_evidence_required signal and review-automated-gate; free-form verification prose is not a trigger.

review-final-merge-gate remains the sole final merge authority. It is required only when a final decision is explicitly requested and must run last. Baseline or specialized gates report gate status and findings but do not approve.

Adopt ask.review-finding@1.0.0 as the closed actionable finding inventory. Findings are ordered by merge-blocker consequence, severity, and code-unit Finding ID. Category is optional metadata; empty category and skipped-heavy sections are omitted from ordinary output. Full applicability remains diagnostic-only.

Missing required capability or evidence fails closed as capability_missing or insufficient_evidence. Specialized gates never substitute for a missing baseline.

## Alternatives considered

### Keep baseline routing as prose

Rejected. Adapter projection and tests can remain mutually consistent while omitting the intended baseline.

### Encode baseline as a synthetic change signal

Rejected. Baseline is required independently of observed change type. A fake signal would make it look optional and could classify correct baseline work as over-processing.

### Make every gate mandatory

Rejected. It would add untriggered work, mix authority boundaries, and violate the controlled heavy-gate policy.

### Rename review-ai-quality

Rejected. The existing skill already owns the baseline semantic responsibilities. Renaming would add migration churn without changing authority.

### Let the router or baseline gate approve

Rejected. Final merge judgment must consume every required result and remains owned only by review-final-merge-gate.

### Keep category-separated output

Rejected for the ordinary route. A single impact-ordered inventory exposes merge consequence first while retaining category as metadata.

## Consequences

- Codex and Claude review capability closure must include review-ai-quality.
- A clean low-risk review performs baseline work without invoking a heavy gate.
- Missing baseline becomes under-processing; baseline itself is never over-processing.
- Final decision requests need an explicit adapter/runtime input or entry contract and remain last.
- Existing gate telemetry can represent baseline in required/executed sets. Telemetry remains mechanism evidence, not proof of review quality or realized value.
- Historical prompts, benchmark oracles, private evaluator artifacts, and metrics are not rewritten.
- The Prompt v2 candidate remains inactive until the later frozen decision and approved Portfolio update.

## Verification and review trigger

Fixtures must cover localized logic, cross-module architecture, domain state, user-facing output, severe adversarial, clean low-risk, missing evidence, conditional final decision, missing/duplicate baseline, untriggered heavy gates, finding fields/order, and ordinary-output omissions. Codex and Claude projection tests must detect removal of baseline semantics.

Revisit this ADR when baseline cardinality changes, another gate replaces review-ai-quality, signal-selection authority moves, final merge ownership changes, finding fields/order change, or an adapter gains authoritative physical-invocation evidence.
