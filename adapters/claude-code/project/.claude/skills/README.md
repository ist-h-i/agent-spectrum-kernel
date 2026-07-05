# Project Skill Projection

This directory is populated by `scripts/install-claude-adapter.mjs`.

The installer copies canonical core skills from `skills/<skill>/SKILL.md` into `.claude/skills/<skill>/SKILL.md` of an adopting project so Claude Code can invoke them as project-local slash commands.

The default projection includes delivery workflow routing skills, the full review gate set referenced by `review-router` and `review-final-merge-gate`, plus evidence, risk, ADR, improvement-ledger, and adoption-metrics support skills.

Do not maintain divergent skill logic here. Update projected skills by rerunning the installer from the canonical repository.
