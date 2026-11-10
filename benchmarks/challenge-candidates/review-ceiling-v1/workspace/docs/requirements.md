# ReviewOps — SES向け要件定義 v0.1

**Status:** P0完了後のP1/P2計画を含む要件定義
**Target:** VS Code Extension + Local Core Engine
**Primary Language:** TypeScript
**Project Name:** ReviewOps
**Marketplace Name:** ReviewOps Guard
**Date:** 2026-05-06

---

## 1. 結論

ReviewOps は、SES会社が抱える次の3つの構造的弱点を、日々のレビュー業務の中で解消するための VS Code 拡張である。

1. 技術的育成が属人的で再現しにくい
2. 技術的な現場評価が見えにくい
3. 現場ごとのレビュー知識・設計知識・失敗パターンがつながらない

最初の導入理由は「育成管理」ではなく、**レビュー作業・コメント対応・修正計画・チケット化の時短**に置く。

その副産物として、以下を蓄積する。

- レビュー観点
- コーディングルール
- 良い実装パターン
- 設計負債パターン
- ジュニア育成材料
- 技術評価の根拠
- 現場横断ナレッジ

プロダクトの一文定義は次とする。

> ReviewOps は、日々のPR/MRレビューとコメント対応を支援しながら、レビュー知識を育成・評価・横展開に使える技術資産へ変換する VS Code 拡張である。

---

## 2. 背景

SES会社では、エンジニアが顧客現場ごとに分散する。結果として、次の問題が慢性化する。

### 2.1 技術的育成の困難性

- 現場ごとに技術スタック、レビュー文化、品質基準が違う
- シニアの指摘がレビューコメントとして消費され、育成教材にならない
- ジュニアが「何を直せばよいか」は分かっても、「なぜそれが悪いか」を蓄積できない
- 同じ種類の指摘が別現場・別案件で繰り返される
- 育成担当が現場コードやレビュー履歴を常時見られない

### 2.2 技術的現場評価のしにくさ

- 勤怠や稼働報告では、技術的成長・判断力・設計力が見えない
- 顧客評価は主観的で、技術的根拠が薄い
- PR/MR、レビュー対応、修正説明、テスト設計などの実作業が評価材料として残りにくい
- 強いエンジニアほど、裏側で品質を支えていても可視化されない
- 技術責任者が現場ごとの実装品質を比較しにくい

### 2.3 ナレッジの現場間接続の弱さ

- ある現場で得たレビュー観点が、別現場へ移植されない
- プロジェクト固有知識と汎用知識が混ざり、再利用できない
- 事故・手戻り・設計崩壊のパターンが個人記憶に残るだけで終わる
- 社内標準ルールが、実際の現場レビューから更新されない

---

## 3. プロダクト方針

### 3.1 基本方針

ReviewOps は、SES会社向けに次の価値を出す。

- 現場のレビュー作業を減らす
- レビューコメントを修正方針に変換する
- 修正対応を説明可能にする
- レビュー指摘をルール候補にする
- 良い実装・悪い実装をナレッジ化する
- エンジニアの技術行動を証跡として残す
- 現場横断で共有できる知識だけを portable knowledge に昇格する

### 3.2 初期導入の勝ち筋

最初から「育成ツール」「評価ツール」として売ると失敗しやすい。理由は、現場エンジニアにとって日次便益が弱く、監視ツールに見えるためである。

初期導入の主語は次にする。

> レビュー作業を楽にする。

その後に、管理者向け価値として次を出す。

> レビュー対応の副産物から、育成・評価・横展開の材料が貯まる。

### 3.3 使い方の基本形

1. VS Code で ReviewOps を開く
2. 対象PR/MRまたはローカルdiffを選ぶ
3. ReviewOps が現場コンテキスト込みのレビュー用プロンプトを生成する
4. ユーザーが現場で許可されたAIまたは人間シニアへ相談する
5. 回答を ReviewOps に取り込む
6. ReviewOps がレビュー結果、修正方針、返信案、ルール候補へ構造化する
7. P0ではユーザー確認後に GitHub PR の summary / reply comment を preview-first で投稿する
8. チケット案作成、Backlog、Jira、GitHub Issues などへの投稿は P1 以降で扱う
9. 汎用化できる知識だけを portable knowledge として保存する

