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
4. Open a pull request and comment:

```text
@claude review
```

## Expected Output

The review comment should include:

- decision: `approve`, `approve with comments`, `request changes`, `block`, or `insufficient evidence`,
- layer summary,
- required fixes,
- suggestions,
- improvement-ledger candidates when applicable,
- evidence reviewed,
- residual risk.

## What This Does Not Do

- It does not run on every PR update by default.
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
