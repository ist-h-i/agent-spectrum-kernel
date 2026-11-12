# Gitless npm distribution verification

## Verification Contract

- Artifact ID: `ask.npm-gitless.verification.v1`
- Artifact type: verification
- Upstream refs: npm distribution request; base main `1a6f5dff15db47fccd4fe20aef8193f0febe1af7`; `docs/npm-distribution.md`
- Policy: `ask.verification-proof-policy@1.0.0`, formal verification contract. Public CLI, persistent source identity, asset lifecycle, and cross-module behavior require the formal path.
- Behavior to prove:
  - NPM-01: A packed package installs and runs without a Git checkout. Installation has no project mutation or model-call side effect.
  - NPM-02: Initialized workspaces retain runtime and versioned source independently of the package cache.
  - NPM-03: Filesystem sources bind exact content; drift and unsafe paths fail before candidate execution or owner mutation.
  - NPM-04: Shared generation, evaluation, human case/adoption gates, application, cleanup and next-cycle paths work with filesystem versions.
  - NPM-05: Asset export/import preserves data but does not import approval or activate automatically.
  - NPM-06: Existing Git source behavior and setup/apply boundaries remain compatible.
- Focused checks: package tarball smoke tests; filesystem candidate/source tests; source binding tests; asset package tests; setup/apply integration; complete supervised lifecycle fixture.
- Required evidence: observed command results for the final source; package inventory and compressed size; independent review.
- Insufficient-evidence conditions: missing runtime files, real model dependency substituted without disclosure, absent adoption gate, stale source marker, unexplained regression, or incomplete packed lifecycle check.
- Evidence required before completion claim: all NPM obligations checked, or explicitly reported as remaining work. npm publication is outside this implementation verification and requires release metadata/authorization.
- Negative cases: source drift, symlink/traversal, existing destination, imported approval, unauthorised apply, missing runtime dependencies.
- Runtime checks: use deterministic provider/check fixtures to prove mechanics, not model quality. No model-quality improvement is claimed.

## Evidence

The checks below cover the implementation. No public npm release has been performed.

### Observed implementation checks (2026-11-12)

- NPM-E01 → NPM-03/NPM-05: `node --test scripts/test-ask-package-loop-prepare.mjs scripts/test-instruction-source-snapshot.mjs scripts/test-instruction-loop-source-binding.mjs scripts/test-instruction-asset-package.mjs`: 24 passed, 0 failed.
- NPM-E02 → NPM-03/NPM-06: `node --test scripts/test-instruction-loop-reference-preparation.mjs scripts/test-instruction-loop-reference-evidence.mjs`: 40 passed, 1 case-insensitive-filesystem check skipped on Linux, 0 failed. Filesystem retained-reference copies do not inherit approvals. The pre-existing reference bridge remains result-only or Git-source-publication, not arbitrary owner adoption.
- NPM-E03 → NPM-01/NPM-02: `node --test scripts/test-npm-package.mjs`: actual local tarball installed through npm; CLI link, no-Git initialization, setup/apply and filesystem identity succeeded. Removing the npm install/cache did not remove the persistent runtime. Approximately 5.8 MB compressed and 32.5 MB unpacked, including public benchmark inputs.
- NPM-E04 → NPM-06: `node --test scripts/test-ask-setup-apply-integration.mjs` against an immutable source copy: 13 actual installer scenarios passed (kernel, Codex and Claude; no skip). Live-worktree test attempts were invalidated by concurrent source edits and were not counted as compatibility evidence.
- NPM-E05 → NPM-03/NPM-06: independent reviewer exercised actual ASK filesystem candidate generation through kernel/Codex installers and ran focused tests (20 passed) plus packed installation (1 passed). Review findings about missing generator goal, historical reference Git assumption, and runtime dependencies were corrected.

No public npm publication or real-model performance run is represented by these checks. The persistent-runtime lifecycle check below covers the standard loop mechanics.

- NPM-E06 → NPM-04: `node --test scripts/test-package-full-loop.mjs`: 1 passed. Bootstrap, controller, runtime, workers and continuation were loaded from the persistent packaged source; runtime pins were asserted to remain inside it. With Git unavailable, the run reached both human gates, evaluated synthetic cases, applied through the actual setup installer, activated versioned assets, cleaned staging, and prepared the next baseline. No real model efficacy is claimed.
- NPM-E07 → NPM-06: complete `test-ask-setup.mjs` and `test-ask-setup-apply-integration.mjs` on the immutable source copy both passed (including input/privacy/safety/doctor and actual installers).
- NPM-E08 → NPM-06: `node scripts/update-adapter-runtime-fixtures.mjs` refreshed checked projection fingerprints; `node scripts/validate-repo.mjs --write-report` passed. The validator's historical preregistration check required fetching its exact existing source commit into the shallow clone; no historical test semantics were changed.
- NPM-E09 → NPM-01/NPM-02/NPM-03/NPM-04: final `npm run test:package` passed all 8 tests serially, including actual tarball and package-only Full lifecycle, after the configuration example and provider-session fixes. The CLI remains private/unpublished.
- NPM-E10 → NPM-04: final fresh-build package lifecycle also prepared a Codex provider profile, checked its derived persistent session root and generation contract, and confirmed that preparation neither created the session nor dispatched a model. Full lifecycle test passed (52.4 seconds).
