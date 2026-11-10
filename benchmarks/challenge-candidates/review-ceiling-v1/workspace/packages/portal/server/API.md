# Local portal adapter

The portal is a local integration harness for the existing ReviewOps engine. It does not contact GitHub, execute review findings, or write to checked-out repositories. `node server/index.mjs` listens on 127.0.0.1 and chooses an unused port unless PORT is set. By default, state resets at process exit; optional temporary-directory restart fixtures are described below. Node 24 or newer is required; no portal dependency installation is necessary.

The response/import workflow in `packages/core/src/responses/import.ts` writes `review-findings.json`, `result.json`, action-plan and reply-draft seed artifacts. The portal's `artifacts.mjs` projects those normalized response fields into its JSON preview/export view. The bridge imports the core TypeScript modules directly using Node 24 native type stripping. Converted findings become a core action plan, fix plan, checklist, verification result and explanation in the exported workflow. Core remains host-independent; server adapters own HTTP, caching and queue execution.

## Identity and fixtures

The synthetic `x-user-id` request header defaults to `alex`. Alex maintains teams alpha and beta. Blair reads alpha; Casey maintains beta. This header is a local scenario selector, not production authentication. Review IDs are local to a team. Each team has 18 reviews; review-001 and review-006 start approved. All repository names, notes, findings and publication receipts are synthetic.

## Endpoints

- GET `/api/teams` returns `{teams}` with id, name and role.
- GET `/api/teams/:team/reviews?q=&status=&limit=&cursor=` returns `{items,total,nextCursor}`. Cursor parameters must match the original team and filters. Default page size is 10, maximum 100. A review has id, teamId, title, repository, pullRequest, headSha, status, version, updatedAt, summary, findings and history.
- GET `/api/teams/:team/reviews/:id` returns the review.
- PATCH that review with `{version,status?,title?,note?}` returns the updated review. Allowed explicit status changes are open, approved and archived. Archiving records archivedFrom. A published review can be restored from its own archived state; new publication is owned by the worker. A stale version returns 409.
- POST `/api/teams/:team/reviews/:id/notes` with `{body}` appends a coordinator note and returns the updated review with history.
- POST `/api/teams/:team/reviews/:id/verification` with `{version,results}` stores verification inputs, validates fix-plan item references through the core, and returns `{review,verification}`. Results carry fixPlanItemId, status, evidence and commands, with optional unresolvedRisk and followUpIssueTitle.
- GET `/api/teams/:team/reviews/:id/artifact` returns the portal's normalized response object; GET `.../export` returns `{reviewId,teamId,artifact,markdown}`. `compact=1` selects the compact preview variant.
- POST `/api/teams/:team/reviews/:id/publish` with optional `{version}` and required `Idempotency-Key` returns 202 `{job}`. A review must be approved or already published. Jobs expose id, teamId, reviewId, state, attempts and optional receipt/error.
- GET `/api/teams/:team/jobs/:id` returns `{job}`. POST `.../retry` retries a failed job and returns 202 `{job}`.
- GET `/api/teams/:team/metrics` returns total, open, approved, published, bySeverity and partial. `partial=1` models an unavailable severity source with bySeverity null.
- GET/POST/PATCH `/api/teams/:team/settings` reads or saves local workspace preferences, including pinnedOrder (at most 500 unique review IDs or qualified team/id keys accessible to the caller). Pinned order is private to each caller within the settings workspace; other preferences remain shared by the team.

Non-read operations require maintainer membership. Missing records return 404, access failures 403, invalid inputs 400 and state conflicts 409. HTTP bodies are limited to 64 KiB. The q=slow synthetic query waits 220 ms and q=fast waits 10 ms, allowing repeatable request-order testing without network access.

## Execution adapters

`createPortal({store,provider,cache,autoRun})` allows fixtures to supply adapters. Its listen method returns the loopback URL and close tears down the server. The default provider is `LocalReviewProvider`, whose revision-2 transport/completion contract is documented in `provider.mjs`. It stores synthetic publications in memory only. `autoRun:false` exposes deterministic queue advancement via `queue.run(job.id)`.

`ReviewStore` exposes beforeWrite and beforeReceipt scheduling/failure seams for adapter tests. Its stats count review, history and artifact reads, permitting work-count checks independent of machine speed. Public smoke tests run with `node --test test/*.test.mjs` from the portal package.

## Optional restart fixtures

The default remains in-memory. To retain review records, raw legacy fields, verification inputs, queued jobs and receipts across process restarts, create a new directory using `mkdtemp` under `os.tmpdir()` with a `reviewops-` prefix. Pass it as `createPortal({stateDirectory})` or `new ReviewStore({directory})`. The command-line equivalent is REVIEWOPS_STATE_DIR. Paths outside that temporary root, or directory names without the prefix, are rejected.

`LocalReviewProvider({directory})` writes an independent `local-provider.json` journal. `createPortal` defaults its provider journal to stateDirectory, or accepts a separate providerDirectory (REVIEWOPS_PROVIDER_DIR). The review/queue snapshot is `review-store.json`. No real provider credentials or existing ReviewOps files are read. Removing the caller-created temporary directories resets these scenarios.

Queue initialization reloads retry tokens from jobs and returns interrupted running jobs to queued. With autoRun enabled, queued work resumes. With autoRun:false, a test advances each recovered job explicitly. Completed jobs are not replayed. Settings/preferences and the artifact cache remain process-local; the persistence adapter intentionally covers review workflow records and provider effects only.

Snapshots use synchronous file replacement on the local temporary filesystem. This is a bounded single-process restart harness, not a multi-process database or a claim of power-loss durability. Tests must give each worker its own directory. Public persistence tests run two bounded Node processes and verify that a completed publication, receipt, coordinator note and original finding evidence survive reopening without replaying the completed job.
