# Agent Spectrum Kernel

A layered intelligence kernel for evidence-based routing, verification, review, and reusable memory in AI coding agents.

AIエージェントが扱う要件・設計・実装・検証・レビュー・知識蓄積の複数スペクトラムを、証拠ベースで接続するKernel。

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

共通の制御メタデータ（route、evidence status、stop reason、next action）の正本は `docs/execution-envelope-contract.md` です。router、adapter、session state はこの Execution Envelope を意味のあるworkflow境界で一度だけ出し、個別SkillはRequirement Contract、Spec、Verification Contract、Implementation Summary、Review Findingsなどの固有artifactに集中します。Metrics event candidate は明示的なopt-in時だけ任意で出します。

claim に必要な lifecycle evidence の接続は `docs/lifecycle-traceability-contract.md` が正本です。Requirement から Release Readiness までを stable item ref と observed revision で必要な範囲だけ結び、stale・contradictory・claim-relevant missing evidence を検出します。release gap は acceptance / verification / review / approval / rollback を区別します。trivial/localized task のtrace免除には観測事実が必要で、approvalやrisk gateは免除されません。中央serverやworkflow databaseは不要です。

`manifest.json.routing` は routing の正本や workflow engine ではありません。machine-readable defaults / validation mirror として、route reference、override、risk-gate surface、adapter capability downgrade の静的検査を支えます。人間向けの手順は `SKILL.md` に残し、route mismatch は risk-gate 以外の自動blockにしません。

`manifest.json.skill_planes` は各canonical Skillを `execution`、`knowledge`、`control` のいずれか1つに分類します。通常作業はexecution/control内で完結し、knowledgeへの遷移には明示的なlifecycle trigger、destination、evidence boundary、owner、stop conditionが必要です。単に実装やレビューが完了しただけではledgerを更新しません。`manifest.json.projection_packs` は、knowledge planeを省いた `daily_delivery` と、明示的な組織知運用向けの `organizational_intelligence` を定義します。

Pack profileは厳密な発見境界です。`full` / `organizational` から `daily` への縮小にはadapter installerの `--prune` が必要で、未指定時は書込み前に停止します。install stateは実際の集合から `selected_planes` / `installed_planes` を分けて算出し、`--skills` はcustom selectionとして記録します。routerはactive stateの `selected_skills` にないSkillへ進まず、`capability_missing` で必要profileまたはoverrideを案内します。

`skills/*/SKILL.md` は分割します。Grill、Spec、ADR、検証、レビュー、Handoffのような重い手順を常時ルールに混ぜないためです。

## File layout

