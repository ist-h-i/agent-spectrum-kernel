# Independent review of main d4ad39 primary release evidence

- Observed date: 2026-10-10.
- Reviewed source revision: `d4ad39ead0f13965aeaf5aa919ef35f830a50e26`.
- Reviewer canonical agent/task ID: `/root/independent_review`.
- Reviewer identity digest: `sha256:953c8d2f13226bb326c0abd6c56f96ef701392ff0c5564189f6a7300431a9ab8` (SHA-256 of the exact UTF-8 canonical ID).
- Main primary evidence producer: `sha256:2eceb5fddff1ab8efd57dc1d2284911df681d38f7cdfdc0dbaa19a30f36b4735`; this is distinct from the reviewer identity.
- Independence: the reviewer did not author or modify the main implementation, main test results, claim matrix or primary evidence catalog.

This report reviews only the 13 main primary evidence records listed below. It judges exact implementation existence and the recorded focused static/synthetic observations. It does not approve a PR merge or release, and it supplies no real adapter, activation, Operational, cross-version upgrade, outcome, publication-permission, or human release-approval evidence.

Review procedure: `AGENTS.md` -> `skills/skill-router/SKILL.md` -> `skills/review-router/SKILL.md`, with the signal policy in `schemas/review-signal-gate-map.json`. The baseline semantic and output/evidence checks were limited to the primary records' narrow wording and evidence domains. The release gate implementation and policy were retained as the authority for evidence strength.

Baseline review:

- Gate: review-ai-quality
- Status: pass
- Evidence: the exact main code/schema bytes, relevant exports/entrypoints, primary claim wording, recorded artifact digests, seven clean-main observation records, and their corresponding command logs.

Additional required gates:

- review-output-quality: status=pass; evidence=implementation existence wording explicitly excludes runtime/use/outcome success and the main observation artifact preserves source, commands, result and limits; signals=structured_output_change,docs_output_change
- review-automated-gate: status=pass; evidence=the seven focused main command logs match the supplied main observations; this verdict is limited to those commands and does not claim complete CI; signals=automated_evidence_required

Missing evidence:

- none

Findings:

- none

## Exact main artifact audit

For all eight artifacts, the recorded SHA-256 digest was compared independently with both `git show d4ad39ead0f13965aeaf5aa919ef35f830a50e26:<path>` bytes and the provided clean-main source snapshot. Every comparison matched. Relevant exported functions or CLI entrypoints were read to confirm the existence wording.

| Main artifact | Verified SHA-256 digest |
| --- | --- |
| schemas/claim-evidence-status.schema.json | sha256:be0ad5f23e3eeae32ac80f9e27e05a4dc397c479cd3719692764609569690098 |
| scripts/verification-evidence.mjs | sha256:a6761cd3b52bcff5acfbc769e36b7cf5f9b19f103c3b503b4f70870c8df01334 |
| scripts/epic-admission-work-package-plan.mjs | sha256:831415bb3cfb13a41baf5d4d13f83a673788a3f92e28c7188d3def175a5f0aaf |
| scripts/asset-registry.mjs | sha256:c85bdae4b2fc1886fa99f38005ac89a45effa4e5107ee736ecea0b4220c675b7 |
| scripts/portfolio-manager.mjs | sha256:c812c126b760e3abd28eaede7c62b25acda9fcc53635e3c33e896dd7fb02564e |
| scripts/evolution-loop.mjs | sha256:914dd0709e9ac8d7a0166fa7b4acaedb22736153f3caa4ed9be341b00d7f9bb2 |
| scripts/ask-benchmark-portfolio-consumer-report.mjs | sha256:7d7e401f5571d7ab887e7d5e4f9a47d6157ebb4164c041769533ef36bf3aba00 |
| scripts/ask-setup.mjs | sha256:4e3465b6c8d0a39f2991bba1e98ee4bfa348a04014b07d95363b378c5ab676ad |

## Reviewed main observations

