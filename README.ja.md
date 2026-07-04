# AI Coding Rules and Skills 日本語ガイド

これは、AIコーディングツールに入れるための汎用ルールとスキルのセットです。

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
```

## 3分で使う

初回利用者は `docs/quickstart-ja.md` から始めてください。

- `docs/quickstart-ja.md`: 最小導入、Skill対応/非対応ツール、最初にAIへ言うこと。
- `docs/prompt-recipes-ja.md`: やりたいこと別のcopy-paste依頼文。
- `docs/glossary-ja.md`: Kernel、Skill、Gate、overlay、context、contractの用語集。
- `docs/usage-ja.md`: 代表的な使い分けと運用ガイド。
- `docs/skill-matrix.md`: workflow選択の一覧。

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
3. 普段はKernelだけで使う。ルーティングの正本は `skills/skill-router/SKILL.md`。
4. 重い作業ではSkill名を明示して呼ぶ。

例:

```text
AGENTS.mdを前提に、spec-driven-development skillを使ってください。
実装前にSpec、Plan、Tasks、Verificationを出してください。
```

## 代表的な呼び出し

正本は `skills/skill-router/SKILL.md` です。以下は代表例です。

| 状況 | 呼ぶSkill |
|---|---|
| 設計を詰めたい | `grill-design` |
| 既存docs/ADRと整合させたい | `grill-with-docs` |
| 実装前に未解決のアプリケーション境界・依存方向・DTO/Error/async lifetime判断 | `application-boundary-architecture` → 通常の実装ルートへ戻る |
| 新機能を作る | `spec-driven-development` → `test-first-verification` for Verification Contract → `controlled-implementation` → `test-first-verification` for evidence |
| バグ原因が不明 | `doubt-driven-development` → `test-first-verification` for reproduction and Verification Contract → `controlled-implementation` → `test-first-verification` for regression proof |
| 実装フェーズに入る | `controlled-implementation` |
| スコープ逸脱が怖い | `scope-control`（実装へ進むなら `controlled-implementation`、レビューでは `review-router` → required gates） |
| 繰り返し実装文脈の固定 | `implementation-context-generation`（既定: `docs/ai/implementation-context.md`） |
| PRレビュー | `review-router` → layer applicability → required gates（architecture impact は `review-architecture-impact`、output quality は `review-output-quality`、adversarial risk は `review-adversarial-risk`）→ `review-final-merge-gate` |
| 負債・スメル・リファクタ候補レビュー | `review-router` → `review-code-health` when applicable |
| 繰り返しレビュー文脈の固定 | `review-context-generation`（既定: `docs/ai/review-context.md`） |
| MR/PR README・PR説明・変更文脈固定 | `mr-readme-generation` |
| 破壊的操作・deploy・migration・secret絡み | `risk-gate` before the selected workflow proceeds to action |
| 次のCodex/Cursor/Claudeに渡す | `handoff-generation` |

## 社内紹介時の説明

一文で言うなら:

> AI coding agentを「実装者」ではなく、Repository First / Scope Discipline / Evidence Firstで動くエンジニアリング作業者として制御するためのKernel + Skillセット。

強調点:

- 常時ルールは短く保つ。
- Grill-MeやSpec作成のような重い手順はSkillに分ける。
- 完了条件は「コードを書いた」ではなく「検証した」。
- 根拠なしの成果主張をEvidence Ledgerで潰す。
- 危険操作はRisk Gateで止める。
- Risk Gateは単独工程ではなく、危険影響がある全ワークフローの前に割り込む。
- Project Overlayの専門Skillは、`skill-router` でgeneric workflowを選んだ後に必要な場合だけ選ぶ。
- Handoffまで含めてAgent運用に対応する。
