---
name: application-boundary-architecture
description: Framework-agnostic and TypeScript-oriented application architecture and boundary decisions. Use when the agent must decide ownership, dependency direction, external I/O boundaries, DTO/error trust boundaries, async lifetime, feature public API, usecase/repository/port/adapter/mapper necessity, ID boundaries, or architecture guard rollout. Do not use for framework-local mechanics, template-only changes, style-only edits, copy changes, simple tests, or implementation details after the boundary is already clear. For Angular-specific APIs, provider scope, Signals/RxJS, templates, forms, SSR/hydration, rendering, performance, or upgrades, use the project overlay's Angular-specific skill if available; otherwise treat the concern as outside this generic skill and report the missing overlay.
---

# Application Boundary Architecture

## Purpose

Use this skill when the agent must decide application boundaries independent of a specific framework.

Do not use this skill for framework-local mechanics, UI rendering details, or implementation steps after the boundary decision is already clear.

This is not a Clean Architecture doctrine skill. The goal is not to increase file count, layer count, or force usecase/repository/entity/mapper folders. The goal is to separate change reasons, mutable state ownership, side effects, external I/O, data trust boundaries, and async lifetimes into observable boundaries that can be reviewed and tested.

Inspect the target repository first, follow existing naming and module conventions, and apply the smallest compatible change.

This skill is framework-agnostic but TypeScript-oriented. When applied to other languages, translate examples such as `unknown`, branded IDs, `index.ts`, and `public-api.ts` into the repository's equivalent constructs such as opaque types, value objects, newtypes, package exports, module boundaries, or public entry points.

## Boundary Invariant Kernel

Use these invariants as the compact first-pass decision model:

1. One owner per mutable fact.
2. Non-trivial external I/O lives behind a named, testable boundary.
3. Transport DTOs, raw SDK responses, and unknown/raw errors do not cross into UI, templates, domain policy, or workflow state unless explicitly accepted as stable read models or typed errors at a boundary.
4. Dependencies point from UI toward application policy and boundary contracts; application/domain policy does not depend on framework UI, transport, SDK, or infrastructure details.
5. Long-lived async work has explicit stale-discard, cancellation, and cleanup responsibilities.
6. Cross-feature access goes through a public API, route boundary, shared abstraction, or explicit migration allowlist.

## Workflow

1. Inspect only the repository evidence needed for the decision surface first: touched files, direct imports, nearby tests, relevant package scripts, public APIs, data access patterns, and error handling. Broaden inspection only when shared behavior, public boundaries, migration rollout, or guard failures require it.
2. Classify the decision surface: feature boundary, dependency direction, state ownership, external I/O, async lifetime, usecase, repository/port/adapter, mapper, DTO/domain/view model, typed error, ID boundary, test boundary, or guardrail.
3. Classify the code maturity: new code, mature feature code, critical/security/boundary code, or legacy code.
4. Choose the smallest boundary that names a real policy or isolates a real source of change.
5. Validate with repository scripts first: focused tests, typecheck/build, lint, then broader tests when shared behavior changed.

## Code Maturity Classification

Classify code as critical/security/boundary code when it touches any of these:

- authentication, authorization, session, tenant, role, permission, or feature-flag decisions;
- PII, credentials, secrets, tokens, billing, payment, audit, compliance, or security-sensitive data;
- destructive actions, irreversible writes, persisted state, cross-user effects, jobs, queues, or external side effects;
- public API exports, package boundaries, route/command parsers, DTO mappers, adapters, repositories, ports/interfaces, error normalization, or validation at trust boundaries;
- shared/common modules used by multiple features.

Legacy code may be migration-staged only for pre-existing violations that are outside the requested change surface, are not relied on by the requested change, are not expanded, and satisfy the baseline rules in "Architecture Guard Rollout". New or expanded violations in touched code should be treated as new-code violations unless the change explicitly reduces the baseline.

## Stability Gates

- `MUST`: Violating this leaks external I/O, breaks dependency direction, duplicates mutable state ownership, leaks DTO/raw errors across a boundary, or hides an async lifetime.
- `SHOULD`: Preferred design, but exceptions are allowed for local/simple implementations.
- `MIGRATION-STAGED`: For pre-existing legacy violations outside the requested change surface, use baseline, warning, owner, reason, expiry or review date, and ratchet. New, expanded, relied-on, or touched critical/security/boundary violations fail.

