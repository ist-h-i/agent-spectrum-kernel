# Glossary 日本語版

この用語集は、このリポジトリ内での意味に限定しています。一般的なフレームワーク解説ではなく、AIコーディング作業でどう使うかを短く定義します。

## Kernel

Meaning:
- 常に有効な最小ルール層です。このrepoでは主に `AGENTS.md` を指します。

Use when:
- どんな小さな依頼でも守る判断基準を固定します。

Do not confuse with:
- 個別workflowを細かく定義するSkill。

## Skill

Meaning:
- 必要なときだけ呼ぶ工程、レビュー、検証、handoffの手順です。

Use when:
- 非自明な作業、設計、調査、レビュー、危険操作などで手順が必要です。

Do not confuse with:
- 常時読み込むKernel。

## Skill router

Meaning:
- delivery/quality作業に必要な最小workflowを選ぶSkillです。正本は `skills/skill-router/SKILL.md` です。

Use when:
- operating mode が delivery/quality で、非自明、曖昧、multi-step、review、investigation、handoff、risk-gated の作業です。

Do not confuse with:
- adoption、metrics、operationまで含む上位router。上位分類は `operating-mode-router` が行います。

## Execution Envelope

Meaning:
- 意味のあるworkflow境界で一度だけ出す共通の制御記録です。route、evidence status、stop reason、next actionをまとめます。正本は `docs/execution-envelope-contract.md`、機械形状は `schemas/execution-envelope.schema.json` です。

Use when:
- router、adapter、session state、またはworkflow境界の出力で、次の進行判断と証拠状態を共有する場合です。

Do not confuse with:
- Requirement Contract、Spec、Verification Contract、Implementation Summary、Review FindingsなどのSkill固有artifact。Metrics event candidateも明示opt-in時だけの任意項目です。

## Operating mode router

Meaning:
- delivery/quality、adoption/bootstrap、observability/metrics、operation/automation の上位modeを選ぶSkillです。正本は `skills/operating-mode-router/SKILL.md` です。

Use when:
- 通常の実装・レビューなのか、project導入、metrics評価、週次/月次運用なのかが曖昧な場合。

Do not confuse with:
- delivery/quality内の詳細workflowを選ぶ `skill-router`。

## Project adoption pack

Meaning:
- 新しいrepo、project、team、client siteにSkillセットを導入するための最小packageです。project overlay draft、implementation context draft、review context draft、local commands、risks、first workflow recipes、missing decisionsを含みます。

Use when:
- 初回導入やrolloutで、generic Skillとproject-specific ruleを分けたい場合。

Do not confuse with:
- 通常の一回限りの実装やレビュー。

## Skill effectiveness evaluation

Meaning:
- 1つの完了済みタスクについて、選んだSkillが効果的だったか、過剰だったか、足りなかったかを根拠付きで評価するworkflowです。

Use when:
- routing quality、output usefulness、evidence quality、risk reduction、overhead control、reuse valueをふりかえりたい場合。

Do not confuse with:
- 複数タスクや期間でadoption maturityを見る `skill-adoption-metrics`。

## Skill adoption metrics

Meaning:
- 複数タスクや期間を対象に、instruction quality、skill usage maturity、task outcomes、quality improvement、maturity movementを測るworkflowです。

Use when:
- Skill導入が運用にどう定着しているかを見たい場合。

Do not confuse with:
- 人事評価、個人成績、compensation/promotion判断。metricsはadoption support、coaching、workflow improvement用です。

## Metrics event candidate

Meaning:
- adoption metrics が明示的に有効な場合だけ、意味のあるタスク境界で出すopt-inの要約eventです。

Use when:
- `docs/metrics-event-contract.md` に沿って、counts、related IDs、evidence references、privacy noteを残したい場合。

Do not confuse with:
- hidden telemetry、raw prompt storage、skill invocationごとの自動ログ。

## Project overlay

Meaning:
- 特定repo固有の規約、コマンド、domain language、禁止範囲、CI、branch運用などの追加層です。

Use when:
- generic Kernel/Skillだけではrepo固有判断が足りない場合。

Do not confuse with:
- framework別のStack overlay。

## Stack overlay

Meaning:
- Angularなど、特定stackにだけ必要な実装制約や検証補足です。

Use when:
- generic workflow選択後、stack固有のcomponent、routing、test、toolingなどに触る場合。

Do not confuse with:
- すべてのrepoに適用するKernel。

## Stack implementation overlay

Meaning:
- `controlled-implementation` へのstack固有制約と、`test-first-verification` への検証補足を提供するoverlayです。