```text
AGENTS.md
CUSTOM_INSTRUCTIONS.md
manifest.json
README.md
CHANGELOG.md
docs/
  routing-model.md
  lifecycle-artifact-contract.md
  lifecycle-traceability-contract.md
  fixtures/lifecycle-artifact-chains.json
  fixtures/lifecycle-traceability-chains.json
  agent-session-state-contract.md
  metrics-event-contract.md
  observability-runtime-contract.md
  operation-automation-contract.md
  debt-lifecycle-contract.md
  adapter-conformance-contract.md
  adapter-capability-matrix.md
  adapter-runtime-boundary-contract.md
  adapter-runtime-migration.md
  adapter-cross-conformance-report.md
  fixtures/adapter-runtime-bundle.json
  fixtures/adapter-cross-conformance.json
  fixtures/adapter-runtime-profiles.json
  fixtures/adapter-runtime-evidence.json
  claude-github-review-setup.md
  ai/review-context.md
  ai/implementation-context.md
  ai/architecture-decision-memory.md
  ai/documentation-knowledge-ledger.md
  ai/engineering-capability-ledger.md
  ai/engineering-pattern-ledger.md
  ai/improvement-ledger.md
  ai/domain-rule-ledger.md
  ai/review-rule-ledger.md
  ai/skill-adoption-metrics.md
  ai/verification-pattern-ledger.md
  ai/adoption-report-template.md
  ai/stakeholder-readiness-report-template.md
  ai/observability-config.yml
  ai/metrics/README.md
  ai/reports/README.md
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
  12-claude-adapter-adoption.md
schemas/
  metrics-event.schema.json
  adapter-runtime-profile.schema.json
  adapter-runtime-evidence.schema.json
  adapter-runtime-event.schema.json
  normalized-event-schema-registry.json
  adoption-report.schema.json
  improvement-ledger-entry.schema.json
  domain-rule-ledger-entry.schema.json
  architecture-decision-memory-entry.schema.json
  documentation-knowledge-ledger-entry.schema.json
  engineering-capability-ledger-entry.schema.json
  engineering-pattern-ledger-entry.schema.json
  review-rule-ledger-entry.schema.json
  verification-pattern-ledger-entry.schema.json
adapters/
  claude-code/
    project/.claude/
    github-actions/
    plugin/
  codex/
    project/.agents/skills/
    prompts/
    commands/
scripts/
  ask-doctor.mjs
  ask-sensors.mjs
  execution-envelope.mjs
  adapter-runtime-event.mjs
  adapter-runtime-smoke.mjs
  adapter-runtime-bundle.mjs
  adapter-cross-conformance.mjs
  codex-exec-runner.mjs
  install-kernel.mjs
  install-codex-adapter.mjs
  install-claude-adapter.mjs
  ai-metrics-record.mjs
  ai-metrics-summarize.mjs
  ai-ledger-refresh.mjs
  ask-benchmark.mjs
  test-ask-benchmark.mjs
benchmarks/
  README.md
  protocol.md
  checkpoint-b.config.json
  schemas/
  fixtures/
  results/
skills/
  operating-mode-router/SKILL.md
  skill-router/SKILL.md
  angular-implementation-architecture/SKILL.md
  application-boundary-architecture/SKILL.md
  architecture-decision-memory/SKILL.md
  repository-orientation/SKILL.md
  grill-design/SKILL.md
  grill-with-docs/SKILL.md
  spec-driven-development/SKILL.md
  planning-with-files/SKILL.md
  project-adoption-pack-generation/SKILL.md
  scope-control/SKILL.md
  controlled-implementation/SKILL.md
  documentation-knowledge-compiler/SKILL.md
  domain-rule-ledger/SKILL.md
  engineering-capability-evaluation/SKILL.md
  engineering-pattern-ledger/SKILL.md
  test-first-verification/SKILL.md
  verification-pattern-ledger/SKILL.md
  release-readiness-gate/SKILL.md
  review-router/SKILL.md
  review-adversarial-risk/SKILL.md
  review-automated-gate/SKILL.md
  review-ai-quality/SKILL.md
  review-architecture-impact/SKILL.md
  review-context-generation/SKILL.md
  review-code-health/SKILL.md
  review-domain-impact/SKILL.md
  review-finding-compiler/SKILL.md
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
  next-best-change-finder/SKILL.md
  refactor-implementation/SKILL.md
  requirement-grill/SKILL.md
  review-to-rule-compiler/SKILL.md
  work-package-compiler/SKILL.md
```

## Comparative benchmark

`benchmarks/` contains the preregistered Checkpoint B comparison for Plain Agent, Kernel-only, and Full ASK. It covers review and medium-complexity implementation fixtures, keeps raw prompts and full outputs outside the repository, records unavailable measurements as `null`, and compares Full ASK directly against Kernel-only.

```bash
node scripts/ask-benchmark.mjs validate
node scripts/test-ask-benchmark.mjs
```

See `benchmarks/protocol.md` for frozen thresholds, blinding, evaluator rules, privacy boundaries, and the separate post-#179 Checkpoint C rerun.

The first measured Checkpoint B result is in `benchmarks/results/checkpoint-b-report.md`; its normalized machine-readable evidence is in `benchmarks/results/checkpoint-b-2026-07-12.json`.

Checkpoint B2 adds two medium-hard and two hard fixtures to test cross-file contracts, concurrency, atomic rollback, idempotency, false-positive control, and scope discipline without overwriting the original baseline:

```bash
node scripts/ask-benchmark.mjs validate --config benchmarks/checkpoint-b2.config.json
node scripts/test-ask-benchmark.mjs
```