If owner, reason, expiry/review date, baseline, or ratchet metadata is not discoverable from repository files, do not invent it. Report the violation as `MUST until staged` or `missing migration metadata`, and avoid expanding the change unless the requested task requires it.

## Default Severity Mapping

Use this severity mapping unless the repository has stricter architecture rules.

### MUST

Treat these as violations in new, mature, critical, security-sensitive, or boundary code:

- Non-trivial external I/O inside ordinary UI/presenter code.
- Externally shaped, transport-coupled, unvalidated, unstable, or raw backend/API data exposed to UI templates, presentational components, workflow policy, or domain policy without an explicit stable read-model decision.
- Raw transport, SDK, or unknown errors stored as user-facing state.
- The same mutable fact owned by multiple sources such as UI state, facade/store, URL, or domain/application logic.
- Subscription, polling, timer, observer, worker, stream, or long-running job without explicit cleanup.
- Shared/common code importing from a feature.
- External import from another feature's internal code.
- Client-side guard, route guard, or UI condition treated as the sole authorization mechanism.
- Dependency direction from domain/view model/application policy toward framework UI, transport DTO, SDK, concrete client, repository implementation, adapter implementation, or infrastructure detail.

### SHOULD

Treat these as preferred architecture rules. Exceptions are allowed when the implementation is local, simple, and the exception is explicit:

- Complex workflow without a usecase/application service.
- Facade mixing presentation-facing state ownership, I/O details, domain policy, and transport normalization.
- Mapper normalization that affects behavior but lacks focused tests.
- Cross-boundary ID represented as a plain primitive when ID confusion is plausible.
- Same operation reachable through multiple paths without an explicit exception.

### MIGRATION-STAGED

Use this only for pre-existing violations that are outside the requested change surface, are not relied on by the requested change, are not expanded by the change, and are covered by a baseline, warning, owner, reason, expiry or review date, and ratchet rule.

Examples:

- Existing internal feature imports.
- Existing DTO leakage.
- Existing raw error leakage.
- Existing duplicated mutable state ownership.
- Existing architecture guard failures.

A migration-staged violation requires a baseline, warning, owner, reason, expiry or review date, and a ratchet rule that prevents new violations or baseline count increases.

## Boundary Rules

### 1. Layer Escalation

Escalate only when behavior requires it:

- Shared workflow state -> facade/store/application state.
- External I/O -> repository/query service/adapter/gateway.
- Workflow policy or orchestration -> usecase/application service.
- DTO mismatch or trust-boundary normalization -> mapper.
- Infrastructure variation under policy -> port/interface.
- Pure local UI effect -> component/directive/hook/utility with explicit cleanup.

Keep ordinary static display and simple input/output in the UI/presenter. Remove pass-through layers that name no real policy.

### 2. Dependency Direction

Keep dependencies one-way. Depend on policy-facing abstractions before depending on infrastructure details.

Arrows in this section describe dependency/import direction, not runtime data-flow or return-value shape. Values returned toward UI must be domain models, view models, read models, or typed application errors, not transport DTOs or raw SDK responses.

Use this shape for workflows with business rules:

```txt
UI -> application state/facade -> usecase/application service -> port/interface
infrastructure adapter/repository implements port/interface
adapter/repository -> external API/SDK/storage/database/filesystem/queue
adapter/repository -> mapper -> DTO/API
```

A usecase/application service should depend on a port/interface when the port/interface conditions below are met and the data source, transport, SDK, storage, or infrastructure detail may change independently from workflow policy.

An adapter/repository implements the port/interface and owns endpoint-specific request/response details, SDK quirks, headers, pagination tokens, storage keys, runtime validation, transport error normalization, and DTO mapping.

Use this shortcut only for simple read-only queries where no workflow policy exists:

```txt
UI -> query service/repository
query service/repository -> external API/SDK/storage
query service/repository -> mapper -> DTO/API
query service/repository returns domain/view/read model to UI
```

This shortcut is allowed only when all of these are true:

- The query service returns a domain model or view model, not a transport DTO.
- No shared workflow state, mutation, permission-sensitive branch, retry policy, cancellation policy, polling, job, transaction-like procedure, or cross-screen procedure exists.
- Error normalization still happens at the data-access boundary.
- The same operation is not also routed through a usecase/application service elsewhere.

Domain and view models must not depend on framework components, templates, DOM APIs, HTTP clients, concrete database clients, repositories, adapters, SDKs, or transport DTOs.