---

## 4. スコープ

### 4.1 P0でやること

P0 は「現場レビュー業務の時短」と「ナレッジ候補の蓄積」に絞る。

- VS Code拡張として起動する
- `.reviewops/` と `.reviewops.local/` を初期化する
- local git diff を取得する
- GitHub PR diff を取得する
- GitHub PR comments / reviews を取得する
- review prompt を生成する
- AIまたは人間シニアの回答を手動で import する
- response を result / action plan / reply draft / rule candidate に整理する
- GitHub review summary を preview-first で投稿する
- GitHub comment reply を preview-first で投稿する
- research / refactoring cycle の計画、取り込み、検証、説明成果物を生成する
- rule candidate を user approval 後に保存する
- knowledge candidate を local / portable-candidate に分類する
- skill evidence を記録する
- field report を生成する
- meta/next で次アクションを提示する
- 外部AI APIへ直接通信しない

### 4.2 P0でやらないこと

- 外部AI APIへの直接通信
- 自動コード修正
- 自動commit / push
- 自動approve / merge
- 自動マスキング保証
- 組織クラウド同期
- テレメトリ送信
- 複雑なinline review comment完全対応
- GitLab / Backlog Pull Request 対応
- Jira / Backlog / GitHub Issues / GitLab Issues への issue 作成
- Jira custom field完全対応
- 人事評価の自動判定
- 個人ランキング
- 勤怠・稼働監視

### 4.3 P1でやること

P1 は、P0で成立した「個人のレビュー時短」を、チームリードが運用できる単位へ広げる。P1に着手できる条件は、P0の主要flow、preview-first投稿、rule candidate保存、skill evidence、field report、P0 readiness確認が完了していることである。

P1の到達目標:

- レビュー対応から issue 作成までを1つの作業線にする
- GitHub / GitLab / Backlog Pull Request を同じ review target として扱う
- Jira / Backlog / GitHub Issues / GitLab Issues へ issue draft を作成・投稿できる
- docs drift と architecture boundary のチェックを review flow に組み込む
- team lead が review plan、未解決リスク、ルール候補を確認できる
- portable knowledge をファイルとして export/import できる
- skill evidence から skill roadmap を生成できる
- monthly field report を生成できる
- organization knowledge pack のローカル版を生成できる

P1でやること:

- Jira / Backlog issue作成
- GitHub Issues / GitLab Issues issue作成
- issue draft の preview-first 投稿
- review target と issue の link 保存
- Backlog Pull Request対応
- GitHub と GitLab の両対応
- docs drift check
- architecture boundary check
- team lead review workflow
- unresolved risk review
- portable knowledge export/import
- skill roadmap生成
- monthly field report
- organization knowledge pack local build

P1でやらないこと:

- 組織クラウド同期
- 複数現場の自動横断分析
- organization-portable への自動昇格
- 評価スコアやランキング
- 自動コード修正
- 自動merge / approve

P1完了条件:

- issue draft から issue 作成まで preview-first で実行できる
- Backlog Pull Request の diff / comments / summary posting が review provider interface 経由で動く
- docs drift / architecture boundary の finding が action plan に統合される
- team lead が field report、unresolved risk、rule candidate、skill roadmap を確認できる
- knowledge pack を export/import して別workspaceで参照できる
- P0の manual-only AI 方針と publish safety が維持されている

### 4.4 P2でやること

P2 は、P1でローカルに運用できるようになった知識・証跡・レポートを、組織単位で承認・集約・配布する段階である。P2に着手できる条件は、P1の issue 連携、team lead workflow、knowledge pack、monthly report が安定していることである。

P2の到達目標:

- 複数現場の portable candidate を ReviewOps Hub に集約する
- ナレッジ承認フローで organization-portable へ昇格する
- 社内標準ルールを現場workspaceへ配布できる
- skill evidence を個人ランキングではなく育成ロードマップとして扱う
- 評価補助ダッシュボードは根拠表示に限定する
- オンプレミス/閉域同期に対応できる同期境界を持つ

P2でやること:

- 組織向けReviewOps Hub
- ナレッジ承認フロー
- multiple field knowledge intake
- organization-portable knowledge registry
- 複数現場の横断分析
- 育成ロードマップ管理
- 評価補助ダッシュボード
- 社内標準ルール配布
- Hub から workspace への knowledge pack 配布
- オンプレミス/閉域同期
- audit log / approval log

P2でやらないこと:

- 人事評価の自動確定
- 個人ランキング
- 顧客固有情報の自動汎用化
- 承認なしの organization-portable 公開
- P0/P1のローカル利用をHub必須にすること

P2完了条件:

- portable candidate を承認フローで organization-portable に昇格できる
- Hub が複数workspaceの field report / skill evidence / knowledge candidate を集約できる
- 社内標準ルールを workspace へ配布し、適用履歴を追跡できる
- dashboard が根拠artifactへ drill-down できる
- オンプレミス/閉域環境でも同期単位、秘匿境界、監査ログを維持できる

---

## 5. ユーザー定義

### 5.1 現場エンジニア

主な利用目的:

- PR/MR説明を速く作る
- レビューコメントを整理する
- 修正方針を作る
- 返信文を作る
- 修正完了を説明する
- チケット化する
- 次にやることを把握する

成功条件:

- レビュー対応時間が減る
- 指摘対応の抜け漏れが減る
- シニアへの相談文が作りやすくなる
- 自分の技術判断が記録として残る

### 5.2 スーパーシニア / レビュアー

主な利用目的:

- 繰り返し指摘をルール化する
- 良い実装パターンを抽出する
- ジュニアに説明すべき観点を明確にする
- レビューコメントの再利用性を高める

成功条件:

- 同じ指摘を何度も書く負担が減る
- レビュー観点がルールとして残る
- 現場固有ではない知見を横展開できる

### 5.3 SES技術責任者

主な利用目的:

- 現場ごとの技術状況を把握する
- 育成対象者の詰まりどころを把握する
- 強い現場のレビュー観点を社内展開する
- 技術評価の根拠を集める

成功条件:

- 技術評価が感覚論だけでなくなる
- 育成課題がレビュー証跡から見える
- 現場間でナレッジを移植できる

### 5.4 営業 / PM / 現場管理者

主な利用目的:

- エンジニアの技術的貢献を説明できる材料を得る
- 顧客との評価面談で根拠を持つ
- 現場交代や増員時の引き継ぎ材料を得る

成功条件:

- 技術貢献を非エンジニアにも説明できる
- 顧客評価と社内評価のズレを減らせる

---

## 6. 主要機能要件

### 6.1 Project Init

目的:

対象プロジェクトに ReviewOps の作業領域を作る。

作成するもの:

```text
.reviewops/
.reviewops.local/
.reviewops/out/
```

要件:

- `.reviewops/` は共有可能な設定・汎用ルールを置く
- `.reviewops.local/` は現場固有情報・個人作業状態を置く
- `.reviewops.local/` は `.gitignore` へ追加する
- token は設定ファイルに保存しない

### 6.2 Project Context Setup

目的:

レビュー時に必要な現場コンテキストを定義する。

入力:

- 技術スタック
- アーキテクチャ方針
- コーディング規約
- テスト方針
- レビュー方針
- AI利用ルール
- 顧客固有の禁止事項

出力:

- `.reviewops.local/project-context.local.yaml`
- `.reviewops.local/project-rules.local.yaml`

### 6.3 Review Target Selection

目的:

レビュー対象の PR/MR または local diff を選ぶ。

対象 provider:

- local git P0
- GitHub P0
- GitLab P1以降
- Backlog Pull Request P1

P0要件:

- local git diff を取得できる
- GitHub PR を取得できる
- 対象branch、base branch、changed files、diff summary を保存できる

### 6.4 Review Prompt Build

目的:

現場コンテキスト込みのレビュー依頼プロンプトを生成する。

入力:

- diff
- PR/MR metadata
- project context
- local rules
- portable rules
- known debt patterns
- user-selected focus

出力:

- `prompt.md`
- `input-summary.md`
- `prompt-metadata.json`

制約:

- ReviewOps は AI API を呼ばない
- prompt には、含まれる情報の種類を明示する
- 固有情報の取り扱いはユーザーと現場ルールの責任と明示する

### 6.5 Response Import / Normalize

目的:

外部AIまたは人間シニアからの回答を取り込み、構造化する。

入力:

- raw markdown
- raw text
- JSON fenced block

出力:

- `response.raw.md`
- `result.md`
- `result.json`
- `review-findings.json`
- `action-plan.seed.json`
- `knowledge-candidates.json`
- `rule-candidates.json`

P0処理:

1. JSON fenced block を抽出
2. Markdown heading を簡易パース
3. レビュー観点をカテゴリ分類
4. 失敗時は raw response を保持して手動編集を促す

### 6.6 Comment Fetch / Triage

目的:

PR/MRレビューコメントを取得し、対応方針の前段として分類する。

分類:

- bug_risk
- architecture_boundary
- test_gap
- docs_drift
- spec_confirmation
- misunderstanding
- style
- good_practice
- rule_candidate
- debt_pattern_candidate

出力:

- `comments.raw.json`
- `comment-triage.json`
- `next-actions.json`

### 6.7 Action Plan

目的:

レビュー結果やコメントに対し、実際に何をするか決める。

decision:

- fix_now
- explain_only
- ask_clarification
- create_issue
- defer
- reject_with_reason
- already_fixed
- duplicate
- rule_candidate

出力:

- `action-plan.json`
- `fix-plan.seed.json`
- `reply-draft.seed.json`
- `rule-candidates.json`

P1以降のissue連携では、action plan から `issue-draft.seed.json` 相当の成果物を生成する。

### 6.8 Fix Plan / Verify / Explain

目的:

指摘事項に対する修正作業を支援する。

Fix Plan 出力:

- 修正対象
- 修正方針
- 影響範囲
- 追加テスト
- docs更新要否
- 返信方針
- ルール化候補

Fix Verify 結果:

- resolved
- partially_resolved
- not_resolved
- new_risk_found
- needs_followup_issue

### 6.9 Publish Draft

目的:

PR/MRコメントと返信を preview-first で実行する。

P1以降では issue 作成も同じ preview-first 方針で扱う。

要件:

- 投稿前に必ず draft を表示する
- 自動投稿しない
- ユーザー確認後に実行する
- 投稿結果 URL / ID を保存する
- `.reviewops/out/actions.jsonl` に記録する

### 6.10 Rules / Knowledge Capture

目的:

レビュー結果から、育成・評価・横展開に使える知識を抽出する。

保存対象:

- coding guideline
- review rule
- architecture rule
- docs drift rule
- test rule
- generic debt pattern
- good practice
- review tip
- roadmap skill

分類:

- project-local
- portable-candidate
- organization-portable P2
- prohibited

P0要件:

- rule candidate を生成できる
- 既存ルールとの重複・矛盾を検出する
- ユーザー確認後に `.reviewops/knowledge/` または `.reviewops.local/` に保存する
- portable candidate へ昇格する場合、確認チェックリストを表示する

### 6.11 Skill Evidence Capture

目的:

技術評価の材料として、レビュー対応・修正判断・説明能力を証跡化する。

記録するもの:

- レビュー対象
- 指摘カテゴリ
- 対応判断
- 修正方針
- 追加テスト
- 返信内容
- ルール候補化の有無
- 解決状態

