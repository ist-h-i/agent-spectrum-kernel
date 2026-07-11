# Agent Spectrum Kernel Prompt Recipes 日本語版

この文書は、Agent Spectrum Kernel を Skill名を深く知らなくても使えるようにする copy-paste 用の依頼文集です。各recipeは「やりたいこと」から選びます。上位routingの正本は `skills/operating-mode-router/SKILL.md`、delivery/quality内の正本は `skills/skill-router/SKILL.md`、各手順の正本は各 `SKILL.md` です。`manifest.json.routing` は正本ではなく、machine-readable defaults / validation mirror です。

## Skill名を知らない通常入口

### そのまま貼る短い依頼文

```text
この作業を適切なルートで進めてください。
```

### そのまま貼る丁寧な依頼文

```text
この依頼を、必要なルートを選んで進めてください。
既存のdocs、repo、domain rules、context、ledgerで判断できるものは吸収し、
人間判断が必要なものだけ明示してください。
作業が進められる場合は、次に必要な実装・検証・レビュー・ドキュメント作成まで案内してください。
```

### やりたいこと別の言い方

| やりたいこと | こう言う | 期待される内部route |
|---|---|---|
| チケットを前に進める | このチケットを進めて | requirement / work package / implementation route |
| PR、diff、生成物をレビューする | このPRをレビューして | review-router and required gates |
| バグ、regression、原因不明を調べる | このバグを調べて | doubt-driven-development and verification route |
| 要件、設計、アーキテクチャを詰める | この設計を詰めて | requirement / design / architecture route |
| Codexや別Agentへ渡せる作業にする | Codexに渡せる形にして | work-package route |
| レビュー指摘や訂正を次回に活かす | この指摘を次に活かして | finding / ledger / documentation route |