The same operation should not bypass its chosen path. If some callers go through a usecase and others call a repository/query service directly for the same workflow, choose one path or make the exception explicit with owner, reason, and expiry.

Treat operations as the same when they mutate or fetch the same resource for the same user intent, represent the same user command, share the same authorization decision, or produce the same durable workflow state, even if endpoint names, method names, or UI entry points differ.

Do not treat two calls as the same operation solely because they touch the same resource. Consider user intent, authorization semantics, consistency requirements, mutation side effects, error handling expectations, and user-visible workflow state.

### 3. Feature Boundaries and Public API

Group code by feature or user workflow. A feature may contain its UI, application state, usecases, repositories/ports, mappers, models, and tests.

Other features must import only from a feature public entry point such as `index.ts`, `public-api.ts`, package exports, or the language/framework equivalent. Exceptions require an explicit public API decision or a temporary migration allowlist with owner, reason, and expiry.

Do not import another feature's internal UI, state, usecase, repository, mapper, model internals, or test helper.

Shared/common code must not import from a feature. Feature-to-feature coordination should use routing/navigation, app-level services, events, explicit public APIs, or backend/API contracts.

### 4. State Ownership

Assign exactly one owner for each mutable state:

- Local UI state for draft input, dirty/touched/focus, visual state, and short-lived interaction state.
- Application/feature state for submitted/saved workflow state, selection, progress, errors, and shared state across UI pieces.
- URL/router/command arguments for shareable navigation, filters, and reload-restorable search conditions.
- Usecase/domain model for domain invariants and workflow rules.
- Application/global state only for truly cross-feature concerns such as session, permissions, config, or global preferences.

Do not keep two mutable sources of truth for the same fact. Derive read models/view models instead of copying state into another owner.

When URL/query params or command arguments represent shareable or reload-restorable state, choose one canonical owner:

- URL-owned: the facade/application state derives state from URL/query params and emits navigation commands instead of independently mutating the same fact.
- State-owned: the facade/application state owns the fact and writes URL/query params as an effect.

Do not allow URL/query params and facade/store/application state to independently mutate the same fact. Derive one from the other.

### 5. Side Effects and Async Lifetimes

External I/O belongs behind an explicit repository, port, adapter, gateway, query service, command service, or equivalent boundary chosen by the repository's conventions.

A boundary is explicit only when it has a named module, function, class, service, adapter, or type with a narrow public contract, can be tested or reviewed separately from UI rendering, and owns a single change reason. A private method inside a UI component/presenter is not an application boundary for external I/O.

Browser APIs that affect durable workflow state, persistence, permissions, external data access, cross-component coordination, background work, or reload-restorable behavior should live behind an adapter, port, query service, command service, or equivalent boundary.

Purely local UI effects such as focus, scroll, transient clipboard copy, local visual observers, and visual-only timers may stay in UI-level utilities, directives, hooks, or components when their lifetime and cleanup are explicit.

Represent async workflows with explicit states when the UI/API/client distinguishes them. Keep query, mutation, and job states separate when they have different retry, cancellation, progress, or failure behavior.

Separate these concerns:

- Stale discard: older responses do not update current state.
- Request cancellation: active HTTP/subscription/polling/timer/job work is stopped.
- Cleanup: route/page/request/component/process destruction tears down subscriptions, timers, observers, workers, streams, and adapters.

If stale discard, cancellation, and cleanup are implemented by the same flag or timing workaround, treat that as a design smell. These concerns may share implementation machinery, but the review must identify which concern is being handled.

Do not use arbitrary sleeps, timing guesses, or "wait then render" code to coordinate async behavior.

### 6. DTO, Domain Model, and View Model

A simple read-only query shortcut does not permit DTO leakage. Even when UI calls a query service/repository directly, the returned value should be a domain model, view model, or explicitly named read model rather than a raw transport DTO.

Do not leak backend/transport DTOs directly into UI templates, presentational components, domain models, or workflow policies.

Do not classify a type as a leaking DTO by name alone. Classify it by whether it is externally shaped, transport-coupled, unvalidated, unstable, or used across a UI/policy boundary without an explicit read-model decision.

Convert DTOs at the data-access boundary into domain models or view models. Keep mappers pure and tested when normalization affects user-visible behavior.

