---
name: review-finding-compiler
description: Convert repeated or high-impact review findings into reusable review judgment, prevention rules, or follow-up targets without hiding current blockers.
---

# Review Finding Compiler

## Goal

Turn review findings into durable prevention knowledge when evidence supports reuse, while keeping current PR blockers in the current review output.

This skill sits after review gates. It does not replace `review-router`, `review-code-health`, `review-to-rule-compiler`, or `improvement-ledger`.

## Use when

- A review produced repeated, high-impact, or mechanically detectable findings.
- A finding should become a future checklist item, validation check, lint/test/check, implementation pattern, verification pattern, review context, or improvement-ledger entry.
- Review noise, false positives, and suppression rules need to be captured.
- `docs/ai/review-rule-ledger.md` needs an entry added, refreshed, deprecated, or contradicted.

## Do not use when

- The current PR still has unresolved blockers that must stay in the review decision.
- The finding is a domain or business rule candidate; use `review-to-rule-compiler`.
- The finding is only a one-off cleanup with no reusable lesson; use the current review or `improvement-ledger`.
- The evidence is a generic best practice with no repository signal.

## Process

1. Separate current review outcomes.
   - Current blockers remain in the PR review.
   - Non-blocking follow-up can become `improvement-ledger` work.
   - Repeated or high-impact patterns can become review rule candidates.

2. Classify the finding.
   - Review layer: domain, architecture, design, logic, output quality, verification, maintainability, mechanical, adversarial risk, evidence.
   - Trigger signal and repeat pattern.
   - False-positive risk and suppression condition.

3. Route by prevention target.
   - Domain/business rules -> `review-to-rule-compiler`.
   - Implementation shape -> `engineering-pattern-ledger`.
   - Evidence expectation -> `verification-pattern-ledger`.
   - Mechanically detectable issue -> validation script, lint, test, or CI check proposal.
   - Non-blocking work -> `improvement-ledger`.
   - Review guidance -> `review-rule-ledger` or `review-context-generation`.

4. Classify evidence status.
   - `Verified`, `Human-confirmed`, `Supported`, `Hypothesis`, `Deprecated`, or `Contradicted`.
   - Do not promote `Hypothesis` to a rule or check.

5. Write or update the review rule entry with current blocker policy, suppression, staleness trigger, and owner.

## Output

```text
Review finding compilation:
- Decision: add review rule | route domain rule | route engineering pattern | route verification pattern | route improvement | propose check | insufficient evidence
- Review rule ID:
- Finding pattern:
- Review layer:
- Trigger signal:
- Why it matters:
- Current PR blocker policy:
- Suggested prevention target:
- Evidence source:
- Evidence status:
- Repeat pattern:
- False-positive risk:
- Suppression rule:
- Staleness trigger:
- Owner:

Current PR handling:
- Blockers retained in current review:
- Non-blocking follow-up:
- Durable candidates:
```

## Exit criteria

- Current PR blockers are not hidden in a ledger.
- Domain rule candidates are routed to `review-to-rule-compiler`.
- The prevention target matches the finding and evidence strength.
- False-positive and suppression handling is explicit.
- Mechanically detectable findings include a concrete check proposal or are left as review guidance.

## Failure modes

| Failure | Correction |
|---|---|
| Moving blockers out of the PR review | Keep blockers in the review decision and optionally add durable follow-up. |
| Duplicating domain-rule extraction | Route domain/business findings to `review-to-rule-compiler`. |
| Turning every comment into a rule | Require repeat pattern, high impact, or human confirmation. |
| Creating noisy checks | Record false-positive risk and suppression rules. |
