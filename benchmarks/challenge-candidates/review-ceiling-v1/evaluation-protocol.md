# RC01 evaluation protocol

This is a difficult **review** task. A review's value is not the number of findings, amount of prose or code volume. The candidate must link business/technical consequences to specific evidence and a justified next action. The source package is separate from the existing 24 tasks and CH01–CH06; no score is directly interchangeable without calibration.

## Public dimensions (100 points)

| Dimension | Points | What is assessed |
|---|---:|---|
| Correct causal findings across system boundaries | 40 | Real high-impact defects/debt, trigger, affected consumers, practical consequence |
| UI/UX and interrupted user journeys | 20 | Information/action/state/feedback, accessibility, async and partial failure behavior |
| Evidence, counterexamples and uncertainty | 15 | Code/runtime provenance, known-good behavior, no unsupported claims or false positives |
| Prioritization and viable remediation | 15 | Release blockers versus deferrable work, minimal adequate remedies, compatibility/recovery/ownership |
| Verification and revised decisions | 10 | Useful probes, regressions to add, performance measurement limits and justified reassessment |

Private requirement weights and causal groups are fixed **before** any model run. One root cause is not awarded repeatedly because it covers multiple source-guide concepts. A genuine unseeded issue is independently adjudicated against the public contract; the same policy is applied to every compared answer. Do not reward guessed labels, prescribed class names or an author's preferred refactor.

Each finding needs a cause, evidence, impact and post-fix condition. Code evidence can establish static mechanisms; a browser/runtime claim requires the corresponding observation. Missing evidence is not a fabricated failure. A substantiated defect can be found by different valid probes. Unknown evaluator outcomes remain unknown; report known points and missing weight, never re-normalize to 100.

Release-blocking data exposure/loss, unauthorized external action, or unverifiable approval are reported separately from points. No arbitrary global score cap is imposed. Finding an unsafe condition in the isolated fixture and withdrawing an earlier judgment is good review behavior, not unsafe production execution.

## Input and scorer boundary

Only `workspace/` and the staged public update are reviewer inputs. No authoring ledger, reference reviews, scoring matcher, reproduction oracle, source derivation notes, Git history or previous answers are included. The benchmark author may validate a fixture using private oracles, but that does not make a model answer correct.

Detailed assessor checks are stored outside the repository. Review assessment is evidence-based and may require human/independent semantic adjudication. A deterministic calculator only validates and totals those decisions; it does not infer correctness from keywords or score a finding by its count. The registered staged path preserves this distinction in its adapter/result labels; see `docs/practical-challenge-evaluation.md` from the repository root.

## Reassessment

Preserve `INITIAL.md` before investigation. After `REVIEW.md` is fixed, the runner may disclose a versioned operational update, then preserve `REASSESSMENT.md`. The update is the same for all compared conditions and does not reveal an answer. A staged variant and a one-phase variant are different evaluation conditions; do not silently mix them. The initial problem has enough facts to review on its own.

## Validation before calibration

1. Reproduce each seeded causal flaw and at least one nearby correct control. Separate static architectural evidence from dynamic behavior.
2. Confirm all source-guide atoms map to material/interaction, a correct control, an explicit evidence gap or an authoring-only obligation. Mapping is not evidence of model difficulty.
3. Independently inspect the task and the oracle; allow multiple valid remedies and prioritizations, including bounded deferral.
4. Test assessment controls: complete review, valid alternative review, generic checklist, unsupported alarmist review, partial/missing-evidence review, duplicate findings, and false success claims. A passed calculator test proves only calculator behavior.
5. Run public smoke/interaction checks and the selected legacy tests where dependencies are available. Record failures and missing tools rather than claiming full verification.
6. Check boundary allowlists, hashes, input immutability, licensing, real-secret scans and implementation/test/data LOC separately.

## Measured execution (not authorized by this package)

Human approval of cases/conditions precedes model runs. Fix model/effort, ASK versions, input hashes, runtime/tools, network/provider policy and measurement method. Install dependencies ahead of time equally or provide the same unavailable-dependency state; do not let one condition accidentally perform unbounded external installs.

Measure task elapsed time, setup/grading time and input/output/cache usage separately. Cache is an input subset, not another summand. Include child usage when available, disclose missing usage and interrupted runs. An execution fault is not a quality score of zero. Preserve failed attempts; retry only affected runs where justified, without selecting results for a desired score.

CH01-level difficulty is a design goal, not a verified fact. Two pilot model trials are recorded in [the archived calibration summary](https://github.com/ist-h-i/agent-spectrum-kernel/blob/445eec92545e694becf04278b96da867134c1758/benchmarks/challenge-candidates/review-ceiling-v1/calibration-summary.json); they do not establish comparative difficulty or readiness of the new staged entry point. Scores near a ceiling should trigger inspection of task coverage and grader discrimination, not retrospective harsher grading.

### One-phase score handling

The complete RC01 assessment uses the fixed staged update. If only the first phase is run, the reassessment requirement remains **unknown (5 points)**, the known-points subtotal is reported out of the unchanged 100-point rubric, and the formal total is null. It is not silently awarded, reweighted or compared as a complete staged score.

### Previously unknown findings

A valid additional finding does not create points beyond the frozen 100. If it proves the same causal requirement, assess it there without duplication. If it is a genuinely different issue, record its severity, evidence and release consequence separately; it may support the existing evidence/prioritization dimensions but does not replace an unrelated seeded requirement. If it exposes an invalid or ambiguous task assumption, suspend that affected requirement for **all** conditions and version the rubric before a new comparison, rather than changing weights to favor one answer.
