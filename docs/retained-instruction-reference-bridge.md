# Retained normal-runner reference comparison

This opt-in connection reuses the instruction-environment CLI, Asset Registry,
content-addressed store and exact environment verification. It does not add a
model executor or replace the existing external trial runner. Ordinary capture,
evaluation and owner-apply behavior retains its existing contracts.

The observed need is a prepared, persistent Codex Full comparison whose existing
runner owns timing, isolation, native child decisions and retention. The generic
evaluation executor uses a different runtime contract. Passing the existing
wrapper to that executor would change the experiment. The bridge therefore
captures first and consumes retained evidence afterward.

## Local commands

All commands accept one JSON input file through
`node scripts/instruction-environment-cli.mjs COMMAND INPUT.json`.

1. Use `registry-create` and `register-asset` for actual authored Skill versions.
   They remain candidate Assets. Existing lifecycle authority requirements apply.
2. `retained-layout-capture` accepts `storeRoot`, `sourceRoot`, a sorted complete
   `expectedFiles` array of `{path, bytes, mode, sha256}` and its explicit
   `expectedInventoryDigest`. It checks the entire reviewed tree, rejects
   symlinks and stores bounded individual file objects.
3. Ordinary `capture` additionally accepts `retainedLayoutObjectDigest`.
   Bind registered Skill content to its discovery paths and list every other
   instruction in `supportPaths`. The resulting complete environment must match
   the reviewed layout, including root instructions, canonical Skill mirrors,
   all references, generated prompts and both install-state files. Codex Full
   selected-Skill entries and discovery entries must agree. A null selection
   records an unadmitted authoring snapshot; it is not a Portfolio selection.
4. `retained-prepare` accepts `storeRoot`, the existing `configPath`, its explicit
   `preparationManifestDigest` and `environments:{baseline,challenger}` containing
   the two environment object digests. Before any trial directory is allocated,
   it verifies the existing manifest, dependencies, wrappers, initial instruction
   closure, paired public task bytes and fresh prepared workspaces. It publishes
   a pre-result comparison object. This command grants no launch authorization.
5. After separately authorized execution through the original runner,
   `retained-verify` and `retained-results` accept `storeRoot` and
   `planObjectDigest`. They verify the frozen runtime and instruction bytes,
   correlate root identities, terminal usage/status/retention records, verify
   retained archive hashes and reject overlapping recorded root intervals.

`retained-layout-inspect` exposes the saved layout metadata without instruction
text. The retained layout includes only a closed extension of instruction paths;
it does not permit arbitrary workspace or authentication paths. Generic
evaluation and normal-owner apply explicitly refuse retained snapshots so an
authoring capture cannot silently select another executor or mutate an owner.

## Interpretation and limits

Results distinguish not started, allocated but running/uncertain, terminal with
retention/process uncertainty, failed/interrupted and completed. Cache tokens
are a subset of root input tokens. Observed native children and sampling errors
are retained; an empty observation does not establish zero actual children.
Complete hierarchical usage and formal quality scores remain null. Missing
usage is not replaced with zero. CLI duration uses the original retention
receipt after checking its agreement with terminal timestamps.

This is a reference comparison on observed tasks. It does not manufacture a
holdout, grading admission, independent evidence authority, cost in money,
human effort, mechanism proof or an adoption decision. The report explicitly
returns `not_assessed` for adoption and separately reports whether all execution
records are ready for reference review. It never substitutes a hard-coded
insufficient-evidence recommendation for an Evolution invocation. Existing Evolution
recommendation, six evidence dimensions, human decision and lifecycle gates
remain unchanged. Reference quality judgments must be supplied separately with
their fixed criteria and evidence. A proposed adoption awaits actual results
and user review; reference counts do not become formal scores.

An authoring export and ordinary source-backed installation are usable without
claiming formal Evolution certification. Use the existing `export` command for
an exact fresh snapshot. Its captured install-state files are historical bytes,
not permission to overwrite a live owner's state. For a normal project, install
from the reviewed candidate source with the existing kernel/Codex installers,
which generate current owner state and provide check/rollback. Before treating
that projection as the measured environment, compare all instruction files and
report supporting-context omissions and metadata differences. A normal installer
preview is not a formal `apply` receipt or a new model measurement.

Keep operator source checkouts, CAS and evidence under the existing denied
operator root. Snapshot verification does not prove sandbox isolation. A source
checkout created outside that boundary can expose benchmark/test hints; record
any exposure window and check the actual source path before running models.

The separately frozen opt-in Core Bundle Full generator is not called by
Registry, retained capture or retained evidence consumption. Its baseline
`legacy_full_source_drift` must remain a disclosed product-generation failure;
this connection does not refresh its goldens or assert Core product compatibility.

Verification: `node --experimental-test-module-mocks --test
scripts/test-retained-instruction-bridge.mjs
scripts/test-instruction-environment.mjs scripts/test-environment-evaluation.mjs
scripts/test-environment-target.mjs`. Tests use synthetic files and fixture
authority only; they do not launch Codex or Claude models.

For the two human judgment stops, automatic continuation, rejection cleanup and
resumption, see [Human-supervised instruction improvement](supervised-instruction-loop.md).
Historical retained results remain explicitly imported evidence, not evidence
that the new controller executed earlier trials.