Use when:
- 実装そのものにstack固有の安全規約やtest作法が関わる場合。

Do not confuse with:
- generic workflowを置き換える専用workflow。

## Gate

Meaning:
- 作業を次へ進めてよいか判断する確認点です。

Use when:
- リスク、レビュー層、外部影響、証拠不足を見落としたくない場合。

Do not confuse with:
- 実装そのもの。

## Review gate

Meaning:
- PR/diff/生成物レビューの特定観点を担当するgateです。

Use when:
- architecture、domain、output quality、adversarial risk などの観点が該当する場合。

Do not confuse with:
- 最終判断を出す `review-final-merge-gate`。

## Signal-first review route

Meaning:
- 観測した Change signals から必要なgateを選び、missing inputは `insufficient evidence` として残す工程です。

Use when:
- PR/diffレビューで、必要なgateだけを選びたい場合。

Do not confuse with:
- gate実行後のmerge判断。

## Merge evidence summary

Meaning:
- 最終レビューで Blocking evidence、Passed required gates、Insufficient evidence、Non-blocking follow-ups、Residual risk を要約したものです。完全な層診断は検証/debug 用の補助情報です。

Use when:
- merge可否や残リスクを一目で確認したい場合。

Do not confuse with:
- review中の作業メモ。

## Final merge gate

Meaning:
- 各review gateの結果を統合して、approve、request changes、block、insufficient evidenceを決める最終gateです。

Use when:
- PR/diffレビューの最終判断が必要な場合。

Do not confuse with:
- 個別のreview gate。

## Evidence overlay

Meaning:
- 正しさ、fixed、no regression、readyなどの主張を根拠状態に分ける出力overlayです。

Use when:
- 成果や品質について断言しそうな場合。

Do not confuse with:
- testそのもの。test結果をどう主張に結びつけるかの整理です。

## Risk overlay

Meaning:
- 破壊的、不可逆、外部影響、本番、auth、secret、billing、dependency、infraなどの影響がある作業の上位gateです。

Use when:
- 実行前に承認、dry-run、rollback、影響範囲確認が必要な場合。

Do not confuse with:
- 通常のreview gate。

## Review context

Meaning:
- レビュー判断に再利用する文脈です。既定ファイルは `docs/ai/review-context.md` です。

Use when:
- persona、output contract、critical workflow、accepted risk、known issueを繰り返し使う場合。

Do not confuse with:
- 実装判断用のImplementation contextや、作業進捗。

## Implementation context

Meaning:
- 実装判断に再利用する文脈です。既定ファイルは `docs/ai/implementation-context.md` です。

Use when:
- stack、commands、test pattern、implementation pattern、boundaries、generated files、stop conditionsを固定したい場合。

Do not confuse with:
- review contextや、長期タスクの進捗保存。

## Task progress / planning state

Meaning:
- 進行中タスクの状態、決定済み事項、残作業、handoff用メモです。

Use when:
- タスクが長く、セッションやAgentを跨ぐ場合。

Do not confuse with:
- `docs/ai/review-context.md` や `docs/ai/implementation-context.md`。これらはdurableな判断材料で、タスク進捗ではありません。

## Improvement ledger

Meaning:
- reviewで見つかった技術負債、リファクタ候補、rule gap、validation check候補、accepted riskを、source、evidence、impact、decision、status付きで残す改善台帳です。既定テンプレートは `docs/ai/improvement-ledger.md` です。

Use when:
- 指摘をreviewコメントで流さず、backlog、rule/check化、resolved、wont_fix、stale reviewへ接続したい場合。

Do not confuse with:
- `docs/ai/review-context.md` や `docs/ai/implementation-context.md`。これらは判断材料で、改善itemの状態管理ではありません。

## Security review boundary

Meaning:
- `review-code-health` は通常のコードレビュー中に evidence-backed な vulnerability / security weakness signals を見つけるための観点です。

Use when:
- diffや対象範囲の中で、入力検証、権限境界、機密情報、依存関係利用、危険なI/Oなどの弱点シグナルを分類したい場合。

Do not confuse with:
- SAST、依存脆弱性スキャン、脅威モデリング、ペンテスト、コンプライアンスレビュー、または正式なセキュリティ監査。abuse path、privacy risk、severe failure path は `review-adversarial-risk` のrouting対象です。

## Behavior preservation contract

Meaning:
- リファクタ実装前に、public API、UI、schema、snapshot、runtime behavior、errors、logs、data shapeなど、変えてはいけない観測可能な挙動を明示する契約です。

Use when:
- `refactor-implementation` で、構造改善をしても既存挙動を維持する必要がある場合。

