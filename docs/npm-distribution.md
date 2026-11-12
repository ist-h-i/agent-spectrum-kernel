# npm distribution

ASK's npm distribution contains the CLI, standard instruction assets and the
shared improvement runtime. It does not run an installer during `npm install`.
The package name `@hiroshi.inoue/agent-spectrum-kernel` and version
`0.1.0-dev.0` are provisional. `private: true` prevents accidental publication;
package naming, license and publication approval are separate release decisions.
The package version is not the `manifest.json` asset version or the historical
`personal-v1.0.0` milestone.

## Install and create a persistent workspace

Before publication, build a local archive from a checkout:

```sh
npm pack
npm install /absolute/path/hiroshi.inoue-agent-spectrum-kernel-0.1.0-dev.0.tgz
npx --no-install ask init --workspace /absolute/path/my-ask
```

The new directory contains:

- `source/`: a pinned copy of the runtime and standard Skills, independent of
  `node_modules` or npm's temporary execution cache;
- `state/`: the home for candidate/evaluation/registry state;
- `.ask-workspace.json`: package identity, filesystem source revision and paths.

Initialization does not require Git or a GitHub account. It refuses to replace
an existing directory and never edits the target application's instructions.
Use separate workspaces for unrelated applications or teams. The generated
configuration contains absolute paths; do not move an active workspace by
renaming the directory. Share individual assets using export/import instead.

## Plan and apply installation

```sh
npx --no-install ask --workspace /absolute/path/my-ask setup plan \
  --target /absolute/path/application --adapter codex --profile daily \
  --output /absolute/path/my-ask/state/setup-plan.json --json
npx --no-install ask --workspace /absolute/path/my-ask setup check \
  --target /absolute/path/application \
  --plan /absolute/path/my-ask/state/setup-plan.json --json
npx --no-install ask --workspace /absolute/path/my-ask setup apply \
  --target /absolute/path/application \
  --plan /absolute/path/my-ask/state/setup-plan.json --json
npx --no-install ask --workspace /absolute/path/my-ask doctor \
  --target /absolute/path/application --json
```

Read the plan before `apply`; the command applies exactly that saved plan. A
stale or changed plan must be rebuilt, not silently accepted. `setup --help`
lists the same options as the existing setup CLI.

## Improvement, sharing and recovery

First prepare the pinned workspace (no provider call or approval is recorded):

```sh
npx --no-install ask --workspace /absolute/path/my-ask loop prepare \
  --spec /absolute/path/improvement-spec.json --run-id first-cycle
```

The specification supplies `skills` (skill IDs), `provider`, `runtime`, `policy`,
`selection`, `practical` (cases, measurement and grading), `assetAuthority` (operator lifecycle authority), and `normal.target`
(the application to receive an approved change). These use the existing Full
practical profile structures described in the loop guide. Preparation derives
filesystem revisions, registry/storage locations and baseline installation; it
returns `profile_path`, `config_path` and the coordinator `root`. Keep these
files for subsequent loop commands. Reusing a run ID is refused: resume its
existing configuration instead. The policy must include `observation.goal`. The operator authority is not a
per-cycle adoption decision; evaluation-case and result-application approvals
remain separate gates. This bootstrap does not choose cases or adopt
changes on behalf of the user.

`ask loop` uses the existing supervised loop commands and approval gates, not a
second npm-specific implementation. Use `--workspace` so that profile runtime
pins point to its persistent source rather than the npm cache. See
[the loop guide](supervised-instruction-loop.md) for case approval, trial,
reporting, adoption/rejection and recovery commands. JSON profiles describe the
model provider, cases, grading and target; installing ASK is not authorization
to run model calls or apply a generated change.

`ask environment COMMAND input.json` exposes the shared environment and registry
commands. `ask assets preview|export|receive|plan|apply input.json` is an alias for
the existing `package-*` commands. npm import planning/application default to
`filesystem_snapshot`; the developer Git route is an explicit `sourceKind` option. [Portability and continuity](instruction-improvement-continuity.md)
describes required inputs, preview approval and conflict handling. Imported
assets remain candidates and do not inherit sender approvals or automatically
replace active assets.

An npm update replaces only the installed CLI/package. It does not update the
workspace source, approved assets or an active cycle. Complete or explicitly
stop a cycle before starting one with a newer runtime. Create a new workspace
and use asset export/import for an explicit version transition. This keeps
rollback and in-progress evaluation pins independent of cache deletion.

## Requirements and limits

