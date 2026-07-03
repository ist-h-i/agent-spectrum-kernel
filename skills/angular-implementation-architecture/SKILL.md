---
name: angular-implementation-architecture
description: Angular stack implementation overlay. Use after the generic implementation workflow is selected when a task touches Angular components, routes, routed pages, providers, dependency injection, directives, pipes, templates, forms, Signals, RxJS, stores/facades, Angular router, DOM/browser APIs, security-sensitive bindings or sanitization, SSR/hydration/rendering, Angular tests, Angular CLI generation, upgrades, migrations, or Angular MCP/tooling. Produces Angular constraints for controlled-implementation and verification supplements for test-first-verification; it does not replace skill-router, controlled-implementation, test-first-verification, or application-boundary-architecture.
---

# Angular Implementation Architecture

## Role

Use this as a stack implementation overlay for Angular-specific implementation mechanics.

This skill is selected after the generic workflow has already been chosen by `skill-router` or explicitly by the user. It feeds Angular constraints into `controlled-implementation` and Angular verification supplements into `test-first-verification`.

It follows the generic stack overlay contract in `docs/stack-implementation-overlay-contract.md`.

It does not perform the final implementation loop by itself, does not make merge decisions, and does not replace `application-boundary-architecture`.

## Stack Overlay Contract

```yaml
name: angular-implementation-architecture
stack: Angular
applies_when:
  - @angular/* dependencies, angular.json, Angular CLI workspace files, or Angular test tooling are present
  - the task touches .component.ts, .component.html, .component.scss/css, route config, directives, pipes, services, providers, forms, Signals, RxJS, stores/facades, DOM/browser APIs, SSR/hydration, Angular tests, migrations, or CLI/MCP tooling
do_not_use_when:
  - the change is not on an Angular surface
  - the change is copy, docs, formatting, or comments only
  - nearby code makes the Angular pattern obvious and low risk
  - generic application-boundary-architecture is sufficient and no Angular mechanics are involved
  - the overlay would add Angular-specific layers by preference rather than evidence
requires_context:
  - selected generic workflow and implementation scope
  - Angular version and local Angular strategy when API, CLI, migration, or tooling choices matter
  - repository scripts and nearby tests for verification choices
reads:
  - docs/ai/implementation-context.md when present
  - AGENTS.project.md or equivalent project overlay when present
  - package.json, angular.json, tsconfig*, and workspace config when relevant
  - nearby Angular files and tests
outputs:
  - stack surface
  - existing pattern
  - constraints for controlled-implementation
  - verification supplement for test-first-verification
  - stop conditions
must_not:
  - replace generic workflow
  - make final merge decision
  - force Angular-specific architecture globally
  - introduce usecase, repository, facade, store, mapper, service, directive, or adapter layers only by preference
```

## Boundary With Generic Architecture

Use this skill for Angular-local mechanics:

- component metadata, inputs, outputs, host bindings, templates, styles, and change detection;
- provider scope, route providers, dependency injection, and injection context;
- Angular router config, routed pages, guards, resolvers, outlets, navigation, and route tests;
- Signals, RxJS interop, async cleanup, resource-like read models, forms, and validation surfaces;
- DOM/browser API access, security-sensitive bindings, sanitization, SSR, hydration, and rendering;
- Angular CLI generation, Angular tests, migrations, and MCP/tooling availability.

Escalate to `application-boundary-architecture` when the decision is not Angular-local:

- one owner per mutable fact is unclear;
- external I/O, transport DTOs, raw SDK responses, raw errors, or trust boundaries cross Angular UI/state/domain surfaces;
- dependency direction, feature public API, cross-feature import policy, or repository/usecase/mapper necessity is unresolved;
- long-lived async work needs an ownership, cancellation, stale-discard, or cleanup policy beyond local Angular mechanics;
- auth, permission, schema, migration, production config, dependency, or infrastructure impact appears.

After the boundary decision is resolved, return to this skill only to map the decision into Angular constructs.

## Process

1. Confirm the Angular surface touched by the task.
2. Inspect only the required repository evidence: implementation context, project overlay, Angular version/tooling, nearby files, nearby tests, direct imports, provider scope, route config, and scripts as needed.
3. Identify the existing local Angular strategy before adding constraints:
   - standalone components or NgModules,
   - route-level or root providers,
   - Signals, RxJS, NgRx, local services, stores, or facades,
   - reactive forms, template-driven forms, or signal forms,
   - SSR/hydration, zoneless, custom builders, Material/CDK, harnesses, or E2E tooling.
