# Registered staged challenge evaluation

RC01 is registered in `benchmarks/practical-challenges.json`, separately from
primary24. Its 151-file public input inventory and existing task bytes are
unchanged. The registration pins the fixed reassessment update and the external
semantic evaluator's three files. It does not admit RC01 into primary24 or
change the primary selection, scoring, weights or runner.

## Standard entry point

Use `scripts/practical-evaluation-cli.mjs`. Existing `advance` and `status`
commands are unchanged. The new commands manage one registered staged run:

```sh
node scripts/practical-evaluation-cli.mjs challenge-list
node scripts/practical-evaluation-cli.mjs challenge-prepare --config /absolute/config.json
node scripts/practical-evaluation-cli.mjs challenge-status --root /absolute/new-run
# Only after direct approval of the inspected exact configuration:
node scripts/practical-evaluation-cli.mjs challenge-start --root /absolute/new-run --confirm sha256:MANIFEST_DIGEST --allow-model-calls
# Inspect the first-stage result, then explicitly approve the same-session continuation:
node scripts/practical-evaluation-cli.mjs challenge-resume --root /absolute/new-run --confirm sha256:MANIFEST_DIGEST --allow-model-calls
node scripts/practical-evaluation-cli.mjs challenge-score-handoff --root /absolute/new-run --evaluator-root /absolute/private-evaluator
```

Preparation is model-free. A minimal configuration is:

```json
{
  "id": "rc01-shared-review-platform",
  "root": "/absolute/new-run",
  "options": {
    "executable": "/absolute/canonical/codex",
    "model": "gpt-6.1-sol",
    "reasoning": "low",
    "task_file": "task.md",
    "timeout_ms": 5400000
  },
  "toolchainRoots": ["/usr", "/System", "/Library", "/bin", "/sbin", "/absolute/node-toolchain"],
  "instructionsRoot": "/absolute/instruction-only-overlay",
  "evaluatorRoot": "/absolute/private-evaluator",
  "sessionRoots": ["/absolute/codex-home/sessions/YYYY/MM/DD"]
}
```

All paths must be canonical on the current machine. The run must be fresh and
outside this checkout. An instruction overlay is optional; it may contain only
`AGENTS.md`, `.agents/**`, the two installer state records, and files declared
with matching hashes by those canonical installer state records. This includes
Full root `skills/**`, `.codex/prompts/**`, docs, schemas and runtime scripts;
undeclared repository files are rejected. Prepare its chosen ASK
version outside the run, then keep the overlay identical across compared runs.
Do not supply the whole ASK repository, authoring folder, historical answers or
private grader as an overlay. The overlay is inventoried and protected just like
public task files. An absent overlay is a different experimental condition, not
an implicit Full installation. Dependency installation is not performed by the
runner; provision the same dependency/tool state in each workspace before start,
without changing the frozen files. In-workspace dependency symlinks are allowed;
links escaping the workspace are not. All additional initial-stage files are
frozen before reassessment. Each inventoried file is bounded to 16 MiB.

The staged execution port reuses `executeCodexPracticalAdapter`,
`executeCodexSession`, `parseUserCodexTelemetry` and standard provider receipts.
It ignores user configuration, disables host skill discovery and external app,
browser, computer, hook and memory integrations, denies host filesystem access
except explicit toolchain roots, and enables network as in the calibration
launch policy so localhost services remain usable. External network services
remain prohibited by the task contract; this is not a claim of enforced
localhost-only network isolation. Missing UI/dependency evidence remains missing.
Pin the same instruction/tool environment for each compared condition; do not
claim exact pilot equivalence merely from these launch defaults.
The standard multi-condition `advance` queue is not changed or bypassed; this
explicit staged path does not automatically enter it.

## Resume and uncertainty

A stage directory is a no-replace dispatch reservation. An interrupted,
failed or uncertain stage is consumed, not automatically retried. Inspect its
standard receipt and logs; use a new run for an explicitly approved retry.
`resume` means the fixed second task turn, never recovery/replay of a failed turn.
It requires a completed first turn, unchanged original inputs and initial
answers, and an observed session ID. Only then is `OPERATIONAL-UPDATE.md`
materialized in the solver workspace. Reassessment must retain all prior files
and add only `REASSESSMENT.md`. The update file lives outside the initial public
workspace and is not copied during preparation.

Exit zero alone does not prove task completion. A successful transport,
`turn.completed`, required nonempty answers and unchanged protected files are
required. This is execution evidence, not a semantic quality judgment. The
requirement to write INITIAL before investigating is not mechanically proven by
its final presence; the assessor must inspect the transcript.

Root input/output/cached counters and stage duration remain in the standard
provider receipt. With host-only `sessionRoots`, each stage additionally records
a cumulative `usage-hierarchy.json`: recursively linked `parent_thread_id`
sessions, own-thread token events only, deduplicated by thread/turn/response.
The latest snapshot includes initial and resume turns; never sum stage snapshots.
Different child models/efforts remain observable and are not prohibited.
Cached tokens are an input subset. Missing files, malformed/contradictory events
and missing session usage remain visible. The aggregate is known observed usage,
not a certified complete total or billing statement; complete total stays null,
with the standard root-turn lower bound retained separately. Setup time and
grading overhead are not silently included in task duration. Synthetic injected-session tests are explicitly
labeled `synthetic` and cannot be used as observed trials.

## Private semantic scoring handoff

The private bundle contains exactly the registered bytes of `rubric.json`,
`score.mjs` and `README.md`. It is external to both checkout and run. The public
registry contains hashes and relative names, never answer keys or private paths.
Preparation can omit this bundle; scoring remains blocked until the exact
external bundle is supplied. Neither its bytes nor its paths are passed to the
solver. `score-handoff.json` is a host-side packet, not a solver input or a
published result. It binds the actual answers, provider receipts, manifest and
private bundle. This command never starts a grader model or executes the private
calculator.

An independent semantic assessor must examine the pinned rubric, public source,
answers, saved probes and transcript, recording evidence and rationale for each
requirement. The pinned external calculator validates/totals those decisions.
It does not establish semantic truth. Unknown requirements keep their missing
weight and a null complete total; they are not zero or reweighted. Release
blockers remain separate from numerical quality. Do not publish the private
packet or its referenced assets with the public problem.

The existing reporting-policy-v3 grader remains unchanged: its supported three
binary 10-point review contracts cannot substitute for RC01's 100-point partial
semantic rubric. No keyword matcher, new rubric or second scoring model is
introduced here. Calibration details are in the source package's
`calibration-summary.json` and `calibration-report.md`.

## Verification contract

- Artifact: RC01-REGISTER-1; upstream: unchanged `review-ceiling-v1` input manifest.
- Proof path: Formal Verification Contract under `ask.verification-proof-policy@1.0.0`;
  public/cross-module contract and staged lifecycle behavior require formal proof.
- Obligations: unchanged primary24; no model call during preparation; exact
  approval gates; source and answer freeze; same-session second turn;
  no automatic replay; semantic-only scoring handoff; legacy adapter compatibility.
- Checks: `node --test scripts/test-challenge-evaluation.mjs scripts/test-practical-codex-adapter.mjs`.
- Local evidence: 13 challenge tests and 42 existing adapter tests passed with
  synthetic sessions only. Exact external three-file binding and handoff were
  also exercised locally with injected sessions, zero actual model calls.
- Remaining evidence: real Codex CLI option/sandbox behavior and actual staged
  model execution have not been validated through this new entry point. Registry
  availability and synthetic checks do not establish measurement readiness.