記録しないもの:

- 個人ランキング
- 人事評価点数
- 勤怠情報
- 自動合否判定

出力:

- `skill-evidence.json`
- `field-evidence.jsonl`

### 6.12 Field Report

目的:

SES技術責任者が現場評価・育成計画・横展開に使えるレポートを作る。

レポート種別:

- weekly developer report
- monthly field report
- reviewer knowledge report
- skill growth report

P0出力:

- `field-report.md`
- `field-report.json`

内容:

- 今週の主なレビュー対応
- 解決した指摘
- 未解決リスク
- 追加したテスト
- 抽出されたルール候補
- 育成上の詰まりどころ
- 良い実装パターン
- 横展開可能な知識候補

### 6.13 P1 Issue / Check / Team Lead Workflow

目的:

P0のreview action planを、チームで追跡できるissue、設計チェック、月次レポートへ接続する。

P1入力:

- `action-plan.json`
- `fix-plan.seed.json`
- `issue-draft.seed.json`
- `rule-candidates.json`
- `knowledge-candidates.json`
- `skill-evidence.json`
- `field-evidence.jsonl`
- docs / architecture rule files

P1出力:

- `issue-drafts.json`
- `issue-links.json`
- `docs-drift-findings.json`
- `architecture-boundary-findings.json`
- `team-lead-review.md`
- `skill-roadmap.json`
- `monthly-field-report.md`
- `monthly-field-report.json`
- `knowledge-pack.local.json`

要件:

- issue draft は `title`、`description`、`sourceActionItemId`、`provider`、`projectRef`、`priority`、`labels`、`reviewTarget` を持つ
- `description` はIssue本文として扱い、`projectRef` は provider project selector / issue type lookup の参照に使う
- issue 作成は preview-first とし、作成後に URL / ID を `issue-links.json` と `actions.jsonl` へ保存する
- docs drift check は、変更されたコード、既存docs、docs drift rule を比較し、更新要否を finding として出す
- architecture boundary check は、設定された境界ルールに対して依存方向、レイヤ違反、公開API逸脱を finding として出す
- team lead review は、未解決リスク、issue化対象、rule candidate、portable candidate、skill signal を1画面または1artifactにまとめる
- skill roadmap は、skill evidence を skill signal kind ごとに集約し、次に伸ばすべき技術行動を候補として出す
- organization knowledge pack local build は、承認前のローカル成果物として生成し、P2 Hub への同期は行わない
- `monthly-field-report.md` は閲覧用、`monthly-field-report.json` はHub同期・集約用の正規入力とする

受け入れ基準:

- P0のaction itemからissue draftを生成できる
- draft確認後に少なくとも1つのIssueProviderへissueを作成できる
- docs drift / architecture boundary のfindingがaction planへ戻せる
- team lead review artifactから次の対応が判断できる
- monthly field reportが週次reportやskill evidenceを集約できる

### 6.14 P2 Hub / Organization Workflow

目的:

P1のローカルknowledge packとfield evidenceを、組織単位で承認・配布・分析できる形にする。

P2入力:

- `knowledge-pack.local.json`
- `monthly-field-report.json`
- `skill-roadmap.json`
- `field-evidence.jsonl`
- `rule-candidates.json`
- `knowledge-candidates.json`
- approval metadata

Hub は `monthly-field-report.json` を正規入力として取り込み、Markdown は人間が確認する補助artifactとして扱う。

P2出力:

- `organization-knowledge-pack.json`
- `approval-log.jsonl`
- `hub-sync-bundle.json`
- `distributed-rules.json`
- `field-comparison-report.json`
- `roadmap-board.json`

要件:

- Hub は project-local と portable-candidate を混同しない
- organization-portable への昇格は reviewer / approver / timestamp / source artifact を必須にする
- 承認フローは `submitted`、`needs_redaction`、`approved`、`rejected`、`distributed` の状態を持つ
- 横断分析は個人ランキングを作らず、指摘カテゴリ、未解決リスク、ルール再利用、育成テーマの傾向を出す
- 評価補助ダッシュボードは、必ず元artifact、field report、skill evidenceへ遡れる
- 社内標準ルール配布は workspace 側で preview / accept できる
- オンプレミス/閉域同期は、bundle単位のimport/exportを基本にし、オンラインHubへの常時接続を必須にしない

受け入れ基準:

- portable candidateを承認してorganization-portableに昇格できる
- organization knowledge packを複数workspaceへ配布できる
- dashboard上の指標から根拠artifactへ辿れる
- 承認ログと配布ログが監査可能な形式で残る
- Hub未導入でもP0/P1のローカル機能は継続利用できる

---

## 7. 非機能要件

### 7.1 Local First

- P0ではローカルファイルベースで動作する
- クラウド同期はしない
- 組織集約はP2以降

### 7.2 Security

- token は VS Code SecretStorage に保存する
- `.reviewops.local/` は `.gitignore` に入れる
- AI API endpoint へ直接通信しない
- LLM SDK を依存関係に追加しない
- provider投稿は confirmation required とする

### 7.3 Confidentiality

- ReviewOps は自動マスキングを保証しない
- portable candidate 昇格時だけ確認チェックリストを出す
- project-local と portable-candidate を明確に分ける
- 顧客名、リポジトリ名、固有仕様、障害情報は portable へ直接保存しない

### 7.4 Extensibility

- core は VS Code API に依存しない
- provider は adapter interface で差し替え可能にする
- P0では local git / GitHub を同じ ReviewProvider 抽象で扱う
- P1以降で GitLab / Backlog / Jira / IssueProvider を追加できる構造にする
- CLI / CI / Hub へ展開できる構造にする

### 7.5 Auditability

- すべての flow run は run id を持つ
- 生成物は `.reviewops/out/<flow>/<run-id>/` に保存する
- 投稿は actions log に残す
- rule apply は user approval を記録する

---

## 8. データ保存方針

### 8.1 `.reviewops/`

共有可能な設定・知識を置く。

