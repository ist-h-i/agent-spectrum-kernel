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
3. 普段はKernelだけで使う。
4. 重い作業ではSkill名を明示して呼ぶ。

例:

```text
AGENTS.mdを前提に、spec-driven-development skillを使ってください。
実装前にSpec、Plan、Tasks、Verificationを出してください。
```

## 代表的な呼び出し

| 状況 | 呼ぶSkill |
|---|---|
| 設計を詰めたい | `grill-design` |
| 既存docs/ADRと整合させたい | `grill-with-docs` |
| 新機能を作る | `spec-driven-development` → `test-first-verification` |
| バグ原因が不明 | `doubt-driven-development` |
| 実装フェーズに入る | `controlled-implementation` |
| PRレビュー | `code-review-quality` → `evidence-ledger` |
| 破壊的操作・deploy・migration・secret絡み | `risk-gate` |
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
- Handoffまで含めてAgent運用に対応する。
