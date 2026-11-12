# npm 1.0.0 release preparation

Approved metadata: `@hiroshi.inoue/agent-spectrum-kernel@1.0.0`, MIT.
This document records preparation, not publication or registry availability.

## Distribution and rights review

- Root `LICENSE` identifies Hiroshi Inoue as copyright holder; npm includes it
  both at package root and in the persistent runtime source.
- The ReviewOps-derived synthetic review fixture retains its MIT license and
  provenance, including source commit `589f9b5a46e7d9eeebc2950fcc9e1ea55331d57e`.
  External model CLIs and fixture npm dependencies are not bundled dependencies
  of ASK and retain their own terms when separately installed.
- The runtime inventory was inspected for license/notice files, vendor assets,
  credential-shaped strings, real email/home paths and private conversation IDs.
  One unnecessary private conversation identifier was replaced by its public
  issue reference. This inspection is not a legal guarantee of third-party rights.
- Historical review-ceiling model calibration reports are excluded from npm;
  documentation points to their immutable GitHub versions. Required synthetic
  fixture lineage/evidence remains included, rather than deleting inputs used by
  evaluation tooling. No Git metadata, node_modules, CI or test scripts at the
  repository script root are packaged.

## Publication boundary

`publishConfig` targets the public npm registry. There is no automatic publishing
workflow or install-time side effect. Removing `private: true` makes publication
possible but does not perform it. Do not run `npm publish` until the user authorizes
publication. Registry account/scope access, the final tarball, publishing with
provenance where supported, and a clean registry installation must be checked at
that time. No registry token is included or stored by these changes.

The supported Full path still requires Node.js 24 and POSIX tar/gzip. Windows and
an authenticated Claude Full-cycle run are not newly claimed by this release.

## Verified preparation results (2026-11-12)

- `npm run test:package`: 8/8 passed on the final distribution changes. This
  builds an actual tarball, installs it, checks 1.0.0/MIT and licenses, exercises
  Gitless setup and completes the packaged synthetic Full lifecycle with human
  gates. No real model-quality claim is made.
- `node scripts/validate-repo.mjs`: passed.
- Final archive: 2,685 files, 5,814,646 bytes compressed, 32,507,754 bytes unpacked.
  Runtime inventory: 2,680 source files, 31,912,622 bytes. Private conversation
  IDs and the two excluded calibration files are absent from that inventory.
- Independent read-only rights/distribution review completed; no contradictory
  license or credential finding remained after the documented corrections.
