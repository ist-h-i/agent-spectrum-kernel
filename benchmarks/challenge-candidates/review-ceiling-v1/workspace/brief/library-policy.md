# Dependency and provider contract

The old packages use the pinned pnpm lock and TypeScript/Vitest development toolchain. The new portal uses Node built-ins and browser APIs. Neither a dependency name nor an old version alone establishes a vulnerability; do not invent an advisory. There is no supplied live vulnerability-service result.

For this release, compatibility review includes:
- public DTO fields/statuses and source defaults versus actual callers;
- error, cancellation and lifecycle behavior across provider boundaries;
- whether a provider receipt means accepted or completed;
- GitHub issue-comment and review-comment identities, whose numeric portions are not globally interchangeable;
- local path identity versus presentation labels;
- shared mutable return objects and ownership across consumers;
- translation of optional, unknown and terminal states.

The real provider adapters are source for inspection only. To verify routing, use an in-memory mock fetch and inspect the request. Do not issue real POSTs. To verify filesystem boundaries, create only synthetic files in your own temporary probe directory. Do not read a real sibling project.

Review suggestions about dependency replacement should state what present contract would improve, the compatibility cost, and a concrete test. Speculative upgrades without a supported impact are not a release blocker.
