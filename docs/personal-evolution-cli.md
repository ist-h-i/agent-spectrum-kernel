# Personal evolution command

Implementation Contract: `personal-evolution-cli-implementation-v1` (implementation).
Revision: 2. Upstream artifact ref: `personal-evolution-cli-spec-v1@2`.
Upstream: #385, #379; base `189ca2a4f47db9c0f3ab63677afa58a7a0e90622`.
Change boundary: a CLI composing the existing generation, Prompt pair, saved-result
and human-decision APIs; no new runner, scoring, installation or authority model.

Spec: `personal-evolution-cli-spec-v1` (spec).
Revision: 2.

- PECLI-1: configure existing Asset/Portfolio/evaluation references once. A user
  then supplies a public problem summary and the configured target to `start`.
- PECLI-2: generated content needs explicit source approval. Reading results
  grants no evaluation or decision trust. Confirmation and decision are separate
  commands; missing authority is a saved, reasoned needs-action outcome.
- PECLI-3: resume reads completed generation/comparison records and advances from
  them without repeating either dispatch. Consumed incomplete work is preserved.
- PECLI-4: approved hold can close with the existing no-op receipt and an unstarted
  next request. Candidate rejection/adoption and physical installation are never
  silently reported as applied. Missing dimensions remain Unknown.
- PECLI-5: explicitly fix the existing scoring-version selector before generation.
  Missing, invalid or drifted selectors cannot fall back to checkout grading refs;
  both comparison roles retain its exact selector and selected public bindings.

Verification Contract: `personal-evolution-cli-verification-v1` (verification),
revision 2; upstream artifact ref: `personal-evolution-cli-spec-v1@2`,
selected `formal_verification_contract` under
`ask.verification-proof-policy@1.0.0` because the CLI crosses persisted lifecycle
and cross-module boundaries and feeds a PR handoff (canonical triggers
`state_concurrency_persistence_lifecycle_or_cross_module`,
`multi_session_multi_agent_or_handoff`, `merge_release_or_stable_trace`).
Focused obligation: PECLI-1–5
through an artificial public input, fake provider, runner and original grading
interface, including repeated resume and missing/declined review. Command:
`node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs`.
Existing driver/primary-loop tests and repository CI supply regression evidence.
Actual provider, model quality, Mac application and all-Skill support remain
Unknown; synthetic success does not prove them. Evidence and final handoff are
recorded in the PR.

## One-time management input

`configure --config /absolute/existing-resources.json --profile /absolute/profile`
snapshots local management input. It reads existing resources and starts no model.
The JSON contains the existing API inputs: `storeRoot`, generation `blueprint`,
`generationActor`, `trust` (the three existing Asset/Portfolio/high-impact trust
arrays), `portfolioAuthority`, `selectorContext`, `experimentTemplateObjectDigest`,
`evaluationAuthority`, `generation` (`executable`, `timeoutMs`), and `evaluation`
(`publicInputRoot`, `cliBin`, `cliVersion`, `model`, `reasoning`, `evidenceKind`,
`scoringVersion` with the existing fixed manifest `path` and raw `digest`,
`gradingResources` with distinct `baseline` and `challenger` path/digest refs).
The blueprint selects only existing primary fixtures (normally all nine); the
unrelated eight-task profile is not included. Evaluation resources remain local.
The template retains its predeclared recommendation and action policy.
The scoring selector is required and checked through the existing scoring-version
verifier, including pinned resource bytes, before a profile is saved. Both roles
use that version's evaluator/freeze references. This selects an existing version;
it does not revise scoring or admission. Older profiles lacking the selector need
a fresh explicit configuration before new execution; saved completed results
continue to use their original records.
Each cycle uses a fresh grading output root; the fixed resource template's
fixture references are unchanged. Cycle directories must be fresh and outside
the ASK source checkout, CAS and fixed grading resources. The profile pins this
source revision; a source upgrade requires a fresh management profile before
new execution. Saved completed work is inspected through its existing records.

## User procedure

Run each operation with `node scripts/ask-personal-evolution-cli.mjs`:

```sh
start --profile /absolute/profile --cycle /absolute/cycle-1 --target TARGET --problem /absolute/public-problem.txt
status --cycle /absolute/cycle-1
review-source --cycle /absolute/cycle-1
review-source --cycle /absolute/cycle-1 --approve --reason 'Reviewed these exact files and inherited scope/effects for this evaluation.'
result --cycle /absolute/cycle-1
confirm-evaluation --cycle /absolute/cycle-1 --confirm --reason 'Reviewed the saved comparison and its missing evidence.'
decide --cycle /absolute/cycle-1 --approve --reason 'Accept the proposed hold; effectiveness remains unproven.'
```

`TARGET` is the configured Prompt stable ID. The problem file is a bounded,
user-reviewed public summary of the actual problem; do not include credentials,
private answers or raw development history. `start` authorizes one generation
and one fixed comparison under the profile, with the explicit source-review
pause. It will invoke the real configured provider/runner when run normally:
the development tests replace dispatch only inside their isolated test process.
Actual execution requires the user's direct authorization to Codex; this change
does not launch it during development.

Use `start --cycle /absolute/cycle-1` to resume. Review approval resumes the same
authorized cycle through evaluation; it does not approve model effectiveness.
Both review operations without their affirmative flag are read-only. `decide
--decline --reason '...'` records a declined proposal. Each result includes its
reason, existing artifact refs and the next command. The local `readout.json` is
a replaceable presentation cache, never authority; status is rebuilt from the
existing records and immutable command inputs.

Source approval attests only that the exact generated content was reviewed for
the inherited applicability, permissions/effects, source safety and freshness
for this comparison, without new high-impact behavior. A distinct
immutable reviewed version keeps the generated content unchanged and retains
unevaluated quality, unknown ownership/license and the exact original parent.
High-impact changes require their existing separate path.

After a completed no-op, `next --cycle /absolute/cycle-1 --output /absolute/cycle-2
--problem /absolute/next-public-problem.txt` prepares a fresh unstarted request
referencing the prior receipt. `start --cycle /absolute/cycle-2` starts it when
separately authorized. A consumed invocation with no complete saved result is
needs-action, never an instruction to rerun old work. Partial child reports and
grading artifacts stay in their original output directories.

An abrupt process/host termination can leave the empty `.command-lock` directory.
The CLI stops further mutations with `command_in_progress_or_interrupted`.
First confirm the original generation/comparison processes have terminated and
inspect `status` plus the original invocation records. Only then remove that
empty lock with `rmdir /absolute/cycle/.command-lock` and resume the same cycle.
Consumed incomplete work still remains needs-action; removing a lock grants no
retry or new authority. The tested lost-return case runs `finally` and removes
the lock; it does not prove automatic recovery from every kind of interruption.

Mutating adoption/rejection remains an explicit pending lifecycle action after
the human decision; this CLI does not apply it to a Portfolio or to the Mac.
A positive recommendation needing a separately fixed lifecycle plan is reported
as needs-action, not converted to a hold or auto-approved.
