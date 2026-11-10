# ReviewOps

ReviewOps は、現場エンジニアが PR/MR レビュー対応を速く、漏れなく、安全に進めるための VS Code 拡張です。

レビュー用プロンプト、コメントトリアージ、修正計画、返信案、ルール候補、技術証跡を整理しつつ、AI 実行は manual-only、外部投稿は preview-first に保ちます。副産物として、SES 企業にとって価値のある育成・評価・横展開用の知識とメトリクスを、ユーザーが見えるローカルファイルとして残します。

## ヒーロー価値

- レビュー対応を速くする: コメントや取り込んだレビュー回答を、アクション計画、修正チェックリスト、返信案へ整理します。
- 抜け漏れを減らす: 次のアクション、未解決リスク、生成成果物を Command Center で見える状態にします。
- 安全に進める: ReviewOps は外部 AI API を直接呼ばず、provider への投稿は必ずプレビュー確認を挟みます。
- 見える資産を残す: 共有メトリクスは `.reviewops/metrics/review-work.yaml`、再利用ナレッジは `.reviewops/knowledge/`、個人・現場ローカル詳細は `.reviewops.local/` に置きます。

## 基準ドキュメント

- [要件定義](docs/requirements.md)
- [設計書](docs/design.md)

## 目標構成

- VS Code Extension Layer
- ReviewOps Core Layer
- Provider Adapter Layer

P0 では AI 実行は manual-only とし、ReviewOps はプロンプト生成と回答取り込みを行います。外部 AI API へは直接通信しません。

現行 P0 の review provider 実装は local git と GitHub です。GitLab、Backlog、Jira、Issue 作成、Hub 連携は P1/P2 計画として扱います。

P0 のメトリクスもローカルファイルに限定します。安全な集計は `.reviewops/metrics/review-work.yaml`、詳細イベントは `.reviewops.local/metrics-events.local.jsonl` に記録し、テレメトリ送信や自動スコアリングは行いません。
