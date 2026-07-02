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

`AGENTS.md` は1ファイルに統合します。ここには、常に有効であるべき原則だけを置きます。実行時のルーティング正本は `skills/skill-router/SKILL.md` です。

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
  07-mr-readme.md
skills/
  skill-router/SKILL.md
  application-boundary-architecture/SKILL.md
  repository-orientation/SKILL.md
  grill-design/SKILL.md
  grill-with-docs/SKILL.md
  spec-driven-development/SKILL.md
  planning-with-files/SKILL.md
  scope-control/SKILL.md
  controlled-implementation/SKILL.md
  test-first-verification/SKILL.md
  review-router/SKILL.md
  review-automated-gate/SKILL.md
  review-ai-quality/SKILL.md
  review-architecture-impact/SKILL.md
  review-domain-impact/SKILL.md
  review-final-merge-gate/SKILL.md
  risk-gate/SKILL.md
  adr-review/SKILL.md
  doubt-driven-development/SKILL.md
  evidence-ledger/SKILL.md
  handoff-generation/SKILL.md
  mr-readme-generation/SKILL.md
```

## Minimum setup

1. Put `AGENTS.md` at the repository root or project instruction location.
2. Install or paste only the `SKILL.md` files your tool can use.
3. For small tasks, use only the kernel.
4. For non-trivial tasks, use `skill-router` as the canonical routing source or invoke an explicitly requested specific skill directly.
5. Add project-specific rules and skills as a separate overlay, not by bloating the kernel.

For tools that only support a single custom instruction field, use `CUSTOM_INSTRUCTIONS.md`.

## Recommended workflows

`skills/skill-router/SKILL.md` is the canonical routing source. The table below is a reference summary.

| Task | Use |
|---|---|
| 軽微な修正 | `AGENTS.md` only |
| 初見repo | `repository-orientation`（対象境界が曖昧なら `scope-control`、セッション/Agentを跨ぐかdurable stateが必要なら `planning-with-files`） |
| 実装方針の壁打ち | `grill-design` |
| docs/ADR/用語体系に関わる設計 | `grill-with-docs` |
| 実装前に未解決のアプリケーション境界・依存方向・DTO/Error/async lifetime判断 | `application-boundary-architecture` → 通常の実装ルートへ戻る |
| 新機能・挙動変更 | `spec-driven-development` → `controlled-implementation` → `test-first-verification` |
| バグ・原因不明 | `doubt-driven-development` → `test-first-verification` for reproduction → `controlled-implementation` → `test-first-verification` for regression proof |
| スコープが広がりそう | `scope-control`（実装へ進むなら `controlled-implementation`、レビューでは `review-router` → `review-ai-quality`） |
| 危険操作・外部影響 | `risk-gate` before the selected workflow proceeds to action |
| PR/diffレビュー | `review-router` → layer applicability → required gates（architecture impact は `review-architecture-impact`）→ `review-final-merge-gate` |
| MR/PR README・PR説明・変更文脈固定 | `mr-readme-generation` |
| 次のAgentへ渡す | `handoff-generation` |

Use `evidence-ledger` whenever final text makes or evaluates a claim about correctness, fixed behavior, no regression, readiness, performance, security, reliability, UX, cost, or maintainability.

## What changed from v1

- Added `application-boundary-architecture` for unresolved framework-agnostic boundary, dependency direction, DTO/error trust boundary, async lifetime, feature public API, and architecture guard decisions before returning to the normal implementation route.
- Added `Safety and External Effects` to the kernel.
- Added a minimal routing gate inside `AGENTS.md` that sends non-trivial workflow selection to `skill-router`.
- Added `risk-gate` for destructive, irreversible, external, production, auth, secret, billing, dependency, and infra risks.
- Added `controlled-implementation` to cover the actual implementation loop between planning and verification.
- Split PR review from one all-purpose skill into router, automated evidence, AI quality, domain impact, and final merge gates.
- Strengthened every skill with exit criteria, failure modes, and evidence requirements.
- Added Japanese usage docs and workflow examples for personal/team adoption.
- Kept the original skill names from v1 where possible to avoid migration friction.

## Boundary

This set is intentionally generic. It does not encode Angular, React, Python, finance, infra, internal naming, branch strategy, or CI-specific conventions.

Add those as project overlays. Do not put them into the global kernel unless they must apply to every repository.

When a project overlay contains framework/domain-specific skills, route in two steps:

```text
generic workflow selection via skill-router
-> project overlay skill selection when the overlay signal applies
```

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