Node 24.x and a POSIX environment with `/usr/bin/tar` and `gzip` on PATH are required for Full candidate generation. Git is optional for the separate contributor/fork path.
The configured model CLI, authentication and any case-specific tools (for
example Python, a browser or a database) remain external requirements. The
package does not claim that npm installation makes Claude or Windows fully
verified, nor that every model provider can run offline.

The archive excludes development tests, CI workflows and historical result
archives. The assembly follows runtime imports and static data/script pins;
dynamic families are included explicitly. `dist/npm-runtime-inventory.json`
records the exact files and hashes. Built-in benchmark fixtures, challenge inputs
and scoring contracts are included so the public evaluation commands remain usable.
Approval of the cases and access to any external evaluator are still required.
Developer repository validation belongs to a complete fork/checkout.

## Maintainer checks

```sh
npm run build
npm run test:package
npm pack --dry-run --json
```

Tests must exercise the actual tarball in a separate directory, npm's linked
binary, setup and persistent initialization. Gitless loop, import/export,
interruption, update and rollback coverage is required in addition to packaging
checks before claiming the full distribution is ready. Do not publish based on
`npm pack` success alone.

## A concrete observed-model specification

The included [specification builder](npm-loop-spec-example.mjs) produces a complete
JSON spec with computed SHA-256 input pins. It performs no model calls. It is a
starting point for your own public task, not a new built-in benchmark or evidence
that a skill improved. One task × two conditions is a smoke comparison only.

1. Initialize your workspace as above.
2. In a separate case directory, create `task.md` with the task and expected
   output filenames, and `criterion.mjs` with a deterministic check of those
   outputs. The check must exit **0 for pass, 1 for fail**; other outcomes remain
   unknown. It runs from each trial's working directory. Do not put secrets in
   either file. If the task requires existing source files, add them to the
   builder's `files` inventory before preparing the loop.
3. Create a local `operator-authority.txt` recording who is permitted to manage
   this workspace's asset lifecycle and its scope. Its hash binds the declared
   operator capability. This is **not** approval to evaluate or apply a candidate:
   those decisions remain required at their respective human gates.
4. Run the builder, replacing all paths, the installed CLI version and model ID
   with your actual environment. `CODEX` must be the absolute executable path;
   authentication is configured separately. Use `-` instead of the last target
   argument to retain results without applying to an application.

```sh
node /absolute/ask-workspace/source/docs/npm-loop-spec-example.mjs \
  /absolute/ask-workspace /absolute/public-case /absolute/bin/codex \
  'codex-cli YOUR_INSTALLED_VERSION' YOUR_AVAILABLE_MODEL \
  /absolute/operator-authority.txt /absolute/loop-spec.json \
  /absolute/application

npx --no-install ask --workspace /absolute/ask-workspace loop prepare \
  --spec /absolute/loop-spec.json --run-id first-cycle
```

The builder selects `controlled-implementation`, requests `low` reasoning for
both trials, and allows no extra retries. Candidate generation uses the configured
provider's ordinary CLI reasoning configuration. Change the skill, goal, selected
cases and retry allowance to your approved plan before preparation. The reported
usage retains its measured scope; a missing descendant counter does not become
zero or a claim of complete cost. Review the output paths returned by `prepare`,
then use the standard loop commands in the guide. Preparation does not execute
trials. Do not approve an application change merely because the command exited
successfully; examine the comparison report and the candidate diff first.

This is an observed Codex configuration, not a synthetic fixture. Advancing with
`operate --allow-model-calls` can start model work and consume your provider
allowance or incur charges. Only do so within your approved execution scope.

## Reusing verification evidence

`ask verification` exposes the existing evidence planner and final coverage check
from an installed package. It does not change CI selection or run gates/models on
its own. The ASK package/workspace can remain Gitless; **this optional scoped
verification route requires Git history in the project being verified**, plus its
committed gate inventory, dependency manifests, completion policy and signed
baseline evidence. See [the completion contract](verification-reuse-completion-contract.md).

```sh
ask verification prepare --repository /absolute/project --store /absolute/evidence \
  --target FULL_CURRENT_COMMIT
ask verification coverage --repository /absolute/project --store /absolute/evidence \
  --target FULL_CURRENT_COMMIT
```

`prepare` identifies exact/scoped reuse, affected gates, unknown/missing evidence
and any required delta review. Run only the indicated gates using your trusted
runner and store their newly signed evidence; do not execute commands copied from
an evidence record. An unknown dependency or missing proof requires revalidation.
`coverage` recomputes the plan against the clean current target, refreshes current
obligations twice, then checks inputs again. It exits nonzero when blocked.
Neither command grants approval or performs a merge, release or deployment.

