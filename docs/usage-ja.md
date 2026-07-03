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
test-first-verification for Verification Contract
controlled-implementation
test-first-verification for evidence
```

例:

```text
spec-driven-development を使って、先に仕様・非目標・受け入れ条件・検証方法を出してください。実装はその後。
```

### Angular stack overlay

Angular固有のcomponent、route、provider、template、forms、Signals/RxJS、DOM/security、SSR/hydration、Angular test、CLI、migrationに触る実装では、generic workflowを選んだ後にstack overlayとして使います。

使うSkill:

```text
skill-routerでgeneric workflow選択
angular-implementation-architecture as stack overlay
controlled-implementation
test-first-verification
```

例:

```text
Angularのrouted formを実装してください。generic workflowは維持し、Angular固有の制約と検証補助だけ angular-implementation-architecture から出してください。
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
test-first-verification for reproduction and Verification Contract
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
review-architecture-impact if needed
review-output-quality if needed
review-adversarial-risk if needed
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

`review-architecture-impact` は、dependency direction、module boundary、public API、persistence / infrastructure、ownership / lifecycle、cross-module coupling などの構造影響をレビューします。詳細な境界メカニクスは `application-boundary-architecture`、記録が必要な判断は `adr-review` に分けます。

`review-output-quality` は、UI、docs、通知、CLI、API response、generated text、AI/system-consumed output の消費者適合・構造・完全性・契約適合をレビューします。persona、medium、output contract が不足している判断は `insufficient evidence` にします。

`review-adversarial-risk` は、通常レビュー後に残る高impactの失敗経路、misuse、blast radiusを最大3件程度に絞って確認します。known issueやaccepted riskを再報告しないため、利用可能なら `docs/ai/review-context.md` を先に読みます。

`review-final-merge-gate` は、最終判断で各層を `pass | fail | skipped | insufficient evidence` として要約します。lint/testのようなMechanical passだけでは、Domain、Architecture、Output quality、Adversarial risk、Risk、Evidenceの未解決問題を上書きできません。

### 繰り返しレビュー文脈

使うSkill:

```text
review-context-generation
```

`review-context-generation` は、`docs/ai/review-context.md` を作成・更新し、project identity、persona、output contract、critical workflow、accepted risk、known issue、noise-control rule を evidence status 付きで残します。task progressはここに保存せず、長期タスク状態は `planning-with-files` を使います。

### 繰り返し実装文脈

使うSkill:

```text
implementation-context-generation
```

`implementation-context-generation` は、`docs/ai/implementation-context.md` を作成・更新し、stack inventory、workspace shape、build/typecheck/lint/test/focused-test commands、implementation/test patterns、architecture boundaries、generated/manual-edit boundaries、stack overlay hooks、stop conditions、update triggers を evidence status 付きで残します。task progressはここに保存せず、Angular/React/Python/Javaなどの固有規約はProject Overlayや専門Skillへ分離します。

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
