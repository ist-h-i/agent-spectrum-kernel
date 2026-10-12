# CI cache public source and lineage independent review

Independent source-only review, 2026-10-12. Repository: `ask-ci-cache-development`; fixed base `4b1bf37961d6f2f23acf950413ac956d20a5ab01`. Initial reviewed HEAD: `b85ea60d51bf1899cfa941ce8bde1ff3b4014457`. Its diff adds 27 public files and 564 lines. The initial worktree was clean. The reviewer made no repository/Git edits; only this new review directory contains reviewer-written records.

This is the pre-grader public source/lineage stage. It does not approve fixture admission, private grading, scored outputs, model/CLI execution, comparison, deployment or production cache changes. Frequency and impact classifications are independently approved as `unknown`, with null weights and practice-weighted ineligibility; neither empirical measurement is upgraded by this review.

## Official source and policy

The reviewer independently read the [official GitHub dependency caching reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) on 2026-10-12. It documents exact key matching, additional prefix/restore-key matching, cache-content immutability and dependency hashes in key construction. The checked-in source summary accurately describes that pattern and clearly distinguishes the fictional exact-key-only local model from the full GitHub service. It is a short paraphrase, rather than a copied workflow/code example.

`documented_external_pattern` is an approved type in the existing lineage policy and closed schema enum. The policy gives both unknown frequency and unknown impact null weights and false practice-weighted eligibility, with separate evidence/reviewer fields. The frozen catalog's base eligibility and identity remain unchanged by the diff. The fixture is primary `pf-ci-cache-flake`, practice-frequency investigation, ci_build, medium_hard, five repetitions, with ci_logs_and_config/historical_flake_runs evidence topology and the original public intent.

The historical observations and run/cache IDs are explicitly fictional in task, investigation contract, scenario provenance, history heading and lineage. The reproducer reports `measured_external_ci:false`. Thus four fixture observations and one synthetic failure are not asserted as an incident count or empirical failure rate. No real occurrence cadence or business/incident impact evidence is supplied. Documentation availability cannot establish frequency; a modeled local failure cannot establish business impact. Neither a low band nor a positive numerical weight is justified. No prohibited private/customer/Issue #195/model-outcome material was review evidence. Public provenance inspection cannot prove the author's entire history; no prohibited provenance was observed in the authorized files.

## Source recoverability and meaning

Verified: Plain investigation is possible using the supplied task, config, history, scenarios, model, controlled reproducer options and report contract. All ten supplied workspace files are protected; only `investigation.json` is the intended output. The exact final verification command is disclosed in the task and matches the command manifest. The local model never requests a network/cache service or performs a dependency install; `dependencies:'installed'` is modeled fixture output, not a real installation observation.

The report contract distinguishes confidence for the fixture from broader causal claims, requires hypotheses/evidence/experiments/limitations, and explicitly states that structural validation does not establish causal truth. The public validator likewise prints that causal meaning requires review. A neutral unresolved report is deliberately accepted by the source test; it is not a benchmark answer, causal approval or a completed investigation. All controller/admission/evaluator/source-freeze records remain pending. The review generated no investigation solution and added no answer to the public source.

Supported: the investigation role, CI evidence topology and hypothesis/causal-confidence intent fit the source qualitatively. Actual medium_hard difficulty, elapsed solving time and empirical usefulness are unknown; no model execution or timing calibration occurred. A deterministic reproduction of supplied observations is distinct from a real stochastic CI flake or actual historical incidents.

## Initial independent ordinary checks

Node `v24.19.0`.

| Public check | Initial result |
|---|---|
| Helper/source-test `node --check` | pass |
| `node scripts/ask-benchmark-pf-ci-cache-source.mjs` | exit 0; exact public closure |
| `node --test scripts/test-ask-benchmark-pf-ci-cache-source.mjs` | exit 0; 6 pass / 0 fail |
| `node scripts/test-ask-benchmark-pf-ci-cache-source.mjs` | exit 0; 6 pass / 0 fail |
| Fixture workspace `npm test` | exit 0; 5 pass / 0 fail |
| Ordinary reproducer `--no-cache` and `--node-major=25` | exit 0; each returns four modeled passing observations and `measured_external_ci:false` |
| Base-to-HEAD `git diff --check` | pass |

The source tests also execute the baseline and `--include-lock` local reproducer. The workspace's five passing tests establish expected fixture observations; they do not mean all fictional build outcomes succeeded or an investigation answer is correct. Repository-validator success was supplied by the author but was not independently rerun; no repository-wide green claim is made.

## Historical minor finding at b85ea60d

