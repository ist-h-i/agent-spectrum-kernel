# 文書索引

[README](../README.md) は目的と使い始めの入口です。この索引は、詳細な手順・契約・評価記録の正本へ案内します。契約の定義や開発進捗をここで複製しません。

## 導入・利用・復旧

| 調べたいこと | 資料 |
| --- | --- |
| Mac / Codexの導入・復旧、最初の作業 | [導入・復旧](quickstart-mac-codex-ja.md)、[初回開発受入の準備](first-workflow-mac-codex-ja.md) |
| ツール別の導入・自然文の依頼 | [共通導入](quickstart-ja.md)、[依頼レシピ](prompt-recipes-ja.md)、[利用ガイド](usage-ja.md)、[用語集](glossary-ja.md) |
| setupの計画・適用・診断 | [導入計画](adoption-setup.md)、[計画の適用・復旧](adoption-apply.md) |
| Codexのprofile・prompt・runner | [Codex adapter](../adapters/codex/README.md) |
| Claudeのprofile・hooks・任意plugin・PR共有 | [Claude Code adapter](../adapters/claude-code/README.md)、[GitHub review setup](claude-github-review-setup.md) |
| 能力、導入状態、更新・縮小・共存・復旧 | [能力と証拠](adapter-capability-matrix.md)、[導入判定](adapter-deployment-governance.md)、[移行](adapter-runtime-migration.md) |
| doctor・sensors・runtime適合性の意味 | [適合性契約](adapter-conformance-contract.md)、[runtime境界](adapter-runtime-boundary-contract.md)、[cross-conformance記録](adapter-cross-conformance-report.md) |

## 工程と契約