A mapper is not required when the transport shape is stable, validated or generated from a trusted contract, and intentionally identical to the returned domain/view/read model. In that case, the review must state that no normalization policy currently exists. Add a mapper when null handling, legacy aliases, invalid values, unit conversion, permissions, derived fields, or runtime trust-boundary handling appears.

Prefer named types over `any`, and use `unknown` plus narrowing when input trust is low.

For untrusted or unstable API data, define an invalid-value policy: reject, default, omit, mark partial, or convert to typed error.

### 7. Usecase Decisions

A facade/application state boundary owns presentation-facing workflow state, async status, selection, progress, recoverable user-facing errors, URL synchronization, and derived view/read models.

A usecase/application service owns workflow policy, orchestration, permission-sensitive branching, retry/cancellation policy, transaction-like procedures, polling/jobs, and coordination across ports/interfaces.

A facade may call a usecase/application service, but should not become a god object that owns I/O details, domain policy, transport normalization, and presentation state at the same time.

Add a usecase/application service when the workflow has one or more of these:

- Multiple I/O sources, ports/interfaces, or repositories.
- Permissions, authorization-sensitive branching, or business rules.
- Retry, backoff, cancellation, polling, jobs, or transaction-like coordination.
- Cross-screen/application procedures.
- Error classification that affects user-visible workflow decisions.

Do not add a usecase for a single pass-through CRUD call unless it names a durable policy or isolates a planned migration boundary.

### 8. Repository, Port, and Mapper Decisions

Add a repository/adapter/query service when code crosses an external I/O boundary or when the data source is likely to change independently from UI/application policy.

Consider a port/interface when workflow policy would otherwise depend on the concrete infrastructure detail, transport, SDK, storage mechanism, or persistence technology.

Do not add a port/interface solely because external I/O exists. A concrete repository/adapter/query service is sufficient when no workflow policy depends on it, no alternate implementation is needed, and tests can verify behavior at the repository/adapter boundary.

Add a port/interface when at least one of these is true:

- a usecase/application service must be tested without concrete infrastructure;
- multiple implementations exist or are expected, such as HTTP vs local cache, browser vs server, mock vs real SDK, or storage variants;
- application policy would otherwise import transport, SDK, storage, or infrastructure details;
- the same workflow policy must survive a planned data-source or transport migration;
- the port names a stable capability rather than a single endpoint call.

Keep endpoint-specific request/response details, transport errors, pagination tokens, headers, storage keys, SDK quirks, and runtime DTO validation at the data-access boundary.

Add a mapper when DTO and domain/view models differ, or when normalizing trust-boundary data affects behavior. If a mapper only copies fields without policy, inline it until a real normalization appears.

### 9. Error Model

Repository and adapter boundaries should not leak raw transport, SDK, or unknown errors into UI, application state, view models, or domain policy.

Raw transport, SDK, or unknown errors may be retained as non-user-facing `cause`, debug metadata, or telemetry metadata at the boundary. They must not be exposed as user-facing state, display text, view model fields, domain policy input, or workflow branching input unless first converted into a typed application/domain/validation error.

Convert errors into typed application/domain/validation errors with classification such as `kind`, `severity`, `retryable`, `messageKey`, `params`, and optional action.

Use global middleware/interceptors for global concerns. Use repositories/mappers/adapters for endpoint-specific normalization. Use application state/facades to represent recoverable user-facing state.

### 10. ID Typing

Use branded, opaque, value-object, newtype, or validated IDs when ID confusion is plausible or when IDs are security-sensitive, persisted, cross-feature, domain-significant, used in URLs/commands, used as cache keys, used as job/entity identifiers, or passed across repository/usecase/store boundaries.

Do not require branded IDs for purely local UI keys such as temporary DOM IDs, tabs, accordions, menu items, client-only list keys, or display-only keys.

Apply branding or validation at mappers, route/command parsers, factories, repository boundaries, or other trust boundaries. If casts spread through UI, templates, or workflow code, the boundary is in the wrong place.

When plain primitives are used for IDs across a boundary, the review should state why ID confusion risk is low.

### 11. Testing Strategy

Test the most stable layer possible:

- Pure helpers: branching, calculations, mappers, view models, reducers.
- Usecase/application state: workflow, race, cancellation, retry, partial failure, error mapping.
- Repository/adapter: method, URL/query/body/headers, storage keys, SDK calls, response mapping, and error mapping.
- UI/component: input/output, DOM/accessibility contract, keyboard interaction, loading/empty/error states.
- E2E/browser/integration: key user flows, URL/command restore, reload/retry, auth expiry, and failure paths.

