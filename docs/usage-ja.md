# Agent Spectrum Kernel Usage Guide 日本語版

## 目的

Agent Spectrum Kernel は、個人開発や社内でAIコーディングツールを紹介するときのベースです。

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

## 最初に読むもの

- `docs/quickstart-ja.md`: 初回導入と最初の依頼文。
- `docs/prompt-recipes-ja.md`: common workflow のcopy-paste依頼文。
- `docs/glossary-ja.md`: Kernel、Skill、Gate、overlay、context、contractの用語。

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

このrepoから導入先repoへcore kernel / skillsを投影する場合は、汎用installerを使います。

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
```

このrepoに更新が入った後は、更新済みcheckoutから同じinstallerを再実行します。

```bash
git pull
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
```

`scripts/install-kernel.mjs` は `AGENTS.md` の managed block、`CUSTOM_INSTRUCTIONS.md`、`skills/<name>/SKILL.md`、`.agent-spectrum-kernel/install-state.json` を更新します。導入先の独自 `AGENTS.md` 本文は保持します。managed file は前回stateのhashと導入先の現在hashが一致する場合だけ更新し、ローカル改変がある場合は `--force` なしでは失敗します。`--check`、`--dry-run`、`--prune`、`--rollback`、`--detach` を使えます。

Codex のrepo-scoped skill surfaceも使う場合は、Codex adapter installerを使います。

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
node scripts/install-codex-adapter.mjs --target /path/to/adopting-repo
```

このinstallerは profile 選択された `.agents/skills/<skill>/SKILL.md`、`.agents/prompts/`、`.agents/commands/`、Codex runner runtime、`.agent-spectrum-kernel/codex-install-state.json` を更新します。default は `implementation` profile です。通常は `--profile minimal|implementation|investigation|review|adoption|observability|full` を使います。`--skills <csv>` は advanced override で、選択 prompt / command、router到達可能route、指定 skill 依存の必須 skill 閉包を満たさない場合は書き込み前に失敗します。coreと同じく `--check`、`--prune`、`--force`、`--rollback`、`--detach` を使えます。Codex用のローカル投影だけを行い、hook、telemetry、外部公開、GitHub Actions は作りません。

Codex の非対話実行は、導入された runner 経由で行います。

```bash
node scripts/codex-exec-runner.mjs --target /path/to/adopting-repo --prompt skill-implement.md --mode implementation
```

runner は `codex exec` の出力を捕捉して `ask-sensors` に通し、`executed` と `insufficient_evidence` を分けます。これはbusiness correctness、product readiness、no regressionの証明ではありません。

Skill非対応ツールでは、必要な `SKILL.md` だけをプロンプトに貼ります。

Claude Code では project-local adapter を使うと、core skills を `.claude/skills/` に投影できます。

```bash
node scripts/install-kernel.mjs --target /path/to/project --merge-agents
node scripts/install-claude-adapter.mjs --target /path/to/project
```

推奨導入順:

```text
1. core kernel / skills
2. Claude project adapter または optional plugin
3. local hooks for observability
4. Pattern B `@claude review` GitHub Actions only when PR-level shared review is needed
5. local weekly/monthly adoption and debt reports
```

Claude adapter は core install state `.agent-spectrum-kernel/install-state.json` を前提にします。未導入の場合は `.claude/` を書き込む前に失敗します。

Claude adapter は `.agent-spectrum-kernel/claude-install-state.json` を記録し、core/Codexと同じ lifecycle semantics を使います。`--check`、`--dry-run`、`--prune`、`--force`、`--rollback`、`--detach` が使えます。`--detach` はClaude実行面とadapter-owned hooksを外し、local metrics、reports、ledgersは既定で残します。

Claude の runtime smoke は明示実行です。hook executable resolution、event-store writability、非機密smoke event、report input availabilityを確認します。

```bash
node scripts/adapter-runtime-smoke.mjs --target /path/to/project --adapter claude
```

