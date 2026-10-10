# Independent review — ASK October release package

Review verdict: **pass for the scoped candidate implementation and local verification; no outstanding actionable findings.** ASK v1 release readiness remains **insufficient evidence / `not_ready`**. This review supplies no merge or release approval.

- Observed date: 2026-10-10.
- Base revision: `d4ad39ead0f13965aeaf5aa919ef35f830a50e26`.
- Reviewer canonical agent/task ID: `/root/independent_review`.
- Reviewer identity digest: `sha256:953c8d2f13226bb326c0abd6c56f96ef701392ff0c5564189f6a7300431a9ab8` (SHA-256 of the exact UTF-8 canonical ID).
- Producer task: `/root`; main primary producer digest: `sha256:2eceb5fddff1ab8efd57dc1d2284911df681d38f7cdfdc0dbaa19a30f36b4735`, distinct from the reviewer.
- Independence: this reviewer did not author or change the implementation, tests, claim matrix, primary catalog or candidate evidence. The reviewer authored only the independent review reports.
- Scope: the candidate diff, doctor freshness correction, synthetic installation/update/recovery smoke, Mac temp-path fixture corrections, release/quickstart wording, current-main primary evidence and its independent-review links, and required local verification evidence.

The review used `AGENTS.md`, `skills/skill-router/SKILL.md`, `skills/review-router/SKILL.md`, `schemas/review-signal-gate-map.json`, the applicable baseline/output/adversarial/automated/release review skills, and the claim/evidence contracts. Only local deterministic inspection and disposable synthetic fixtures were used. No actual adapter/model/provider launch, authenticated communication, credentials, global or security configuration changes, real-project apply, GitHub mutation, merge, or release was performed by this reviewer.

Baseline review:

- Gate: review-ai-quality
- Status: pass
- Evidence: doctor and projection-renderer code, exact Skill asset inventory, installer stale-retention paths, setup source/read/write boundaries, complete changed-file diff, the regression/recovery smoke, touched setup/consumer fixtures, documentation, final public evidence artifacts and focused command results. The code changes remain localized and preserve managed-target drift refusal.

Additional required gates:

- review-output-quality: status=pass; evidence=the Mac quickstart matches the existing CLI, keeps Installed/Activated/Operational distinct, describes same-source profile update and managed recovery limits, and retains Windows/Linux and #192/#198 obligations. Structured evidence keeps main and candidate sources separate; signals=docs_output_change,structured_output_change,cli_output_change
- review-adversarial-risk: status=pass; evidence=the smoke accepts no arbitrary target, creates its own disposable repositories, uses a fixed local CLI allowlist and filtered child environment, preserves project-owned content, verifies refusals are read-only, and never launches the installed runner. Release policy and evidence strength are unchanged; signals=release_readiness_risk
- review-automated-gate: status=pass; evidence=final model-free recovery smoke, setup suite including actual installer integration, release regression, consumer report, Skill asset and registered local collector checks passed; reviewer also reran repository validation, bundle freshness, focused release/asset checks and whitespace validation; signals=automated_evidence_required
- release-readiness-gate: status=insufficient_evidence; evidence=all 16 required release gates remain, with 4 pass and 12 not_ready; the six required runtime/outcome claims remain unknown and five release blockers remain open; signals=release_readiness

Missing evidence:

- {"gate_id":"release-readiness-gate","missing_input":"Final release-scoped first workflow and actual supported-adapter execution; #192/#198 measured activation/bypass and report publication; clean-user cross-version upgrade/recovery; required integration and real candidate disposition; final documentation/version consistency and explicit human release approval.","affected_judgment":"Whether ASK v1 can be released. These gaps do not establish a defect in the scoped model-free release package.","next_check":"Confirm the bounded #315 task, runtime, execution destination, authorization and evidence requirements; complete the existing #192/#198 and other mandatory release obligations through separately authorized work."}

Findings:

- none

## Repaired finding and independent closure

`F-DOCTOR-RETIRED-SKILL` was reproduced during review: the first candidate threw ENOENT and emitted no doctor JSON when an old managed Skill was retained after its source directory disappeared. Main d4ad39 returned a structured warning for the same artificial fixture. The candidate now verifies the managed target hash before inspecting the source inventory and reports unavailable source as a structured warning for retained stale records, or a failure for active records.

Independent post-fix reproduction confirmed:

| Artificial condition | Doctor exit | Structured result | Target binding |
| --- | --- | --- | --- |
| Retained stale Skill, current source absent, target hash unchanged | 0 | overall status warn | unchanged |
| Same retained target with artificial drift | 1 | overall status fail; managed hash mismatch | unchanged |
| Active Skill, current source absent, target hash unchanged | 1 | overall status fail; source unverified | unchanged |

The smoke now includes the retained-source case and its drift refusal. Overall doctor status is the asserted warning/failure result; the existing Installed layer is not assumed to mirror every top-level warning. The finding is resolved and does not remain in the current finding inventory.

## Main evidence and catalog integrity

The main-only audit is preserved separately at `docs/fixtures/release-evidence-gate/current-main-d4ad39-independent-review.md`. Its bytes match the reviewer-authored main report exactly. All eight implementation artifact digests matched both the exact Git revision and the provided clean-main snapshot; all seven main observation result strings matched their supplied logs. That report contains no candidate installation/recovery success claim.

