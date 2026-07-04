---
name: review-code-health
description: Inspect code for technical debt, vulnerabilities, refactor candidates, coding smells, maintainability risks, and improvement backlog candidates.
---

# Code Health Review

## Goal

Find evidence-backed code-health issues and classify them into actionable current-PR fixes, separate refactor work, improvement backlog items, or AI rule/check feedback without silently expanding the current review scope.

This skill focuses on debt discovery and classification. It does not replace ordinary correctness review, architecture review, adversarial review, or refactor implementation.

## Use when

- The user asks for technical debt review, code smell inspection, vulnerability-oriented code review, maintainability audit, or refactor candidate discovery.
- A PR, diff, commit, patch, or repository area may introduce or expose non-blocking code-health risk.
- Repeated review findings should be categorized as improvement candidates instead of being lost as one-off comments.
- The review question includes whether a finding should become an AI implementation rule, review checklist item, validation check, lint/test/check, or project overlay update.

## Do not use when

- The only question is whether the PR is correct. Use `review-ai-quality` after `review-router`.
- The primary issue is a hard-to-reverse dependency, public API, persistence, or ownership boundary. Use `review-architecture-impact` or `application-boundary-architecture`.
- The primary issue is misuse, blast radius, security/privacy abuse path, or prompt/generated-output adversarial risk. Use `review-adversarial-risk`.
- The task is to implement an approved refactor. Use `refactor-implementation` when available, or `controlled-implementation` with a behavior-preservation verification contract.
- The task is to store, prioritize, or update an improvement ledger. Use `improvement-ledger` when available.
- There is no concrete code, diff, repository pattern, review comment, or CI evidence to inspect.

## Process

1. Define review target and scope.
   - Identify the diff, files, directory, PR, issue, review comments, or CI output under review.
   - Separate current-PR blockers from observations that belong in a separate PR, project-level improvement, or no-action bucket.
   - Read nearby implementation, tests, public contracts, docs, and existing review context when needed.

2. Decide applicability before findings.
   - Required when the user explicitly asks for debt, smell, refactor, maintainability, vulnerability, dependency/tooling, dead code, duplicated logic, boundary weakness, or repeated finding analysis.
   - Optional when ordinary review surfaces non-blocking code-health risk that should not block the current PR.
   - Skipped when inspected evidence shows only mechanical, correctness, domain, architecture, output-quality, or adversarial concerns covered by other gates.

3. Inspect required categories.
   - vulnerability / security weakness
   - technical debt
   - refactor candidate
   - coding smell
   - maintainability risk
   - testability risk
   - performance risk
   - dependency / tooling risk
   - dead code / obsolete pattern
   - duplicated logic
   - abstraction boundary problem
   - repeated review finding

4. Build findings only from evidence.
   - Use file paths, line numbers, snippets, repeated patterns, review comments, CI output, or repository conventions as evidence.
   - Do not report vague concerns without an observed pattern and impact.
   - Do not treat every small style preference as debt.

5. Classify action and scope.
   - Use severity to describe impact if ignored: `critical`, `high`, `medium`, or `low`.
   - Use urgency to describe timing: `now`, `soon`, `backlog`, or `observe`.
   - Use recommended action to separate fixing, backlog creation, rule/check feedback, later refactor, or acceptance.
   - Use scope guidance to keep current-PR blockers separate from separate-PR or project-level improvements.

6. Route specialized signals.
   - Security weakness with abuse path or privacy risk may require `review-adversarial-risk`.
   - Boundary or dependency direction issues may require `review-architecture-impact`.
   - Unsupported safety, readiness, performance, or reliability claims require `evidence-ledger`.
   - Risky external action requires `risk-gate`.

7. Produce AI-rule feedback only when evidence supports it.
   - Name whether the finding should become an AI implementation rule, review checklist item, validation check, lint/test/check, project overlay update, or no rule.
   - Prefer validation/lint/test/check for mechanically detectable patterns.
   - Prefer project overlay for project-specific patterns.
   - Prefer Skill or review checklist updates for reusable agent behavior.

## Output

```text
Code health review:
- Gate status: pass | pass with findings | fail | insufficient evidence
- Scope reviewed:
- Current-PR blockers:
- Backlog / separate-PR candidates:
- Rule or check feedback:

Finding:
- Short description

Category:
- vulnerability | technical_debt | refactor_candidate | code_smell | maintainability | testability | performance | dependency | dead_code | duplication | boundary | repeated_finding

Evidence:
- File / line / snippet / observed pattern

Impact:
- Why this matters

Severity:
- critical | high | medium | low

Urgency:
- now | soon | backlog | observe

Recommended action:
- fix now | create backlog | add lint/test/check | update skill/rule | refactor later | accept

Scope guidance:
- in current PR | separate PR | project-level improvement | no action

AI-rule feedback:
- Should this become an AI implementation rule, review checklist item, validation check, project overlay update, or no rule?

Specialized signals routed:
- Architecture:
- Adversarial/security:
- Evidence:
- Risk:

Evidence reviewed:
- ...

Residual risk:
- ...
```

## Exit criteria

- Each finding has category, evidence, impact, severity, urgency, recommended action, scope guidance, and AI-rule feedback.
- Current-PR blockers are separated from separate-PR or backlog candidates.
- Refactor implementation is not performed during the review.
- Existing review gates keep their responsibilities.
- Non-blocking findings have a clear handoff target when an improvement ledger or backlog process is available.

## Failure modes

| Failure | Correction |
|---|---|
| Turning every review into a debt audit | Run this gate only when the review question or observed risk makes code health applicable. |
| Replacing correctness review | Route ordinary design, logic, test, and scope findings through `review-ai-quality`. |
| Reporting vague smells | Require code evidence, impact, and scope guidance. |
| Expanding the current PR | Mark non-blocking debt as separate PR or project-level improvement. |
| Implementing refactors while reviewing | Stop at findings and hand off to an implementation workflow. |
