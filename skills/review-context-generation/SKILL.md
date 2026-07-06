---
name: review-context-generation
description: Generate and maintain a durable project review context file with evidence-status-labeled claims for repeated review routing, output-quality review, adversarial review, and final merge decisions.
---

# Review Context Generation

## Goal

Create or update reusable review context so repeated PR reviews do not rediscover personas, output contracts, critical workflows, accepted risks, known issues, and project constraints from scratch.

## Use when

- Initial repository orientation or review setup is expected to support repeated MR/PR reviews.
- `review-output-quality` or `review-adversarial-risk` needs project context.
- Review noise is recurring because known issues, accepted risks, output contracts, or critical workflows are not documented.
- Review rule ledger or documentation knowledge entries should inform repeated reviews without duplicating current PR blockers.
- A project overlay exists and should be referenced from review workflows without replacing it.

## Do not use when

- The task only needs transient progress tracking. Use `planning-with-files`.
- The user only needs a final merge decision for one already-scoped review. Use `review-router` and required gates.
- The project wants permanent agent rules. Reference or update project overlay rules such as `AGENTS.project.md` instead.
- You would need to ask the user to fill a blank form from scratch.

## Default path

Prefer:

```text
docs/ai/review-context.md
```

If the project prefers hidden agent files, use:

```text
.agent/review-context.md
```

If the context belongs in permanent project rules, reference or update:

```text
AGENTS.project.md
```

## Context status metadata

The context file must include explicit metadata:

```yaml
context_status: template | initialized | stale
last_updated:
evidence_owner:
source_scope:
```

Interpretation:

- `template`: default uninitialized context. Treat placeholder rows, blank rows, and `Unknown` values as missing or insufficient evidence, not reusable project facts.
- `initialized`: real project facts have been recorded with evidence status and source. Consumers may use the recorded claims according to their evidence status.
- `stale`: previously initialized context may be outdated because source files, docs, workflows, product claims, accepted risks, known issues, or review gates changed. Refresh before relying on it, or downgrade affected claims to `Unknown` / `insufficient evidence`.

## Evidence statuses

Use these statuses for important claims:

| Status | Meaning |
|---|---|
| `Verified` | Directly observed in repo files, docs, tests, runtime output, command output, or user input. |
| `Supported` | Backed by indirect evidence but not fully proven. |
| `Hypothesis` | Plausible inference that needs confirmation before being used as fact. |
| `Human-confirmed` | Confirmed by a human owner in the current or prior documented review context. |
| `Unknown` | Not inspected, unavailable, ambiguous, or outside current evidence. |

## Process

1. Read existing context status first.
   - If `context_status` is `template`, treat the file as missing durable context and populate only from repository evidence or targeted human input.
   - If `context_status` is `initialized`, preserve evidence-backed content unless contradicted by newer evidence.
   - If `context_status` is `stale`, refresh affected sections before use, or mark the affected judgments as `insufficient evidence`.

2. Inspect repository evidence first.
   - README and product docs,
   - project overlay rules,
   - docs, ADRs, schemas, examples, tests, generated artifacts, screenshots, or workflows,
   - review rule ledger, documentation knowledge ledger, architecture decision memory, and other active evidence-backed ledgers when present,
   - review history when available.

3. Draft candidate context.
   - product / project identity,
   - project hero or product promise,
   - primary users / personas,
   - human and system / AI consumers,
   - critical workflows,
   - output quality standards,
   - domain review context,
   - architecture review context,
   - adversarial review context,
   - assets to protect,
   - threat / misuse model,
   - accepted risks,
   - known issues not to re-report,
   - review noise-control rules,
   - links to review rule and documentation knowledge entries,
   - verification policy,
   - update triggers.

4. Label each important claim with evidence status and source.
   - Do not treat AI-inferred persona, project promise, accepted risk, or threat model as fact.
   - Mark unsupported items as `Hypothesis` or `Unknown`.

5. Ask the user only for missing or high-impact human judgment when needed.
   - persona or audience,
   - accepted risks,
   - assets to protect,
   - critical workflows,
   - known issues not to re-report,
   - safety boundaries.

6. Save or update the context file.
   - Change `context_status` from `template` to `initialized` only after at least one real project fact is recorded with a non-empty source.
   - Set `last_updated` to the evidence update date or timestamp.
   - Set `evidence_owner` to the human, agent, team, or source responsible for the update.
   - Set `source_scope` to the repository paths, docs, PR/review history, or human input scope inspected.
   - Use `stale` when existing context is known or strongly suspected to lag behind changed source evidence; do not silently rely on stale claims.
   - Preserve existing human-confirmed content unless contradicted by newer evidence.
   - Keep task progress out of this file.
   - Add update triggers so future agents know when context may be stale.

7. Wire consumers.
   - `review-router`, `review-output-quality`, `review-adversarial-risk`, and `review-final-merge-gate` should read this context when available.
   - `review-finding-compiler` should update reusable review-rule entries after current PR blockers remain in the review output.
   - `documentation-knowledge-compiler` should route durable docs knowledge into this context only when it is review-relevant.
   - Consumers must treat `context_status: template` as missing context and `context_status: stale` as insufficient evidence for affected claims until refreshed.
   - `planning-with-files` remains responsible for task progress.

## Output

```text
Review context generation:
- Path:
- Created or updated:
- Facts found from repo:
- Human-confirmed items:
- Hypotheses needing confirmation:
- Unknowns:
- Review consumers:
- Ledger links found:
- Update triggers:
- Next review skills that should read this file:
```

## Exit criteria

- A reusable review context file is created or updated.
- `context_status` is `initialized` only after real project facts are recorded with sources; otherwise `template` or `stale` is explicit.
- Important claims have evidence status and source.
- Human-provided context is requested only for high-impact gaps.
- Output quality and adversarial review can rely on the context instead of repeating repo-wide discovery.
- Known issues and accepted risks can suppress recurring review noise.
- Task progress is not stored in review context.

## Failure modes

| Failure | Correction |
|---|---|
| Asking the user to fill a blank template | Inspect repo evidence first and ask only targeted questions. |
| Treating inferred persona or threat model as fact | Mark it `Hypothesis` or `Unknown` until human-confirmed. |
| Replacing project overlay rules | Reference the overlay; update it only when the content is a durable project rule. |
| Storing task progress here | Move progress to `planning-with-files`. |
| Letting context go stale silently | Add update triggers and evidence sources. |
| Treating a checked-in template as context | Keep `context_status: template` and report missing or insufficient evidence until real project facts are recorded. |