The measured B2 result is in `benchmarks/results/checkpoint-b2-report.md`. In this bounded run, Kernel-only improved the hard transfer fixture from 76.9% to 100%, while Full ASK added no quality over Kernel-only and more than doubled tokens on all four fixtures.

## Minimum setup

1. Put `AGENTS.md` at the repository root or project instruction location.
2. Install or paste only the `SKILL.md` files your tool can use.
3. For small tasks, use only the kernel.
4. For non-trivial tasks, use `operating-mode-router` when the operating layer is unclear, then use `skill-router` for delivery/quality work or invoke an explicitly requested specific skill directly.
5. Add project-specific rules and skills as a separate overlay, not by bloating the kernel.

From this repository, the generic core installer can project and later update the kernel and canonical skills in an adopting repository:

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
```

When this repository is updated, pull the new revision and rerun the installer:

```bash
git pull
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
```

The installer writes only local files, records `.agent-spectrum-kernel/install-state.json`, reports stale managed skill projections, and uses three-way update safety: managed files are updated only when the target still matches the previous managed hash, unless `--force` is used. `--check`, `--dry-run`, `--prune`, `--rollback`, and `--detach` are supported lifecycle commands. `--detach` removes ASK execution surfaces while preserving project-owned content.

For tools that only support a single custom instruction field, use `CUSTOM_INSTRUCTIONS.md`.

## Claude Code adapter

For Claude Code, use the local-first adapter instead of changing core skills.

```bash
node scripts/install-kernel.mjs --target /path/to/project --merge-agents
node scripts/install-claude-adapter.mjs --target /path/to/project
```

Recommended adoption path:

```text
1. Install core kernel/skills with `scripts/install-kernel.mjs`.
2. Install the Claude project adapter or optional plugin.
3. Enable local hooks for project-local observability.
4. Use Pattern B @claude review GitHub Actions only when PR-level shared review is needed.
5. Generate local weekly/monthly adoption and debt reports.
```

The Claude installer requires the core install state, then updates profile-selected `.claude/skills`, `.claude/commands`, command-required docs/assets, local runtime scripts, and managed hooks in `.claude/settings.json`. It does not use `.claude/hooks/hooks.json` as the project hook source of truth.

The Claude adapter records `.agent-spectrum-kernel/claude-install-state.json` with the same lifecycle schema as the core and Codex installers, including managed hook identifiers and partial-file hashes for `.claude/settings.json`. It supports `--check`, `--dry-run`, `--prune`, `--force`, `--rollback`, and `--detach`; detach removes projected Claude execution surfaces and adapter-owned hooks while preserving local metrics, reports, and ledgers by default.

Supported Claude profiles are `daily`, `organizational`, `implementation`, `investigation`, `review`, `observability`, and `full`. `daily` projects the manifest `daily_delivery` pack; `organizational` projects `organizational_intelligence`. The default remains `full` for compatibility; narrow profiles are closed over command requirements and router-reachable skills. Use `--skills <csv>` only as an advanced override; the installer fails before writing files when the override is not closed.

`--skip-runtime` also skips/removes adapter-owned metrics hooks. `--skip-hooks` skips/removes hooks but still installs runtime scripts. The optional plugin may be combined with the project adapter; plugin hooks resolve through `CLAUDE_PLUGIN_ROOT` and no-op when the project runtime is absent.

Defaults are project-local: no external publication, no raw prompt storage, no secrets/customer/personal data storage, and no full file contents or full command output in metrics events.

Deployment readiness is stateful. File projection only proves `Installed`; `Activated` and `Operational` require profile selection, approval boundaries, runtime health, and task evidence as defined in `docs/adapter-deployment-governance.md`.

## Codex adapter

For Codex, use the prompt-driven adapter in `adapters/codex/`.

The Codex adapter projects the core `AGENTS.md`, selected canonical skills, and generated compact explicit-entry profiles into Codex-compatible repository surfaces, including `.agents/skills`, `.agents/prompts`, and `codex exec` command patterns.

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
node scripts/install-codex-adapter.mjs --target /path/to/adopting-repo
```

