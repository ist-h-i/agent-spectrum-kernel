---
name: review-ai-quality
description: Perform the mandatory baseline semantic review for every evaluative review request. Cover ordinary implementation quality and route specialized decisions without owning final merge approval.
---

# Baseline Semantic Review

## Goal

Produce exactly one evidence-backed baseline review result for the concrete target, covering ordinary semantic implementation quality before optional specialized gates run.

## Use when

- Any PR, diff, commit, patch, design artifact, or generated code is evaluated.
- The target may affect logic, local design, state/error boundaries, types/contracts, compatibility, observability, concurrency, performance signals, tests, maintainability, or scope.

## Do not use when

- The request is a non-evaluative summary.
- A physical invocation count is being inferred from projected contract text.

A missing target or missing applicable evidence produces an insufficient-evidence baseline result. It does not remove the baseline obligation.

## Review stance

Be specific and evidence-backed. Passing tests prove only their observed behavior. A finding needs the closed fields from ask.review-finding@1.0.0; generic advice is not a finding.

## Severity

| Severity | Meaning |
|---|---|
| blocker | Must be fixed before merge because the current change can cause critical correctness, security, data-loss, build, or operational harm. |
| major | Actionable defect, regression, incompatible boundary, or critical missing proof. |
| minor | Actionable local correctness, maintainability, or bounded edge issue. |
| nit | Optional clarity/style improvement; never a merge blocker by severity alone. |

## Process

1. Read the target in repository context.
   - changed files and diff/artifact;
   - nearby implementation and tests;
   - affected public/local contracts;
   - relevant docs/ADRs and active context;
   - applicable output and CI/test evidence.

2. If any evidence required for the concrete judgment is absent, return insufficient evidence and name the exact next check. Do not treat an inapplicable evidence class as missing.

3. Review the baseline semantic surface.
   - Logic and edge cases.
   - Local design and responsibility split.
   - State transitions, state ownership signals, and error boundaries.
   - Types, local/public contract signals, API use, and backward compatibility.
   - Error handling and observability.
   - Concurrency and race signals.
   - Local performance and security signals.
   - Test adequacy, negative cases, and proof-to-claim fit.
   - Readability, duplication, local complexity, and maintainability.
   - Scope creep, unrelated cleanup, and unauthorized expansion.
   - For generated work: invented APIs, stale assumptions, unsupported claims, and broad unverified rewrites.

4. Route specialized signals without deciding them.
   - domain meaning -> review-domain-impact;
   - public/cross-module architecture -> review-architecture-impact;
   - user/system-facing output -> review-output-quality;
   - adversarial/security/privacy/misuse paths -> review-adversarial-risk;
   - material debt beyond ordinary local maintainability -> review-code-health;
   - required automated evidence -> review-automated-gate using automated_evidence_required;
   - destructive/external/auth/secret/production/etc. action -> risk-gate;
   - durable hard-to-reverse architecture -> adr-review;
   - release readiness -> release-readiness-gate.
   The baseline may identify and route these signals, but does not make their specialized judgment.

5. Produce one finding inventory.
   - Every blocker or actionable finding has a unique Finding ID, severity, merge-blocker boolean, practical impact, trigger or failure trace, evidence location, and required post-fix condition.
   - A finding with blocker severity always sets `Merge blocker: true`; other severities keep their explicitly judged merge consequence.
   - Category is optional metadata, not a section.
   - Sort merge blockers first, then blocker/major/minor/nit, then Finding ID in code-unit order.
   - Keep non-actionable suggestions outside the finding inventory.

6. Return baseline gate status only. Final merge approval belongs to review-final-merge-gate and runs only when requested.

## Output

~~~text
Baseline review:
- Gate: review-ai-quality
- Status: pass | pass with comments | fail | insufficient evidence
- Evidence: concrete target and applicable evidence reviewed
- Specialized signals routed: exact signal ID -> additional gate, or none

Findings:
- Finding ID:
  Severity:
  Merge blocker: true | false
  Practical impact:
  Trigger or failure trace:
  Evidence location:
  Required post-fix condition:
  Category: optional
~~~

Use - none when there is no finding. Do not emit empty category sections. Do not emit a final merge Decision.

## Exit criteria

- Exactly one current baseline result exists.
- The status follows the evidence actually available.
- Logic, local design, state/error, types/contracts, compatibility, observability, concurrency, performance signals, tests, maintainability, and scope were considered.
- Each actionable finding uses the closed common fields and impact order.
- Specialized decisions are routed, not made inside baseline.
- Final merge authority is untouched.

## Failure modes

| Failure | Correction |
|---|---|
| Baseline runs only when a signal exists | Run it for every evaluative request. |
| Missing target means no baseline | Return baseline insufficient evidence. |
| Category-separated report | Emit one impact-ordered inventory with optional category metadata. |
| Generic advice | Supply practical impact, trace, evidence, and post-fix condition. |
| Tests pass, therefore review passes | Assess coverage and the changed semantic surface. |
| Baseline decides architecture/domain/output/adversarial/risk | Route the exact signal to the owning gate. |
| Baseline approves merge | Return gate status only. |