Current-state observations are host capabilities, not portable evidence. If the
policy requires current approval, independent judgment or external state, omission
of a host provider deliberately blocks coverage. An operator can explicitly supply
an audited module and pin its exact bytes:

```sh
ask verification coverage --repository /absolute/project --store /absolute/evidence \
  --target FULL_CURRENT_COMMIT \
  --provider-module /absolute/trusted-host.mjs --provider-sha256 sha256:HEX_DIGEST
```

This flag **executes trusted host code with the operator's privileges and inherited
environment**. It is not a sandbox. Never use a downloaded/evidence-supplied module
without inspecting and authorizing it. ASK never discovers providers from a repo,
transfer, or cached result. The module exports `providers`, a map from policy
provider IDs to async functions. Each function receives the current bound query
and returns exactly `{query, status, actor_id, evidence_digest}`. Status is
`satisfied`, `unsatisfied` or `unavailable`. Read the authoritative system on
**every invocation**, including `confirm`; never echo a cached success. The core
checks authorized/independent actors, query identity and stable observation digest.

Each observation runs the pinned module bytes in a fresh Node process, with a
10-second upper bound (also constrained by the policy's overall deadline) and a
1 MiB response bound. Pin mismatches, missing functions, extra stdout and malformed
responses fail closed. Write diagnostics to stderr, not stdout; diagnostics are
not retained. On POSIX, the owned process group is terminated on completion or
failure; pipes are closed on cancellation. Host providers must clean up detached
children themselves, and on Windows must own cleanup of all child processes.
Module code is loaded from a data URL, so use Node built-ins or
explicit absolute dependencies, not relative imports. The pin covers the module
bytes, not its transitive dependencies; audit the entire trusted host integration.
A fresh process does not make a lying provider trustworthy. Do not use this route
to substitute a developer's assertion for an independent review or human decision.

The installed-package acceptance test checks unchanged inputs, changed inputs,
missing evidence, fresh provider calls and failure handling with real local gate
executions. Its providers are synthetic and do **not** establish production GitHub
approval, live model quality, or token/time savings for a particular application.
Report gate counts and measured elapsed time separately from model tokens; missing
model counters remain unavailable rather than zero. Existing native-model pilot
results retain their documented scope in [reuse measurement](verification-reuse-measurement.md).

### Dispatch the planner's review scope

`prepare` is inspection only. To execute its selected review through a host's
model adapter, use the separate opt-in command:

```sh
ask verification review --repository /absolute/project --store /absolute/evidence \
  --target FULL_CURRENT_COMMIT --allow-review true \
  --provider-module /absolute/trusted-reviewer.mjs --provider-sha256 sha256:HEX_DIGEST
```

The host module exports `providers.review(request)`. ASK computes the paths from
the current planner, expands gate-wide independent judgments to their declared
semantic surfaces, and supplies bounded before/after Git content. The host must
review this request rather than replace it with a manually chosen smaller scope.
Unknown scope blocks dispatch; `not_required` makes no host/model call. HEAD,
worktree, plan and request are checked again after the response. A changed target
or an incomplete/mismatched response cannot become a successful review receipt.

Return `{result, usage}`. `result` includes `request_digest`, `target_revision`,
`reviewed_paths`, `reviewed_obligations`, `judgment_refs`, `findings` (each with
`path`, `obligation_ref`, `severity`) and `decision` (`pass` or `block`). Use all
required request identities. `usage` contains observed `input_tokens`,
`cached_input_tokens`, `output_tokens`; omit unavailable telemetry rather than
inventing zeroes. The recorded receipt excludes raw material/prompts/transcripts.
A reviewer is trusted executable integration code; the same host-code caution as
coverage applies. Review dispatch allows up to five minutes instead of the
current-state observation's ten seconds, and may consume model usage. It still
grants no approval and never merges or releases anything. A valid blocking review
is retained as a reviewed result, but exits nonzero; it is not an infrastructure
failure or a reason to repeat the model call until it passes.

Obligation refs identify requirements; they are not the requirement text itself.
The trusted host must resolve their actual approved specification (or include the
corresponding task contract in its prompt). If a ref cannot be resolved, report
that gap and block; do not infer a passing requirement from a name or fixture.
ASK does not bake public benchmark answers into the production dispatcher.