| 調べたいこと | 正本 |
| --- | --- |
| 常時の判断原則・工程選択 | [Kernel](../AGENTS.md)、[モード・層・pack](routing-model.md)、[Skill一覧](skill-matrix.md)、[mode router](../skills/operating-mode-router/SKILL.md)、[delivery router](../skills/skill-router/SKILL.md) |
| プロジェクト・技術固有の補助 | [overlayの導入](quickstart-ja.md#project-overlay-rules)、[技術別overlay契約](stack-implementation-overlay-contract.md) |
| 要件から実装・検証までの責任と接続 | [ライフサイクル成果物](lifecycle-artifact-contract.md)、[証拠の追跡](lifecycle-traceability-contract.md)、[検証方式の選択](verification-proof-policy-contract.md) |
| route・証拠状態・停止理由・次の行動 | [Execution Envelope](execution-envelope-contract.md)、[継続状態](agent-session-state-contract.md) |
| 証拠の同一性・再利用・持ち運び | [検証証拠契約](verification-evidence-contract.md)、[信頼境界ADR](adr/0001-verification-evidence-trust-boundary.md) |
| 大きな作業の開始判断・Work Package Plan | [admission契約](epic-admission-work-package-plan-contract.md)、[権限ADR](adr/0002-epic-admission-work-package-plan-authority.md) |
| Skill・Prompt等の不変な登録 | [Asset Registry](asset-registry-contract.md)、[権限ADR](adr/0003-asset-registry-authority-boundary.md) |
| Asset集合の選択・有効化・rollback | [Portfolio Manager](portfolio-manager-contract.md)、[有効化の権限ADR](adr/0004-portfolio-activation-authority-boundary.md) |
| 候補・比較・評価・人の判断・適用の分離 | [Evolution](evolution-loop-contract.md)、[権限ADR](adr/0005-evolution-authority-boundary.md)、[公開候補例](evolution-loop-sample-prompt-candidate.md) |

## 手順を評価・改善する

| 調べたいこと | 資料 |
| --- | --- |
| Promptの個人改善を始める・再開する | [個人改善CLI](personal-evolution-cli.md)、[一巡の手順](personal-evolution-primary-loop.md)、[保存結果](personal-evolution-saved-results.md) |
| 生成の準備・実行接続・状態を調べる | [生成契約](personal-evolution-generation.md)、[connector](personal-evolution-generation-connector.md)、[Codex接続](personal-evolution-codex-generation.md)、[状態確認](personal-evolution-generation-status.md) |
| 独立した候補確認・比較処理の接続 | [source reviewer](personal-evolution-source-reviewer.md)、[pair契約](personal-evolution-primary-pair-contract.md)、[driver](personal-evolution-driver.md)、[bridge](personal-evolution-bridge.md)、[無人処理の範囲](personal-evolution-unattended.md) |
| Prompt v2の事前登録と実行境界 | [固定protocol](../benchmarks/protocol-prompt-v2.md)、[事前登録](../benchmarks/prompt-v2-preregistration.json)、[実行handoff](prompt-v2-execution-handoff.md)、[権限ADR](adr/0011-prompt-v2-result-blind-canary-authority.md) |
| 導入効果・工程の過不足をふり返る | [Skill効果評価](../skills/skill-effectiveness-evaluation/SKILL.md)、[導入指標](../skills/skill-adoption-metrics/SKILL.md)、[能力評価](../skills/engineering-capability-evaluation/SKILL.md) |

## 比較条件・測定・限界

| 調べたいこと | 資料 |
| --- | --- |
| 過去の比較と不利な結果を含む測定 | [benchmark定義](../benchmarks/)、[B2報告](../benchmarks/results/checkpoint-b2-report.md)、[C報告](../benchmarks/results/checkpoint-c-report.md)、[保存結果一覧](../benchmarks/results/) |
| 24課題の公開入力・組立・採点の未完事項 | [公開入力点検](primary-24-public-inputs.md)、[組立・採点検証状況](primary-24-task-assembly.md)、[正本catalog](../benchmarks/portfolio-catalog.json) |
| 利用者repoで比較する・環境差を記録する | [Mac / Codex三条件比較](user-repository-comparison-mac-codex-ja.md)、[探索的評価](pragmatic-evaluation.md) |
| モデル不要のlocal eval・Full準備・実行境界 | [配布とplatform経路](local-eval-distribution.md)、[Full静的準備](local-full-static-preparation.md)、[三条件比較](local-three-arm-comparison.md)、[Codex接続](local-codex-connection.md)、[probe / evaluation開始境界](local-codex-admission.md) |
| 従来構成とSkillゼロのCore Bundleの違い | [Core Bundle実装・導入・未検証範囲](ask-core-bundle-implementation.md)、[製品の原則](../products/ask-core-bundle/AGENTS.md) |
| K-principlesの抽出とv2評価条件 | [v1比較定義](kernel-principles-comparison.md)、[v2候補](kernel-principles-candidate-v2.md)、[v2評価入口](kernel-principles-v2-adoption.md)、[primary接続](primary-principles-v2-connection.md) |
| revisionごとのリリース判定・目標・残件 | [2026年10月の判定資料](release-package-2026-10.md) |

## 知識・運用・報告

| 調べたいこと | 資料 |
| --- | --- |
| 繰り返し参照する作業・レビュー文脈 | [implementation context](ai/implementation-context.md)、[review context](ai/review-context.md) |
| 実装・検証・レビュー・文書・設計の再利用知識 | [実装pattern](ai/engineering-pattern-ledger.md)、[検証pattern](ai/verification-pattern-ledger.md)、[review rule](ai/review-rule-ledger.md)、[文書知識](ai/documentation-knowledge-ledger.md)、[設計判断](ai/architecture-decision-memory.md) |
| 業務ルール・改善候補 | [domain rule](ai/domain-rule-ledger.md)、[改善台帳](ai/improvement-ledger.md) |
| opt-inの導入指標と運用 | [指標台帳](ai/skill-adoption-metrics.md)、[event契約](metrics-event-contract.md)、[observability runtime](observability-runtime-contract.md)、[運用自動化契約](operation-automation-contract.md) |
| 能力評価と関係者向け報告 | [能力台帳](ai/engineering-capability-ledger.md)、[導入報告](ai/adoption-report-template.md)、[readiness報告](ai/stakeholder-readiness-report-template.md)、[人工データの報告例](ai/reports/examples/) |

## 実装の配置と履歴

Skill・契約等の登録情報は [manifest.json](../manifest.json)、全ファイルはGitのツリーを参照してください。

| 場所 | 内容 |
| --- | --- |
| [AGENTS.md](../AGENTS.md) / [CUSTOM_INSTRUCTIONS.md](../CUSTOM_INSTRUCTIONS.md) | 共通原則と単一instruction欄向けの投影 |
| [skills/](../skills/) | 工程の正本 |
| [docs/](.) / [schemas/](../schemas/) | 人向け契約・ガイドと機械可読schema |
| [scripts/](../scripts/) | 導入・検証・評価等のCLIとテスト |
| [adapters/](../adapters/) / [products/](../products/) | ツール向け投影と別製品 |
| [benchmarks/](../benchmarks/) / [examples/](../examples/) | 評価定義・測定と利用例 |
| [CHANGELOG.md](../CHANGELOG.md) / [コミット履歴](https://github.com/ist-h-i/agent-spectrum-kernel/commits/main/) | 変更履歴。現在の能力は対象revisionの実装と証拠で確認する |
