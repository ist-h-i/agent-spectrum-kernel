# Implementation Context Template

Use this file as durable project implementation context for repeated implementation, verification, and stack-orientation tasks.

This file is not task progress. Use `planning-with-files` for task state.

This file is framework-agnostic. Put Angular, React, Python, Java, or other stack-specific rules in project overlays or stack-specific skills, and link them from the overlay hooks section.

## Evidence Status Key

| Status | Meaning |
|---|---|
| `Verified` | Directly observed in repo files, docs, tests, runtime output, command output, or user input. |
| `Supported` | Backed by indirect evidence but not fully proven. |
| `Hypothesis` | Plausible inference that needs confirmation before being used as fact. |
| `Human-confirmed` | Confirmed by a human owner in the current or prior documented implementation context. |
| `Unknown` | Not inspected, unavailable, ambiguous, or outside current evidence. |

## Stack Inventory

| Area | Finding | Status | Source |
|---|---|---|---|
| Languages: |  | Unknown |  |
| Frameworks / runtimes: |  | Unknown |  |
| Package managers: |  | Unknown |  |
| Build systems: |  | Unknown |  |
| Test frameworks: |  | Unknown |  |
| Tooling / formatting: |  | Unknown |  |

## Package / Workspace Shape

| Boundary | What lives there | Implementation impact | Status | Source |
|---|---|---|---|---|
| Root package / workspace: |  |  | Unknown |  |
| Apps / services: |  |  | Unknown |  |
| Libraries / packages: |  |  | Unknown |  |
| Generated / vendored areas: |  |  | Unknown |  |

## Commands

| Purpose | Command | When to use | Status | Source |
|---|---|---|---|---|
| Install / bootstrap: |  |  | Unknown |  |
| Build: |  |  | Unknown |  |
| Typecheck: |  |  | Unknown |  |
| Lint / format check: |  |  | Unknown |  |
| Test all: |  |  | Unknown |  |
| Focused test: |  |  | Unknown |  |
| Run / dev server: |  |  | Unknown |  |

## Implementation Patterns By Area

| Area | Pattern | When to reuse | Status | Source |
|---|---|---|---|---|
|  |  |  | Unknown |  |

## Test Patterns By Change Type

| Change type | Preferred evidence | Example target | Status | Source |
|---|---|---|---|---|
| Behavior change: | focused test, integration test, or runtime check tied to acceptance criteria |  | Supported | `skills/test-first-verification/SKILL.md` |
| Bug fix: | reproduction before fix and regression check after fix when feasible |  | Supported | `skills/test-first-verification/SKILL.md` |
| Refactor: | evidence that existing behavior is preserved |  | Supported | `skills/test-first-verification/SKILL.md` |
| Docs / prompt / skill change: | static consistency check plus targeted content review |  | Supported | `skills/test-first-verification/SKILL.md` |

## Architecture Boundaries And Public Contracts

| Boundary / contract | Implementation rule | Stop or escalation condition | Status | Source |
|---|---|---|---|---|
| Public API: |  |  | Unknown |  |
| Module dependency direction: |  |  | Unknown |  |
| Data / persistence boundary: |  |  | Unknown |  |
| External I/O boundary: |  |  | Unknown |  |
| Schema / migration boundary: |  |  | Unknown |  |

## Error Handling / Logging / Observability

| Concern | Convention | Status | Source |
|---|---|---|---|
| Error representation: |  | Unknown |  |
| User-facing errors: |  | Unknown |  |
| Logging: |  | Unknown |  |
| Metrics / traces: |  | Unknown |  |

## State And Data Flow

| Flow | Ownership / lifetime | Status | Source |
|---|---|---|---|
| Client state: |  | Unknown |  |
| Server state: |  | Unknown |  |
| Async jobs / background work: |  | Unknown |  |
| Cache / derived data: |  | Unknown |  |

## Generated / Vendored / Manual-Edit Boundaries

| Path or artifact | Edit policy | Regeneration command | Status | Source |
|---|---|---|---|---|
|  |  |  | Unknown |  |

## Common Implementation Recipes

| Task type | Recipe | Verification | Status | Source |
|---|---|---|---|---|
| Add a small behavior: |  |  | Unknown |  |
| Fix a bug: |  |  | Unknown |  |
| Update a public contract: |  |  | Unknown |  |
| Change generated artifacts: |  |  | Unknown |  |

## Stack Overlay Hooks

| Overlay | Applies when | What it may define | Status | Source |
|---|---|---|---|---|
| Angular overlay: | Angular-specific implementation is required | Angular-specific implementation constraints, testing supplements, provider/DI scope, template/form, Signals/RxJS, router, DOM/security, SSR/hydration, CLI, and migration checks | Supported | `skills/angular-implementation-architecture/SKILL.md` |
| React overlay: | React-specific implementation is required | React-specific component, state, and rendering conventions | Unknown |  |
| Python overlay: | Python-specific implementation is required | Python-specific packaging, testing, and runtime conventions | Unknown |  |
| Java overlay: | Java-specific implementation is required | Java-specific package, build, and testing conventions | Unknown |  |
| Project overlay: | Repository-specific rules exist | Local conventions that extend this context | Unknown |  |

## Stop Conditions

Stop and re-plan or ask for a human decision when:

- a change requires public API, schema, migration, auth, permission, billing, email, telemetry, dependency, production config, or infrastructure changes,
- verification commands are missing, unsafe, or too expensive for the requested scope,
- generated/manual-edit boundaries are unclear,
- stack-specific decisions would need to be encoded in the generic context,
- existing implementation context conflicts with newer repository evidence.

## Update Triggers

Update this context when:

- package/workspace shape changes,
- build, typecheck, lint, test, or focused-test commands change,
- framework/runtime/tooling versions or conventions change,
- architecture boundaries, public contracts, or generated-file policies change,
- new stack overlays are added,
- implementation tasks repeatedly rediscover the same commands, patterns, boundaries, or stop conditions.