The core installer owns `AGENTS.md`; the Codex installer updates profile-selected `.agents/skills`, `.agents/prompts`, `.agents/commands`, and `.agent-spectrum-kernel/codex-install-state.json`. The default profile is `implementation`, not every manifest skill. Supported profiles are `daily`, `organizational`, `minimal`, `implementation`, `investigation`, `review`, `adoption`, `observability`, and `full`.

Use `--profile <name>` for normal installs. Use `--skills <csv>` only as an advanced override; the installer fails before writing files when the override is not closed over required skills for the selected prompts, commands, router-reachable routes, and dependencies of the specified skills.

The Codex installer uses the shared lifecycle semantics: `--check`, `--dry-run`, `--prune`, `--force`, `--rollback`, and `--detach` are available, and locally modified managed files are not overwritten without `--force`.

Implementation, investigation, review, verification, and handoff prompt profiles bind canonical revision/source digests and critical fallback controls. A fixed entry skips unnecessary upper routers; the runner reports requested, projected, compact-profile load, unavailable Codex Skill-load evidence, and applied output-contract evidence separately.

The Codex adapter is intentionally smaller than the Claude Code adapter: no hooks, no local metrics sidecar, no shared PR workflow, and no external publication path are provided. Capability claims are downgraded in `docs/adapter-capability-matrix.md`.

## Dual-runtime generation and conformance

The canonical source can generate one deterministic bundle covering the common Claude/Codex profiles without treating either adapter projection as a second workflow truth:

```bash
node scripts/adapter-runtime-bundle.mjs --check
node scripts/adapter-runtime-bundle.mjs --write
node scripts/adapter-cross-conformance.mjs
node scripts/test-adapter-runtime-event.mjs
node scripts/test-adapter-runtime-migration.mjs
```

`docs/fixtures/adapter-runtime-bundle.json` binds the common profile projections to one canonical union digest while retaining each adapter's own subset digest, renderer fingerprint, and managed inventory. The nine same-fixture checks independently derive normalized contract meaning from each renderer's generated command or prompt bytes before comparing the results. Mutation fixtures remove approval/stop, verification, final-review, executable-handoff, and knowledge-promotion bytes and must fail closed. Claude metrics events and Codex runner reports are mapped through `scripts/adapter-runtime-event.mjs` and validated against `schemas/adapter-runtime-event.schema.json`. Their current conformance evidence level is `projected`; external runtime loading and behavioral conformance remain unavailable until bounded Claude/Codex runs are captured.

Upgrade, rollback, profile shrink, coexistence, and detach guidance is in `docs/adapter-runtime-migration.md`. The post-architecture Checkpoint C handoff preserves the B/B2 baselines and requires architecture, model, CLI, adapter, and repository changes to be attributed separately.

## Doctor and sensors

Use `ask-doctor` after first adoption, kernel updates, adapter installation, skill projection refresh, or suspected installation drift:

```bash
node scripts/ask-doctor.mjs --target /path/to/adopting-repo
node scripts/ask-doctor.mjs --target /path/to/adopting-repo --runtime-probe
```

Doctor reports installation health. It is not a per-task gate, and a failure downgrades setup/readiness claims rather than blocking read-only investigation or local verification. Exit code 1 means installation health failed; it does not prohibit normal read-only investigation or local verification.

The optional runtime probe adds local/static/dry-run adapter conformance checks for projected command/template directories, skill readability, adapter config shape, visible command/template references, hook executable resolution, event-store availability, and report inputs. Runtime probe findings are reported separately from installation health and downgrade runtime conformance/readiness claims only. Passing the probe is not proof that Claude, Codex, GitHub Actions, deployment, network, or product/client readiness works.

Use the explicit smoke runner when you want a local runtime write check:

```bash
node scripts/adapter-runtime-smoke.mjs --target /path/to/adopting-repo --adapter claude
```

For Codex non-interactive runs, use the installed bounded runner instead of invoking `codex exec` directly:

```bash
cd /path/to/adopting-repo
node ./scripts/codex-exec-runner.mjs --prompt skill-implement.md --mode implementation
```

The Codex runner can report `executed` after capturing output and running `ask-sensors`; this evidences only the inspected output contract. It does not prove workflow, risk/approval, or verification-contract application, business correctness, product readiness, or no regression.

