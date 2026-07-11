# Claude GitHub Review Setup

This guide documents the optional Pattern B `@claude review` adapter.

Local Claude hooks are the default path for local observability. GitHub Actions are optional and useful when a PR-level shared review comment is needed.

## Prerequisites

- Claude Code GitHub Action access.
- A copied project adapter under `.claude/skills/` or an enabled `ai-skills` plugin.
- Repository secret or approved provider authentication for Claude.
- Repository permissions reviewed by the owner.

## Setup

1. Copy `adapters/claude-code/github-actions/claude-review-on-mention.yml` into `.github/workflows/` of the adopting repository.
2. Add `ANTHROPIC_API_KEY` as a GitHub Actions secret, or adapt the workflow to an approved Bedrock/Vertex/OIDC setup.
3. Confirm permissions are limited to the review use case.
4. Confirm who is allowed to invoke the workflow. The template accepts comment-triggered reviews only from `OWNER`, `MEMBER`, or `COLLABORATOR` actor associations by default.
5. Open a pull request and comment:

```text
@claude review
```

## Expected Output

The review comment should include:

- decision: `approve`, `approve with comments`, `request changes`, `block`, or `insufficient evidence`,
- change signals and required gates,
- blocking evidence,
- passed required gates,
- insufficient evidence,
- non-blocking follow-ups,
- residual risk.

The workflow checks out the PR head workspace before invoking Claude. It captures PR metadata into `.claude/pr-context.json`, the patch diff into `.claude/pr.diff`, and the checked-out head SHA into `.claude/pr-head-sha.txt`. The prompt requires Claude to read those files before extracting change signals and selecting gates.

For fork PRs, the template blocks comment-triggered execution by default. A repository owner can intentionally review a fork by using `workflow_dispatch`, setting `pr_number`, and setting `allow_fork=true` after approving the data-exposure and cost risk.

## What This Does Not Do

- It does not run on every PR update by default.
- It does not allow arbitrary commenters to trigger a review by default.
- It does not review fork PRs from comments by default.
- It does not replace local hook observability.
- It does not auto-merge, deploy, publish, or release.
- It does not create or store secrets.
- It does not publish metrics externally.

## Risk Gate

Before enabling the copied workflow in a production repository, review:

- GitHub token permissions,
- Claude authentication path,
- whether forked PRs are allowed to trigger the workflow,
- cost limits and timeout,
- whether comments can expose sensitive repository details,
- owner approval for external execution.

Static validation in this repository can check that the template is present and guarded, but it cannot prove runtime GitHub Actions or Claude behavior.

To loosen the guard intentionally, change the actor-association allowlist or fork guard in the copied workflow in the adopting repository. Keep that decision in project rules or an ADR, and downgrade review confidence when the workflow cannot prove it is reading the PR head workspace.
