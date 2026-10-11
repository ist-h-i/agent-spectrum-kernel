# K-principles comparison candidate

Spec `SPEC-KERNEL-PRINCIPLES-1` revision 1 references the approved 2026-10-11
request to implement and merge a small evaluation candidate. It does not adopt
the separate Core Bundle product proposal or authorize real model comparison.

`kernel_principles_v1` / **K-principles** projects basic principles from canonical
`AGENTS.md`. It is distinct from `kernel_only`, which still means canonical
AGENTS with no added ASK Skills. P and the existing Full definition are unchanged.
F−K-principles compares complete instruction configurations; it does not isolate
the incremental effect of Skills over a byte-identical shared Kernel.

## Source and responsibility mapping

Paragraph indexes below are zero-based blank-line-separated blocks in each
canonical section. `scripts/kernel-principles.mjs` seals the complete AGENTS
bytes, including excluded text. Any source change stops candidate generation
until its rule coverage and boundaries are reviewed. No generated instruction
file or Skill procedure is maintained as a second source.

| Canonical source | Candidate keeps | Formal procedure retained in F |
| --- | --- | --- |
| Operating intent | All six duties and outcome priority | No weaker Full baseline |
| §0 paragraphs 0, 2; first sentence of 3 | Task classification, seven classes, proportionate processing | Mode selection and Skill invocation in `skills/operating-mode-router/SKILL.md` and `skills/skill-router/SKILL.md` |
| §1 paragraphs 1–3 | Five statuses, unsupported-claim prohibition, missing evidence | Machine-readable status contract and formal ledger activation |
| §2–6 complete | Repository context, scope, all approval boundaries, smallest valid change, assumptions | Structured implementation and specialized risk procedure |
| §7 paragraphs 0, 2–4 | Verified behavior, applicable checks, exact results, unavailable-check disclosure | Proof selector/schema, Compact Proof and Formal Verification Contract via `skills/test-first-verification/SKILL.md` |
| §7.5 paragraphs 1–2 | Bounded useful continuation; state is not proof | `docs/agent-session-state-contract.md` serialization |
| §8 | No mandatory router invocation | Canonical routing, overlays and required `risk-gate` invocation |
| §9 complete | All nine rejected shortcuts and proportionate evidence | Same principles remain in Full |
| §10 | Simple candidate report of boundary/checks/evidence/limits | Formal ledger, Implementation Contract, review gates/findings and `docs/execution-envelope-contract.md` |

The treatment-boundary and simple-report sentences are candidate glue, not copied
Skill procedures. Formal proof, state and control protocols are explicitly not
provided. Missing explicitly required specialized/formal work stops its dependent
scope; human approval alone does not fabricate that capability. All safety and
evidence principles still apply. Availability means structural entry availability,
not observed model obedience, quality, runtime gate enforcement or product value.

## Comparison connection

Existing `prepare` accepts `--kernel-condition kernel_principles_v1` (programmatic
`kernelCondition`). Omission keeps the old P/K/F condition set. Only that new ID
and `kernel_only` are accepted; no arbitrary instruction path/profile is accepted.
The fixed-v2 bundle entry passes this option through existing preparation without
changing task, verifier, seed checks or mutable paths.

The new condition adds one managed AGENTS block and no ASK Skills/contracts.
Custom project instructions are preserved. Canonical source and renderer bytes
are retained privately under `control/` with hashes and source commit; the plan
binds the generated body, extraction map and dependency check. Reopening checks
that exact generation and baseline rather than trusting an availability label.
Declared global capabilities cannot satisfy or repair this candidate's checks.

Initial structural admission covers `implementation` and `trivial`. Review and
investigation remain unavailable for this candidate and are saved as
`capability_missing`, with quality and usage unknown. They are not silently routed
through an invented generic procedure. Explicit specialized requirements within
an implementation are also outside the provided candidate; the instruction stops
that dependent scope. Static admission does not infer semantic task signals.

Use a new run ID and output directory after separate execution approval. Old
plans, runs, missing-route receipts, exit 3 and unknown values remain readable and
unchanged. Aggregation separates the old and new condition sets and never aliases
the candidate to `kernel_only`. The candidate uses existing sequential execution,
checkpoint/resume, receipt integrity, independent Node verification and reporting.
No new Router, runner, capability registry, installer or product package is added.

## Development verification contract

Implementation `IMP-KERNEL-PRINCIPLES-1` revision 1 references this Spec. Changes
are limited to the projection helper, existing comparison seams, tests and docs.
Canonical AGENTS, Skill text, Full installers, model runner and frozen v2 bundle
are outside the change boundary.

Formal Verification Contract `FVC-KERNEL-PRINCIPLES-1` revision 1 references the
Spec. Policy `ask.verification-proof-policy@1.0.0` selects
`formal_verification_contract`: observed triggers are
`state_concurrency_persistence_lifecycle_or_cross_module`,
`multiple_specialized_checks`, `merge_release_or_stable_trace` and
`multi_session_multi_agent_or_handoff`. This is the development proof, not a
protocol that the candidate promises to supply during a comparison.

Obligations:

- O1: deterministic generation; complete retained-rule coverage; excluded formal
  dependencies; source-boundary drift, altered body/metadata/source/renderer and
  unsupported/unknown condition rejection.
- O2: real temporary Git preparation preserves source and custom instructions;
  zero candidate Skills; Full and fixed-v2 inputs remain identical; old plans and
  K missing-route outcomes remain unchanged.
- O3: fake-only sequential execution, interruption, pending-only resume, terminal
  receipt integrity, no retries, partial reports and separated aggregation.
- O4: related existing model-free suites, repository consistency, runtime bundle
  freshness, whitespace and required CI on the final commit.
- O5: independent final-snapshot review of code, arbitrary rule deletion, Skill
  copying, unconditional availability, condition confusion and maintenance cost.

Missing or failed evidence or unresolved major findings prevent merge completion.
Real comparison prepare/start, evaluation CLI/model calls, native model behavior
and effectiveness measurement are unexecuted in this development task. Effective
model-name capture is a separate follow-up, not a prerequisite here.

Maintenance is one reviewed source seal/extraction function and two closed
condition sets in existing comparison code. A future source change requires a
reviewed candidate revision and compatibility decision; it must not silently
redefine v1 or erase old receipts. Product/package expansion is outside this work.
