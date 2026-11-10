# ReviewOps — SES向け設計書 v0.1

**Status:** P0完了後のP1/P2計画を含む設計
**Target:** VS Code Extension + Local Core Engine
**Primary Language:** TypeScript
**Project Name:** ReviewOps
**Marketplace Name:** ReviewOps Guard
**Date:** 2026-05-06

---

## 1. 設計結論

ReviewOps は、SES会社向けに「レビュー業務を入口にした技術育成・技術評価・現場横断ナレッジ化」を実現する。

アーキテクチャは次の3層に分ける。

```text
VS Code Extension Layer
  └─ UI / commands / sidebar / webview / SecretStorage

ReviewOps Core Layer
  └─ flows / cycles / artifacts / rules / knowledge / skill evidence / reports

Provider Adapter Layer
  ├─ P0 current: local git / GitHub
  └─ P1+ target: GitLab / Backlog / Jira / Issue providers
```

重要な設計判断は次である。

1. `DevKit` という名前と `.devkit/` は捨てる
2. 表のプロダクト名は `ReviewOps` に統一する
3. VS Code 拡張名は `ReviewOps Guard` とする
4. 設定・成果物ディレクトリは `.reviewops/` と `.reviewops.local/` にする
5. P0では外部AI APIに直接通信しない
6. AI回答は `response/import` で取り込む
7. 投稿はすべて preview-first とする
8. 評価機能は自動採点ではなく skill evidence と field report に留める
9. portable knowledge は承認制にする
10. core は VS Code API から独立させる
11. P1はローカル拡張として issue / check / team lead workflow を追加する
12. P2は ReviewOps Hub による承認・集約・配布を追加し、P0/P1のローカル利用をHub必須にしない

---

## 2. システム全体構成

現行リポジトリの主要構成は次である。

```text
reviewops/
├─ packages/
│  ├─ core/
│  │  └─ src/
│  ├─ providers/
│  │  └─ src/
│  └─ vscode-extension/
│     ├─ src/
│     ├─ resources/
│     ├─ l10n/
│     └─ package.json
│
├─ docs/
│  ├─ requirements.md
│  └─ design.md
├─ scripts/
├─ tests/
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

P1/P2 の目標構成では、GitLab / Backlog / Jira / IssueProvider、knowledge pack、Hub sync などを追加する。ただし P0 の現行 provider 実装は `local-git` と `github` である。

---

## 3. レイヤ設計

### 3.1 VS Code Extension Layer

責務:

- Command Palette 登録
- Side Bar TreeView
- Webview Report
- token の SecretStorage 管理
- provider setup UI
- artifact を editor / webview で開く
- publish draft の preview / confirm
- core API の呼び出し

禁止事項:

- flow business logic を持たない
- providerごとのAPI仕様を直接持たない
- `.reviewops/` のファイル構造を直接散らばって触らない
- AI API SDK を依存関係に追加しない

### 3.2 ReviewOps Core Layer

責務:

- FlowManifest 管理
- FlowRun 状態遷移
- Prompt 生成
- Response import / normalize
- Artifact read/write
- ActionPlan 生成
- RuleCandidate 抽出
- KnowledgeCandidate 抽出
- SkillEvidence 記録
- FieldReport 生成
- NextAction 推論

禁止事項:

- VS Code API に依存しない
- provider HTTP details を持たない
- token を扱わない
- 外部AI APIを呼ばない

### 3.3 Provider Adapter Layer

責務:

- P0では local git / GitHub との通信
- P1以降では GitLab / Backlog / Jira / IssueProvider を追加する
- providerごとの差異を ReviewProvider / IssueProvider interface に変換
- API request / response mapping
- pagination / rate limit / retry の局所処理

禁止事項:

- core flow logic を持たない
- VS Code UI を持たない
- token保存方法を決めない

---

## 4. ワークスペースファイル構成

### 4.1 `.reviewops/`

共有可能な設定・知識・成果物を置く。

```text
.reviewops/
├─ config.yaml
├─ commands.json
├─ templates/
│  ├─ prompt-templates.yaml
│  └─ output-schemas.yaml
├─ knowledge/
│  ├─ coding-guidelines.yaml
│  ├─ review-rules.yaml
│  ├─ architecture-rules.yaml
│  ├─ docs-drift-rules.yaml
│  ├─ test-rules.yaml
│  ├─ generic-debt-patterns.yaml
│  ├─ project-debt.yaml
│  └─ roadmap-skills.yaml
└─ out/
```

### 4.2 `.reviewops.local/`

現場固有情報・個人作業状態を置く。

```text
.reviewops.local/
├─ project-context.local.yaml
├─ project-rules.local.yaml
├─ project-debt.local.yaml
├─ provider-target.local.yaml
├─ prompt-packs.local/
├─ ai-responses.local/
├─ raw-findings.local.jsonl
├─ field-evidence.local.jsonl
├─ metrics-events.local.jsonl
└─ current-cycle.local.json
```

`.reviewops.local/` は `.gitignore` に入れる。

```gitignore
.reviewops.local/
```

### 4.3 Flow出力

```text
.reviewops/out/<flow-slug>/<run-id>/
├─ flow-run.json
├─ input-summary.md
├─ prompt.md
├─ response.raw.md
├─ result.md
├─ result.json
├─ review-findings.json
├─ action-plan.json
├─ publish.draft.md
├─ knowledge-candidates.json
├─ rule-candidates.json
├─ skill-evidence.json
└─ next-actions.json
```

`issue-drafts.json` などの issue 連携成果物は P1 以降で追加する。

### 4.4 Action Log

投稿系操作は global log に保存する。

```text
.reviewops/out/actions.jsonl
```

1行1JSON。

```json
{
  "id": "act_20260504_001",
  "createdAt": "2026-05-04T12:00:00+09:00",
  "provider": "github",
  "mode": "summary-comment",
  "targetId": "pull:123",
  "draftId": "draft-001",
  "status": "posted",
  "url": "https://github.com/org/repo/pull/123#issuecomment-456"
}
```

---

## 5. Core Type設計

### 5.1 Flow Manifest

```ts
export type FlowType = 'atomic' | 'composite' | 'cycle' | 'meta';
export type FlowPriority = 'P0' | 'P1' | 'P2';

