# Checkpoint C Post-Architecture Benchmark Report

Run date: 2026-07-14 JST
Protocol commit: `b16f14436e28ad57d232d35007d61426958eb340`
Protocol SHA-256: `c90f4e6b937908818229a0088c337482a428e3cc919ff7c2a2ba8a438d2a96ef`
Configuration SHA-256: `c09574e3a69081f10ddd7eaef318465c573458f341ecdc5a2d4dcd4c38b03ea0`
Measured repository revision: `b16f14436e28ad57d232d35007d61426958eb340`
Runtime: Codex CLI `0.144.2`, `gpt-5.6-sol`, reasoning effort `high`, sequential execution

## Bounded conclusion

Checkpoint C does not justify expanding Full ASK over Kernel-only on these four fixtures.

- Full ASK improved the frozen score on the medium-hard session review from Kernel-only's 3/4 to 4/4 valid major findings. This met the material-quality threshold, but Full ASK used 271.3% more tokens and took 83.8% longer than Kernel-only. The token overhead exceeded the frozen 150% quality-gain allowance, so the decision is `retain`, not `expand`.
- Full ASK did not improve quality over Kernel-only on the hard export review or either implementation fixture. Token overhead was 144.5%, 188.4%, and 252.7%, respectively, so all three decisions are `simplify`.
- All twelve runs completed without timeout or capability downgrade. Full ASK selected the correct route, reported the expected contracts, and had no recorded under-processing on all four fixtures. Kernel-only under-processed one implementation route. Over-processing was not classified and remains `unknown` for every condition.
- Senior correction time, additional investigation time, unresolved human decisions, rework, and monetary cost remain `unknown`; no human evaluator measured them.

The result is bounded to one repetition of synthetic fixtures. It does not isolate the effect of #179 because the Codex CLI, ASK repository, and adapter projection evidence changed alongside the architecture.

## Frozen decisions

| Fixture | Class | Full ASK decision | Threshold and guardrail evidence |
|---|---|---|---|
| Session refresh | Review | `retain` | +1 valid major finding; +83.8% duration; +271.3% tokens, exceeding the +150% quality-gain limit |
| Export lease | Review | `simplify` | no quality gain; -38.5% duration; +144.5% tokens, exceeding the normal +50% limit |
| Atomic rule batch | Implementation | `simplify` | no quality gain; +2.4% duration; +188.4% tokens, exceeding the normal +50% limit |
| Concurrent transfer | Implementation | `simplify` | no quality gain; +34.9% duration; +252.7% tokens, exceeding the normal +50% limit |

`expand` was selected for 0/4 fixtures. No Full ASK run reduced the primary quality metric or worsened a frozen quality guardrail relative to Kernel-only.

## Condition results

Quality is valid major findings for review and satisfied hidden requirements for implementation. Duration is rounded to the nearest second. Cost and human-effort values are not inferred from duration or tokens.

| Fixture | Condition | Quality | False positives | Scope deviations | Unverified completion | Duration | Tokens | Route/runtime evidence |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Session refresh | Plain Agent | 3/4 | 0 | 0 | 0 | 202 s | 138,369 | route unknown; contracts not reported; executed |
| Session refresh | Kernel-only | 3/4 | 0 | 0 | 0 | 142 s | 149,871 | correct route; contracts reported; executed |
| Session refresh | Full ASK | 4/4 | 0 | 0 | 0 | 260 s | 556,490 | correct route; contracts reported; projection present; executed |
| Export lease | Plain Agent | 5/5 | 1 | 0 | 0 | 193 s | 146,779 | route unknown; contracts not reported; executed |
| Export lease | Kernel-only | 5/5 | 1 | 0 | 0 | 445 s | 136,364 | correct route; contracts reported; executed |
| Export lease | Full ASK | 5/5 | 1 | 0 | 0 | 273 s | 333,399 | correct route; contracts reported; projection present; executed |
| Atomic rule batch | Plain Agent | 11/11 | n/a | 0 | 0 | 244 s | 213,493 | correct route; contracts reported; executed |
| Atomic rule batch | Kernel-only | 11/11 | n/a | 0 | 0 | 614 s | incorrect route; under-processing; contracts reported; executed |
| Atomic rule batch | Full ASK | 11/11 | n/a | 0 | 0 | 629 s | correct route; contracts reported; projection present; executed |
| Concurrent transfer | Plain Agent | 13/13 | n/a | 0 | 0 | 379 s | correct route; contracts reported; executed |
| Concurrent transfer | Kernel-only | 10/13 | n/a | 0 | 1 | 341 s | correct route; contracts reported; executed |
| Concurrent transfer | Full ASK | 10/13 | n/a | 0 | 1 | 460 s | correct route; contracts reported; projection present; executed |

The transfer Kernel-only and Full ASK runs failed the same three frozen requirements (`TRANSFER-REQ-01`, `TRANSFER-REQ-07`, and `TRANSFER-REQ-09`) and both claimed completion despite hidden-test failure. This is direct evidence of no incremental Full ASK value for that run, not evidence that either instruction condition caused the shared failure.

## Full ASK vs Kernel-only

| Fixture | Quality gain | Automated correction-unit delta | Duration overhead | Token overhead | Senior correction | Rework |
|---|---:|---:|---:|---:|---|---|
| Session refresh | +1 finding | -1 | +83.8% | +271.3% | unknown | unknown |
| Export lease | 0 | 0 | -38.5% | +144.5% | unknown | unknown |
| Atomic rule batch | 0 requirements | 0 | +2.4% | +188.4% | unknown | unknown |
| Concurrent transfer | 0 requirements | 0 | +34.9% | +252.7% | unknown | unknown |

Usage cost is `unknown` because the runtime did not expose a monetary cost. Automated correction units are a bounded score proxy, not minutes or rework.

## Supplemental review audit

This audit occurred after all cases completed and after the frozen automated result was generated. It is not blinded and does not replace the preregistered score.

- Session refresh: all three conditions identified all four oracle defects. Plain Agent and Kernel-only classified the exact-expiry defect as `minor`, which the frozen protocol does not score. Full ASK classified it as `major`; its 4/4 score is therefore a prioritization gain, not discovery of an otherwise unmentioned defect.
- Export lease: each condition had one frozen false positive. Kernel-only reported the expressly excluded `structuredClone` concern. Plain Agent reported lease reclamation outside the required contract. Full ASK split lease-owner and lease-expiry omissions into two findings, while the frozen oracle requires one root finding. The 5/5 plus one-false-positive scores are consistent with the rubric.

## Checkpoint B2 to C comparison

| Fixture | B2 Full vs Kernel | C Full vs Kernel | B2 decision | C decision |
|---|---|---|---|---|
| Session refresh | 0 finding gain; -0.3% duration; +126.1% tokens | +1 finding; +83.8% duration; +271.3% tokens | `simplify` | `retain` |
| Export lease | -1 frozen finding; +30.4% duration; +113.0% tokens | 0 finding gain; -38.5% duration; +144.5% tokens | `stop` | `simplify` |
| Atomic rule batch | 0 requirement gain; +25.3% duration; +122.3% tokens | 0 requirement gain; +2.4% duration; +188.4% tokens | `simplify` | `simplify` |
| Concurrent transfer | 0 requirement gain; +40.8% duration; +131.9% tokens | 0 requirement gain; +34.9% duration; +252.7% tokens | `simplify` | `simplify` |

The review scores improved relative to B2, while token overhead worsened on all four fixtures. The hard-transfer result also reversed across repetitions: in B2, Plain Agent passed 10/13 while Kernel-only and Full ASK passed 13/13; in C, Plain Agent passed 13/13 while Kernel-only and Full ASK passed 10/13. This directly demonstrates that one-run model variance is large enough to block architecture-only or universal causal claims.

## Adoption and runtime evidence

| Condition | Correct route | Under-processing | Over-processing | Contracts reported | Executed | Capability downgrade |
|---|---:|---:|---:|---:|---:|---:|
| Plain Agent | 2 true, 2 unknown | 0 true, 2 false, 2 unknown | unknown 4/4 | 2/4 | 4/4 | 0 |
| Kernel-only | 3/4 | 1/4 | unknown 4/4 | 4/4 | 4/4 | 0 |
| Full ASK | 4/4 | 0/4 | unknown 4/4 | 4/4 | 4/4 | 0 |

The Full ASK projection was present for all four Full ASK cases. The pinned Codex full-profile projected-asset digest is `sha256:c23fde39066da6c695a708ea6aa96d6bb04704eaf1f38454136d2100cdeed73f`; the runtime-bundle file SHA-256 is `b943562be43d3b38d8d32f6603a121cbc50149ede1e8dcc62c8bef881019bcf7`. This is projected-asset evidence. The twelve completed Codex processes and structured outputs are execution evidence; neither proves that every projected contract changed model behavior.

## Attribution and evidence status

Verified:

- The B2 fixture manifest hash and evaluator inputs were unchanged.
- The model name and reasoning effort matched B2; Codex CLI changed from `0.144.1` to `0.144.2`.
- The measured repository revision contains the post-#179 canonical dual-runtime architecture.
- All twelve cases executed once and completed without timeout or recorded downgrade.
- Frozen quality, token, duration, routing, and recommendation values are recorded in the normalized result.

Supported:

- Full ASK improved session-review prioritization and hard-review precision relative to the observed B2 run.
- Full ASK's incremental token overhead remained disproportionate for these fixtures under the frozen thresholds.

Unknown:

- Senior correction time, additional investigation time, unresolved human decisions, rework, and monetary cost.
- The B2 adapter projection digest; it was not captured in the B2 durable result.
- Whether the observed B2-to-C changes came from architecture, CLI, repository changes, adapter changes, model stochasticity, or their interaction.

Falsified for this measured run:

- Full ASK met the frozen `expand` threshold on any tested fixture.
- Full ASK reduced token usage relative to Kernel-only on any tested fixture.

## Limitations

- Four synthetic fixtures and one repetition do not establish production, client, universal, or causal value.
- The Codex CLI, ASK repository, and adapter projection evidence changed alongside #179, so the architecture effect is not isolated.
- Review scoring uses a frozen semantic matcher; the manual audit is supplemental and unblinded.
- The run did not include a blinded senior human evaluator.
- The hard-transfer reversal across B2 and C shows material stochastic variance.

## Privacy and evidence files

The durable report and normalized result contain no raw prompts, full outputs, full event streams, secrets, customer data, personal data, production source, or full fixture copies. Temporary case artifacts remain in the operator-managed `/tmp` run directory and are not committed.

- Frozen protocol: `benchmarks/protocol-c.md`
- Frozen configuration: `benchmarks/checkpoint-c.config.json`
- Normalized result: `benchmarks/results/checkpoint-c-2026-07-14.json`
- B2 baseline result: `benchmarks/results/checkpoint-b2-2026-07-12.json`
- Runner: `scripts/ask-benchmark.mjs`
- Focused tests: `scripts/test-ask-benchmark.mjs`
