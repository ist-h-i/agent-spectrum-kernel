# Bind a caller-owned Full authoring entry point

Formal Verification Contract `full-authoring-executable-pin@1`.
Full authoring can use a caller-owned input-only Codex wrapper through its
existing executable port. Add optional provider.executableDigest to bind that
entry point to the trusted local configuration. After the existing model grant
check and before creating a session, require a SHA256 digest and an absolute regular,
non-symlink, stable nonempty executable file within the existing16MiB source
bound. A mismatch refuses without session allocation or dispatch. Existing
profiles without the optional field keep their behavior.

P-01: malformed/missing/changed/nonregular/symlink executable inputs refuse before
session creation and provider dispatch; no grant remains no grant.
P-02: a matching pinned fake provider and the existing unpinned provider complete
the unchanged response protocol. Existing owner/case/runtime source boundaries
are unchanged.

This is source-drift detection, not atomic execution against a malicious local
writer. Pinning a wrapper alone does not pin its delegated executable, external
settings, client context or toolchain. Keep required permission rules inside the
wrapper and validate their effective read scope separately. This option does
not select a provider, grant a model call, add a human judgment, imply anonymous
review or establish authentication.

Implementation Contract:
- Artifact ID: full-authoring-executable-pin-implementation@1.
- Upstream refs: host-reference-scoring@1; private host-input-only setup.
- Actual change boundary: optional existing Full-provider executable guard and
  permanent fake-provider regressions in the current CI suite owner.
- Verification attempted / evidence: source-bound focused, compatibility and
  repository checks accompany delivery; no new real model or owner operation.
- Selected proof: Formal full-authoring-executable-pin@1 above.
- Handoff state: implementation and software verification; real provider
  permission/instruction/auth/closure acceptance remains separate.
