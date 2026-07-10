# Agent Spectrum Kernel Quick Start 日本語版

このガイドは、Agent Spectrum Kernel を設計議論を追っていない人が最初の3分で使い始めるための入口です。詳しいSkill一覧は `docs/skill-matrix.md`、実例は `docs/workflow-examples.md`、そのまま貼れる依頼文は `docs/prompt-recipes-ja.md` を見てください。

## 3分で使う

### 1. まず入れるもの

最小構成:

```text
repo-root/
  AGENTS.md
```

Skill対応ツール:

```text
repo-root/
  AGENTS.md
  skills/
    */SKILL.md
```

このrepoのcheckoutから導入先repoへ投影する場合:

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
```

このrepoに更新が入った後は、checkoutを更新して同じコマンドを再実行します。

```bash
git pull
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
```

installer は `AGENTS.md` の managed block、`CUSTOM_INSTRUCTIONS.md`、`skills/<name>/SKILL.md`、`.agent-spectrum-kernel/install-state.json` を更新します。managed file は前回stateのhashと導入先の現在hashが一致する場合だけ更新し、ローカル改変がある場合は `--force` なしでは失敗します。`--check`、`--dry-run`、`--prune`、`--rollback`、`--detach` を使えます。`--detach` は実行面を外し、project-owned contentを残します。

導入状態を確認する場合:

```bash
node scripts/ask-doctor.mjs --target /path/to/adopting-repo
```

`ask-doctor` は初回導入、kernel更新、adapter導入、skill投影更新、drift調査のためのhealth checkです。per-task gateではありません。exit code 1 は installation health failed を示すだけで、read-only investigation や local verification を禁止しません。failure は setup/readiness claim を下げる根拠として扱います。

Codex の `.agents/skills`、prompt template、`codex exec` command template も投影する場合:

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
node scripts/install-codex-adapter.mjs --target /path/to/adopting-repo
```

Codex installer は profile 選択された `.agents/skills/<skill>/SKILL.md`、`.agents/prompts/`、`.agents/commands/`、`.agent-spectrum-kernel/codex-install-state.json` を更新します。default は `implementation` profile です。通常は `--profile minimal|implementation|investigation|review|adoption|observability|full` を使い、`--skills <csv>` は選択 prompt / command、router到達可能route、指定 skill 依存の閉包検証付き advanced override として扱います。coreと同じく `--check`、`--prune`、`--force`、`--rollback`、`--detach` を使えます。hook、telemetry、外部公開、GitHub Actions は作りません。

完了報告やレビュー出力の制御リスクを確認する場合:

```bash
node scripts/ask-sensors.mjs --target /path/to/repo --mode implementation --input final-output.txt
node scripts/ask-sensors.mjs --target /path/to/repo --mode review --input review-output.txt
```

初期 sensors は report-only です。control failure を検出しますが、業務正しさは証明しません。`fail` は unsupported completion/readiness/safety/merge claim を制限し、`hard_stop` は既存 `AGENTS.md` の approval-required action に限定します。

Claude Code を使う場合の推奨構成:

```text
repo-root/
  AGENTS.md
  skills/
  .claude/
    skills/
    commands/
    settings.json
  docs/ai/observability-config.yml
```

Skill非対応ツール:

```text
CUSTOM_INSTRUCTIONS.md をカスタム指示に入れる
必要な workflow の SKILL.md だけを依頼時に貼る
```

コピー&ペーストだけで始める場合:

```text
このrepoでは AGENTS.md と skills/ を前提に作業してください。
非自明な作業では operating-mode-router でmodeを確認し、通常のdelivery/quality作業では skill-router を使って、必要なSkillだけ選んでください。
不要なSkillは明示的にskipしてください。
```

### 2. 最初にAIへ言うこと

Skill対応ツールでは、最初の依頼に次を足してください。

```text
このrepoでは AGENTS.md と skills/ を前提に作業してください。
非自明な作業では operating-mode-router でmodeを確認し、通常のdelivery/quality作業では skill-router を使って、必要なSkillだけ選んでください。
不要なSkillは明示的にskipしてください。
```

Skill非対応ツールでは、使いたい工程だけを明示します。

```text
AGENTS.md のルールを前提にしてください。
今回は bug fix なので、doubt-driven-development と test-first-verification の SKILL.md を貼ります。
貼ったSkillだけを使い、関係ないSkillは使わないでください。
```

判断に迷う場合:

```text
判断に迷ったら、operating-mode-router を使って、この依頼が delivery/quality、adoption/bootstrap、observability/metrics、operation/automation のどれかを選んでください。
```

### Skill名を知らずに始める

普段の依頼では、Skill名を指定しなくても構いません。次のように作業意図だけを伝えます。

```text
この作業を適切なルートで進めてください。
```

人間判断の分離まで任せたい場合:

```text
この依頼を、必要なルートを選んで進めてください。
既存のdocs、repo、domain rules、context、ledgerで判断できるものは吸収し、
人間判断が必要なものだけ明示してください。
作業が進められる場合は、次に必要な実装・検証・レビュー・ドキュメント作成まで案内してください。
```

