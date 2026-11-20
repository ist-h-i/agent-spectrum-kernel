# Upgrade the document-export archive adapter

The document-export team is moving to the supplied version2 archive library. Its manifest consumer must keep receiving the existing application format on both Windows and POSIX, and the team needs an explicit local version1 fallback if compatibility checks fail.

Migrate `src/archive-compat.mjs` using the public vendor APIs and `docs/migration-contract.md`. Preserve the application API, manifest shape, entry order and duplicates, UTF-8 byte counts, explicit platform path behavior, fresh outputs and unchanged inputs. Verify actual use of the selected library, the version2 default and the preserved version1 rollback path. Add the specified `migration-record.json` with truthful local verification declarations.

Add `migration-record.json`. Preserve vendor modules, settings, compatibility matrix, tests, scripts, docs and package in the supplied initial input. The libraries operate in memory on fictional data; no installation, external write or real migration is requested.

From the workspace, run `npm test`, `npm run rollback` and `npm run validate:migration`. Report their actual outcomes; record/snapshot validation alone does not establish all compatibility behavior.

Both the scheduled export and the interactive download consume the application manifest through `src/scheduled-export.mjs` and `src/download-export.mjs`. Keep their exported functions and the `buildManifest` API usable. You may edit either caller and the adapter in both stages. All contract tests, vendor code, settings and application-facing formats stay fixed.

Retain the initial migration, migration record and command results. In a separate copy the evaluator supplies a new result format for the version2 library while the application manifest and the version1 rollback contract stay the same. Apply the follow-up there and report which dependency forced each edit, which callers needed changes, and which checks ran before and after. Equivalent function-based designs are welcome.
