# Agent Spectrum Kernel Codex Repo Skill Projection

Codex reads Agent Spectrum Kernel repo-scoped skills from `.agents/skills`. Project only the skills needed for the adopting repository.

Each projected skill must remain traceable to the canonical source in this repository:

```text
skills/<skill-name>/SKILL.md -> .agents/skills/<skill-name>/SKILL.md
```

Do not rewrite the workflow logic into a Codex-only model. If a local project needs extra rules, add them as project-specific `AGENTS.md` guidance or a separate project overlay skill.

Broad/ambiguous entry profiles commonly project:

- `operating-mode-router`
- `skill-router`
- `test-first-verification`
- `controlled-implementation`
- `evidence-ledger`
- `risk-gate`
- `handoff-generation`

Generated implementation, investigation, verification, and handoff compact profiles skip the two upper routers because their entry mode/task class is already fixed. They still project the named primary Skill plus required verification, evidence, risk, and handoff contracts. Review keeps `review-router` because observed change signals determine its required gates.

Review projections should also include the review router and required gates listed in `adapters/codex/README.md`.

Full-layer intelligence projections are optional and should be selected by need:

- `engineering-pattern-ledger`
- `verification-pattern-ledger`
- `review-finding-compiler`
- `documentation-knowledge-compiler`
- `architecture-decision-memory`
- `engineering-capability-evaluation`

Do not project every ledger just to handle trivial tasks. Project them when the adopting repository wants reusable evidence-backed implementation, verification, review, documentation, architecture, or capability memory.
