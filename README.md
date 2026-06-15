# AI Coding Kernel + Skills v2

個人開発と社内紹介向けの、AIコーディングエージェント用ルールセットです。

狙いは「AIにたくさん書かせる」ことではなく、AIの開発行動を次の方向へ固定することです。

```text
Repository-aware
Scope-disciplined
Evidence-driven
Verification-first
Handoff-ready
Risk-gated
```

## 設計判断

```text
Kernel = 常時発火する判断OS
Skills = 必要時だけ呼ぶ工程・レビュー・検証プロセス
Project overlay = リポジトリ固有の規約・コマンド・禁止範囲
```

`AGENTS.md` は1ファイルに統合します。ここには、常に有効であるべき原則だけを置きます。

`skills/*/SKILL.md` は分割します。Grill、Spec、ADR、検証、レビュー、Handoffのような重い手順を常時ルールに混ぜないためです。

## File layout

```text
AGENTS.md
CUSTOM_INSTRUCTIONS.md
manifest.json
README.md
README.ja.md
CHANGELOG.md
docs/
  skill-matrix.md
  usage-ja.md
  workflow-examples.md
  project-overlay-template.md
  customization-guide.md
  quality-rubric.md
  validation-report.md
  references.md
examples/
  01-small-change.md
  02-new-feature.md
  03-bug-fix.md
  04-design-grill.md
  05-pr-review.md
  06-handoff-to-agent.md
skills/
  skill-router/SKILL.md
  repository-orientation/SKILL.md
  grill-design/SKILL.md
  grill-with-docs/SKILL.md
  spec-driven-development/SKILL.md
  planning-with-files/SKILL.md
  scope-control/SKILL.md
  controlled-implementation/SKILL.md
  test-first-verification/SKILL.md
  code-review-quality/SKILL.md
  risk-gate/SKILL.md
  adr-review/SKILL.md
  doubt-driven-development/SKILL.md
  evidence-ledger/SKILL.md
  handoff-generation/SKILL.md
```

## Minimum setup

1. Put `AGENTS.md` at the repository root or project instruction location.
2. Install or paste only the `SKILL.md` files your tool can use.
3. For small tasks, use only the kernel.
4. For non-trivial tasks, start from `skill-router` or invoke the specific skill directly.
5. Add project-specific rules as a separate overlay, not by bloating the kernel.

For tools that only support a single custom instruction field, use `CUSTOM_INSTRUCTIONS.md`.

## Recommended workflows

| Task | Use |
|---|---|
| 軽微な修正 | `AGENTS.md` only |
| 初見repo | `repository-orientation` |
| 実装方針の壁打ち | `grill-design` |
| docs/ADR/用語体系に関わる設計 | `grill-with-docs` |
| 新機能・挙動変更 | `spec-driven-development` → `controlled-implementation` → `test-first-verification` |
| バグ・原因不明 | `doubt-driven-development` → `test-first-verification` |
| スコープが広がりそう | `scope-control` |
| 危険操作・外部影響 | `risk-gate` |
| PR/diffレビュー | `code-review-quality` → `evidence-ledger` |
| 次のAgentへ渡す | `handoff-generation` |

## What changed from v1

- Added `Safety and External Effects` to the kernel.
- Added minimal skill routing inside `AGENTS.md` so routing does not depend only on a separate skill.
- Added `risk-gate` for destructive, irreversible, external, production, auth, secret, billing, dependency, and infra risks.
- Added `controlled-implementation` to cover the actual implementation loop between planning and verification.
- Strengthened every skill with exit criteria, failure modes, and evidence requirements.
- Added Japanese usage docs and workflow examples for personal/team adoption.
- Kept the original skill names from v1 where possible to avoid migration friction.

## Boundary

This set is intentionally generic. It does not encode Angular, React, Python, finance, infra, internal naming, branch strategy, or CI-specific conventions.

Add those as project overlays. Do not put them into the global kernel unless they must apply to every repository.

## Quality target

This v2 is optimized for personal development and internal introduction, not for public marketing. The quality target is:

```text
Kernel design:            95+
Skill separation:         95+
Agent operational safety: 95+
Verification discipline:  95+
Review/handoff utility:   95+
Personal/internal use:    95+
```

See `docs/quality-rubric.md` for the scoring rubric.