```text
.reviewops/
├─ config.yaml
├─ commands.json
├─ templates/
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

### 8.2 `.reviewops.local/`

現場固有・個人作業状態を置く。

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

---

## 9. P0 Flow

### 9.1 Setup

- `project/init`
- `project/context`
- `provider/connect`
- `provider/list-targets`

### 9.2 Review

- `review/select-target`
- `diff/review`
- `response/import`
- `response/normalize`
- `review/action-plan`
- `publish/summary-draft`

### 9.3 Comment

- `provider/fetch-review`
- `review/comment-triage`
- `review/reply-drafts`
- `publish/reply-draft`

### 9.4 Fix

- `fix/plan`
- `fix/checklist`
- `fix/verify`
- `fix/explain`

### 9.5 Research

- `research/select-scope`
- `research/investigate`
- `research/import-findings`
- `research/normalize-findings`
- `research/action-plan`

### 9.6 Refactoring

- `refactor/plan`
- `refactor/checklist`
- `refactor/verify`
- `refactor/explain`

### 9.7 Knowledge / Skill

- `rules/propose`
- `rules/reconcile`
- `rules/apply`
- `rules/update`
- `knowledge/capture-candidates`
- `skill/evidence-capture`
- `field/report`

### 9.8 Meta

- `meta/list`
- `meta/next`
- `meta/status`
- `meta/resume`
- `meta/readiness`

---

## 10. Cycle

サイクル構成の判断基準:

- `cycle/mr-review`: レビュー対象を選び、外部AIまたは人間シニアの回答を取り込み、レビュー概要を preview-first で出す。`review/action-plan` 後は `publish/summary-draft` へ進め、コメント対応用の `fix/*` と `reply-draft` は必須にしない。
- `cycle/comment-response`: 既存コメントの取得、分類、修正、検証、返信までが目的なので、`fix/*` と `review/reply-drafts` / `publish/reply-draft` を含める。差分レビュー用の `diff/review` は必須にしない。
- `cycle/fix-review`: 既存の手動修正を再レビューし、追加対応が必要な場合に修正計画・検証・説明まで進める。コメント返信投稿は前提にしない。
- `cycle/research`: 調査範囲、調査プロンプト、調査結果取り込み、調査フォローアップに限定する。`research/action-plan` 後は knowledge capture へ進め、レビュー回答・修正・投稿フローは含めない。
- `cycle/refactoring`: リファクタリングの計画、チェックリスト、検証、説明に限定し、レビュー回答・修正・投稿フローは含めない。
- `cycle/field-report`: 既存の知識候補とスキル証跡をレポート化するため、レビュー・修正・投稿フローは含めない。

### 10.1 `cycle/mr-review`

```text
review/select-target
  → diff/review
  → response/import
  → response/normalize
  → review/action-plan
  → publish/summary-draft
  → rules/propose
  → rules/reconcile
  → rules/apply
  → rules/update
  → knowledge/capture-candidates
  → skill/evidence-capture
  → meta/next
```

### 10.2 `cycle/comment-response`

```text
provider/fetch-review
  → review/comment-triage
  → review/action-plan
  → fix/plan
  → fix/checklist
  → fix/verify
  → fix/explain
  → review/reply-drafts
  → publish/reply-draft
  → rules/propose
  → rules/reconcile
  → rules/apply
  → rules/update
  → knowledge/capture-candidates
  → skill/evidence-capture
  → meta/next
```

### 10.3 `cycle/fix-review`

```text
review/select-target
  → diff/review
  → response/import
  → response/normalize
  → review/action-plan
  → fix/plan
  → fix/checklist
  → fix/verify
  → fix/explain
  → rules/propose
  → rules/reconcile
  → rules/apply
  → rules/update
  → knowledge/capture-candidates
  → skill/evidence-capture
  → meta/next
```

### 10.4 `cycle/research`

```text
research/select-scope
  → research/investigate
  → research/import-findings
  → research/normalize-findings
  → research/action-plan
  → knowledge/capture-candidates
  → skill/evidence-capture
  → meta/next
```

### 10.5 `cycle/refactoring`

```text
refactor/plan
  → refactor/checklist
  → refactor/verify
  → refactor/explain
  → rules/propose
  → rules/reconcile
  → rules/apply
  → rules/update
  → knowledge/capture-candidates
  → skill/evidence-capture
  → meta/next
```

### 10.6 `cycle/field-report`

```text
knowledge/capture-candidates
  → skill/evidence-capture
  → field/report
  → meta/next
```

---

## 11. VS Code UI要件

### 11.1 Command Palette

P0コマンド:

```text
ReviewOps: Initialize Project
ReviewOps: Update Project Context
ReviewOps: Setup GitHub Token
ReviewOps: Command Center
ReviewOps: Open Status Preview

ReviewOps: Next Action
ReviewOps: Status
ReviewOps: Resume Current Cycle
ReviewOps: Show Next Actions
ReviewOps: Show P0 Readiness

ReviewOps: Prepare Local Diff Review
ReviewOps: Prepare GitHub Pull Request Review
ReviewOps: Import Manual Review Response
ReviewOps: Build Review Action Plan
ReviewOps: Preview GitHub Summary Comment

ReviewOps: Prepare GitHub Comment Triage
ReviewOps: Draft Review Replies
ReviewOps: Preview GitHub Reply Comment

ReviewOps: Plan Review Fix
ReviewOps: Build Review Fix Checklist
ReviewOps: Verify Review Fix
ReviewOps: Explain Review Fix

ReviewOps: Propose Rules
ReviewOps: Reconcile Rules
ReviewOps: Apply Rules
ReviewOps: Update Rules

ReviewOps: Capture Knowledge Candidates
ReviewOps: Capture Skill Evidence
ReviewOps: Generate Field Report
ReviewOps: Open Artifacts
```

### 11.2 Sidebar

```text
ReviewOps
├─ Current Field
│  ├─ Provider
│  ├─ Review Target
│  ├─ Branch
│  └─ Confidentiality Mode
│
├─ Next Actions
│  ├─ Import Response
│  ├─ Create Action Plan
│  ├─ Propose Rules
│  └─ Post Summary
│
├─ Review Work
│  ├─ MR Review
│  ├─ Comments
│  ├─ Fix Plan
│  └─ Publish Drafts
│
├─ Knowledge
│  ├─ Rule Candidates
│  ├─ Good Practices
│  ├─ Debt Patterns
│  └─ Portable Candidates
│
├─ Skill Evidence
│  ├─ Resolved Findings
│  ├─ Test Additions
│  ├─ Architecture Decisions
│  └─ Growth Signals
│
└─ Reports
   ├─ Developer Report
   ├─ Field Report
   └─ Reviewer Knowledge Report
```

---

## 12. Provider要件

### 12.1 Review Provider

P0:

- local git
- GitHub

P1:

- Backlog Pull Request
- GitLab

必須操作:

- list review targets
- get target
- get diff
- get comments
- post summary comment
- post replies

### 12.2 Issue Provider

P1:

- Jira
- Backlog
- GitHub Issues
- GitLab Issues

必須操作:

- create issue draft
- create issue
- save issue URL
- link issue to review target

---

## 13. 評価指標

### 13.1 現場エンジニア向け

- レビューコメント対応時間
- 返信漏れ件数
- 修正方針作成件数
- 指摘解消率
- 追加テスト件数
- 未解決リスク数

### 13.2 シニア / レビュアー向け

- 繰り返し指摘のルール化件数
- good practice抽出件数
- debt pattern抽出件数
- reusable review tip件数

### 13.3 SES組織向け

- portable knowledge候補数
- 現場横断で再利用されたルール数
- skill evidence件数
- 育成ロードマップ候補数
- field report生成数

---

## 14. リスク

### 14.1 監視ツールに見える

対策:

- 個人ランキングを作らない
- 自動評価点を出さない
- 「評価」ではなく「技術証跡」として扱う
- developer report は本人確認可能にする

### 14.2 機密情報がportable knowledgeに混入する

対策:

- local / portable-candidate / organization-portable を分ける
- portable昇格時チェックリストを必須にする
- 顧客名、仕様名、障害情報の保存を警告する

### 14.3 AIなしでは価値が薄くなる

対策:

- PR/MR取得、コメント整理、action plan、reply draft、field report はAIなしでも動く skeleton を持つ
- AI回答は import 可能な追加入力として扱う
- 将来のAI直接連携に依存しない core を作る

### 14.4 ナレッジ候補が増えすぎる

対策:

- duplicate / merge_needed / rejected を持つ
- rules/reconcile を必須にする
- portable昇格は承認制にする

---

## 15. v0.1完了条件

v0.1 は次を満たす。

- VS Code拡張として起動できる
- `.reviewops/` と `.reviewops.local/` を初期化できる
- local git diff を取得できる
- GitHub PR diff/comments を取得できる
- review prompt を生成できる
- response を import できる
- review result を構造化できる
- action plan を生成できる
- summary/comment reply を preview-first で投稿できる
- rules/propose/reconcile/apply が動く
- skill evidence を保存できる
- field report を生成できる
- meta/next が次アクションを出せる
- 外部AI APIへ通信しない
- token を平文設定ファイルに保存しない

---

## 16. 最終定義

ReviewOps は、SES会社のためのレビュー運用OSである。

日々のレビュー作業を減らすことで現場エンジニアに使われ、その過程でレビュー観点・良い実装・設計負債・育成課題・技術評価証跡を蓄積する。

最初に売るものは「育成管理」ではない。

最初に売るものは、レビュー対応の時短である。

そこから、SES会社が最も苦手な技術育成・技術評価・現場横断ナレッジ化へ接続する。
