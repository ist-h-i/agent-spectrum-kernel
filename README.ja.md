# Agent Spectrum Kernel 日本語ガイド

Agent Spectrum Kernel は、AIコーディングエージェント向けに、要件・設計・実装・検証・レビュー・知識蓄積の複数スペクトラムを証拠ベースで接続するKernelです。

目的は「AIにたくさん書かせること」ではなく、次の失敗を減らすことです。

- リポジトリを読まずに実装する
- 要件を勝手に補完する
- 変更範囲を広げる
- 検証していないのに完了扱いする
- “改善した / 安全 / production-ready” のような主張を根拠なしに出す
- 次のAgentや人間が引き継げない状態で終わる

## 構成

```text
AGENTS.md      常時発火する軽量Kernel
skills/        必要時だけ使うワークフロー
examples/      使い方の短い例
docs/          運用・カスタマイズ・採点基準
schemas/       metrics / report / ledger entry のmachine-readable schema
adapters/      Claude Code adapter と Codex adapter
scripts/       validation、Claude adapter install、local observability runtime
```

## 3分で使う

初回利用者は `docs/quickstart-ja.md` から始めてください。

- `docs/quickstart-ja.md`: 最小導入、Skill対応/非対応ツール、最初にAIへ言うこと。
- `docs/prompt-recipes-ja.md`: やりたいこと別のcopy-paste依頼文。
- `docs/glossary-ja.md`: Kernel、Skill、Gate、overlay、context、contractの用語集。
- `docs/routing-model.md`: operating mode と skill group metadata の説明。
- `docs/usage-ja.md`: 代表的な使い分けと運用ガイド。
- `docs/skill-matrix.md`: workflow選択の一覧。
- `docs/adapter-conformance-contract.md` / `docs/adapter-capability-matrix.md`: adapterの移植性とcapability evidence。
- `docs/ai/stakeholder-readiness-report-template.md`: internal quality、release readiness、client-value readinessを分けるstakeholder別report template。
- `docs/ai/domain-rule-ledger.md`: 業務ルールを証拠状態付きで残す台帳template。
- `docs/ai/engineering-pattern-ledger.md` / `docs/ai/verification-pattern-ledger.md` / `docs/ai/review-rule-ledger.md` / `docs/ai/documentation-knowledge-ledger.md` / `docs/ai/architecture-decision-memory.md` / `docs/ai/engineering-capability-ledger.md`: full-layer engineering intelligence の台帳template。

## Skill名を知らない入口

通常の依頼では、Skill名を覚えずに「やりたい作業」を言えばよいです。内部ではrouteを選び、外向きには作業モード、根拠不足、人間判断、次アクションを説明します。

短い依頼:

```text
この作業を適切なルートで進めてください。
```

丁寧な依頼:

```text
この依頼を、必要なルートを選んで進めてください。
既存のdocs、repo、domain rules、context、ledgerで判断できるものは吸収し、
人間判断が必要なものだけ明示してください。
作業が進められる場合は、次に必要な実装・検証・レビュー・ドキュメント作成まで案内してください。
```

| やりたいこと | こう言う | 内部で選ぶroute |
|---|---|---|
| チケットを前に進める | このチケットを進めて | 要件確認 / 実装準備 / 実装route |
| PRをレビューする | このPRをレビューして | review-router and required gates |
| バグ原因を調べる | このバグを調べて | doubt-driven-development and verification route |
| 設計を詰める | この設計を詰めて | design / architecture route |
| Agent-readyにする | Codexに渡せる形にして | work-package route |
| 指摘を次に活かす | この指摘を次に活かして | finding / ledger / documentation route |

Skill名は内部routeやdebug説明では出してよいですが、通常のUser-facing routeと `Next action` は作業用語で書きます。

## 使い分け

判断基準は単純です。

```text
ボタン文言修正でも常に必要 → AGENTS.md
状況によって必要 → Skill
プロジェクト固有 → 追加AGENTS.mdまたはプロジェクト固有Skill
```

## 最小導入

1. `AGENTS.md` を対象repoのルートに置く。
2. AIコーディングツールのプロジェクト指示として読ませる。
3. 普段はKernelだけで使う。上位routingは `skills/operating-mode-router/SKILL.md`、delivery/quality内の正本は `skills/skill-router/SKILL.md`。
4. 重い作業ではSkill名を明示して呼ぶ。

Claude Code の推奨導入:

```bash
node scripts/install-claude-adapter.mjs --target /path/to/project
```

推奨順:

```text
1. core kernel / skills を入れる
2. Claude project adapter または optional plugin を入れる
3. local hooks で project-local observability を有効にする
4. PR共有が必要なときだけ Pattern B @claude review GitHub Actions を使う
5. local events / improvement ledger から週次・月次reportを生成する
```

Local hooks がdefaultです。GitHub Actionsは任意のPR共有adapterであり、常時PR reviewやlocal observabilityの代替ではありません。metricsは既定でproject-local、raw prompt / secret / customer data / personal data / full file contents / full command output / external publication は既定offです。

Codex の推奨入口:

```text
adapters/codex/README.md
adapters/codex/prompts/
adapters/codex/commands/codex-exec.md
```

Codex adapter は prompt-driven な最小adapterです。`AGENTS.md` と必要なSkillを Codex のrepo surfaceへ投影する使い方を示しますが、installer、hooks、local metrics sidecar、共有PR workflow、外部公開は提供しません。capabilityは `docs/adapter-capability-matrix.md` で supported / partial / unsupported / unknown に分けます。