export interface FlowManifestEntry {
  id: string;
  title: string;
  type: FlowType;
  priority: FlowPriority;
  description: string;
  aiExecution: 'manual-only';
  network: {
    ai: false;
    devServices: boolean;
  };
  inputs: FlowInputSpec[];
  outputs: FlowOutputSpec[];
  sideEffects: FlowSideEffect[];
  knowledgeHooks: KnowledgeHookId[];
  skillHooks: SkillHookId[];
  nextActions: string[];
}
```

### 5.2 Flow Run

```ts
export type FlowRunStatus =
  | 'created'
  | 'prepared'
  | 'prompt_generated'
  | 'awaiting_ai_response'
  | 'response_imported'
  | 'artifact_generated'
  | 'action_planned'
  | 'ready_to_publish'
  | 'published'
  | 'knowledge_captured'
  | 'skill_evidence_captured'
  | 'failed';

export interface FlowRun {
  id: string;
  flowId: string;
  cycleId?: string;
  status: FlowRunStatus;
  createdAt: string;
  updatedAt: string;
  target?: ReviewTargetRef | IssueRef | WorkItemRef;
  artifacts: FlowArtifactRef[];
  nextActions: NextAction[];
  error?: FlowRunError;
}
```

### 5.3 Review Target

```ts
export type ReviewProviderKind = 'local-git' | 'github' | 'gitlab' | 'backlog';

export interface ReviewTargetRef {
  provider: ReviewProviderKind;
  repository: string;
  id: string;
  url?: string;
}

export interface ReviewTarget {
  ref: ReviewTargetRef;
  title: string;
  author?: string;
  sourceBranch?: string;
  targetBranch?: string;
  status?: 'open' | 'merged' | 'closed' | 'draft' | 'unknown';
  createdAt?: string;
  updatedAt?: string;
}
```

### 5.4 Review Diff

```ts
export interface ReviewDiff {
  target: ReviewTargetRef;
  files: ReviewDiffFile[];
  summary: {
    changedFiles: number;
    additions?: number;
    deletions?: number;
    backendTouched: boolean;
    frontendTouched: boolean;
    testTouched: boolean;
    docsTouched: boolean;
    configTouched: boolean;
  };
}

export interface ReviewDiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  patch?: string;
}
```

### 5.5 Review Finding

```ts
export type ReviewFindingCategory =
  | 'bug_risk'
  | 'architecture_boundary'
  | 'test_gap'
  | 'docs_drift'
  | 'spec_confirmation'
  | 'misunderstanding'
  | 'style'
  | 'good_practice'
  | 'rule_candidate'
  | 'debt_pattern_candidate';

export interface ReviewFinding {
  id: string;
  category: ReviewFindingCategory;
  severity: 'critical' | 'warning' | 'suggestion' | 'info';
  title: string;
  summary: string;
  file?: string;
  line?: number;
  sourceCommentId?: string;
  evidence?: string;
  suggestedNextFlow?: string;
}
```

### 5.6 Review Action Plan

```ts
export type ReviewDecision =
  | 'fix_now'
  | 'explain_only'
  | 'ask_clarification'
  | 'create_issue'
  | 'defer'
  | 'reject_with_reason'
  | 'already_fixed'
  | 'duplicate'
  | 'rule_candidate';

export interface ReviewActionItem {
  id: string;
  sourceId: string;
  sourceType: 'review-finding' | 'comment' | 'test-gap' | 'docs-drift';
  summary: string;
  decision: ReviewDecision;
  reason: string;
  nextFlow?: string;
  requiresCodeChange: boolean;
  requiresReply: boolean;
  requiresIssue: boolean;
  requiresRuleCandidate: boolean;
}

