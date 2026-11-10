# Shared release architecture notes

## Existing system

The existing extension invokes local core operations and provider adapters. Core artifacts and review/fix states are consumed by the extension UI, prompt rendering, cycle history, field reports and next-action generation. Public API types and old artifact shape live in `packages/core/src/types.ts`; inspect their producers and consumers rather than inferring meaning from a single renderer.

Existing data flows include:
- raw review response → normalization → findings/action plan → fix verification → explanation/next actions;
- review comments → disposition/priority → action plan → provider reply draft;
- flow run → artifact store → cycle history → artifact browser;
- workspace-relative locators → filesystem store → readers/writers.

## Proposed portal

The new `packages/portal` exposes a browser UI and a local synthetic HTTP API. Teams have independent review and artifact namespaces. A queue publishes summaries through a local provider substitute. Conversion links the shared summaries to legacy core semantics; old consumers are still contractual clients, not implementations the reviewer is free to change.

The local adapter is an intentionally small operational model. It supports observable concurrency/interruption/cache boundaries without live cloud infrastructure. Do not claim database durability, deployed authentication, production throughput or genuine cloud failure recovery from this model alone. Identify the contract needed in a real implementation.

The old direct GitHub and filesystem adapters remain in source for compatibility review, but are not configured with live credentials or user paths. The supplied provider is the only permitted effect target in this task. A reviewer may instrument or substitute synthetic provider behavior in a temporary probe.

## Ownership and boundaries

- Domain/core owns artifact meaning, finding disposition and verification status.
- Portal application owns team-scoped use cases and their lifecycle.
- Transport/UI represent these states; they do not create approval by presentation or defaulting.
- Provider acceptance and provider completion may be distinct. Read the provided provider interface and behavior before treating a response as success.
- An event or summary is a derived record; identify its source of truth and recovery source before using it to authorize another action.

These are required responsibilities, not a prescribed class hierarchy. A small implementation is acceptable if it enforces the same boundary and can be verified. A separate repository/service/abstraction is not inherently an improvement.