Follow the repository's scripts and test runner. Do not introduce a new runner or dependency unless the existing stack cannot verify the requested behavior.

### 12. Architecture Guard Rollout

Guardrails should be operational rules, not ideals.

- New code: fail.
- Mature feature code: fail.
- Critical/security/boundary code: fail when violations are newly introduced, expanded, relied on by the requested change, or touched; existing untouched violations may be migration-staged only under the baseline rules below.
- Legacy code: start with baseline and warning, fail baseline-external new violations, require owner/reason/expiry for allowlists, and forbid baseline count increases.

Violations below fail in legacy code when they are newly introduced, expanded, relied on by the requested change, or located in touched critical/security/boundary code.

Existing untouched violations outside the requested change surface may be MIGRATION-STAGED only when they are covered by a baseline, warning, owner, reason, expiry or review date, and ratchet rule.

- External I/O mixed directly into ordinary UI/presenter code for a non-trivial workflow.
- Externally shaped, transport-coupled, unvalidated, unstable, or raw backend/API data flowing into UI templates, presentational components, or domain policy without an explicit stable read-model decision.
- Raw transport/SDK/unknown errors displayed or stored as user-facing state.
- Mutable state owner duplicated across UI, store/facade, URL, and domain/application logic.
- Async polling, subscription, timer, observer, worker, or stream without cleanup.
- Shared/common code importing from a feature.
- External import from feature internal code.
- Client-side guard or UI condition treated as sole authorization.
- Dependency direction from domain/view model/application policy toward framework UI, transport DTO, SDK, concrete client, repository implementation, adapter implementation, or infrastructure detail.

If a violation appears both in MUST and MIGRATION-STAGED, classify it by change surface:

- MUST: newly introduced, expanded, relied on by the requested change, or touched in critical/security/boundary code.
- MIGRATION-STAGED: pre-existing, untouched, outside the requested change surface, not relied on by the requested change, not expanded, and covered by baseline, warning, owner, reason, expiry or review date, and ratchet.
- MUST until staged: pre-existing but missing baseline, owner, reason, expiry or review date, or ratchet.

## Output Modes

The full review format is not the default for every implementation task.

Do not print collapsed full-review headings for local implementation. If no boundary changed, say `No boundary change` once and continue with the requested implementation summary.

- Trivial/local change: do not print the full architecture review. State `No boundary change` only if relevant.
- Local implementation: report only boundary decision, change made or diff shape, and verification.
- Boundary review or architecture audit: use the full review output.
- Guard failure: report violation, evidence, risk, smallest fix, and verification.
- Migration / legacy rollout: report scope, baseline status, owner/reason/expiry or review date if discoverable, ratchet rule, and missing metadata.

## Review Output

Use this structure for boundary review, architecture audit, migration rollout, or when the user asks for detailed review. Do not invent risks, inferred patterns, migration constraints, or architecture changes when repository evidence does not support them.

### 1. Boundary Decision

- Chosen boundary:
- Rejected boundary:
- Reason:
- Smallest compatible change:

### 2. Confirmed Facts

Separate facts from interpretation.

- Files inspected:
- Package scripts / CI checks inspected:
- Existing naming and module conventions:
- Existing data access pattern:
- Existing error handling pattern:
- Existing test pattern:

### 3. Inferences

State only inferences grounded in repository evidence.

- Inferred architecture pattern:
- Inferred owner of mutable state:
- Inferred trust boundary:
- Inferred migration constraint:

### 4. Violations

Classify findings by severity.

- MUST:
- SHOULD:
- MIGRATION-STAGED:

For each violation, report:

- Rule:
- Evidence:
- Risk:
- Suggested smallest fix:

### 5. Proposed Change

When this full review output is explicitly used for implementation review, report the diff shape before or after making changes.

- Files likely affected:
- Boundaries changed:
- New layer or abstraction added:
- Layer or abstraction intentionally not added:
- DTO/domain/view model changes:
- Error model changes:
- State ownership changes:
- Async lifetime changes:

### 6. Verification

- Commands run:
- Expected pass condition:
- Actual result:
- Missing verification:
- Reason verification is missing, if any:

### 7. Remaining Risks

- Owner decision needed:
- Legacy/baseline concern:
- Broader check required:
- Risk accepted temporarily:
- Expiry or ratchet rule, if applicable:
