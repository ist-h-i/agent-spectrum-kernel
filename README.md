# AI Coding Kernel + Skills

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
Operating mode router = delivery / adoption / observability / operation の上位分類
Skills = 必要時だけ呼ぶ工程・レビュー・検証プロセス
Project overlay = リポジトリ固有の規約・コマンド・禁止範囲
```

`AGENTS.md` は1ファイルに統合します。ここには、常に有効であるべき原則だけを置きます。上位の運用モード選択は `skills/operating-mode-router/SKILL.md`、delivery/quality 内のルーティング正本は `skills/skill-router/SKILL.md` です。

`skills/operating-mode-router/SKILL.md` は、通常のdelivery/quality作業と、project adoption、observability/metrics、operation/automationを先に分ける上位routerです。`skills/skill-router/SKILL.md` はdelivery/quality内のrouterとして使います。

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
  routing-model.md
  metrics-event-contract.md
  ai/review-context.md
  ai/implementation-context.md
  ai/improvement-ledger.md
  ai/skill-adoption-metrics.md
  ai/adoption-report-template.md
  quickstart-ja.md
  prompt-recipes-ja.md
  glossary-ja.md
  skill-matrix.md
  usage-ja.md
  workflow-examples.md
  project-overlay-template.md
  stack-implementation-overlay-contract.md
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
  08-code-health-review.md
  09-improvement-ledger-update.md
  10-safe-refactor.md
  11-prevention-rule-feedback.md
skills/
  operating-mode-router/SKILL.md
  skill-router/SKILL.md
  angular-implementation-architecture/SKILL.md
  application-boundary-architecture/SKILL.md
  repository-orientation/SKILL.md
  grill-design/SKILL.md
  grill-with-docs/SKILL.md
  spec-driven-development/SKILL.md
  planning-with-files/SKILL.md
  project-adoption-pack-generation/SKILL.md
  scope-control/SKILL.md
  controlled-implementation/SKILL.md
  test-first-verification/SKILL.md
  release-readiness-gate/SKILL.md
  review-router/SKILL.md
  review-adversarial-risk/SKILL.md
  review-automated-gate/SKILL.md
  review-ai-quality/SKILL.md
  review-architecture-impact/SKILL.md
  review-context-generation/SKILL.md
  review-code-health/SKILL.md
  review-domain-impact/SKILL.md
  review-output-quality/SKILL.md
  review-final-merge-gate/SKILL.md
  risk-gate/SKILL.md
  skill-effectiveness-evaluation/SKILL.md
  skill-adoption-metrics/SKILL.md
  adr-review/SKILL.md
  doubt-driven-development/SKILL.md
  evidence-ledger/SKILL.md
  handoff-generation/SKILL.md
  improvement-ledger/SKILL.md
  implementation-context-generation/SKILL.md
  mr-readme-generation/SKILL.md
  refactor-implementation/SKILL.md
```

## Minimum setup

1. Put `AGENTS.md` at the repository root or project instruction location.
2. Install or paste only the `SKILL.md` files your tool can use.
3. For small tasks, use only the kernel.
4. For non-trivial tasks, use `operating-mode-router` when the operating layer is unclear, then use `skill-router` for delivery/quality work or invoke an explicitly requested specific skill directly.
5. Add project-specific rules and skills as a separate overlay, not by bloating the kernel.

For tools that only support a single custom instruction field, use `CUSTOM_INSTRUCTIONS.md`.

## 3分で使う / Quick start

First-time users should start with `docs/quickstart-ja.md`.

- `docs/quickstart-ja.md`: minimum install path, skill-aware / non-skill-aware setup, first prompts.
- `docs/prompt-recipes-ja.md`: copy-paste requests organized by what the user wants to do.
- `docs/glossary-ja.md`: operational definitions for Kernel, Skill, Gate, overlay, context, and contract terms.
- `docs/routing-model.md`: operating-mode routing and skill group model.
- `docs/usage-ja.md`: representative usage guide for common operating patterns.
- `docs/skill-matrix.md`: reference matrix for workflow selection.

## Recommended workflows

`skills/operating-mode-router/SKILL.md` first separates delivery/quality, adoption/bootstrap, observability/metrics, and operation/automation. `skills/skill-router/SKILL.md` is the delivery/quality routing source. The table below is a reference summary.

| Task | Use |
|---|---|
| 軽微な修正 | `AGENTS.md` only |
| operating mode が曖昧 | `operating-mode-router` |
| project adoption / first-time rollout | `operating-mode-router` → `project-adoption-pack-generation` |
| 初見repo | `repository-orientation`（対象境界が曖昧なら `scope-control`、セッション/Agentを跨ぐかdurable stateが必要なら `planning-with-files`） |
| 実装方針の壁打ち | `grill-design` |
| docs/ADR/用語体系に関わる設計 | `grill-with-docs` |
| 実装前に未解決のアプリケーション境界・依存方向・DTO/Error/async lifetime判断 | `application-boundary-architecture` → 通常の実装ルートへ戻る |
| 新機能・挙動変更 | `spec-driven-development` → `test-first-verification` for Verification Contract → `controlled-implementation` → `test-first-verification` for evidence |
| バグ・原因不明 | `doubt-driven-development` → `test-first-verification` for reproduction and Verification Contract → `controlled-implementation` → `test-first-verification` for regression proof |
| 承認済みリファクタ実装 | `refactor-implementation` → `test-first-verification` for regression proof |
| スコープが広がりそう | `scope-control`（実装へ進むなら `controlled-implementation`、レビューでは `review-router` → required gates） |
| 危険操作・外部影響 | `risk-gate` before the selected workflow proceeds to action |
| 繰り返し実装文脈の固定 | `implementation-context-generation`（既定: `docs/ai/implementation-context.md`） |
| PR/diffレビュー | `review-router` → layer applicability → required gates（architecture impact は `review-architecture-impact`、output quality は `review-output-quality`、adversarial risk は `review-adversarial-risk`）→ `review-final-merge-gate` |
| リリース候補のready判定 | `release-readiness-gate`（deploy / publish / migration / external notification / release execution は `risk-gate` と明示承認が先） |
| 負債・スメル・リファクタ候補レビュー | `review-router` → `review-code-health` when applicable |
| non-blockingな改善候補の台帳化 | `improvement-ledger` |
| skill選択やworkflow効果のふりかえり | `operating-mode-router` → `skill-effectiveness-evaluation` |
| adoption maturity / instruction quality / adoption impact measurement | `operating-mode-router` → `skill-adoption-metrics` |
| weekly/monthly adoption report | `operation_automation` layer + report templates; scheduling is external |
| 繰り返しレビュー文脈の固定 | `review-context-generation`（既定: `docs/ai/review-context.md`） |
| MR/PR README・PR説明・変更文脈固定 | `mr-readme-generation` |
| 次のAgentへ渡す | `handoff-generation` |

Use `evidence-ledger` whenever final text makes or evaluates a claim about correctness, fixed behavior, no regression, readiness, performance, security, reliability, UX, cost, or maintainability.

## What changed from v1

- Added `operating-mode-router` and `docs/routing-model.md` so the system first separates delivery/quality, adoption/bootstrap, observability/metrics, and operation/automation.
- Added skill group metadata to `manifest.json` and validation coverage for unclassified, unknown, duplicate, and unsupported multi-group skills.
- Added `project-adoption-pack-generation` for first-time repository or team rollout.
- Added `skill-effectiveness-evaluation` for one-task workflow retrospective evaluation.
- Added `skill-adoption-metrics`, `docs/metrics-event-contract.md`, `docs/ai/skill-adoption-metrics.md`, and adoption report templates for opt-in adoption measurement.
- Added `release-readiness-gate` for release package readiness checks across scope, validation, rollback, monitoring, post-release verification, customer impact, communication, approvals, and residual risks.
- Added `application-boundary-architecture` for unresolved framework-agnostic boundary, dependency direction, DTO/error trust boundary, async lifetime, feature public API, and architecture guard decisions before returning to the normal implementation route.
- Added `review-context-generation`, `review-output-quality`, and `review-adversarial-risk` so context-heavy review layers have dedicated gates instead of being collapsed into AI quality review.
- Added `implementation-context-generation` so repeated implementation tasks can reuse evidence-labeled stack, command, pattern, boundary, and stop-condition context without embedding framework-specific rules.
- Added `Safety and External Effects` to the kernel.
- Added a minimal routing gate inside `AGENTS.md` that sends operating-mode ambiguity to `operating-mode-router` and delivery/quality workflow selection to `skill-router`.
- Added `risk-gate` for destructive, irreversible, external, production, auth, secret, billing, dependency, and infra risks.
- Added `controlled-implementation` to cover the actual implementation loop between planning and verification.
- Split PR review from one all-purpose skill into router, automated evidence, AI quality, domain impact, and final merge gates.
- Strengthened every skill with exit criteria, failure modes, and evidence requirements.
- Added Japanese usage docs and workflow examples for personal/team adoption.
- Kept the original skill names from v1 where possible to avoid migration friction.

## Boundary

The kernel and generic workflows are intentionally stack-agnostic. They do not encode Angular, React, Python, finance, infra, internal naming, branch strategy, or CI-specific conventions as always-on rules.

Add those as project overlays or stack implementation overlays. The included `angular-implementation-architecture` skill is the first concrete stack overlay and is selected only after the generic workflow when Angular signals apply. Do not put stack-specific rules into the global kernel unless they must apply to every repository.

When a project overlay contains framework/domain-specific skills, route in layered steps:

```text
operating mode selection via operating-mode-router when needed
-> generic delivery/quality workflow selection via skill-router
-> project overlay skill selection when the overlay signal applies
```