After classifying the task, pass `--gates-observed` when no task-specific gate applies, or `--required-gate <id>` for each required gate. Review runs include `review-final-merge-gate` from the managed prompt contract. Missing gate observation is recorded as missing evidence; an explicitly required `risk-gate` without specific-action approval stops before Codex invocation.

Use `ask-sensors` to classify control risks in an implementation or review output:

```bash
node scripts/ask-sensors.mjs --target /path/to/repo --mode implementation --input final-output.txt
node scripts/ask-sensors.mjs --target /path/to/repo --mode review --input review-output.txt
```

Sensors are initial report-only checks. They detect control failures such as missing completion sections, missing review decision/signal-gate sections, risk surfaces, unsupported adapter capability claims, and evidence phrases without evidence. They do not prove business correctness. `fail` restricts unsupported completion/readiness/safety/merge claims; `hard_stop` is limited to AGENTS approval-required actions.

## 3分で使う / Quick start

First-time users should start with `docs/quickstart-ja.md`.

- `docs/quickstart-ja.md`: minimum install path, skill-aware / non-skill-aware setup, first prompts.
- `docs/prompt-recipes-ja.md`: copy-paste requests organized by what the user wants to do.
- `docs/glossary-ja.md`: operational definitions for Kernel, Skill, Gate, overlay, context, and contract terms.
- `docs/routing-model.md`: operating-mode routing and skill group model.
- `docs/execution-envelope-contract.md`: shared Execution Envelope source of truth for routing, evidence, stop reasons, and next actions.
- `docs/usage-ja.md`: representative usage guide for common operating patterns.
- `docs/skill-matrix.md`: reference matrix for workflow selection.
- `docs/adapter-conformance-contract.md`, `docs/adapter-capability-matrix.md`, `docs/adapter-deployment-governance.md`, and `docs/adapter-runtime-migration.md`: adapter portability, capability evidence, supported deployment profiles, migration, rollback, and operational governance.
- Full-layer intelligence ledger templates: `docs/ai/engineering-pattern-ledger.md`, `docs/ai/verification-pattern-ledger.md`, `docs/ai/review-rule-ledger.md`, `docs/ai/documentation-knowledge-ledger.md`, `docs/ai/architecture-decision-memory.md`, and `docs/ai/engineering-capability-ledger.md`.
- `docs/ai/stakeholder-readiness-report-template.md`: stakeholder-specific readiness reports that separate internal quality, release readiness, and client-value readiness.
- `docs/ai/reports/examples/`: fixture-backed stakeholder-readiness samples for senior engineering, development management, business unit, and AI promotion views.

## Skill名を知らない入口

通常の利用者はSkill名を覚える必要はありません。やりたい作業を自然文で依頼し、内部では `operating-mode-router` と `skill-router` が必要なrouteを選びます。

```text
この作業を適切なルートで進めてください。
```

より明示したい場合:

```text
この依頼を、必要なルートを選んで進めてください。
既存のdocs、repo、domain rules、context、ledgerで判断できるものは吸収し、
人間判断が必要なものだけ明示してください。
作業が進められる場合は、次に必要な実装・検証・レビュー・ドキュメント作成まで案内してください。
```

| User wants to... | Say this | System should route to... |
|---|---|---|
| Move a ticket forward | このチケットを進めて | requirement / work package / implementation route |
| Review a PR | このPRをレビューして | review-router and required gates |
| Investigate a bug | このバグを調べて | doubt-driven-development and verification route |
| Refine a design | この設計を詰めて | design / architecture route |
| Prepare agent work | Codexに渡せる形にして | work-package route |
| Preserve lessons | この指摘を次に活かして | finding / ledger / documentation route |

Default outputs should describe the selected work mode, user-facing route, missing evidence, human-decision points, internal route, and next action. Skill names may appear in the internal route for debugging, but the user-facing route should stay in work terms.

## Recommended workflows

`skills/operating-mode-router/SKILL.md` first separates delivery/quality, adoption/bootstrap, observability/metrics, and operation/automation. `skills/skill-router/SKILL.md` is the procedural delivery/quality routing source. The table below is a reference summary.