- Finding ID: `F-CACHE-EMPTY-EVIDENCE-PATH`.
  Severity: minor (P2).
  Merge blocker: false.
  Practical impact: a report with an empty evidence path is accepted as structurally valid even though the supplied schema requires a nonempty path.
  Trigger or failure trace: an otherwise neutral structure-only report with `hypotheses[0].evidence[0].path=""` yields public validator exit 0 and the structure-accepted message. The existing JSON Schema validator rejects the same object on `minLength:1`. This was reproduced only in a `/tmp` copy of the public workspace, with no causal/scoring answer.
  Evidence location: `workspace/scripts/validate-report.mjs:7`, compared with `workspace/investigation.schema.json` evidence path declaration, at the initial reviewed commit.
  Required post-fix condition: empty evidence paths are rejected; valid relative nonempty paths remain accepted; the public source tests include that structural boundary and input/protected-command closure is regenerated.
  Category: automated-evidence.

The author supplied a bounded correction adding `x.path.length>0` and an empty-path rejection assertion to the existing neutral structure-only test. The reviewer independently inspected that correction and its derived input/task/command hash updates.

Initial closure refs at `b85ea60d51bf1899cfa941ce8bde1ff3b4014457`:
- Input manifest raw digest: `sha256:3f22c19b4a1fa0d54478e8ed91661b0988742ed51b13bf75f473f07bb0a8d932`.
- Verification contract semantic digest: `sha256:fc14d2557cfd7b8ff548dd62850604aedab871e5cf6b07e0b59162582d8ba7f6`.
- Initial validator raw digest: `sha256:78f59a19d139644e01a40def093849b4b9a0f269531fa969ec60837b046d1f49`.

## Final correction verification and current result

Final reviewed HEAD: **`639a24646009b1abef44a141ee5aad135dce0bb0`**. The worktree is clean. The delta from the initial HEAD changes only the validator, author-side neutral structural assertion, derived input manifest, disclosed task invocation and verification command contract (five files; 12 additions and 12 deletions).

Independent reruns at the final HEAD:
- Source closure validator: exit 0.
- `node --test scripts/test-ask-benchmark-pf-ci-cache-source.mjs`: exit 0; 6 pass / 0 fail, including empty-path rejection.
- Direct `node scripts/test-ask-benchmark-pf-ci-cache-source.mjs`: exit 0; 6 pass / 0 fail.
- Final base-to-HEAD whitespace check: pass.

Current input manifest raw digest: `sha256:a22e4f6d28b233add4e8325eeabbde3e09dd9a51d35253e43e5a38d41a087f8f`. Current verification semantic digest: `sha256:a3d8c6007df80cdeb540306dbea8c49818fff8dea4c7184bac3d96dbf4440784`. Detailed raw source/hash refs are in `source-approval.json`; raw JSON-file digests are distinguished from embedded semantic contract digests.

`F-CACHE-EMPTY-EVIDENCE-PATH` is resolved. The correction rejects schema-invalid empty refs while preserving neutral valid structure acceptance and the explicit separation of causal meaning from structure. It does not alter observations/model, source lineage, frequency/impact evidence or catalog identity.

Baseline review:
- Gate: `review-ai-quality`.
- Status: `pass`.
- Evidence: initial complete public diff, local fixture/contracts, ordinary tests, exact final correction and regenerated closures at final reviewed HEAD.

Additional required gates:
- `review-domain-impact`: status=`pass`; evidence=separate unknown band decisions, existing approved-source/weight policy, unchanged catalog identity and base eligibility; signals=`reporting_meaning_change`.
- `review-output-quality`: status=`pass`; evidence=explicitly fictional observations, official source summary, public report contract and structure-only validator message; signals=`docs_output_change,ai_facing_output_change,structured_output_change,cli_output_change`.
- `review-automated-gate`: status=`pass`; evidence=6/6 author checks in both forms, initial 5/5 unchanged observations, final closure/diff checks and resolved structural boundary; signals=`automated_evidence_required`.

Missing evidence:
- none

Findings:
- none open. The initial P2 is retained above as historical, independently reproduced and resolved.

Decision:
- **approve**, for exact final public source preparation and source lineage only.

The separate `frequency-review.json` and `impact-review.json` each approve retaining the unknown classification. Both weights are null and practice-weighted eligibility false. These are classification approvals in the presence of insufficient empirical evidence, not positive empirical measurements or a changed catalog eligibility. The canonical machine-readable frozen lineage/admission artifacts and private grading remain future stages; these external reviewer records do not substitute for them.

## Scope limits

Only the named public worktree, official documentation and ordinary public-source tests/local deterministic reproducer were inspected or run. The structure-only counterexample and source test reports exist only in temporary copies, which were removed. No private grading/client material, past model outcomes, stopped-client review, score/comparison/real model CLI, real CI/cache service or production modification was accessed or performed. No scoring answer was added to public source. No full final investigation report was authored. This review does not establish real-world cache incidents, frequency, impact, stochastic flakiness, empirical task difficulty, complete GitHub Actions cache equivalence or fixture admission.