4. Run the touched-surface scan below.
5. Produce the bounded overlay output for the generic workflow.
6. Use repository scripts as validation authority. Map Angular guidance to local scripts before suggesting `ng` commands.

Do not load or apply broad Angular modernization, migration, SSR, security, performance, or design-system guidance unless the touched surface requires it.

## Touched-Surface Scan

Answer only the questions touched by the task:

1. Does this change provider lifetime or mutable state ownership?
2. Does this expose backend-shaped DTOs, raw errors, or transport concerns to templates, stores, view models, or domain policy?
3. Does this create async work that needs stale discard, cancellation, teardown, or RxJS/Signal cleanup?
4. Does this touch DOM/browser APIs, SSR/hydration-sensitive rendering, security-sensitive data, bindings, or sanitization?
5. Does this affect a public component contract, route contract, feature boundary, or shared UI contract?
6. What focused check proves the Angular behavior or contract?

If a touched answer requires a non-Angular ownership or trust-boundary decision, stop and route that decision to `application-boundary-architecture`.

## Angular Constraints To Consider

Use these as candidate constraints only when supported by repository evidence and the touched surface:

- Keep existing standalone vs NgModule style unless the task explicitly migrates it.
- Keep provider lifetime local to the smallest correct scope; do not move providers to root by default.
- Keep writable state private when the local pattern supports it; expose read-only signals, observables, or view models where that is the observed convention.
- Avoid duplicating the same mutable fact across URL, component state, store/facade, and service.
- Keep templates free of transport DTO/error assumptions unless the repository has an explicit stable read-model boundary.
- Prefer existing form strategy for existing features; do not migrate form style opportunistically.
- Clean up subscriptions, timers, DOM listeners, observers, resources, and effects according to the local Angular version and pattern.
- Guard browser-only APIs for SSR/hydration-sensitive code when the app renders outside the browser.
- Use Angular sanitization and binding rules; do not bypass security or write DOM sinks unless the trust boundary and verification are explicit.
- Use Angular CLI or schematics only when the repository already uses them or the task explicitly calls for generation. Do not install global CLI tools.
- Treat latest Angular APIs as version-gated. Confirm package availability, builder behavior, formatter support, and test tooling before using them.

## Verification Supplement

Feed the applicable items into `test-first-verification`.

Prefer local scripts first:

- focused component/service/pipe/directive tests,
- router tests for route config, guards, resolvers, navigation, or outlet behavior,
- form tests for validation, disabled states, submission, and error display,
- async tests for cancellation, stale results, teardown, or signal/observable updates,
- lint/typecheck/build for template type checking and DI errors,
- SSR/hydration/build checks when rendering behavior changes,
- browser/manual checks for visible UI behavior when automated coverage is absent,
- accessibility checks for interaction, keyboard flow, labels, focus, and ARIA when UI contracts change.

Only suggest raw Angular CLI commands such as `ng test`, `ng lint`, `ng build`, or migration commands after checking that local scripts or workspace tooling support them.

## Angular CLI And MCP Gate

Use active-session tools only. If Angular MCP or Angular CLI wrapper tools are unavailable, continue with repository inspection and documented local commands.

When execution-capable tools are available:

- verify the target workspace path before running path-sensitive commands;
- prefer read-only diagnostics before generation or migration;
- do not simulate unavailable tools;
- treat repository scripts as the validation authority;
- record tools used in the final report.

## Output

Produce this overlay handoff before implementation when Angular mechanics matter:

```text
Angular implementation overlay:
- Angular surface:
- Existing Angular pattern:
- State owner:
- Provider / DI scope:
- Async lifecycle:
- Template / form impact:
- DOM / security impact:
- SSR / hydration impact:
- Constraints for controlled-implementation:
- Verification supplement for test-first-verification:
- Stop conditions:
- Evidence:
```

For small local Angular edits, keep the output compact. Omit untouched fields only when the task is trivial or the user asked for a lightweight response.

## Stop Conditions

Stop and report the reason before implementation when:

- Angular version, workspace, or local scripts are required for a decision but cannot be confirmed;
- provider lifetime, state ownership, DTO/error trust boundary, dependency direction, or async lifetime is unresolved;
- a public component, route, feature, schema, generated artifact, dependency, auth, permission, or production-facing contract would change without explicit scope;
- Angular generation or migration would modify broad files outside the requested surface;
- focused verification cannot be identified for the changed Angular behavior.

## Exit Criteria

- The overlay can be skipped safely when no Angular signal exists.
- Constraints are based on local repository evidence or explicitly marked unknown.
- The generic workflow remains the implementation backbone.
- The output feeds `controlled-implementation` and `test-first-verification`.
- No Angular-specific architecture is forced globally.
