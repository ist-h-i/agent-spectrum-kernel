# Checkpoint B2 Difficulty-Expanded Benchmark Report

Run date: 2026-07-12 JST
Protocol commit: `57866e2ad42d7c1db91488528b0879a87776d4e0`
Protocol SHA-256: `2d2a346fa2866588de84cf9fd73b828eeb273f68a392733f97cc68584e286f1b`
Configuration SHA-256: `91c4572210f18fe805b8992cd5dabed91c70af9ec490053fab4766d1bdcd9fd5`
Runtime: Codex CLI `0.144.1`, `gpt-5.6-sol`, reasoning effort `high`

## Bounded conclusion

The difficulty-expanded fixtures remove the original all-perfect ceiling for one workflow, but they do not show incremental value from Full ASK over Kernel-only.

- Kernel-only improved the hard transfer implementation from Plain Agent's 10/13 requirements (76.9%) to 13/13 (100%). This is positive evidence for Kernel value on that fixture.
- Full ASK did not improve over Kernel-only on any of the four fixtures.
- Full ASK added 113.0% to 131.9% token overhead on every fixture.
- On the hard review fixture, the frozen automated score was worse for Full ASK. A post-run manual audit corrected one matcher undercount but still found no quality gain and one additional speculative major finding, so the guardrail failure and decision are unchanged.

This supports `retain` for the Kernel as a candidate default and `simplify` for the current full projection. It does not establish universal ASK value or prove that the Kernel caused the hard-transfer improvement; one repetition requires replication.

## Frozen automated results

| Fixture | Difficulty | Metric | Plain | Kernel-only | Full ASK | Full vs Kernel duration | Full vs Kernel tokens | Frozen decision |
|---|---|---|---:|---:|---:|---:|---:|---|
| Session refresh review | medium-hard | valid major findings | 3/4 | 3/4 | 3/4 | -0.3% | +126.1% | `simplify` |
| Export lease review | hard | valid major findings | 5/5 | 5/5 | 4/5 | +30.4% | +113.0% | `stop` |
| Atomic rule batch | medium-hard | requirements satisfied | 11/11 | 11/11 | 11/11 | +25.3% | +122.3% | `simplify` |
| Concurrent transfer | hard | requirements satisfied | 10/13 | 13/13 | 13/13 | +40.8% | +131.9% | `simplify` |

All conditions completed. No implementation condition had a scope deviation. Full ASK and Kernel-only had no unsupported completion claim. Plain Agent claimed completion on the hard transfer despite one hidden-test failure, producing one unsupported completion claim.

## Kernel-only vs Plain Agent

| Fixture | Quality change | Duration overhead | Token overhead | Evidence status |
|---|---:|---:|---:|---|
| Session refresh review | 0 findings | +22.1% | +56.5% | no measured quality value |
| Export lease review | 0 findings | +16.8% | +14.2% | no measured quality value |
| Atomic rule batch | 0 requirements | +30.9% | +55.3% | no measured quality value |
| Concurrent transfer | +3/13 requirements | +23.9% | +45.4% | supported value for this single run |

The hard-transfer difference is the first discriminative result in the benchmark suite. The three failed Plain requirements share the normal-transfer receipt/history test, while Kernel-only and Full ASK pass all nine hidden tests and all thirteen mapped requirements.

## Full ASK vs Kernel-only

| Fixture | Quality gain | Automated correction-unit delta | Duration overhead | Token overhead |
|---|---:|---:|---:|---:|
| Session refresh review | 0 | 0 | -0.3% | +126.1% |
| Export lease review | -1 automated | +3 automated | +30.4% | +113.0% |
| Atomic rule batch | 0 | 0 | +25.3% | +122.3% |
| Concurrent transfer | 0 | 0 | +40.8% | +131.9% |

No Full ASK run met the frozen material-quality threshold. The normal 50% token-overhead guardrail failed on all four fixtures.

## Supplemental manual review audit

The frozen semantic matcher remains the reproducible score and was not changed after output inspection.

- Session refresh: every condition reported all four oracle defects, but each labeled the exact-expiry boundary as `minor`. The frozen protocol scores only `blocking`/`major`, so all remain 3/4.
- Export lease Kernel-only and Plain: 5/5 oracle findings, no major false positives.
- Export lease Full ASK: the output contains all 5/5 oracle findings. The frozen matcher counted 4/5 because inflected wording did not satisfy the manual-retry term rule. Full ASK also added one major claim that expired running jobs must be reclaimable. The repository contract does not require that recovery behavior, and the rubric treats speculative contract-unbound concerns as false positives.

Manual adjudication therefore changes the Full ASK hard-review score from `4/5 with 2 false positives` to `5/5 with 1 false positive`. It does not create a quality gain over Kernel-only, and it still violates the zero-false-positive-increase guardrail. The `stop` decision for using the current full projection on this workflow is unchanged.

## Value decision

| ASK layer | Decision | Evidence |
|---|---|---|
| Kernel | `retain` and replicate | Improved one hard implementation fixture from 76.9% to 100%, with +23.9% duration and +45.4% tokens; no benefit on the other three fixtures. |
| Full ASK over Kernel-only | `simplify` | No incremental quality gain in 0/4 fixtures; token overhead exceeded 100% in 4/4; one hard-review precision guardrail worsened. |
| Full projection for hard review | `stop` pending redesign | No valid-finding gain, one manually confirmed speculative major finding, and +113.0% tokens. |

The next controlled comparison should keep these fixtures and add a task-scoped ASK condition (`review` profile for review fixtures and `implementation` profile for implementation fixtures). That would distinguish value from applicable skills from overhead caused by the current full projection. Run at least three randomized repetitions before changing the default architecture.

## Unknowns and limitations

- One run per condition cannot separate instruction effects from model variance.
- Senior correction time, additional investigation time, rework, unresolved human decisions, and monetary cost are `unknown`, not zero.
- Automated correction units are not human time or rework.
- Review scoring uses a frozen semantic matcher; the manual audit is supplemental and separately reported.
- Synthetic fixtures do not establish production, client, or universal causal value.
- Checkpoint C remains pending on #179 and must separate architecture, model, CLI, repository, and adapter changes.

## Evidence files

- Frozen protocol: `benchmarks/protocol-b2.md`
- Frozen configuration: `benchmarks/checkpoint-b2.config.json`
- Input manifest: `benchmarks/fixtures/checkpoint-b2/input-manifest.json`
- Normalized result: `benchmarks/results/checkpoint-b2-2026-07-12.json`
- Runner: `scripts/ask-benchmark.mjs`
- Focused tests: `scripts/test-ask-benchmark.mjs`

Raw prompts, full outputs, JSONL events, submitted diffs, and temporary case workspaces remain outside the repository.