| やりたいこと | 例 | 期待される作業モード |
|---|---|---|
| チケットを進める | このチケットを進めて | 要件確認 / 実装準備 / 実装 |
| PRを見る | このPRをレビューして | レビュー |
| 原因を探す | このバグを調べて | 調査 |
| 判断を固める | この設計を詰めて | 要件確認 / 設計 |
| Agentへ渡す | Codexに渡せる形にして | 実装準備 |
| 学びを残す | この指摘を次に活かして | 知識蓄積 |

AIの出力は、通常の説明では作業モードと次アクションを示し、必要な場合だけ内部routeにSkill名を出します。

## Tool mode guidance

### Skill-aware setup

- `AGENTS.md` を常時ルールとして読ませます。
- `skills/` をツールのSkill置き場に入れます。
- 非自明な依頼では `operating-mode-router` がmodeを選び、delivery/qualityでは `skill-router` が必要な workflow だけを選びます。
- ユーザーが特定Skillを明示した場合は、そのSkillを優先します。

### Non-skill-aware setup

- `CUSTOM_INSTRUCTIONS.md` をカスタム指示に入れます。
- 依頼ごとに必要な `SKILL.md` だけを貼ります。
- すべてのSkillを貼らないでください。文脈が太り、判断品質が落ちます。

### Copy/paste fallback

ツールがファイル参照できない場合は、次の順で貼ります。

1. `AGENTS.md` または `CUSTOM_INSTRUCTIONS.md`
2. `skills/operating-mode-router/SKILL.md` when mode is unclear
3. `skills/skill-router/SKILL.md` when the task is delivery/quality
4. ルーティングで選ばれた必要最小の `SKILL.md`

### Claude Code local-first setup

Claude Code では、core skills を project-local adapter として投影するのが推奨です。

```bash
node scripts/install-kernel.mjs --target /path/to/project --merge-agents
node scripts/install-claude-adapter.mjs --target /path/to/project
```

導入順:

```text
1. core kernel / skills を入れる。
2. Claude project adapter または optional plugin を入れる。
3. local hooks で observability を有効化する。
4. PR共有が必要なときだけ Pattern B `@claude review` GitHub Actions を使う。
5. project-local events と ledger から週次/月次reportを生成する。
```

Claude adapter installer は core installer が作る `.agent-spectrum-kernel/install-state.json` を要求します。core state がない場合は `.claude/` を書き込む前に失敗します。

Claude adapter は `.agent-spectrum-kernel/claude-install-state.json` を記録し、core/Codexと同じ lifecycle semantics を使います。`--check`、`--dry-run`、`--prune`、`--force`、`--rollback`、`--detach` が使えます。`--detach` は `.claude/skills`、`.claude/commands`、runtime script、adapter-owned hooksを外し、local metrics、reports、ledgersは既定で残します。

対応profileは `implementation`、`investigation`、`review`、`observability`、`full` です。default は `full` です。narrow profile は、選択commandの必須Skill、Skill依存、通常routerが到達し得るSkillを含むよう閉じています。`--skills <csv>` はadvanced overrideで、閉包を満たさない場合は書き込み前に失敗します。

Claude project adapter のHook正本は `.claude/settings.json` です。`.claude/hooks/hooks.json` は新規には投影せず、旧adapter-owned hookだけのlegacy fileは削除します。`--skip-runtime` はruntime scriptを入れず、adapter-owned metrics hooksも入れません。`--skip-hooks` はhooksだけをskip/removeし、runtime scriptは入れます。

Local hooks はローカル作業のdefaultです。`docs/ai/metrics/events.jsonl` に要約イベントだけを保存し、raw prompt、secret、customer data、personal data、full file contents、full command output は既定で保存しません。

Optional plugin は project adapter と併用できます。project adapter はproject-local commands/runtime/settings hooksを所有し、plugin hooksは `${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record` 経由で実行されます。project runtimeがない場合、plugin metrics wrapperはno-opします。

GitHub Actions は任意です。`@claude review` コメントでだけ動かすPR共有adapterであり、常時PR reviewやlocal observabilityの代替ではありません。

### Project overlay rules

プロジェクト固有ルールは、共通Kernelに混ぜずに project overlay として分けます。framework、domain、branch、CI、禁止範囲などが対象です。

modeが曖昧なら先に `operating-mode-router` で選びます。通常のdelivery/quality workflow は `skill-router` で選び、その後、該当する場合だけ project overlay や stack overlay を補助として使います。

## First tasks

### Small edit

```text
この文言だけを変更してください。関連しないファイルは触らないでください。
軽微な修正なので AGENTS.md だけで進め、検証できる範囲を最後に報告してください。
```

主な流れ:

- `AGENTS.md` only
- 最小diff
- cheapな静的確認

### New feature

```text
新しい挙動を追加してください。
spec-driven-development で仕様、非目標、受け入れ条件、検証方法を先に出してください。
その後、test-first-verification で Verification Contract を作り、controlled-implementation で最小実装してください。
```

