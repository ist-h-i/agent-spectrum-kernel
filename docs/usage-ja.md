# Usage Guide 日本語版

## 目的

このセットは、個人開発や社内でAIコーディングツールを紹介するときのベースです。

AIに期待する動作は次です。

```text
1. repoを読む
2. 勝手に仮定しない
3. スコープを広げない
4. 最小変更で実装する
5. 検証してから完了を主張する
6. 未検証事項を隠さない
7. 次のAgent/人間が引き継げる状態にする
```

## まず入れるもの

最低限は `AGENTS.md` だけでよいです。

```text
repo-root/
  AGENTS.md
```

Skill対応ツールでは `skills/` も入れます。

```text
repo-root/
  AGENTS.md
  skills/
    */SKILL.md
```

Skill非対応ツールでは、必要な `SKILL.md` だけをプロンプトに貼ります。

## 使い分け

実行時のルーティング正本は `skills/skill-router/SKILL.md` です。このガイドの例は、その導線を説明するためのものです。

### 軽微な修正

Kernelだけで十分です。

例:

```text
このラベル文言を “Save” から “保存” に変更してください。関連しないファイルは触らないでください。
```

### 新機能

使うSkill:

```text
spec-driven-development
controlled-implementation
test-first-verification
```

例:

```text
spec-driven-development を使って、先に仕様・非目標・受け入れ条件・検証方法を出してください。実装はその後。
```

### 設計壁打ち

使うSkill:

```text
grill-design
```

例:

```text
grill-design を使って、この設計案を実装前に詰めてください。repoから答えられるものは質問せずに確認してください。一度に一問だけ聞いてください。
```

### docs/ADR/用語が絡む設計

使うSkill:

```text
grill-with-docs
adr-review
```

例:

```text
grill-with-docs を使って、既存docs/ADR/用語体系とこの設計案の衝突を確認してください。
```

### アプリケーション境界判断

使うSkill:

```text
application-boundary-architecture
adr-review if hard-to-reverse or record-worthy
grill-with-docs if docs/domain/ADR terms matter
```

例:

```text
application-boundary-architecture を使って、この変更で facade / usecase / repository / mapper / port のどこまで必要かを、既存repo構成に合わせて判断してください。境界違反、最小変更、検証方法も出してください。
```

### バグ・原因不明

使うSkill:

```text
doubt-driven-development
test-first-verification for reproduction
controlled-implementation
test-first-verification for regression proof
```

例:

```text
doubt-driven-development を使って、最初の仮説に飛びつかず、反証チェックを先に並べてください。修正前に再現条件を確認してください。
```

### PRレビュー

使うSkill:

```text
review-router
review-automated-gate
review-ai-quality
review-domain-impact if needed
adr-review if needed
risk-gate if needed
evidence-ledger if needed
review-final-merge-gate
```

例:

```text
review-router を使ってこのdiffの Layer applicability を出し、必要ゲートを選んでください。必要なレビュー後に review-final-merge-gate で approve/request changes/block の判断を出してください。
```

`review-router` は、各レビュー層を `required | skipped | insufficient evidence` で明示してからゲートを選びます。スキップする層には、diff・docs・tests・CIなど確認済み入力に基づく理由が必要です。

`review-final-merge-gate` は、最終判断で各層を `pass | fail | skipped | insufficient evidence` として要約します。lint/testのようなMechanical passだけでは、Domain、Architecture、Output quality、Adversarial risk、Risk、Evidenceの未解決問題を上書きできません。

### MR/PR README / 仕様理解固定

使うSkill:

```text
mr-readme-generation
adr-review if needed
review-router if merge decision is requested
```

例:

```text
mr-readme-generation を使って、このPRの説明を docs/pr 配下のPR専用READMEとして作成してください。PR概要、影響範囲、リスク、切り戻し方針、ドメイン領域、アーキテクチャー判断ログ、設計思想、検証結果、後続AI向け再利用メモを含めてください。
```

### 危険操作

使うSkill:

```text
risk-gate
```

`risk-gate` は単独工程ではなく上位ゲートです。破壊的操作、外部影響、本番、auth、secret、dependency、migration、billing、email、infraを含む場合は、選択済みワークフローが action に進む前に必ず通します。

例:

```text
risk-gate を使って、このmigrationを実行してよいか判断してください。実行はまだしないでください。リスク、承認要否、rollback、検証方法を出してください。
```

### 次のCodex/Agentへ渡す

使うSkill:

```text
handoff-generation
```

例:

```text
handoff-generation を使って、次のCodexに渡せるタスク指示を作ってください。Allowed scope / Forbidden scope / Verification / Stop condition を必ず含めてください。
```

## 社内紹介時の説明

短く説明するならこうです。

```text
これはAIコーディング用の常時ルールと、状況別Skillのセットです。
Kernelは「いつも守る判断基準」、Skillは「必要なときだけ呼ぶ工程」です。
狙いは、AIの過剰実装・スコープ逸脱・根拠なし完了報告・引き継ぎ不能を減らすことです。
```

## 導入時の注意

- 全Skillを毎回使わない。
- Kernelにプロジェクト固有ルールを詰め込みすぎない。
- フレームワーク固有規約はProject Overlayに分離する。
- Project Overlayの専門Skillは、`skill-router` でgeneric workflowを選んだ後に必要な場合だけ選ぶ。
- 検証できていないものを「完了」「改善」「安全」と言わせない。
- 「修正済み」「no regression」「production-ready」「安全」「改善」などの主張を出すときは `evidence-ledger` を通す。
- 危険影響がある作業は、選択済みワークフローの前に `risk-gate` を通す。
