# Synthetic ASK benchmark fixtures

This bundle contains four independent Node.js fixtures:

| Fixture | Class | Difficulty |
|---|---|---|
| `pr-session-refresh-medium-hard` | PR review | medium-hard |
| `pr-export-lease-hard` | PR review | hard |
| `impl-rule-batch-medium-hard` | implementation + verification | medium-hard |
| `impl-transfer-hard` | implementation + verification | hard |

Each fixture separates the agent-visible `task.md` and `workspace/` from evaluator-only material. The evaluator
directory contains the oracle, hidden tests, reference patch, and scoring rubric. No fixture needs network access,
external services, or dependencies beyond Node.js standard modules.
Each condition is scoped for a 15-minute attempt; difficulty comes from contract discovery, cross-file evidence, state boundaries, and scope control rather than repository size.

## Running

Visible tests:

```sh
cd <fixture>/workspace
npm test
```

Hidden evaluator against a candidate workspace:

```sh
node <fixture>/evaluator/hidden-tests.mjs <candidate-workspace>
```

Validate a reference solution on a disposable copy, using absolute paths for `<bundle>`:

```sh
cp -R <bundle>/<fixture>/workspace /tmp/candidate
cd /tmp/candidate
git apply <bundle>/<fixture>/evaluator/reference.patch
npm test
node <bundle>/<fixture>/evaluator/hidden-tests.mjs /tmp/candidate
```

For PR-review fixtures, the initial workspace intentionally contains the proposed defects: visible tests pass,
hidden tests demonstrate the contract violations, and the reference patch repairs them. For implementation
fixtures, the initial workspace has an incomplete public API: visible tests are expected to fail until implemented.

To give Plain, Kernel-only, and Full ASK identical conditions, expose only `task.md` plus a byte-identical copy of
`workspace/`. Keep `evaluator/` outside the agent mount and invoke it afterward against the submitted workspace.

## Input identity

`input-manifest.json` records SHA-256 and byte length for every agent-visible `task.md` and `workspace/**` file. Run `node verify-inputs.mjs` before each benchmark arm to verify byte-identical inputs.
