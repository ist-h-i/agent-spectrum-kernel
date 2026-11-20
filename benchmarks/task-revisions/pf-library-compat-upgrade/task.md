# Upgrade the document-export archive integration

Migrate the document-export application to the supplied version2 library. Both application callers must continue receiving the documented manifest on Windows and POSIX. Keep version1 available for explicit local fallback.

Follow `docs/migration-contract.md`. Edit only the archive adapter and its two application callers, and add `migration-record.json`. The vendor modules and application-facing contracts are fixed. Libraries operate on fictional data in memory.

Run `npm test`, `npm run rollback` and `npm run validate:migration`. Report the outcomes and what they establish.

Submit the initial solution first. A separate follow-up will be provided after that submission is frozen.
