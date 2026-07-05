# Codex Repo Skill Projection

Codex reads repo-scoped skills from `.agents/skills`. Project only the skills needed for the adopting repository.

Each projected skill must remain traceable to the canonical source in this repository:

```text
skills/<skill-name>/SKILL.md -> .agents/skills/<skill-name>/SKILL.md
```

Do not rewrite the workflow logic into a Codex-only model. If a local project needs extra rules, add them as project-specific `AGENTS.md` guidance or a separate project overlay skill.

Minimum common projections:

- `operating-mode-router`
- `skill-router`
- `test-first-verification`
- `controlled-implementation`
- `evidence-ledger`
- `risk-gate`
- `handoff-generation`

Review projections should also include the review router and required gates listed in `adapters/codex/README.md`.