export interface ReviewActionPlan {
  items: ReviewActionItem[];
  summary: {
    fixNowCount: number;
    explainOnlyCount: number;
    issueCount: number;
    ruleCandidateCount: number;
  };
}
```

### 5.7 Rule Candidate

```ts
export type RuleCandidateKind =
  | 'coding-guideline'
  | 'review-rule'
  | 'architecture-rule'
  | 'docs-drift-rule'
  | 'test-rule'
  | 'generic-debt-pattern';

export type KnowledgeScope =
  | 'project-local'
  | 'portable-candidate'
  | 'organization-portable'
  | 'prohibited';

export interface RuleCandidate {
  id: string;
  kind: RuleCandidateKind;
  title: string;
  rationale: string;
  source: {
    flowRunId: string;
    artifactId?: string;
    commentId?: string;
    findingId?: string;
  };
  scope: KnowledgeScope;
  suggestedRule?: Record<string, unknown>;
  reviewQuestions?: string[];
  mentorHints?: string[];
  risks?: string[];
  mitigations?: string[];
  status: 'new' | 'duplicate' | 'merge_needed' | 'conflict' | 'applied' | 'rejected';
}
```

### 5.8 Knowledge Candidate

```ts
export type KnowledgeCandidateKind =
  | 'good-practice'
  | 'review-tip'
  | 'generic-debt-pattern'
  | 'roadmap-skill'
  | 'coding-guideline'
  | 'project-debt';

export interface KnowledgeCandidate {
  id: string;
  kind: KnowledgeCandidateKind;
  title: string;
  summary: string;
  details?: string;
  sourceFlowRunId: string;
  scope: KnowledgeScope;
  status: 'candidate' | 'accepted' | 'rejected' | 'promoted';
}
```

### 5.9 Skill Evidence

```ts
export type SkillSignalKind =
  | 'bug-risk-detection'
  | 'architecture-boundary-understanding'
  | 'test-design'
  | 'docs-drift-awareness'
  | 'review-response-quality'
  | 'fix-planning'
  | 'technical-explanation'
  | 'rule-extraction'
  | 'good-practice-recognition';

export interface SkillEvidence {
  id: string;
  flowRunId: string;
  target?: ReviewTargetRef;
  createdAt: string;
  kind: SkillSignalKind;
  title: string;
  summary: string;
  evidenceRefs: FlowArtifactRef[];
  strength: 'weak' | 'medium' | 'strong';
  evaluationUse: 'self-review' | 'mentor-review' | 'field-report';
  notes?: string;
}
```

### 5.10 Field Report

```ts
export interface FieldReport {
  id: string;
  period: {
    from: string;
    to: string;
  };
  targetScope: 'developer' | 'field' | 'reviewer' | 'team';
  summary: string;
  resolvedFindings: number;
  unresolvedRisks: number;
  addedTests: number;
  ruleCandidates: number;
  knowledgeCandidates: number;
  skillSignals: SkillEvidence[];
  portableKnowledgeCandidates: KnowledgeCandidate[];
  recommendedMentorActions: string[];
  markdownPath: string;
  jsonPath: string;
}
```

---

## 6. Provider Interface設計

### 6.1 ReviewProvider

```ts
export interface ReviewProvider {
  kind: ReviewProviderKind;

  listReviewTargets(input: ListReviewTargetsInput): Promise<ReviewTarget[]>;

  getReviewTarget(target: ReviewTargetRef): Promise<ReviewTarget>;

  getDiff(target: ReviewTargetRef): Promise<ReviewDiff>;

  getComments(target: ReviewTargetRef): Promise<ReviewComment[]>;

  postSummaryComment(
    target: ReviewTargetRef,
    body: string
  ): Promise<PostResult>;

  postReplies?(
    target: ReviewTargetRef,
    replies: ReviewReply[]
  ): Promise<PostResult[]>;
}
```

### 6.2 IssueProvider P1以降

```ts
export type IssueProviderKind =
  | 'jira'
  | 'backlog'
  | 'github-issues'
  | 'gitlab-issues'
  | 'none';

export interface IssueProvider {
  kind: IssueProviderKind;

  listProjects?(): Promise<IssueProject[]>;

  listIssueTypes?(projectRef: IssueProjectRef): Promise<IssueType[]>;

  createIssue(input: CreateIssueInput): Promise<IssueRef>;

  createIssues(inputs: CreateIssueInput[]): Promise<IssueRef[]>;

  postIssueComment?(issue: IssueRef, body: string): Promise<PostResult>;
}
```

### 6.3 Token Handling

Provider adapter は token を直接保存しない。VS Code Extension Layer が SecretStorage から token を取得し、adapter factory に渡す。

```ts
export interface ProviderCredentialResolver {
  getToken(provider: ReviewProviderKind | IssueProviderKind): Promise<string | undefined>;
}
```

---

## 7. Flow Engine設計

### 7.1 Flow Executor

```ts
export interface FlowExecutorContext {
  workspaceRoot: string;
  now: () => Date;
  artifactStore: ArtifactStore;
  configStore: ConfigStore;
  providerRegistry: ProviderRegistry;
  logger: ReviewOpsLogger;
}

