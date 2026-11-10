# ReviewOps

ReviewOps helps field engineers handle PR/MR reviews faster, more completely, and more safely from VS Code.

It organizes review prompts, comment triage, fix plans, reply drafts, rule candidates, and field evidence while keeping AI execution manual-only and provider posting preview-first. The useful side effect for SES teams is that review work leaves editable local knowledge and metrics files that can support mentoring, technical evaluation discussions, and cross-field knowledge sharing without telemetry or automatic scoring.

## Hero Value

- Faster review response: turn comments and imported review responses into action plans, fix checklists, and reply drafts.
- Fewer misses: keep next actions, unresolved risks, and generated artifacts visible in the Command Center.
- Safer publishing: external AI calls are not made by ReviewOps, and provider writes require explicit preview confirmation.
- Visible local assets: shared counters live in `.reviewops/metrics/review-work.yaml`, reusable knowledge lives in `.reviewops/knowledge/`, and local-only details stay in `.reviewops.local/`.

## Source Documents

- [Requirements](docs/requirements.md)
- [Design](docs/design.md)

## Target Shape

- VS Code Extension Layer
- ReviewOps Core Layer
- Provider Adapter Layer

P0 keeps AI execution manual-only: ReviewOps generates prompts and imports responses, but does not call external AI APIs directly.

The current P0 review provider implementations are local git and GitHub. GitLab, Backlog, Jira, issue creation, and Hub integration are treated as P1/P2 plans.

P0 also keeps metrics local. ReviewOps writes safe aggregate counters to `.reviewops/metrics/review-work.yaml` and detailed local events to `.reviewops.local/metrics-events.local.jsonl`; both are files in the user's workspace rather than telemetry.

## Development

ReviewOps uses a pnpm TypeScript workspace.

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm check:policy
```

Workspace packages:

- `@reviewops/core`: local core engine boundary, independent from VS Code APIs.
- `@reviewops/providers`: provider adapter boundary.
- `reviewops-guard`: VS Code extension package for ReviewOps Guard.
