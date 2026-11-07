# Preserve unchanged Full assets across revisions

Formal Verification Contract `full-partial-assets@1`.

Full authoring may revise only one of several selected Skills. Registering every
selected parent as a full_content_revision currently rejects the first unchanged
parent. Keep the Registry's same-content revision guard. Reuse exact unchanged
refs and separate the complete selected environment from the owned delta, as the
component loop already does.

Spec: register only changed file projections; preserve existing media types for
existing files; return environment_assets (reused + new), candidate_assets (new
owned revisions only) and baseline_assets (their replaced parents only). Whole
Full context comparison still runs before no-change admission. Native and Full
practical lifecycle transitions touch only the delta; the next active baseline
keeps all environment refs. Restore uses the immutable pre-activation Registry
snapshot to preserve exact original states. Old retained candidates without the
new complete-ref field retain their fallback behavior; pinned runtimes prevent
mixing worker versions within an existing run.

No changed assets means no Eval or owner operation. The existing no_change
controller path cleans only manifest-owned staging/source/Full materializations,
retains its archive/CAS/evidence and needs no owner target/lifecycle authority.
Original baseline, shared refs, unrelated owner content and failed runs remain
untouched. Unknown partial work is inspected, never replayed.

P-01: a two-Skill fixture with one edit registers one revision, reuses the other
exact ref, preserves helper media metadata and compares the whole environment.
P-02: activation/retirement/restore leave the unchanged ref's state intact;
restore returns changed parents to their exact original current/candidate state.
P-03: next uses all selected refs; old saved output without environment_assets
uses its existing candidate_assets fallback.
P-04: no-op completes without case/model/owner dispatch; owned cleanup refuses
source/archive/layout drift and preserves baseline, Registry, archive and evidence.

Implementation plan: existing Full registration/native stage/continuation and
owned-staging helper, existing native-bindings suite owner, focused regressions,
model-free copied-baseline standard-CLI smoke, independent review and current CI.
No new provider, permission, Registry rule, dependency or human judgment type.
Real model/owner/receiver/Claude acceptance remains separate.

P-05: native preparation creates missing canonical parent directories, refuses
symlink roots/reusing an allocated root, and retains bounded child stdout/stderr,
exit/signal/error and truncation diagnostics on failure without a model launch.
The existing failed-preparation port preserves the consumed failed run and
prepares fresh paths; it never changes that run into a completed cycle.

Implementation Contract:
- Artifact ID: full-partial-assets-implementation@1.
- Upstream refs: Formal full-partial-assets@1; ADR0021; ADR0016.
- Actual change boundary: Full registration, lifecycle/continuation, owned-only
  cleanup, native preparation and private failure evidence; existing suite owners.
- Verification attempted: source-bound focused/compatibility/repository checks,
  Python preparation regressions and a copied-baseline model-free standard smoke;
  exact results and immutable source identity accompany the PR/delivery evidence.
- Evidence references: retained failing registration and preparation records,
  test logs, source proof and independent review supplied with delivery.
- Selected proof: Formal full-partial-assets@1, P-01 through P-05.
- Handoff state: implementation/software verification; no actual model Eval,
  actual owner application or authenticated Claude operation is implied.