例:

```text
AGENTS.mdを前提に、spec-driven-development skillを使ってください。
実装前にSpec、Plan、Tasks、Verificationを出してください。
```

## 代表的な呼び出し

上位正本は `skills/operating-mode-router/SKILL.md`、delivery/quality内の正本は `skills/skill-router/SKILL.md` です。以下は代表例です。

| 状況 | 呼ぶSkill |
|---|---|
| delivery / adoption / metrics / operation の分類が曖昧 | `operating-mode-router` |
| 次にやるべき変更候補を探す | `next-best-change-finder` → 原則 `requirement-grill` |
| 業務意図・成功条件・責任境界が曖昧 | `requirement-grill` |
| 確定済み要件をAgent-ready taskへ変換 | `work-package-compiler` |
| 新しいrepoやteamへ導入したい | `operating-mode-router` → `project-adoption-pack-generation` |
| 設計を詰めたい | `grill-design` |
| 既存docs/ADRと整合させたい | `grill-with-docs` |
| 実装前に未解決のアプリケーション境界・依存方向・DTO/Error/async lifetime判断 | `application-boundary-architecture` → 通常の実装ルートへ戻る |
| 再利用可能な実装patternを台帳化したい | `engineering-pattern-ledger` |
| 再利用可能な検証patternを台帳化したい | `verification-pattern-ledger` |
| ADR未満のarchitecture decision memoryを残したい | `architecture-decision-memory`（ADRが必要なら `adr-review`） |
| 新機能を作る | `spec-driven-development` → `test-first-verification` for Verification Contract → `controlled-implementation` → `test-first-verification` for evidence |
| バグ原因が不明 | `doubt-driven-development` → `test-first-verification` for reproduction and Verification Contract → `controlled-implementation` → `test-first-verification` for regression proof |
| 実装フェーズに入る | `controlled-implementation` |
| 承認済みリファクタを安全に実装する | `refactor-implementation` → `test-first-verification` for regression proof |
| スコープ逸脱が怖い | `scope-control`（実装へ進むなら `controlled-implementation`、レビューでは `review-router` → required gates） |
| 繰り返し実装文脈の固定 | `implementation-context-generation`（既定: `docs/ai/implementation-context.md`） |
| PRレビュー | `review-router` → layer applicability → required gates（architecture impact は `review-architecture-impact`、output quality は `review-output-quality`、adversarial risk は `review-adversarial-risk`）→ `review-final-merge-gate` |
| 繰り返し/高impact review findingsを予防知識へ変換 | `review-finding-compiler` |
| 既存要件・業務ルールとの照合 | `review-domain-impact` |
| リリース候補のready判定 | `release-readiness-gate`（deploy / publish / migration / external notification / release execution は `risk-gate` と明示承認が先） |
| 負債・スメル・リファクタ候補レビュー | `review-router` → `review-code-health` when applicable |
| non-blockingな改善候補の台帳化 | `improvement-ledger` |
| 業務ルール台帳の作成・更新 | `domain-rule-ledger` |
| レビューや人間の訂正から業務ルール候補を抽出 | `review-to-rule-compiler` |
| Skill選択やworkflow効果をふりかえりたい | `operating-mode-router` → `skill-effectiveness-evaluation` |
| adoption maturityやinstruction qualityを期間で測りたい | `operating-mode-router` → `skill-adoption-metrics` |
| full-layer engineering capabilityを証拠付きで評価したい | `operating-mode-router` → `engineering-capability-evaluation` |
| weekly/monthly adoption reportを作りたい | operation layer + `docs/ai/adoption-report-template.md` |
| stakeholder向けにreadinessを説明したい | `docs/ai/stakeholder-readiness-report-template.md` |
| Claude Codeでlocal-firstに導入したい | `scripts/install-claude-adapter.mjs` + local hooks |
| `@claude review` をPRで任意実行したい | Pattern B GitHub Actions adapter（有効化前に `risk-gate`） |
| 繰り返しレビュー文脈の固定 | `review-context-generation`（既定: `docs/ai/review-context.md`） |
| MR/PR README・PR説明・変更文脈固定 | `mr-readme-generation` |
| docs/ADR/PR/handoffからdurable knowledgeを抽出 | `documentation-knowledge-compiler` |
| 破壊的操作・deploy・migration・secret絡み | `risk-gate` before the selected workflow proceeds to action |
| 次のCodex/Cursor/Claudeに渡す | `handoff-generation` |

## 社内紹介時の説明

一文で言うなら:

> AI coding agentを「実装者」ではなく、Repository First / Scope Discipline / Evidence Firstで動くエンジニアリング作業者として制御するためのKernel + Skillセット。

強調点:

- 常時ルールは短く保つ。
- まず operating mode を分け、通常開発は `skill-router` に渡す。
- Grill-MeやSpec作成のような重い手順はSkillに分ける。
- 完了条件は「コードを書いた」ではなく「検証した」。
- 根拠なしの成果主張をEvidence Ledgerで潰す。
- 危険操作はRisk Gateで止める。
- Risk Gateは単独工程ではなく、危険影響がある全ワークフローの前に割り込む。
- Project Overlayの専門Skillは、`operating-mode-router` と `skill-router` でgeneric workflowを選んだ後に必要な場合だけ選ぶ。
- Handoffまで含めてAgent運用に対応する。