export interface FlowExecutor<I = unknown, O = unknown> {
  flowId: string;
  execute(input: I, context: FlowExecutorContext): Promise<O>;
}
```

### 7.2 Flow Registry

```ts
export interface FlowRegistry {
  list(): FlowManifestEntry[];
  get(flowId: string): FlowManifestEntry | undefined;
}
```

### 7.3 State Transition Policy

FlowRun は定義済み状態以外へ遷移できない。

```ts
export interface FlowRunTransition {
  from: FlowRunStatus;
  to: FlowRunStatus;
  reason: string;
  at: string;
}
```

状態遷移は artifact に記録する。

---

## 8. Prompt / Response設計

### 8.1 Prompt Template

```yaml
id: diff-review-default
flowId: diff/review
version: 1
sections:
  - id: purpose
    title: Purpose
  - id: projectContext
    title: Project Context
  - id: target
    title: Target
  - id: diffSummary
    title: Diff Summary
  - id: rules
    title: Rules / Guidelines
  - id: task
    title: Task
  - id: expectedOutput
    title: Expected Output
  - id: outputSchema
    title: Output JSON Schema
```

### 8.2 Prompt 共通構造

```md
# ReviewOps Prompt

## Purpose

## Project Context

## Target

## Input Summary

## Rules / Guidelines

## Task

## Expected Output

## Output JSON Schema
```

### 8.3 Response Normalize

処理順:

1. JSON fenced block を抽出
2. JSON parse
3. schema validation
4. Markdown heading parse
5. fallback result生成
6. user edit required flag を立てる

```ts
export interface NormalizeResult {
  success: boolean;
  structured: boolean;
  resultJson?: unknown;
  resultMarkdown: string;
  warnings: string[];
  requiresUserEdit: boolean;
}
```

---

## 9. Knowledge設計

### 9.1 Knowledge Scope

```text
project-local
  現場内でのみ使う。顧客・案件固有情報を含み得る。

portable-candidate
  汎用化候補。まだ共有不可。

organization-portable
  承認済み。社内横展開可能。

prohibited
  機密・固有・再利用不可。