主な流れ:

- `spec-driven-development`
- `test-first-verification` for Verification Contract
- `controlled-implementation`
- `test-first-verification` for evidence

#### 実装workflowの全体像

通常は必要な部分だけ使います。非自明な実装で、文脈不足、scope risk、境界判断、stack固有制約がある場合の全体像は次です。

```text
repository-orientation
-> implementation-context-generation if context is missing/stale and work is non-trivial or repeated
-> spec-driven-development
-> scope-control when scope risk exists
-> application-boundary-architecture if boundary decision is unresolved
-> stack overlay if available and applicable
-> test-first-verification for Verification Contract
-> controlled-implementation using Implementation Contract
-> test-first-verification for evidence
-> evidence-ledger when completion claims need evidence
```

### Bug fix

```text
この不具合を修正してください。
doubt-driven-development を使って、最初の仮説に飛びつかず反証チェックを出してください。
可能なら修正前に再現し、test-first-verification で回帰確認まで行ってください。
```

主な流れ:

- `doubt-driven-development`
- `test-first-verification` for reproduction and Verification Contract
- `controlled-implementation`
- `test-first-verification` for regression proof

### PR review

```text
review-router を使ってこのdiffをレビューしてください。
Layer applicability を出し、必要なgateだけを選んでください。
最後は review-final-merge-gate で approve / request changes / block / insufficient evidence を判断してください。
```

主な流れ:

- `review-router`
- layer applicability
- required gates
- `review-final-merge-gate`

### Review context setup

```text
review-context-generation を使って、このrepoのレビュー判断contextを docs/ai/review-context.md に整理してください。
persona、output contract、critical workflow、accepted risk、known issue、noise-control rule を evidence status 付きで残してください。
```

使う場面:

- 同じrepoでレビューを繰り返す
- persona、出力契約、既知リスクを毎回説明したくない

### Implementation context setup

```text
implementation-context-generation を使って、このrepoの実装contextを作成してください。
stack、commands、test patterns、implementation patterns、architecture boundaries、generated files、stop conditions を evidence status 付きで docs/ai/implementation-context.md に整理してください。
```

使う場面:

- 同じrepoで実装を繰り返す
- build/test/lint command や境界規約を毎回探索したくない

### Implementation with a contract

```text
controlled-implementation を使う前に Implementation Contract を出してください。
goal、non-goals、allowed/forbidden scope、existing patterns、boundary decision、implementation context、stack overlay used、verification contract、stop conditions を明示してください。
```

使う場面:

- 挙動変更がある
- 触る範囲を先に固定したい
- 実装中のscope driftを避けたい

### Verification contract setup

```text
test-first-verification を使って、実装前に Verification Contract を出してください。
証明する挙動、回帰防止、既存coverage、追加すべきfocused test、negative cases、commands、未検証事項を明示してください。
```

使う場面:

- fixed / no regression / correct と言うには根拠が必要
- 既存testが何を保証しているか不明
- 手動確認と自動testの境界を決めたい

## Context files

混同しやすい3種類です。

```text
docs/ai/review-context.md          レビュー判断用。persona, output contract, accepted risk, known issue など。
docs/ai/implementation-context.md  実装判断用。stack, commands, patterns, test style, boundaries など。
docs/ai/improvement-ledger.md      改善台帳用。reviewで見つけた負債、rule gap、check化候補、accepted risk など。
docs/ai/skill-adoption-metrics.md  adoption metrics用。project-specific metricsは導入先projectにだけ保存。
docs/ai/observability-config.yml   Claude hook-first runtimeのlocal設定。外部公開は既定off。
docs/ai/metrics/events.jsonl       導入先projectのlocal JSONL event store。
docs/ai/reports/                   導入先projectのlocal weekly/monthly report出力先。
planning-with-files                長期タスクの進捗保存用。context fileの代替ではない。
```

## Stack overlays

Stack overlay は任意の補助です。generic workflow を置き換えません。

- Angular overlay は、このrepoに含まれる最初の concrete stack overlay です。
- React / Python / Java overlay は、追加された場合だけ使う将来またはプロジェクト固有の補助です。
- modeが曖昧なら `operating-mode-router`、通常のdelivery/qualityなら `skill-router` で generic workflow を選びます。
- stack固有の制約や検証補足が必要な場合だけ overlay を使います。

例:

```text
このrepoに stack-specific overlay がある場合だけ、generic workflow選択後に該当overlayを使って controlled-implementation への制約と test-first-verification への検証補足を出してください。Angular固有Skillを全repoに強制しないでください。
```

## 次に読むもの

- `docs/prompt-recipes-ja.md`: よくある依頼をそのまま貼るためのレシピ
- `docs/glossary-ja.md`: Kernel、Skill、Gate、overlay、context、contract などの用語集
- `docs/usage-ja.md`: 代表的な使い分け
- `docs/skill-matrix.md`: workflow 選択の一覧