対応profileは `implementation`、`investigation`、`review`、`observability`、`full` です。default は `full` で、全manifest Skillと全Claude commandを投影します。narrow profile は、選択command、Skill依存、router到達可能routeを含む閉包を自動投影します。`--skills <csv>` はadvanced overrideで、閉包を満たさない場合は書き込み前に失敗します。

Hookの正本は `.claude/settings.json` です。`.claude/hooks/hooks.json` は新規には投影しません。`--skip-runtime` はruntime scriptとadapter-owned metrics hooksを両方skip/removeします。`--skip-hooks` はhooksだけをskip/removeし、runtime scriptは入れます。

Optional plugin はproject adapterと併用できます。plugin hooksは `${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record` を通して実行され、project runtimeがない場合はno-opします。

## 使い分け

実行時の上位ルーティング正本は `skills/operating-mode-router/SKILL.md` です。通常のdelivery/quality作業では `skills/skill-router/SKILL.md` が正本です。`manifest.json.routing` は正本ではなく、machine-readable defaults / validation mirror です。このガイドの例は、その導線を説明するためのものです。

### Skill名を知らない通常依頼

普段はSkill名ではなく、作業意図で依頼します。

```text
この作業を適切なルートで進めてください。
```

または:

```text
この依頼を、必要なルートを選んで進めてください。
既存のdocs、repo、domain rules、context、ledgerで判断できるものは吸収し、
人間判断が必要なものだけ明示してください。
作業が進められる場合は、次に必要な実装・検証・レビュー・ドキュメント作成まで案内してください。
```

| やりたいこと | こう言う | User-facing work mode |
|---|---|---|
| チケットを進める | このチケットを進めて | 要件確認 / 実装準備 / 実装 |
| PRをレビューする | このPRをレビューして | レビュー |
| バグを調べる | このバグを調べて | 調査 |
| 設計を詰める | この設計を詰めて | 要件確認 / 設計 |
| Agent-readyにする | Codexに渡せる形にして | 実装準備 |
| 状態を整理する | この状態を整理して | ドキュメント整理 |
| 指摘を次回に活かす | この指摘を次に活かして | 知識蓄積 |

期待する出力は、`Selected work mode`、`User-facing route`、`Internal route`、`Route confidence`、`Evidence checked`、`Missing evidence`、`Human decision required`、`Next action` です。`Internal route` はSkill名を出してよいですが、`User-facing route` と `Next action` は作業用語で書きます。

### Operating mode routing

使うSkill:

```text
operating-mode-router
```

使う場面:

- delivery/quality、adoption/bootstrap、observability/metrics、operation/automation の分類が曖昧
- project rollout、Skill効果評価、adoption metrics、週次/月次運用が混じる

例:

```text
operating-mode-router を使って、この依頼のmodeを選んでください。通常の実装・レビューなら skill-router に渡してください。
```

### 軽微な修正

Kernelだけで十分です。

例:

```text
このラベル文言を “Save” から “保存” に変更してください。関連しないファイルは触らないでください。
```

### Requirement-to-Rule Loop

使うSkill:

```text
next-best-change-finder
requirement-grill
work-package-compiler
review-domain-impact
review-to-rule-compiler
domain-rule-ledger
```

使う場面:

- 次にやるべき変更候補をrepo evidenceから探したい
- 業務意図、成功条件、責任境界、確認負担、訂正負担が曖昧
- 確定済み要件を別Agentに渡せる作業単位へ変換したい
- PRやdiffが既存要件・業務ルールに反していないか確認したい
- レビューや人間の訂正から再利用可能な業務ルール候補を抽出したい

基本route:

```text
next-best-change-finder
  -> requirement-grill
  -> human decision
  -> work-package-compiler
  -> review-domain-impact
  -> review-to-rule-compiler
  -> domain-rule-ledger
```

注意:

- `next-best-change-finder` は候補生成であり、実装承認ではありません。
- `requirement-grill` は判断支援であり、未解決の業務判断を実装タスクに変換しません。
- `work-package-compiler` は確定済みRequirement Contractの変換だけを行います。
- `review-domain-impact` は検証Skillであり、新しい業務判断を作りません。
- `review-to-rule-compiler` は候補抽出であり、AI推測をconfirmed ruleに昇格しません。
- `domain-rule-ledger` は証拠状態、stale trigger、contradictionを残す台帳です。