Do not confuse with:
- 新機能の受け入れ条件。挙動を変える場合はリファクタではなく、仕様化された実装として扱います。

## Implementation Contract

Meaning:
- 上流artifactを参照し、上流で未決定だった実装判断、実際の変更境界、逸脱、検証attemptとevidence参照、残課題、handoff状態だけを記録する契約です。

Use when:
- 非自明な実装でscope driftを避けたい場合。

Do not confuse with:
- Requirement、Spec、Work Package、Verification Contractの再掲。変更がある場合は暗黙に上書きせずexplicit deltaにします。

## Verification Contract

Meaning:
- 実装前にproof obligationを定義し、実装後も同じIDを参照してevidenceを追加する再利用可能な契約です。

Use when:
- fixed、correct、no regression などの主張に根拠が必要な場合。

Do not confuse with:
- 実行済みtest結果そのもの、または実装範囲。test実行後もcontractとevidence recordは分けます。

## Lifecycle artifact delta

Meaning:
- Requirement、Spec、Work Package、Verification、Implementationの下流artifactが、上流の変更点だけを `target ref / field / previous / new / reason / decision evidence` として記録する形式です。

Use when:
- assumption、acceptance condition、scope boundary、proof obligationが上流artifactから変わる場合。

Do not confuse with:
- unchanged fieldのコピー。変更がなければartifact IDを参照して継承します。正本は `docs/lifecycle-artifact-contract.md` です。

## Handoff

Meaning:
- 次のAgentや人間がそのまま進められるよう、task、context、scope、expected output、verification、stop conditionを渡すことです。

Use when:
- 作業が完了していない、または次工程を別の人/Agentに渡す場合。

Do not confuse with:
- 一般的なおすすめや感想。

## ADR

Meaning:
- Architecture Decision Record。重要な設計判断、理由、代替案、影響を残す記録です。

Use when:
- hard-to-reverse、横断的、将来の判断に影響する設計決定がある場合。

Do not confuse with:
- 一時的なtask progress。

## Application boundary

Meaning:
- dependency direction、state ownership、external I/O、DTO/error trust boundary、async lifetime、public APIなどの境界です。

Use when:
- facade、usecase、repository、port、adapter、mapperなどをどこに置くか判断する場合。

Do not confuse with:
- AngularやReactなどのstack固有実装作法。

## Output quality

Meaning:
- UI、docs、通知、CLI、API response、generated text、AI/system-consumed output が消費者に合っているかの品質です。

Use when:
- 出力の構造、完全性、契約適合、読み手適合をレビューする場合。

Do not confuse with:
- コードstyleだけの問題。

## Adversarial risk

Meaning:
- 通常レビュー後に残る高impactな失敗経路、misuse、blast radiusです。

Use when:
- 重大な事故経路や悪用可能性を少数に絞って確認したい場合。

Do not confuse with:
- すべての小さな不具合探し。

## Insufficient evidence

Meaning:
- 判断に必要な証拠が足りず、pass/failを責任を持って言えない状態です。

Use when:
- test、docs、runtime output、仕様、review contextなどが不足している場合。

Do not confuse with:
- 問題なしという意味。

## Required / skipped / optional gates

Meaning:
- `required` は実行すべきgate、`skipped` は根拠付きで不要なgate、`optional` は該当すれば補助になるgateです。

Use when:
- reviewやworkflow選択で、必要最小の工程に絞る場合。

Do not confuse with:
- すべてのgateを通すこと。

## Stop condition

Meaning:
- そこで作業を止め、報告、再計画、承認要求に切り替える条件です。

Use when:
- public API、schema、migration、auth、secret、dependency、production configなどに触れそうな場合。

Do not confuse with:
- 作業完了条件。

## Stack overlay supplement

Meaning:
- stack overlay が generic workflow に追加する制約や検証補足です。

Use when:
- stack固有の落とし穴があるが、workflow自体はgenericのまま進める場合。

Do not confuse with:
- generic workflowの置換。

## Angular implementation overlay

Meaning:
- Angular固有のcomponent、route、provider、template、forms、Signals/RxJS、DOM/security、SSR/hydration、test、CLI、migration向けのstack overlayです。

Use when:
- Angular実装に触る場合に、generic workflow選択後の補助として使います。

Do not confuse with:
- すべてのrepoで必須のSkill。

## Future stack overlays

Meaning:
- React、Python、Javaなど、将来またはproject overlayで追加される可能性があるstack固有補助です。

Use when:
- そのoverlayがrepoに存在し、対象変更に該当する場合だけ使います。

Do not confuse with:
- すでにこのrepoに全て含まれているSkill。
