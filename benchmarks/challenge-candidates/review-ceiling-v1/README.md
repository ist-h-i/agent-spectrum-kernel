# Review Ceiling V1 — Release review of a multi-team review platform

ASK-031 asks for a release review of an existing TypeScript system and a multi-team portal. The reviewer uses product constraints, architecture contracts, operational evidence and observed UI behavior to decide what each team can release.

One observed `gpt-6.2-astra` / `max` run completed both stages of `review-public-v3`. The public evaluation protocol records the conditions at registration. The study records the result under those conditions. [November 21 study](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/benchmarks/results/release-review-astra-2026-11-21.md)

The revised `review-public-v4` study records the refreshed two-stage review with the added pilot-desk evidence. [Revised edition results](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/benchmarks/results/revised-thirteen-astra-2026-11-21.md)

- `workspace/`: answer-free reviewer input; `task.md` is the starting point.
- `evaluation-protocol.md`: public scoring dimensions and evidence semantics.
- `tools/`: input construction/validation; never expose author notes to a measured model.
- Private defect references, reproduction checks, reference reviews and detailed scoring remain outside this repository.

The ReviewOps source is a pinned MIT-licensed snapshot. See `workspace/PROVENANCE.md`; copied legacy code, tests, new authored code and non-code are counted separately. No source from SaihAI or SignalCascade is copied. They are structural references only.

Model inputs must contain only the manifest-listed workspace, without Git metadata, authoring files, original repository/network access, or upstream issue conversations. This authored package is not permission to run a paid/model evaluation or to adopt changes in ASK.

## Construction verification

The previous review-public-v3 input contained 151 files: 19,647 implementation lines and 6,768 test lines, plus 172 stylesheet and 35 markup lines. Text documentation and lockfiles are excluded from those source counts. The implementation itself is below 20,000 lines; implementation plus tests is 26,415 lines. Size is not evidence of difficulty.

Construction checks covered 15 public portal tests (also on separately materialized input), 15 private backend checks, 13 scoring-calculator checks, 9 UI DOM-double checks, core differential checks and scoped core/provider TypeScript checks. The independent reviewer assessed the rubric and reference/negative review controls. Broader browser accessibility, the full legacy Vitest/extension build, whole-repository CI for the fixture and standard runner admission remain outside that evidence.

Prepare the reviewer input from the repository root with `node scripts/practical-evaluation-cli.mjs task-prepare --id rc01-shared-review-platform --root /absolute/new/run`. The preparation record gives the path to `task.md`. Scoring and evidence requirements are in `evaluation-protocol.md`.

## Registered staged execution

Select the task by its stable ID, `ASK-031`. The operator freezes the first submission before sharing the reassessment update with the same solver session. [Evaluation task catalog](../../../docs/evaluation-task-catalog.md) · [Staged evaluation guide](../../../docs/practical-challenge-evaluation.md)
