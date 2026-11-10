# Review Ceiling V1 — Release review of a multi-team review platform

This **new candidate** is separate from the existing 24 tasks and ceiling CH01–CH06. It is a review task, not a repair contest. A large existing TypeScript system plus a synthetic multi-team portal must be assessed against product constraints, architecture contracts, operational evidence and observed UI behavior.

Status: **construction validated; pending human review; not admitted; model difficulty unmeasured**. A large source tree does not establish difficulty. No score target is enforced by changing grading after a run.

- `workspace/`: answer-free reviewer input; `task.md` is the starting point.
- `evaluation-protocol.md`: public scoring dimensions and evidence semantics.
- `tools/`: input construction/validation; never expose author notes to a measured model.
- Private defect references, reproduction checks, reference reviews and detailed scoring remain outside this repository.

The ReviewOps source is a pinned MIT-licensed snapshot. See `workspace/PROVENANCE.md`; copied legacy code, tests, new authored code and non-code are counted separately. No source from SaihAI or SignalCascade is copied. They are structural references only.

Model inputs must contain only the manifest-listed workspace, without Git metadata, authoring files, original repository/network access, or upstream issue conversations. This authored package is not permission to run a paid/model evaluation or to adopt changes in ASK.

## Construction verification

The frozen input contains 151 files: 19,647 implementation lines and 6,768 test lines, plus 172 stylesheet and 35 markup lines. Text documentation and lockfiles are excluded from those source counts. The implementation itself is below 20,000 lines; implementation plus tests is 26,415 lines. Size is not evidence of difficulty.

Author checks passed: 15 public portal tests (also on separately materialized input), 15 private backend checks, 13 scoring-calculator checks, 9 UI DOM-double checks, core differential checks and scoped core/provider TypeScript checks. The independent reviewer also assessed the rubric and reference/negative review controls. UI checks do not establish full real-browser accessibility coverage. Full legacy Vitest/extension build, whole-repository CI, model calibration and standard runner admission have not been performed.

Build reviewer input with `node tools/materialize.mjs --out /absolute/new/directory` from this directory; start with its `task.md`. This excludes the private author/evaluator materials. Read `evaluation-protocol.md` for scoring and evidence requirements. No model execution occurs during materialization.
