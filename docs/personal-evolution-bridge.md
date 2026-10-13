# Personal Evolution bridge: bounded preparation and inspection

This first slice connects a caller-reviewed public observation to an **already registered** exact candidate Asset, its current parent Portfolio, and the existing Evolution artifact verifiers. It uses the existing content-addressed store. It does not complete the individual self-improvement loop.

## APIs

- `buildPersonalEvolutionObservation(input)` in `scripts/ask-personal-evolution-observation.mjs` closes and bounds the observation, preserves its evidence status, and assigns an immutable digest. Effectiveness remains `Unknown` and authority remains false.
- `preparePersonalEvolutionCandidate(input)` in `scripts/ask-personal-evolution.mjs` verifies the registered candidate's exact identity, candidate state, full-content parent, rollback target, Registry identity, and current parent Portfolio before publishing the observation, Evolution candidate, and preparation record.
- `inspectPersonalEvolution(input)` repeats the registered-candidate identity, lineage, rollback, and supplied-current-parent checks before verifying a contiguous artifact prefix: candidate → sealed experiment → recommendation → proposal → human decision → application receipt. A self-digested preparation does not substitute for those checks. Caller-supplied trust contexts remain separate from artifact pointers. A valid artifact from another candidate is rejected. Inspection does not publish or apply changes.

Preparation input contains `storeRoot`, `observationInput`, `blueprint`, `generationActor`, `holdoutTaskIds`, and the existing optional Asset/Portfolio/high-impact trust arrays. The blueprint contains `candidate_id`, `parent_asset`, `parent_portfolio`, `candidate_asset`, `registry`, `factors`, `evaluation_scope`, `expected_upside`, `risks`, `retirement_condition`, `rollback`, `prohibited_effects`, and `authorities`. These are existing Evolution candidate fields. The bridge derives generation source, delta, hypothesis, and challenger lane from the bounded observation rather than accepting caller replacements for them.

The observation contains exactly `observation_id`, `repository_id`, `task_ids`, `evidence_refs`, `evidence_status`, `correction`, `intended_mechanism`, `applicability`, `non_applicability`, and `privacy`. IDs are bounded to 256 characters; summaries to 2,048 characters; collections to 32 entries. Each evidence reference contains only `artifact_id` and an exact SHA-256 digest. Privacy must declare `classification: "public_summary"`, `raw_content_retained: false`, and `private_answers_retained: false`. Raw prompt, log, answer, and unknown fields are rejected. `Unknown` and `Falsified` observations can be retained as observations but cannot derive a candidate. A `Hypothesis` observation stays a hypothesis; candidate preparation supplies no effectiveness evidence.

Inspection takes `preparationObjectDigest`, optional `artifacts` with `experimentObjectDigest`, `recommendationObjectDigest`, `proposalObjectDigest`, `decisionObjectDigest`, and `receiptObjectDigest`, plus the existing trusted authority arrays. Artifact predecessors cannot be skipped. The result reports the last verified stage, exact semantic digests, evidence status, recommendation/action/receipt state when available, and false authority/mutation/execution/installation indicators. `receipt_verified` means the supplied receipt passed the existing verifier; even a completed no-op receipt does not prove installation or effectiveness.

## Boundaries and limits

The caller must review summaries for disclosure and resolve evidence references. Privacy declarations and the accidental-disclosure regex do not prove secrecy or authenticate the source. The bridge does not read or validate referenced evidence contents. Observed and held-out task IDs must be distinct, and holdouts must be in the frozen candidate scope. This does not prove that their content or private answers are disjoint.

The parent is the current manifest **of the supplied exact lock**, not an automatically discovered latest head. The operation does not grant freshness or concurrent-update authority. After preflight, immutable CAS publication can leave unreferenced objects if publication fails; the three-object operation is not a transaction. Existing files are never replaced. The caller owns a dedicated store and must not share it with private evaluator or mutable development write roots.

Existing Evolution projection contracts still apply. The bridge does not convert arbitrary Skills or a P/K/F diagnostic into the formal fixed-B1 or exact Prompt-v2 protocol. Model execution and grading require the separate authorized execution path; they are not started by these APIs.

Remaining slices are candidate content authoring/registration, an explicitly supported evaluation projection, verified local installation and restoration on the same target, and a bounded unattended driver. Those require their own contracts and verification. This slice does not change setup's `portfolio_authority_unverified` guard, schemas, installers, benchmarks, private fixtures, runtime bundles, or CI.

## Non-model verification

```sh
node --test scripts/test-ask-personal-evolution-observation.mjs scripts/test-ask-personal-evolution.mjs
```

Tests copy the public Prompt-v2 preregistration CAS into temporary directories. They check idempotence, immutable source objects, exact identity and rollback/current-parent checks, holdout separation, authority separation, candidate transplant rejection, observation rebinding rejection, and a synthetic six-object insufficient-evidence/no-change closure. Synthetic evaluation and decision objects in tests are contract fixtures and provide no production authorization or measured quality evidence.