Source: `docs/fixtures/release-evidence-gate/current-main-d4ad39-observations.json`, declared clean detached main source. Its seven result strings matched the corresponding supplied `main-*.log` files. These are observed log/artifact checks; the reviewer does not claim to have rerun all seven commands. The observed host scope is Darwin arm64, macOS 26.6.2, Node v24.19.0.

| Main command | Recorded exit | Matching observed result |
| --- | --- | --- |
| node scripts/validate-repo.mjs | 0 | Repository validation passed: . |
| node scripts/test-release-evidence-gate.mjs | 0 | 18 original scenarios + 116 review regressions passed |
| node scripts/test-verification-evidence.mjs | 0 | Verification evidence exact-reuse tests passed |
| node scripts/test-verification-scoped-reuse.mjs | 0 | verification scoped reuse tests passed |
| node scripts/test-epic-admission-work-package-plan.mjs | 0 | 150 cases passed |
| node scripts/test-asset-registry.mjs | 0 | 70 cases passed |
| node scripts/test-portfolio-manager.mjs | 0 | 86 cases passed |

The Asset Registry log also contains a Darwin temporary-directory warning from Git; it does not contradict that suite's recorded pass. No omitted full-suite or hosted-CI success is inferred.

## Primary record verdicts

| Primary evidence ID | Independent result | Reviewed boundary |
| --- | --- | --- |
| release-evidence-main-platform-claim-evidence-status | passed | Claim-status schema exists at the declared main bytes |
| release-evidence-main-implementation-verification-store | passed | Verification evidence store/reuse implementation exists |
| release-evidence-main-implementation-epic-admission | passed | Epic admission / Work Package Plan implementation exists |
| release-evidence-main-implementation-asset-registry | passed | Asset Registry implementation exists |
| release-evidence-main-implementation-portfolio | passed | Portfolio Manager implementation exists |
| release-evidence-main-implementation-evolution | passed | Generic governed Evolution implementation exists |
| release-evidence-main-implementation-report | passed | Consumer evaluation/report infrastructure exists |
| release-evidence-main-implementation-setup | passed | Local inspect/recommend/plan/check/apply/doctor CLI exists |
| release-evidence-main-repository-validation | passed | The recorded clean-main validate-repo observation is supported by its log |
| release-evidence-main-static-verification-store | passed | Main's focused exact-reuse/scoped-reuse static/synthetic observations match logs |
| release-evidence-main-static-asset-registry | passed | Main's 70-case static/synthetic contract observation matches its log |
| release-evidence-main-static-portfolio | passed | Main's 86-case static/synthetic contract observation matches its log |
| release-evidence-main-static-epic-admission | passed | Main's 150-case static contract observation matches its log; this does not meet the unchanged epic-admission runtime-strength release requirement |

These verdicts support the eight recorded implementation-existence claims only at their stated narrow scopes. Static/synthetic proof does not become real-host enforcement or measured product effect when its review is attached.

## Claim/evidence boundary

Contract: `ask.claim-evidence-status@1.0.0`. Formal-audit triggers: explicit_claim_audit, multiple_material_claims, cross_artifact_synthesis.

- Verified: all eight named main artifact digests match the exact Git revision and provided main snapshot; all seven focused observation result strings match their supplied logs.
- Supported: the eight narrow implementation-existence claim wordings and the 13 primary records above fit that evidence.
- Unknown: required guided first workflow, release-scoped evaluation/report authority, measured #192/#198 activation/bypass, actual supported adapter execution, clean-user cross-version install/upgrade/recovery, and benchmark/report publication.
- Excluded optional claim: operator-dependence remains outside this evidence audit's outcome scope; no ROI or client-value inference is made.

All 16 fixed release gates remain required. Independent review of these primary records does not waive required runtime evidence, #192/#198, open blockers, final version/documentation consistency, or explicit human release approval. Release readiness remains `not_ready`.

No external/model/provider execution, authenticated communication, credentials, environment values, Keychain, global/security configuration changes, real-project application, GitHub mutation, merge, or release was used in this review.