All 13 attached independent-review records were checked for matching artifact digest, reviewer identity, main source revision, primary scope, claim IDs, gate IDs, and single primary subject reference. Each reviewer identity differs from its primary producer. The records support only the stated implementation existence/static verification scope.

Independent assessment after registration returned:

- 16 fixed gates: 4 pass (`repository_validation`, `verification_evidence_store`, `asset_registry`, `portfolio_manager`) and 12 not_ready.
- Eight narrow implementation claims: supported.
- Six required runtime/outcome claims: unknown; their assessment status remains not_ready.
- Optional operator-dependence claim: excluded.
- Five release blockers: open; no accepted risks were introduced.
- Epic-admission static evidence remains `evidence_kind_insufficient` for that runtime-strength release gate.

The historical `756c72` fixtures and gate implementation are unchanged. Candidate smoke is not referenced by the main catalog or promoted to pristine-main, product-value, or final-release runtime evidence. The metadata refresh changes one existing subject digest and 17 existing artifact references; capability/evidence levels, results, scope and policy are unchanged. The registered local collector verification passed before that refresh.

## Candidate proof and verification

`docs/fixtures/release-evidence-gate/mac-install-recovery-candidate.json` matches the final smoke run's host, adapter, profiles, result, steps, deployment status, scenarios and limits. All nine named executable/setup-profile metadata digests match the final candidate bytes, including the repaired doctor and refreshed adapter evidence/profile JSON. Documentation and hosted CI remain outside that named local smoke proof.

- Smoke exit: 0.
- Scenarios: 10.
- CLI executions: 35, comprising 31 exit 0 and four expected exit 1 refusals.
- Scope: clean artificial install, read-only checks, exact reapply, same-source minimal-to-implementation profile update, update rollback, retained removed Skill, drift refusal, detach, fresh-install rollback, and project-owned preservation.
- Fresh installation: Installed=pass; Activated/Operational=insufficient_evidence.
- Repaired doctor digest: `sha256:a0ff1b56429177c2151bdc9ae166883bfd45ef52b346ae7a4a47da7abc1a7f56`.
- Final smoke script digest: `sha256:cb012513598963e21bc51ae4fbe749b5d42779c206b31c1a78d54d86bc19b821`.

Reviewer-run checks:

- `node scripts/test-release-evidence-gate.mjs`: exit 0; 18 original scenarios + 116 review regressions + current-main boundary.
- `node --test scripts/test-skill-assets.mjs`: exit 0; 14 tests passed.
- `node scripts/validate-repo.mjs`: exit 0; repository validation passed.
- `node scripts/adapter-runtime-bundle.mjs --check`: exit 0; bundle current.
- `git diff --check d4ad39ea`: exit 0.
- Independent retired-Skill post-fix reproduction: all three expected results and read-only bindings confirmed.
- Independent main/candidate artifact, public-review link and release-assessment checks: passed at the scopes above.

Producer command results inspected:

- `node scripts/test-release-install-recovery.mjs --json`: exit 0; 10 scenarios / 35 CLI executions.
- `node scripts/test-ask-setup.mjs`: exit 0, including actual installer CLI integration for kernel/Codex/Claude, 13 scenarios with no skip. The final completion lines were inspected.
- `node scripts/test-release-evidence-gate.mjs`: exit 0; original, review and current-main regressions passed.
- `node scripts/test-ask-benchmark-portfolio-consumer-report.mjs`: exit 0; 16 closures passed.
- `node --test scripts/test-skill-assets.mjs`: exit 0; 14 tests passed.
- `node scripts/test-claude-metrics-collector.mjs`: exit 0; registered local fixture checks passed.

These are scoped local checks. Complete hosted CI, actual adapter use, real-user adoption, cross-version compatibility and outcome improvement are not inferred from them.

## Evidence ledger and remaining boundary

Contract: `ask.claim-evidence-status@1.0.0`. Triggers: explicit_claim_audit, multiple_material_claims, cross_artifact_synthesis, high_stakes_readiness.

| Claim ID | Claim | Status | Evidence / remaining check |
| --- | --- | --- | --- |
| REVIEW-MAIN-PRIMARY | Main primary records bind exact source and narrow evidence scopes | Verified | Exact Git/snapshot hashes, main result logs, separate main audit and 13 matching review links |
| REVIEW-DOCTOR-RETIRED-SKILL | Repaired doctor preserves structured stale-source diagnostics and rejects target drift | Verified | Independent three-case reproduction plus final smoke regression |
| REVIEW-CANDIDATE-RECOVERY | The final synthetic Mac smoke completed its declared local scenarios | Verified | Final run/proof comparison and nine matching source digests; no real workflow or cross-version inference |
| REVIEW-RELEASE-BOUNDARY | The package preserves fixed release obligations and evidence-strength distinctions | Verified | Unchanged gate/policy, 4 pass / 12 not_ready assessment, mandatory unknown claims and open blockers |
| REVIEW-V1-READINESS | ASK v1 has enough evidence to release | Unknown | Existing runtime, #192/#198, publication, upgrade/integration, final-version and approval obligations remain |

Next release preparation step: confirm the bounded #315 first-workflow task/runtime/destination/authorization and evidence requirements. Windows/Linux and unmeasured Mac architectures remain later real-host acceptance work. The package's October/November/December dates remain targets, with release postponement required if mandatory evidence is incomplete.