### Full-layer Engineering Intelligence

使うSkill:

```text
engineering-pattern-ledger
verification-pattern-ledger
review-finding-compiler
documentation-knowledge-compiler
architecture-decision-memory
engineering-capability-evaluation
```

使う場面:

- 繰り返し使える実装patternを証拠付きで残したい
- 変更種別ごとの検証patternや回帰防止観点を残したい
- review findingを次回以降の予防知識、check、台帳候補へ変換したい
- docs/ADR/PR/handoffからdurable knowledgeを抽出し、正しい保存先へ送る
- ADR未満のarchitecture decision memoryを残し、必要ならADRへ昇格判断する
- capability growthを自己申告ではなく証拠付きで評価する

基本ルール:

- すべての台帳を毎回読む必要はありません。
- `template`、`stale`、`archived`、`missing`、`Hypothesis` は enforcement の根拠にしません。
- 台帳はmemory sourceであり、現在タスクの検証・review gate・human decisionを置き換えません。
- Project overlayとADRがそれぞれの責務では正本です。台帳は参照や更新提案に留めます。

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

### Project adoption / first-time rollout

使うSkill:

```text
operating-mode-router
project-adoption-pack-generation
repository-orientation when needed
implementation-context-generation / review-context-generation as follow-up
```

`project-adoption-pack-generation` は、新しいrepoやteamにこのSkillセットを導入するため、project overlay draft、implementation context draft、review context draft、improvement-ledger initialization guidance、最初のworkflow recipe、missing human decisionsを作ります。

通常の一回限りの実装やレビューでは使いません。ファイル変更は明示依頼があるまで行わず、branch、release、security、ownership policyは根拠なしに推測しません。

Claude Code が対象runtimeの場合は、project adoption packで次を推奨します。

- `scripts/install-claude-adapter.mjs` によるproject-local `.claude/skills` 投影。
- `docs/ai/observability-config.yml` と local hooks による project-local event capture。
- `adapters/claude-code/plugin/` は team distribution が必要な場合だけ使う optional package。
- `adapters/claude-code/github-actions/` は `@claude review` が必要なPR共有時だけ使う Pattern B adapter。

### Skill effectiveness / adoption metrics

使うSkill:

```text
operating-mode-router
skill-effectiveness-evaluation for one completed task
skill-adoption-metrics for multiple tasks or period measurement
```

`skill-effectiveness-evaluation` は、1つの完了済みタスクでSkill選択が役に立ったか、過剰だったか、足りなかったかを根拠付きで評価します。

`skill-adoption-metrics` は、複数タスクや期間を対象に、instruction quality、skill usage maturity、task outcomes、quality improvement、maturity movementを見ます。raw promptは既定で保存せず、HR/personnel evaluationには使いません。

### Metrics event / adoption reports

使う文書:

```text
docs/metrics-event-contract.md
docs/observability-runtime-contract.md
docs/debt-lifecycle-contract.md
docs/ai/skill-adoption-metrics.md
docs/ai/adoption-report-template.md
docs/ai/observability-config.yml
```

通常Skillは作業を行い、adoption metrics が明示的に有効な場合だけ `Metrics event candidate` を出せます。bare router invocation、partial conversation、trivial edit、hidden telemetryでは出しません。

Claude hook-first runtimeでは、task boundary があるときだけ `docs/ai/metrics/events.jsonl` に要約イベントを追記します。task boundary がない場合は `skip` とし、file editごとのノイズを出しません。

週次/月次reportは別Skillではなくoperation layerのreporting modeです。集計は `skill-adoption-metrics`、出力形は `docs/ai/adoption-report-template.md` を使います。local report は `docs/ai/reports/` に保存します。スケジューラ、外部通知、外部公開は `risk-gate` の対象です。

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