### 期待する出力

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": { "work_mode": "実装", "operating_mode": "delivery_quality", "user_facing": "作業用語で次の確認・停止・実行を示す", "internal": { "primary": "controlled-implementation" } },
  "evidence_status": { "checked": [], "missing": [] },
  "stop_reason": { "status": "none", "details": [], "human_decision_required": [], "stop_if": [] },
  "next_action": "implement scoped change"
}
```

### 注意

- `route.user-facing` と `next action` はSkill名だけで終わらせません。
- `route.internal` はdebugやreviewのためにSkill名を出して構いません。
- chained Skill は固有artifactだけを追加し、Execution Envelope の項目を複製しません。
- 次のrouteは推薦です。ユーザーが継続を求めていない場合、全Skill chainを自動実行しません。
- `template`、`stale`、`archived`、`contradicted`、`Hypothesis` のledger entryをenforcement evidenceとして扱いません。
- deploy、migration、release、外部通知、secret、auth、permission、production config は `risk-gate` と明示承認が先です。

## Small local edit

### そのまま貼る依頼文

```text
この小さな修正だけを行ってください。
対象外のrefactor、format churn、public API変更はしないでください。
作業前に軽く対象ファイルと近傍patternを確認し、最後に変更点、検証、未検証事項を報告してください。
```

### 使われる主なSkill

- `AGENTS.md` only

### 期待する出力

- 変更ファイル
- 実行した確認
- 未確認事項

### 注意

- trivial なら `skill-router` を無理に使いません。

## New feature / behavior change

### そのまま貼る依頼文

```text
新しい挙動を追加してください。
まず skill-router で必要workflowを選び、spec-driven-development で仕様、非目標、受け入れ条件、検証方法を出してください。
その後、test-first-verification で Verification Contract を作り、controlled-implementation で最小実装してください。
最後に実行した検証と未検証リスクを分けて報告してください。
```

### 使われる主なSkill

- `skill-router`
- `spec-driven-development`
- `test-first-verification`
- `controlled-implementation`
- `evidence-ledger`

### 期待する出力

- Spec
- Verification Contract
- Implementation Contract
- 実装結果と検証結果

### 注意

- 仕様が曖昧なら実装前に止めます。
- stack overlay は generic workflow 選択後、該当する場合だけ使います。

## Operating mode routing

### そのまま貼る依頼文

```text
この依頼が delivery/quality、adoption/bootstrap、observability/metrics、operation/automation のどれかを operating-mode-router で先に分類してください。
通常の実装・レビューなら skill-router に渡し、導入・メトリクス・週次/月次運用なら該当する上位layerに送ってください。
不要なworkflowは明示的にskipしてください。
```

### 使われる主なSkill

- `operating-mode-router`
- `skill-router` when delivery/quality

### 期待する出力

- Operating mode
- Selected route
- Skipped workflows
- Risk overlay要否

### 注意

- 週次/月次運用はdelivery skillではなくoperation layerです。
- adoptionやmetricsは明示依頼または明確な信号がある場合だけ使います。

## Requirement-to-Rule Loop

### そのまま貼る依頼文

```text
業務判断を楽にする変更候補をrepo evidenceから探し、実装前に責任境界を崩さない形で要件化してください。
まず next-best-change-finder で候補、根拠、期待価値、リスク、反証条件を出してください。
業務意図や成功条件が曖昧な候補は requirement-grill に回し、Requirement Contract を作ってください。
未解決の業務判断が残る場合は work-package-compiler に進まず、needs human decision としてください。
確定済みRequirement Contractだけを work-package-compiler でWork Packageに変換してください。
```

### 使われる主なSkill

- `next-best-change-finder`
- `requirement-grill`
- `work-package-compiler`
- `review-domain-impact`
- `review-to-rule-compiler`
- `domain-rule-ledger`

### 期待する出力

- Change Candidate
- Requirement Contract
- Work Package when executable
- Domain rule candidates when evidence exists
- Human decision required / not required

### 注意

- 候補探索は実装承認ではありません。
- `Hypothesis` domain rule は質問や警告にだけ使い、review blockの単独根拠にしません。
- AI推測を `Human-confirmed` に昇格しません。

## Project adoption pack

### そのまま貼る依頼文

```text
このrepoに Agent Spectrum Kernel を導入するための project adoption pack を作ってください。
operating-mode-router で adoption_bootstrap に分類し、project-adoption-pack-generation を使ってください。
README、commands、CI、docs、ADR、local rules、risk、generated file boundaries を確認し、project overlay draft、implementation context draft、review context draft、improvement-ledger initialization guidance、最初の3つのworkflow recipe、missing human decisions を出してください。
ファイル変更はまだ行わず、根拠がないpolicyは Unknown としてください。
```

### 使われる主なSkill

- `operating-mode-router`
- `project-adoption-pack-generation`
- `repository-orientation` when needed

### 期待する出力

- Project adoption pack
- Project overlay draft
- Implementation / review context draft
- Missing information

### 注意

- project-specificな生成物は対象project側に置きます。
- branch/release/security/ownership policyを推測で埋めません。

## Full-layer engineering memory

### そのまま貼る依頼文

```text
このタスク/PR/レビューから、再利用可能なengineering intelligenceだけを抽出してください。
まず skill-router で対象を分類し、実装patternなら engineering-pattern-ledger、検証patternなら verification-pattern-ledger、review findingなら review-finding-compiler、docs/ADR/PR/handoff由来のdurable knowledgeなら documentation-knowledge-compiler、architecture decisionなら architecture-decision-memory に送ってください。
Hypothesisは質問にだけ使い、enforcementやblockerにしないでください。
現在PRのblocker、task progress、project overlay rule、ADRはそれぞれの場所に残し、台帳へ隠さないでください。
```

### 使われる主なSkill

- `skill-router`
- `engineering-pattern-ledger`
- `verification-pattern-ledger`
- `review-finding-compiler`
- `documentation-knowledge-compiler`
- `architecture-decision-memory`
- `evidence-ledger`

### 期待する出力

- どの台帳/Skillに送るか
- Evidence source / Evidence status
- Staleness trigger
- Current taskでの扱い
- 追加しないものと理由

### 注意

- full-layer memoryは通常タスクの必須工程ではありません。
- 台帳は現在タスクの検証・レビューを置き換えません。
- Project overlayやADRの内容を自動で上書きしません。

## Skill effectiveness evaluation

### そのまま貼る依頼文

```text
この完了済みタスクで選んだSkillが有効だったかを評価してください。
operating-mode-router で observability_metrics に分類し、skill-effectiveness-evaluation を使ってください。
使ったSkill、skipしたSkill、成果物、検証結果、残リスクを根拠に、routing quality、output usefulness、evidence quality、risk reduction、overhead control、reuse valueを0-100で評価してください。
一つの実例だけでSkillを書き換えず、必要なら prompt recipe、validation、project overlay、context、example、improvement-ledger への狭いfollow-upを提案してください。
```

### 使われる主なSkill

- `operating-mode-router`
- `skill-effectiveness-evaluation`
- `evidence-ledger` when claims need evidence status

### 期待する出力

- Scores
- What worked / excessive / missing
- Defects or risks caught / missed
- Recommended follow-up
- Confidence

### 注意

- 1タスクの評価です。期間集計は `skill-adoption-metrics` です。
- 人やチームの評価ではなくworkflow効果の評価です。

## Adoption metrics measurement

### そのまま貼る依頼文

```text
複数タスクの evidence から skill adoption metrics をまとめてください。
operating-mode-router で observability_metrics に分類し、skill-adoption-metrics を使ってください。
raw promptは保存せず、instruction quality、skill usage maturity、task outcomes、quality improvement、maturity movement、privacy/safety noteを集計してください。
改善効果は、因果が証明できない場合は correlation / signal として表現してください。
```

### 使われる主なSkill

- `operating-mode-router`
- `skill-adoption-metrics`

### 期待する出力

- Instruction maturity
- Skill usage maturity
- Task outcomes
- Maturity movement
- Adoption effect
- Privacy / safety note

### 注意

- HR/personnel evaluationに使いません。
- project-specific metrics は対象projectの `docs/ai/skill-adoption-metrics.md` に保存します。

## Claude Code local adapter setup

### そのまま貼る依頼文

```text
Claude Code 用にこのskill setを導入してください。
core skillsは変更せず、scripts/install-claude-adapter.mjs で .claude/skills と commands/hooks をproject-localに投影してください。
local hooksは docs/ai/observability-config.yml を使い、raw prompt、secret、customer data、personal data、full file contents、full command output、external publication は既定offにしてください。
GitHub Actionsは有効化せず、Pattern B @claude review は必要時のoptional adapterとしてdocsだけ確認してください。
```

### 使われる主なSkill / artifact

- `project-adoption-pack-generation` when first-time rollout
- `adapters/claude-code/README.md`
- `scripts/install-claude-adapter.mjs`
- `docs/observability-runtime-contract.md`

### 注意

- local hooks がdefaultです。
- GitHub ActionsはPR共有が必要な場合だけ使います。
- 外部公開、secret、repository settings変更は `risk-gate` 対象です。

## Claude Pattern B PR review

### そのまま貼る依頼文

```text
このPRで @claude review Pattern B を使うための設定を確認してください。
GitHub Actions workflowを有効化する前に、adapters/claude-code/github-actions/README.md と docs/claude-github-review-setup.md に沿って、trigger guard、permissions、secrets、cost、fork PR扱い、risk-gate要否を確認してください。
```

### 使われる主なSkill / artifact

- `risk-gate` when enabling workflow/secrets
- `review-router`
- `review-final-merge-gate`

### 注意

- `@claude review` コメント時だけ動かします。
- `pull_request.opened` や `synchronize` で常時起動するdefaultにはしません。

## Opt-in metrics event candidate

### そのまま貼る依頼文

```text
このタスクでは adoption metrics を明示的に有効にします。
通常の作業は該当Skillで進め、意味のあるタスクイベントが完了またはdurable stateに達した場合だけ、docs/metrics-event-contract.md に沿って Metrics event candidate を出してください。
raw prompt、secret、customer data、個人情報、機密情報は保存しないでください。
```

### 使われる主なSkill

- normal delivery/review skills
- `skill-adoption-metrics` later consumes event candidates

### 期待する出力

- Optional Metrics event candidate
- Evidence references
- Privacy note

### 注意

- hidden telemetryではありません。
- bare router invocationやtrivial editでは出しません。

## Weekly / monthly adoption report

### そのまま貼る依頼文

```text
今週または今月の adoption report を作ってください。
operating-mode-router で operation_automation と observability_metrics の境界を明示し、集計は skill-adoption-metrics、出力形は docs/ai/adoption-report-template.md を使ってください。
スケジューラ設定や外部通知は実行しないでください。必要ならrisk-gateで承認要否を出してください。
```

### 使われる主なSkill

- `operating-mode-router`
- `skill-adoption-metrics`
- `docs/ai/adoption-report-template.md`
- `risk-gate` if external scheduling or notifications are requested

### 期待する出力

- Weekly or monthly report
- Evidence sources
- Adoption effect with unsupported causality avoided
- Next intervention

### 注意

- weekly/monthly reportは別Skillではなくoperation layerのreporting modeです。
- project-specific generated reportsは導入先projectに置きます。

## Bug fix with unknown cause

### そのまま貼る依頼文

```text
この不具合を修正してください。
doubt-driven-development を使い、最初の仮説に飛びつかず、反証可能な仮説と観測方法を出してください。
可能なら修正前に再現し、test-first-verification で回帰を防ぐ Verification Contract を作ってください。
修正は controlled-implementation で最小範囲に限定してください。
```

### 使われる主なSkill

- `doubt-driven-development`
- `test-first-verification`
- `controlled-implementation`

### 期待する出力

- 仮説と反証結果
- 再現または再現不能理由
- 回帰確認

### 注意

- 再現できない場合、fixed と断言せず evidence status を下げます。

## Investigation / root-cause analysis

### そのまま貼る依頼文

```text
doubt-driven-development を使って原因調査してください。
観測事実、仮説、反証チェック、次に見るファイルやログを分けてください。
原因が確定するまで実装修正に進まず、確定後に最小修正案と検証方法を出してください。
```

### 使われる主なSkill

- `doubt-driven-development`
- `evidence-ledger`

### 期待する出力

- Verified / Supported / Hypothesis / Unknown の区別
- 最小の次アクション

### 注意

- 調査だけなら実装しません。修正依頼が含まれる場合だけ実装へ進みます。

## Design grill

### そのまま貼る依頼文

```text
grill-design を使って、この設計案を実装前に厳しく確認してください。
repoから確認できることは先に調べ、未確定の前提、失敗モード、非目標、受け入れ条件を整理してください。
質問が必要な場合は一度に一問だけにしてください。
```

### 使われる主なSkill

- `grill-design`
- `evidence-ledger`

### 期待する出力

- 設計判断
- 未解決リスク
- 実装前に決めること

### 注意

- deploy、migration、secret、authなどが出たら `risk-gate` が先です。

## Docs / ADR / terminology fit review

### そのまま貼る依頼文

```text
grill-with-docs を使って、この案が既存docs、ADR、用語体系と衝突しないか確認してください。
必要なら adr-review で、ADR作成、更新、不要の判断を出してください。
```

### 使われる主なSkill

- `grill-with-docs`
- `adr-review`

### 期待する出力

- 用語やdocsとの整合
- ADR要否
- 変更すべき文書

### 注意

- docsにない推測を事実として扱いません。

## Application boundary decision

### そのまま貼る依頼文

```text
application-boundary-architecture を使って、この変更の境界を判断してください。
dependency direction、state ownership、external I/O、DTO/error trust boundary、async lifetime、feature public API、usecase/repository/port/adapter/mapper の必要性を、既存repo構成に合わせて見てください。
最小変更、境界違反、検証方法、ADR要否も出してください。
```

### 使われる主なSkill

- `application-boundary-architecture`
- `adr-review` when needed
- `grill-with-docs` when docs/domain/ADR terms matter

### 期待する出力

- 境界判断
- 許可される実装範囲
- stop condition

### 注意

- pass-through layer を将来のためだけに追加しません。

## Implementation context generation

### そのまま貼る依頼文

```text
implementation-context-generation を使って、このrepoの実装contextを作成してください。stack、commands、test patterns、implementation patterns、architecture boundaries、generated files、stop conditions を evidence status 付きで docs/ai/implementation-context.md に整理してください。
```

### 使われる主なSkill

- `implementation-context-generation`
- `repository-orientation`

### 期待する出力

- `docs/ai/implementation-context.md`
- evidence status 付きの実装判断材料

### 注意

- task progress はここに書かず、長期進捗は `planning-with-files` に分けます。

## Implementation with an Implementation Contract

### そのまま貼る依頼文

```text
controlled-implementation を使う前に Implementation Contract を出してください。goal、non-goals、allowed/forbidden scope、existing patterns、boundary decision、implementation context、stack overlay used、verification contract、stop conditions を明示してください。
```

### 使われる主なSkill

- `controlled-implementation`
- `test-first-verification` when behavior needs proof

### 期待する出力

- Implementation Contract
- scoped implementation
- verification evidence

### 注意

- contract 外の refactor はしません。

## Verification Contract before implementation

### そのまま貼る依頼文

```text
test-first-verification を使って、実装前に Verification Contract を出してください。証明する挙動、回帰防止、既存coverage、追加すべきfocused test、negative cases、commands、未検証事項を明示してください。
```

### 使われる主なSkill

- `test-first-verification`

### 期待する出力

- Behavior to prove
- Regression to prevent
- Commands
- Evidence required

### 注意

- 実行していない検証を実行済みとして報告しません。

## Safe refactor implementation

### そのまま貼る依頼文

```text
refactor-implementation を使って、承認済みのリファクタ候補だけを安全に実装してください。
まず Refactor objective、Behavior preservation contract、Allowed scope、Forbidden scope、Boundary decision、Verification contract を出してください。
public API、UI、schema、snapshot、runtime behavior、errors、logs、data shape は明示承認なしに変えないでください。
境界移動や責務移動が必要なら application-boundary-architecture を先に使って止めてください。
候補はあるがscopeが曖昧な場合は、最小の安全な対象を提案し、編集承認がなければ実装前に止めてください。
実装後は before / after、実行した検証、未検証事項、improvement-ledger へのfollow-up有無を報告してください。
```

### 使われる主なSkill

- `refactor-implementation`
- `test-first-verification`
- `application-boundary-architecture` when boundary movement may be needed
- `improvement-ledger` when follow-up debt or prevention candidates remain

### 期待する出力

- Refactor objective
- Behavior preservation contract
- Allowed / forbidden scope
- Boundary decision
- Regression proof
- Before / after

### 注意

- リファクタ候補の検出は `review-code-health` の責務です。
- backlog保存やrule/check候補化は `improvement-ledger` の責務です。
- リファクタ名目で挙動変更しません。
- 承認済み候補と具体scopeがある場合は、behavior preservation と regression proof を先に定義して進めます。

## Stack overlay use when available

### そのまま貼る依頼文

```text
このrepoに stack-specific overlay がある場合だけ、generic workflow選択後に該当overlayを使って controlled-implementation への制約と test-first-verification への検証補足を出してください。Angular固有Skillを全repoに強制しないでください。
```

### 使われる主なSkill

- `skill-router`
- relevant stack overlay only when present and applicable

### 期待する出力

- generic workflow
- overlay applicability
- stack-specific constraints and verification supplement

### 注意

- stack overlay は任意補助です。generic workflow を置き換えません。

## Angular implementation overlay

### そのまま貼る依頼文

```text
Angular固有のcomponent、route、provider、template、forms、Signals/RxJS、DOM/security、SSR/hydration、Angular test、CLI、migrationに触る実装です。
まず skill-router でgeneric workflowを選び、その後に angular-implementation-architecture を stack overlay として使ってください。
Angular固有の制約は controlled-implementation に、検証補足は test-first-verification に接続してください。
```

### 使われる主なSkill

- `skill-router`
- `angular-implementation-architecture`
- `controlled-implementation`
- `test-first-verification`

### 期待する出力

- Angular overlay applicability
- 実装制約
- Angular向け検証補足

### 注意

- Angular は任意例です。他stackに強制しません。
- React / Python / Java overlay は、repoやproject overlayに追加されている場合だけ使います。

## PR / diff review

### そのまま貼る依頼文

```text
review-router を使ってこのdiffをレビューしてください。
観測した Change signals から Required gates を選び、必要なゲートだけを実行して review-final-merge-gate で判断してください。
Missing evidence は skipped にせず insufficient evidence として残してください。通常出力では全層の固定表を出さず、必要な場合だけ診断用に添付してください。
review-code-health が applicable な場合は、current PR blocker と non-blocking な improvement ledger candidate / rule feedback / deferred or accepted code-health risk を分け、final review output に必要時だけ optional section として残してください。
```

### 使われる主なSkill

- `review-router`
- required gates
- `review-final-merge-gate`
- `evidence-ledger`

### 期待する出力

- Change signals / Required gates / Skipped heavy gates / Missing evidence
- Blocking evidence / Passed required gates / Insufficient evidence / Non-blocking follow-ups / Residual risk
- Decision

### 注意

- Mechanical pass だけで merge 可とは判断しません。
- Required fixes と backlog / rule feedback / accepted risk を混ぜません。
- final gate は `docs/ai/improvement-ledger.md` を直接更新せず、必要な場合に `improvement-ledger` へ渡せる候補を明示します。

## Code health review

### そのまま貼る依頼文

```text
review-code-health を使って、このdiffまたは指定範囲の技術負債、脆弱性/security weakness、リファクタ候補、コードスメル、保守性・テスト容易性・性能・依存関係リスク、dead code、重複、境界問題、repeated review finding を確認してください。
各findingは evidence、impact、severity、urgency、recommended action、scope guidance、AI-rule feedback を含め、current PRで直すものと separate PR / project-level improvement / no action に分けてください。
これは完全なセキュリティ監査、SAST、依存脆弱性スキャン、脅威モデリング、ペンテスト、コンプライアンスレビューの代替ではありません。
review-ai-quality、review-architecture-impact、review-adversarial-risk の責務は置き換えず、該当する場合だけroutingしてください。
```

### 使われる主なSkill

- `review-router`
- `review-code-health`
- `review-ai-quality` when ordinary implementation quality review is also required
- `review-architecture-impact` / `review-adversarial-risk` when specialized signals appear
- `evidence-ledger` when claims need evidence status

### 期待する出力

- category / evidence / impact
- severity / urgency / recommended action
- current PR blocker と backlog candidate の分離
- AI-rule feedback

### 注意

- すべてのPRで強制実行しません。
- 任意のリファクタ実装は行いません。
- abuse path、privacy risk、severe failure path がある場合は `review-adversarial-risk` にroutingします。

## Release readiness gate

### そのまま貼る依頼文

```text
release-readiness-gate を使って、このrelease candidateまたは bundled change set がship可能かを判断してください。
included PRs / commits / issues、excluded changes、CI / validation / test結果、migration / data影響、rollback、feature flags / rollout、monitoring / alerting、post-release verification、customer impact、release notes / communication、approval、residual risksを確認してください。
判断は ready / ready_with_conditions / defer / block / insufficient_evidence のいずれかにしてください。
deploy、publish、migration、external notification、release execution は実行しないでください。必要ならrisk-gateで承認要否を出してください。
```

### 使われる主なSkill

- `release-readiness-gate`
- `risk-gate` before deploy / publish / migration / external notification / release execution
- `review-final-merge-gate` for PR-level merge readiness when needed

### 期待する出力

- Release readiness decision
- Release scope
- Readiness summary
- Required before release
- Conditions / follow-up
- Residual risks
- Evidence reviewed

### 注意

- PR単体のmerge判断は `review-final-merge-gate`、release packageのready判定は `release-readiness-gate` です。
- ready判定はdeploy実行の承認ではありません。外部影響がある実行は `risk-gate` が先です。

## Improvement ledger update

### そのまま貼る依頼文

```text
improvement-ledger を使って、review-code-health やPRレビューで出たnon-blockingな負債、リファクタ候補、rule gap、validation check候補、accepted riskを docs/ai/improvement-ledger.md の形式に沿って整理してください。
current PR blocker は台帳に逃がさず Blocking evidence（必要なら詳細な Required fixes）に残し、non-blockingなものだけ separate PR / backlog / convert_to_rule / convert_to_check / accept / wont_fix / needs_more_evidence に分類してください。
各entryは ID、Source、Finding、Category、Evidence、Impact、Severity、Urgency、Decision、Recommended action、Prevention target、Owner / status、Refresh rule を含めてください。
repeated finding や high-impact single case がある場合だけ、Repeat pattern、Proposed rule or check、Why this target、Scope、convert / defer / reject / needs_more_evidence の判断も出してください。
```

### 使われる主なSkill

- `improvement-ledger`
- `review-code-health` only if findings still need detection
- `evidence-ledger` when resolution or readiness claims need evidence status

### 期待する出力

- ledger entry candidate
- current PR blocker と ledger candidate の分離
- prevention target / proposed rule or check when applicable
- owner / status / refresh rule

### 注意

- 検出は `review-code-health`、蓄積・仕分け・状態管理は `improvement-ledger` に分けます。
- project-specific entry は、対象projectの台帳にだけ追加します。
- evidence なしで durable rule / check に変換しません。
- `AGENTS.md` へ入れるのは常時必要なgeneric ruleだけです。

## Prevention rule feedback

### そのまま貼る依頼文

```text
improvement-ledger を使って、台帳内またはレビュー内の repeated finding / likely repeated finding / high-impact single case を、再発防止ruleまたはcheck候補に変換してください。
すべてを AGENTS.md に入れず、AGENTS.md、CUSTOM_INSTRUCTIONS.md、project overlay、SKILL.md、review checklist、validation script、lint/test/check、implementation context、review context のどこに置くべきかを evidence と scope から判断してください。
各候補は Finding、Repeat pattern、Prevention target、Proposed rule or check、Why this target、Evidence、Scope、Decision を含め、Decision は convert / defer / reject / needs_more_evidence から選んでください。
```

### 使われる主なSkill

- `improvement-ledger`
- `evidence-ledger` when repeat pattern or readiness claims need evidence status

### 期待する出力

- repeated / likely repeated / high-impact single case の分類
- prevention target の根拠
- proposed rule or check
- convert / defer / reject / needs_more_evidence

### 注意

- hypothesis のまま durable rule にしません。
- mechanically detectable なものは validation script / lint / test / check を優先します。
- project-specific なものは project overlay や context に寄せ、always-on kernel を肥大化させません。

## Output quality review

### そのまま貼る依頼文

```text
review-output-quality を使って、UI、docs、通知、CLI、API response、generated text、AI/system-consumed output としての品質をレビューしてください。
利用できる場合は docs/ai/review-context.md を読み、persona、medium、output contract に対する適合を確認してください。
```

### 使われる主なSkill

- `review-output-quality`
- `review-context-generation` if reusable context is missing and requested

### 期待する出力

- consumer fit
- structure / completeness
- contract fit

### 注意

- persona や output contract が不明なら insufficient evidence とします。

## Adversarial risk review

### そのまま貼る依頼文

```text
review-adversarial-risk を使って、通常レビュー後に残る高impactの失敗経路、misuse、blast radiusを確認してください。
利用できる場合は docs/ai/review-context.md を読み、known issueやaccepted riskの再報告は避けてください。
最大3件程度の重要リスクに絞ってください。
```

### 使われる主なSkill

- `review-adversarial-risk`
- `risk-gate` when external or destructive impact exists

### 期待する出力

- high-impact failure paths
- blast radius
- mitigation or stop condition

### 注意

- 通常レビューの全項目を繰り返しません。

## Review context generation

### そのまま貼る依頼文

```text
review-context-generation を使って、このrepoのレビュー判断contextを docs/ai/review-context.md に整理してください。
project identity、persona、output contract、critical workflow、accepted risk、known issue、noise-control rule を evidence status 付きで残してください。
task progress は書かないでください。
```

### 使われる主なSkill

- `review-context-generation`
- `repository-orientation`

### 期待する出力

- `docs/ai/review-context.md`
- review gate が再利用できる判断材料

### 注意

- 実装判断用の情報は `docs/ai/implementation-context.md` に分けます。

## MR/PR README generation

### そのまま貼る依頼文

```text
mr-readme-generation を使って、このPRの説明を docs/pr 配下のPR専用READMEとして作成してください。
PR概要、影響範囲、リスク、切り戻し方針、ドメイン領域、アーキテクチャー判断ログ、設計思想、検証結果、後続AI向け再利用メモを含めてください。
hard-to-reverse な判断がある場合は adr-review も使ってください。
```

### 使われる主なSkill

- `mr-readme-generation`
- `adr-review` when needed

### 期待する出力

- durable change context
- reviewer向け説明
- future AI reuse notes

### 注意

- merge decision が必要な場合だけ `review-router` を使います。

## Handoff to another agent

### そのまま貼る依頼文

```text
handoff-generation を使って、次のAgentに渡せるタスク指示を作ってください。
Task、Context、Allowed scope、Forbidden scope、Expected output、Verification、Stop condition を必ず含めてください。
事実、推論、未確認を分けてください。
```

### 使われる主なSkill

- `handoff-generation`
- `evidence-ledger`

### 期待する出力

- 次のAgentがそのまま実行できる依頼
- 残リスクと未確認事項

### 注意

- 汎用的な助言ではなく、具体的な次タスクにします。