| Task | Use |
|---|---|
| 軽微な修正 | `AGENTS.md` only |
| operating mode が曖昧 | `operating-mode-router` |
| project adoption / first-time rollout | `operating-mode-router` → `project-adoption-pack-generation` |
| 初見repo | `repository-orientation`（対象境界が曖昧なら `scope-control`、セッション/Agentを跨ぐかdurable stateが必要なら `planning-with-files`） |
| 次にやるべき変更候補探索 | `next-best-change-finder` → 原則 `requirement-grill` |
| 業務意図・成功条件・責任境界が曖昧 | `requirement-grill` |
| 確定済み要件をAgent-ready taskへ変換 | `work-package-compiler` |
| 実装方針の壁打ち | `grill-design` |
| docs/ADR/用語体系に関わる設計 | `grill-with-docs` |
| 実装前に未解決のアプリケーション境界・依存方向・DTO/Error/async lifetime判断 | `application-boundary-architecture` → 通常の実装ルートへ戻る |
| 再利用可能な実装patternを台帳化 | `engineering-pattern-ledger` |
| 再利用可能な検証patternを台帳化 | `verification-pattern-ledger` |
| ADR未満のarchitecture decision memory | `architecture-decision-memory`（ADRが必要なら `adr-review`） |
| 新機能・挙動変更 | `spec-driven-development` → `test-first-verification` for Verification Contract → `controlled-implementation` → `test-first-verification` for evidence |
| バグ・原因不明 | `doubt-driven-development` → `test-first-verification` for reproduction and Verification Contract → `controlled-implementation` → `test-first-verification` for regression proof |
| 承認済みリファクタ実装 | `refactor-implementation` → `test-first-verification` for regression proof |
| スコープが広がりそう | `scope-control`（実装へ進むなら `controlled-implementation`、レビューでは `review-router` → required gates） |
| 危険操作・外部影響 | `risk-gate` before the selected workflow proceeds to action |
| 繰り返し実装文脈の固定 | `implementation-context-generation`（既定: `docs/ai/implementation-context.md`） |
| PR/diffレビュー | `review-router` → observed change signals → required gates（architecture impact は `review-architecture-impact`、output quality は `review-output-quality`、adversarial risk は `review-adversarial-risk`）→ `review-final-merge-gate` |
| 繰り返し/高impact review findingsを予防知識へ変換 | `review-finding-compiler` |
| 既存要件・業務ルールとの照合 | `review-domain-impact`（Requirement Contract / Work Package / Domain Rule Ledger を入力にできる） |
| リリース候補のready判定 | `release-readiness-gate`（deploy / publish / migration / external notification / release execution は `risk-gate` と明示承認が先） |
| 負債・スメル・リファクタ候補レビュー | `review-router` → `review-code-health` when applicable |
| non-blockingな改善候補の台帳化 | `improvement-ledger` |
| 業務ルール台帳の作成・更新 | `domain-rule-ledger` |
| レビューや人間の訂正から業務ルール候補を抽出 | `review-to-rule-compiler` |
| skill選択やworkflow効果のふりかえり | `operating-mode-router` → `skill-effectiveness-evaluation` |
| adoption maturity / instruction quality / adoption impact measurement | `operating-mode-router` → `skill-adoption-metrics` |
| full-layer engineering capabilityを証拠付きで評価 | `operating-mode-router` → `engineering-capability-evaluation` |
| weekly/monthly adoption report | `operation_automation` layer + report templates; scheduling is external |
| 繰り返しレビュー文脈の固定 | `review-context-generation`（既定: `docs/ai/review-context.md`） |
| MR/PR README・PR説明・変更文脈固定 | `mr-readme-generation` |
| docs/ADR/PR/handoffからdurable knowledgeを抽出 | `documentation-knowledge-compiler` |
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
- Added the Requirement-to-Rule Loop: `next-best-change-finder`, `requirement-grill`, `work-package-compiler`, `review-to-rule-compiler`, `domain-rule-ledger`, and enhanced `review-domain-impact` input handling.
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