```

### 9.2 Portable昇格チェック

portable candidate を organization-portable に昇格する前に、最低限次を確認する。

- 顧客名が含まれていない
- リポジトリ名が含まれていない
- URLが含まれていない
- 障害情報が含まれていない
- 固有仕様が含まれていない
- 個人名が含まれていない
- 汎用ルールとして表現されている
- 別技術スタックでも意味があるか確認した

### 9.3 Rules Reconcile

`rules/reconcile` は以下を行う。

- 既存ルールとの重複検出
- 同義ルールの merge 提案
- 矛盾検出
- 粒度が細かすぎる候補の local 降格
- portable 不適切候補の prohibited 化

---

## 10. Skill Evidence設計

### 10.1 基本思想

ReviewOps は人事評価を自動化しない。

代わりに、技術的行動の証跡を残す。

評価者は field report と skill evidence を見て、本人との1on1や育成計画に使う。

### 10.2 Skill Evidence生成ポイント

- review/action-plan 実行時
- research/action-plan 実行時
- refactor/plan 実行時
- refactor/verify 実行時
- fix/plan 実行時
- fix/verify 実行時
- review/reply-drafts 実行時
- rules/propose 実行時
- field/report 実行時

### 10.3 Skill Evidenceの扱い

- 本人が確認できる
- 自動点数化しない
- mentor review の材料にする
- field report へ要約する
- portable knowledge とは分ける

---

## 11. VS Code Extension設計

### 11.1 package.json contribution

現行 package.json の代表的な contribution は次である。詳細な完全一覧は `packages/vscode-extension/package.json` を source of truth とする。

```json
{
  "name": "reviewops-guard",
  "displayName": "%reviewops.displayName%",
  "categories": ["Other", "Linters"],
  "activationEvents": [
    "onCommand:reviewops.initializeProject",
    "onCommand:reviewops.commandCenter",
    "onCommand:reviewops.nextAction",
    "onCommand:reviewops.prepareLocalDiffReview",
    "onCommand:reviewops.prepareGitHubPullRequestReview",
    "onCommand:reviewops.importManualReviewResponse",
    "onCommand:reviewops.previewGitHubSummaryComment",
    "onCommand:reviewops.previewGitHubReplyComment",
    "workspaceContains:.reviewops/config.yaml"
  ],
  "contributes": {
    "commands": [
      {
        "command": "reviewops.initializeProject",
        "title": "%reviewops.command.initializeProject.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.commandCenter",
        "title": "%reviewops.command.commandCenter.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.nextAction",
        "title": "%reviewops.command.nextAction.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.status",
        "title": "%reviewops.command.status.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.prepareLocalDiffReview",
        "title": "%reviewops.command.prepareLocalDiffReview.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.prepareGitHubPullRequestReview",
        "title": "%reviewops.command.prepareGitHubPullRequestReview.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.importManualReviewResponse",
        "title": "%reviewops.command.importManualReviewResponse.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.previewGitHubSummaryComment",
        "title": "%reviewops.command.previewGitHubSummaryComment.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.previewGitHubReplyComment",
        "title": "%reviewops.command.previewGitHubReplyComment.title%",
        "category": "ReviewOps"
      },
      {
        "command": "reviewops.generateFieldReport",
        "title": "%reviewops.command.generateFieldReport.title%",
        "category": "ReviewOps"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "reviewops",
          "title": "ReviewOps",
          "icon": "resources/reviewops-activitybar.svg"
        }
      ]
    },
    "views": {
      "reviewops": [
        {
          "id": "reviewops.statusView",
          "name": "%reviewops.view.status.name%"
        },
        {
          "id": "reviewops.reviewWorkView",
          "name": "%reviewops.view.reviewWork.name%"
        },
        {
          "id": "reviewops.knowledgeView",
          "name": "%reviewops.view.knowledge.name%"
        },
        {
          "id": "reviewops.skillEvidenceView",
          "name": "%reviewops.view.skillEvidence.name%"
        },
        {
          "id": "reviewops.reportsView",
          "name": "%reviewops.view.reports.name%"
        }
      ]
    }
  }
}
```

### 11.2 Command Handler設計

VS Code command handler は薄くする。

```ts
export async function initializeProjectCommand(ctx: ExtensionContext) {
  const workspaceRoot = resolveWorkspaceRoot();
  const result = await core.projectInit({ workspaceRoot });
  await refreshViews();
  await openArtifact(result.summaryArtifact);
}
```

### 11.3 Sidebar Provider

- `NextActionsTreeProvider`
- `ReviewWorkTreeProvider`
- `KnowledgeTreeProvider`
- `SkillEvidenceTreeProvider`
- `ReportsTreeProvider`

### 11.4 Webview

P0 Webview:

- Publish draft preview
- Field report preview
- Rule candidate review
- Integration setup

---

## 12. Security設計

### 12.1 SecretStorage

P0で実装済みの token は GitHub である。GitLab / Jira / Backlog は P1以降の provider 追加時に扱う。

```ts
export interface SecretKeys {
  githubToken: 'reviewops.github.token';
  gitlabToken?: 'reviewops.gitlab.token';
  jiraToken?: 'reviewops.jira.token';
  backlogToken?: 'reviewops.backlog.token';
}
```

### 12.2 AI Network Guard

P0では次を policy test で検査する。

- `openai` dependency がない
- `@anthropic-ai/*` dependency がない
- `@google/generative-ai` dependency がない
- `azure openai` SDK dependency がない
- known AI API host への fetch 実装がない

### 12.3 Publish Safety

```ts
export interface PublishDraft {
  id: string;
  provider: ReviewProviderKind | IssueProviderKind;
  target: ReviewTargetRef | IssueRef;
  title: string;
  body: string;
  mode: 'summary-comment' | 'reply' | 'issue-create' | 'issue-comment';
  requiresConfirmation: true;
  status: 'draft' | 'posted' | 'failed';
}
```

投稿コマンドは `requiresConfirmation: true` の draft 以外を受け付けない。

---

## 13. P0実装順序

### Milestone 0: Repository Bootstrap

成果:

- pnpm workspace
- packages/core
- packages/providers
- packages/vscode-extension
- TypeScript build
- test runner
- lint
- basic README

Done:

- `pnpm test` が通る
- VS Code extension が起動する

### Milestone 1: Core Foundation

実装:

- core types
- FlowManifest
- FlowRun
- ArtifactStore
- ConfigStore
- ProjectInit
- meta/list
- meta/status skeleton

Done:

- `.reviewops/` と `.reviewops.local/` を生成できる
- flow manifest を読み込める
- artifact を保存できる

### Milestone 2: Prompt / Response

実装:

- prompt template loader
- prompt renderer
- response import
- response normalize skeleton
- artifact open

Done:

- local diff を input に prompt を生成できる
- raw response を保存できる
- result skeleton を生成できる

### Milestone 3: VS Code UI

実装:

- commands
- sidebar
- artifact open
- publish draft webview skeleton

Done:

- `ReviewOps: Initialize Project`
- `ReviewOps: Next Action`
- `ReviewOps: Open Artifacts`

### Milestone 4: Local Git Provider

実装:

- changed files
- diff
- branch info
- commit range option

Done:

- local diff review prompt が生成できる

### Milestone 5: GitHub Provider MVP

実装:

- token setup
- list targets
- get diff
- get comments
- post summary comment

Done:

- GitHub PR diff/comments を取得できる
- summary draft を preview-first で投稿できる

### Milestone 6: Review / Comment / Fix Flows

実装:

- review/select-target
- diff/review
- response/import
- response/normalize
- review/action-plan
- provider/fetch-review
- review/comment-triage
- review/reply-drafts
- publish/summary-draft
- publish/reply-draft
- fix/plan
- fix/checklist
- fix/verify
- fix/explain
- refactor/plan
- refactor/checklist
- refactor/verify
- refactor/explain

Done:

- レビュー取得、コメント対応、修正対応、リファクタリング計画から必要な成果物まで進められる

### Milestone 6.5: Research Flows

実装:

- research/select-scope
- research/investigate
- research/import-findings
- research/normalize-findings
- research/action-plan

Done:

- 調査サイクルをレビュー回答フローに乗せず、調査結果とフォローアップへ構造化できる

### Milestone 7: Knowledge / Skill / Report

実装:

- rules/propose
- rules/reconcile
- rules/apply
- knowledge/capture-candidates
- skill/evidence-capture
- field/report

Done:

- rule candidate を保存できる
- skill evidence を保存できる
- field report を生成できる

### Milestone 8: Cycle / Meta

実装:

- cycle/mr-review
- cycle/comment-response
- cycle/fix-review
- cycle/research
- cycle/refactoring
- cycle/field-report
- meta/next
- meta/resume
- meta/readiness

構成方針:

- MRレビューは、対象選択、差分レビュー、回答取り込み、レビュー概要、証跡化までを必須経路にする。`review/action-plan` 後は summary draft へ進め、コメント対応用の修正・返信投稿は別サイクルに分ける。
- コメント対応は、provider コメント取得から triage、修正、検証、返信下書き、preview-first 投稿までを必須経路にする。
- 修正レビューは、既存修正の再レビューと追加対応の検証を目的にし、コメント返信投稿は必須経路にしない。
- 調査は `research/*` の範囲選択、調査、取り込み、正規化、フォローアップ計画に閉じる。`research/action-plan` 後は knowledge capture へ進め、レビュー回答・修正・投稿フローを混ぜない。
- リファクタリングは `refactor/*` の計画、チェックリスト、検証、説明に閉じ、レビュー回答・修正・投稿フローを混ぜない。
- フィールドレポートは knowledge / skill / report の証跡化に閉じ、レビュー・修正・投稿フローを混ぜない。

Done:

- Next Action だけで主要業務を進められる

---

## 14. P1/P2設計

### 14.1 P1設計方針

P1は、P0のlocal-first / manual-only / preview-firstを維持したまま、作業対象を「個人のレビュー対応」から「チームで追跡するレビュー運用」へ広げる。Hubやクラウド同期はまだ導入しない。

追加する設計要素:

```text
ReviewOps Core Layer
  ├─ issues/
  │  ├─ draft-builder
  │  ├─ link-store
  │  └─ provider-publish-policy
  ├─ checks/
  │  ├─ docs-drift
  │  └─ architecture-boundary
  ├─ team-lead/
  │  ├─ review-board
  │  └─ unresolved-risk
  ├─ roadmap/
  │  └─ skill-roadmap
  └─ packs/
     ├─ export
     └─ import

Provider Adapter Layer
  ├─ backlog review provider
  ├─ jira issue provider
  ├─ backlog issue provider
  ├─ github issues provider
  └─ gitlab issues provider
```

### 14.2 P1 Flow

P1で追加するflow:

```text
issue/draft
issue/create
issue/link-review-target
check/docs-drift
check/architecture-boundary
team-lead/review
team-lead/unresolved-risk
knowledge/export-pack
knowledge/import-pack
skill/roadmap
field/monthly-report
```

代表cycle:

```text
cycle/team-lead-review
  → meta/status
  → team-lead/unresolved-risk
  → check/docs-drift
  → check/architecture-boundary
  → issue/draft
  → rules/reconcile
  → skill/roadmap
  → team-lead/review
```

```text
cycle/issue-followup
  → review/action-plan
  → issue/draft
  → issue/create
  → issue/link-review-target
  → review/reply-drafts
  → publish/reply-draft
  → field/report
```

### 14.3 P1 Data Model

```ts
export interface IssueDraft {
  id: string;
  sourceActionItemId: string;
  provider: IssueProviderKind;
  projectRef?: IssueProjectRef;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  labels: string[];
  reviewTarget?: ReviewTargetRef;
  requiresConfirmation: true;
  status: 'draft' | 'posted' | 'skipped' | 'failed';
}

export interface IssueLink {
  id: string;
  issue: IssueRef;
  reviewTarget?: ReviewTargetRef;
  sourceActionItemId: string;
  createdAt: string;
}

export interface DesignCheckFinding {
  id: string;
  kind: 'docs-drift' | 'architecture-boundary';
  severity: 'critical' | 'warning' | 'suggestion' | 'info';
  title: string;
  summary: string;
  file?: string;
  ruleId?: string;
  suggestedAction: 'update_docs' | 'refactor_boundary' | 'create_issue' | 'explain_only';
}

export interface SkillRoadmap {
  id: string;
  period: { from: string; to: string };
  targetScope: 'developer' | 'team' | 'field';
  signals: SkillEvidence[];
  recommendedFocus: Array<{
    skill: SkillSignalKind;
    reason: string;
    nextReviewPractice: string;
  }>;
}

export interface KnowledgePack {
  id: string;
  createdAt: string;
  sourceWorkspaceId: string;
  rules: RuleCandidate[];
  knowledge: KnowledgeCandidate[];
  fieldReportRefs: FlowArtifactRef[];
  status: 'local-build' | 'exported' | 'imported';
}
```

P1 artifact:

```text
.reviewops/out/<flow-slug>/<run-id>/
├─ issue-drafts.json
├─ issue-links.json
├─ docs-drift-findings.json
├─ architecture-boundary-findings.json
├─ team-lead-review.md
├─ skill-roadmap.json
├─ monthly-field-report.md
├─ monthly-field-report.json
└─ knowledge-pack.local.json
```

`monthly-field-report.md` は閲覧用、`monthly-field-report.json` はHub同期・集約用の正規入力とする。

### 14.4 P1 Provider設計

Backlog Pull Request は `ReviewProvider` として実装する。Backlog issue、Jira、GitHub Issues、GitLab Issues は `IssueProvider` として実装する。

Provider共通方針:

- token は VS Code SecretStorage から渡す
- provider adapter は投稿前確認を行わず、core の `PublishDraft` / `IssueDraft` policy に従う
- 投稿結果は `PostResult` または `IssueRef` に正規化する
- rate limit / pagination / retry は adapter 内に閉じ込める
- provider固有のcustom fieldは P1 では best-effort mapping に留める

### 14.5 P1 Check Engine設計

`check/docs-drift` は、変更ファイル、既存docs、`.reviewops/knowledge/docs-drift-rules.yaml` を入力にし、docs更新要否を `DesignCheckFinding` として出す。

`check/architecture-boundary` は、`.reviewops/knowledge/architecture-rules.yaml` と project context を入力にし、依存方向、レイヤ境界、公開APIの逸脱を `DesignCheckFinding` として出す。

P1では静的解析を過度に一般化しない。まずは次を優先する。

- file path / glob rule
- import path rule
- changed file category
- manually maintained architecture rule
- response import から得た補助finding

### 14.6 P1 Team Lead Workflow設計

team lead artifact は、次の判断を1つのviewまたはmarkdownで行えるようにする。

- 今日対応すべき未解決リスク
- issue化すべき指摘
- ルール化すべき繰り返し指摘
- portable candidate にできる知見
- 育成ロードマップへ入れるべき skill signal
- 月次field reportへ載せるべき根拠

自動評価点は出さない。判断の根拠は artifact link と source flow run id で辿れるようにする。

### 14.7 P2設計方針

P2は ReviewOps Hub を追加する。Hub は P1の `knowledge-pack.local.json`、`monthly-field-report.json`、`skill-roadmap.json`、`field-evidence.jsonl` を取り込み、承認・分析・配布を行う。

P2でも、P0/P1のローカル機能はHubなしで動く。Hubは組織運用の追加層であり、VS Code Extension と Core の基本設計を置き換えない。

```text
ReviewOps Hub
  ├─ intake API / bundle import
  ├─ approval workflow
  ├─ organization knowledge registry
  ├─ rule distribution
  ├─ field analytics
  ├─ roadmap board
  └─ audit log

VS Code Extension
  └─ Hub sync client / offline bundle import-export
```

### 14.8 P2 Hub Data Model

```ts
export interface HubSyncBundle {
  id: string;
  createdAt: string;
  sourceWorkspaceId: string;
  contents: {
    knowledgePack?: KnowledgePack;
    fieldReports?: FieldReport[];
    skillRoadmaps?: SkillRoadmap[];
    fieldEvidence?: SkillEvidence[];
  };
  confidentialityReview: {
    reviewedBy?: string;
    status: 'not-reviewed' | 'reviewed' | 'needs-redaction';
  };
}

export interface KnowledgeApproval {
  id: string;
  candidateId: string;
  status: 'submitted' | 'needs_redaction' | 'approved' | 'rejected' | 'distributed';
  submittedBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
  sourceArtifactRefs: FlowArtifactRef[];
  notes?: string;
}

export interface OrganizationKnowledgePack {
  id: string;
  version: string;
  rules: RuleCandidate[];
  knowledge: KnowledgeCandidate[];
  approvals: KnowledgeApproval[];
  distributedAt?: string;
}
```

### 14.9 P2 Approval / Distribution設計

承認フロー:

```text
portable-candidate
  → submitted
  → needs_redaction | approved | rejected
  → organization-portable
  → distributed
```

必須policy:

- 顧客名、リポジトリ名、URL、障害情報、個人名、固有仕様は昇格前に確認する
- organization-portable への昇格は approver と source artifact を必須にする
- distribution は workspace 側で preview / accept する
- distributed rule は適用履歴を `.reviewops/out/actions.jsonl` またはHub audit logへ残す

### 14.10 P2 Analytics / Dashboard設計

P2 dashboard は、評価確定ではなく技術判断の補助に限定する。

表示してよいもの:

- 指摘カテゴリの傾向
- 未解決リスクの推移
- ルール再利用数
- portable knowledge の承認状況
- skill roadmap の育成テーマ
- field report の生成状況

表示しないもの:

- 個人ランキング
- 自動評価点
- 勤怠・稼働監視
- 顧客固有情報の未承認表示

各指標は元artifact、field report、skill evidence、approval logへ drill-down できることを必須にする。

### 14.11 P1/P2実装順序

P1:

1. IssueDraft / IssueLink model と artifact を追加する
2. IssueProvider interface と fake provider test を追加する
3. Jira / Backlog / GitHub Issues / GitLab Issues の最小作成を実装する
4. Backlog Pull Request を ReviewProvider に追加する
5. docs drift / architecture boundary check を core flow として追加する
6. team lead review と skill roadmap を生成する
7. knowledge pack export/import と monthly field report を追加する

P2:

1. HubSyncBundle と OrganizationKnowledgePack のschemaを固定する
2. offline bundle import/export を先に実装する
3. approval workflow と audit log を実装する
4. organization knowledge registry と distribution を実装する
5. dashboard は artifact drill-down を満たしてから追加する
6. オンプレミス/閉域同期は bundle transport を差し替える形で追加する

---

## 15. Test設計

### 15.1 Unit Test

- FlowManifest validation
- FlowRun transition
- Artifact path generation
- Project init
- Prompt rendering
- Response normalize
- Action plan generation
- Rule candidate extraction
- Rule reconcile
- Skill evidence generation
- Field report generation
- Issue draft generation P1
- Docs drift finding generation P1
- Architecture boundary finding generation P1
- Skill roadmap aggregation P1
- Hub approval state transition P2

### 15.2 Integration Test

- local git provider
- fake GitHub provider
- fake GitLab provider P1
- fake Jira provider P1
- fake Backlog provider P1
- fake GitHub Issues provider P1
- fake GitLab Issues provider P1
- knowledge pack export/import P1
- Hub sync bundle import/export P2
- VS Code command smoke

### 15.3 Policy Test

- AI SDK dependency がない
- AI endpoint への直接通信がない
- token が設定ファイルに保存されない
- `.reviewops.local/` が gitignore される
- publish は confirmation required
- portable promotion は checklist required
- issue creation は confirmation required P1
- Hub approval は source artifact と approver required P2
- dashboard は source artifact drill-down required P2

---

## 16. 初期README骨子

```md
# ReviewOps

ReviewOps is a VS Code extension for SES teams that turns daily PR/MR review work into reusable engineering knowledge.

## Core Value

- Reduce review and comment response work
- Capture senior review knowledge as rules
- Preserve technical evidence for mentoring and field evaluation
- Connect knowledge across isolated client sites

## What ReviewOps Does

- Builds review prompts from PR/MR diffs and project context
- Imports AI or senior engineer responses manually
- Converts review findings into action plans
- Drafts replies and review summaries
- Captures rule candidates and good practices
- Generates field reports and skill evidence

## What ReviewOps Does Not Do in v0.1

- No direct external AI API calls
- No automatic code edits
- No automatic commit, push, approve, or merge
- No telemetry
- No automatic HR scoring
```

---

## 17. Codex初回実装指示

```text
You are implementing ReviewOps, a VS Code extension and local TypeScript core for SES engineering teams.

Read docs/requirements.md and docs/design.md first.

Implement Milestone 0 and Milestone 1 only.

Rules:
- Do not use the old DevKit name.
- Use ReviewOps for product naming.
- Use .reviewops/ and .reviewops.local/ for workspace files.
- Do not implement external AI API calls.
- Do not add OpenAI, Anthropic, Gemini, Azure OpenAI, or other LLM SDK dependencies.
- Keep core independent from VS Code APIs.
- VS Code extension owns UI and SecretStorage only.
- Provider adapters must be isolated under packages/providers.

Create:
- pnpm workspace
- packages/core
- packages/providers
- packages/vscode-extension
- core FlowManifest types
- FlowRun state types
- ArtifactStore
- ConfigStore
- project/init
- meta/list
- meta/status skeleton
- tests for manifest validation, project init, and artifact writing

Done:
- pnpm test passes
- .reviewops/ and .reviewops.local/ are created in a sample workspace
- flow manifest can be listed
- no AI SDK dependency exists
```

---

## 18. 設計上の本当の肝

ReviewOps の本質は、レビュー補助ではない。

本質は、**現場で消費されている技術判断を、育成・評価・横展開可能な形に変換すること**である。

ただし、それを前面に出すと現場エンジニアには重い。

そのため、UI上の入口は常に次に置く。

- レビューを楽にする
- コメント対応を楽にする
- 修正方針を作る
- 返信を作る
- 次に何をすべきか出す

育成・評価・横展開は、その結果として発生する副産物を使う。

この順序を間違えると、ReviewOps は監視ツールか管理ツールに見える。

この順序を守ると、ReviewOps は現場で使われる。

現場で使われれば、SES会社が本当に欲しい技術ナレッジが貯まる。
