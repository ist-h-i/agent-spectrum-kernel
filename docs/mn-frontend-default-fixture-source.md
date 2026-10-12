# Frontend default-state fixture source preparation

This slice adds the public task and workspace for the frozen `mn-frontend-default-fix` catalog entry from #205/#207. The ordinary request, state specification, implementation and tests form the existing `implementation_and_tests` / `single_file_spec` topology. No task wording refers to scoring or ASK-specific practices.

The workspace is intentionally a bug-fix seed. Its `npm test` command currently fails on the reported first-load regression and on invalid saved-state normalization; unrelated update/reset routes pass. A passing author-side source preparation check confirms that these failures are present and the public input/command digests close. It does not establish the correctness of a submitted solution.

Input and command manifests reuse the existing fixture contracts. Remaining controller artifacts retain `generation_pending` markers. This source slice has no private evaluator, source-bound evaluator freeze, admission decision or execution config. It is not scoring-ready and must not enter comparison execution. No authority from PR341 is reused; the branch starts at the separately pinned main revision.

Remaining work requires a separately versioned private evaluator with documented scoring rationale, equivalence and false-positive boundaries, normal/bad candidates and evidence-removal mutations, then source/archive closure and independent admission. No blocked review was retried through this slice. This Draft source preparation does not close #207 or claim that the task is complete.
