# Pattern B GitHub Actions Adapter

This adapter is an optional PR-sharing path for `@claude review`.

It is not the default local observability path. Local hooks remain the primary way to capture project-local metrics and debt evidence before code is pushed.

## Pattern B

Pattern B means:

- run only when a user comments `@claude review` on a PR,
- do not run on every PR update,
- use the installed project skills or plugin skills,
- start with `review-router`,
- run only required gates,
- end with `review-final-merge-gate` style output.

## Install

1. Install the Claude project adapter or plugin in the adopting repository.
2. Copy `claude-review-on-mention.yml` into the adopting repository's `.github/workflows/`.
3. Add required Claude authentication through GitHub Secrets or approved OIDC setup.
4. Comment `@claude review` on a pull request.

The workflow template references `${{ secrets.ANTHROPIC_API_KEY }}` but does not contain any secret value.

## Safety Boundary

The template:

- uses comment and manual triggers only,
- captures PR metadata with `gh pr view` and PR patch with `gh pr diff` before invoking Claude,
- does not trigger on `pull_request.opened` or `pull_request.synchronize`,
- does not auto-merge,
- does not deploy,
- does not publish,
- does not enable external observability publication,
- does not store raw prompts by default.

Enabling this workflow in a real repository is externally visible and should be reviewed through `risk-gate` when permissions, secrets, or repository settings change.
