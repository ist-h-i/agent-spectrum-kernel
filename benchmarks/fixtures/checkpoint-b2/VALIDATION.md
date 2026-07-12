# Validation record

Validation profile executed against the packaged files:

| Fixture | Initial visible | Initial hidden | Reference visible | Reference hidden |
|---|---:|---:|---:|---:|
| `pr-session-refresh-medium-hard` | pass | fail as designed | pass | pass |
| `pr-export-lease-hard` | pass | fail as designed | pass | pass |
| `impl-rule-batch-medium-hard` | fail as designed | fail as designed | pass | pass |
| `impl-transfer-hard` | fail as designed | fail as designed | pass | pass |

Additional checks:

- every reference patch applies cleanly with `git apply` to a fresh copy of its workspace;
- all JSON files parse;
- PR oracle file/line ranges resolve inside the packaged post-change tree;
- implementation reference patches touch five implementation files and add focused tests;
- package manifests contain no dependencies;
- fixture code uses Node.js standard modules only and performs no network access;
- `node verify-inputs.mjs` validates the byte identity of all agent-visible task/workspace inputs.
