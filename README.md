# Agent Spectrum Kernel

**ASKは、AIによる開発を必要な手順と検証の証拠で導き、その手順自体も評価・改善するための基盤です。**

ルールやSkillを集めるだけでなく、依頼とリポジトリに応じて必要な工程を選び、変更範囲・検証結果・未確認事項を揃えて次の判断につなげます。手順を増やすことが目的ではありません。効果のない工程は減らし、小さな作業は軽く進めることも目指します。

初めて使う場合は [はじめ方](#はじめ方) へ。Mac / Codexでは [導入・復旧ガイド](docs/quickstart-mac-codex-ja.md) から始められます。実装やテストが存在することと、実務成果が改善したことは区別します。

## 何を解決したいか

AIへの依頼では、必要な文脈を読まずに変更する、範囲を広げすぎる、テストの成功を完成と取り違える、引き継ぎ時に根拠が失われる、といった問題が起こり得ます。一方、すべての作業に重い計画・レビュー・記録を要求すると、時間やトークンだけが増える可能性があります。

ASKは、共通の判断原則、必要時に使う工程、プロジェクト固有の規約を分け、**今回の作業に何が必要で、何を確かめれば完了と言えるか**を明示するために使います。安全性や品質を一律に保証する仕組みではなく、成果と負担を証拠に照らして見直すための仕組みです。

## どう使い、何を受け取るか

導入後は、Skill名を覚えるより、対象・目的・制約を自然文で伝えます。

| やりたいこと | 依頼の例 | 期待する成果物・判断材料 |
| --- | --- | --- |
| 変更する | 「このチケットを進めて。既存の規約を確認し、変更範囲を絞って検証してください」 | 必要な要件確認、差分、実行した検証と結果、未確認事項 |
| 原因を調べる | 「このバグを調べて。再現と仮説の反証を示してください」 | 再現条件、確かめた仮説、原因の根拠、次の確認 |
| レビューする | 「このPRをレビューして。必要な観点を選び、指摘の根拠を示してください」 | 根拠付きの指摘、判断に足りない証拠、要求した場合の最終判断 |
| 引き継ぐ | 「次のAgentが続けられる形にしてください」 | 現在地、許可された範囲、確認済みの証拠、次の作業と停止条件 |
| 手順を見直す | 「この作業で手順が重すぎた理由を調べ、改善候補と比較方法を提案してください。適用はしないでください」 | 問題の整理、候補、比較条件、採否に必要な証拠 |

これは依頼と出力の使い方であり、モデルが毎回正しく手順を適用するという実測結果ではありません。利用できる工程は、導入したprofileとツールに依存します。例文は [依頼レシピ](docs/prompt-recipes-ja.md)、工程の選び方は [利用ガイド](docs/usage-ja.md) を参照してください。

## 二つのループ

### 1. 開発を進める

1. 依頼、既存コード、規約、関連する証拠を理解する。
2. 必要な工程だけを選ぶ。小さな修正にすべてのSkillを使わない。
3. 変更範囲を決め、実装・検証・レビューを進める。権限や証拠が足りなければ止める。
4. 変更内容、確認結果、残る不確実性を示して完了を判断し、必要なら引き継ぐ。

共通の判断は [Kernel](AGENTS.md)、工程の選択は [ルーティングモデル](docs/routing-model.md)、成果物の責任分担は [ライフサイクル契約](docs/lifecycle-artifact-contract.md) に定義しています。READMEで契約を重ねて定義しません。

### 2. 手順自体を評価・改善する

1. 実作業の失敗、抜け、過剰な工程を問題として記録する。
2. Skill / Promptの改善候補を作る。
3. 結果を見る前に、比較対象・課題・評価基準・予算を決める。
4. 評価し、品質だけでなく負担、失敗、未確認事項も確認する。
5. 採用・修正・保留・却下を判断する。実際の適用は別途承認する。

開発で得た問題を改善候補にし、評価で必要性を確かめた手順を開発へ戻す構想です。候補やSkillを増やすこと自体を成功とは扱いません。不要な工程の削減も改善に含めます。

[Evolutionの契約](docs/evolution-loop-contract.md) は候補・比較・判断・適用の責任を分けます。現在の [個人改善CLI](docs/personal-evolution-cli.md) は **Promptを対象とする入口**で、事前の管理設定後に問題要約、候補生成、ソース確認、保存比較、評価確認、人の判断をつなぎます。任意のSkillを自律的に改善したり、Macへ自動適用したりする機能ではありません。実モデルの生成・比較を始めるには本人の直接承認が必要です。公開された一巡の検証はfake provider / runner / gradingによる合成試験であり、実運用の成功とは区別します。

## Kernel・Skills・プロジェクト固有設定

| 層 | 役割 | 正本・入口 |
| --- | --- | --- |
| Kernel | 常時参照する判断原則。文脈、範囲、証拠、承認、完了判断を扱う | [AGENTS.md](AGENTS.md) |
| Skills | 必要時に選ぶ要件確認、設計、実装、検証、レビューなどの工程 | [skills/](skills/)、[Skill一覧](docs/skill-matrix.md) |
| Project overlay | 対象repoの規約、コマンド、業務・技術固有の制約 | [導入ガイドのoverlay説明](docs/quickstart-ja.md#project-overlay-rules)、[技術別overlay契約](docs/stack-implementation-overlay-contract.md) |
| Adapter | ツールが読める配置・prompt・runnerへ投影する接続部分 | [Codex](adapters/codex/README.md)、[Claude Code](adapters/claude-code/README.md)、[能力と証拠の対応表](docs/adapter-capability-matrix.md) |

共通Kernelに個々のプロジェクトの規約を詰め込まず、工程選択後に該当するoverlayを使います。Adapterがファイルを配置できることと、実行時にモデルが読み、手順を適用したことも別です。

### 「Kernelだけ」と呼ばれる構成の違い

| 構成 | 内容・用途 | 混同しない点 |
| --- | --- | --- |
| 従来のAGENTS.md単体 | 小さな作業向けに判断原則だけを置く入口 | 全工程・依存契約を含む導入ではない。追加工程が必要なら対応する構成を選ぶ |
| ASK Core Bundle | opt-inの別製品。`core` はSkillゼロで必須の契約・実行資産を含み、`full` は同じcoreにSkill等を追加 | [Core Bundle実装・導入](docs/ask-core-bundle-implementation.md)。従来installerの既定動作を置き換えない |
| K-principles v2 | 共通原則を抽出した、`kernel_principles_v2` という別IDの評価条件 | [評価入口](docs/kernel-principles-v2-adoption.md)。専門Skillや形式手順を提供・実行したことにはならず、必須手順が欠ければ開始できない |

過去のbenchmarkのKernel-onlyと、現在のCore BundleやK-principles v2を同一条件として比較しません。[三条件比較の定義](docs/local-three-arm-comparison.md) と [v2のprimary接続](docs/primary-principles-v2-connection.md) で、対象の条件を確認してください。

## はじめ方

導入時間の一律の目安は設けていません。まず、対象repoと利用ツールを決めます。

1. **Mac / Codex:** [導入・復旧ガイド](docs/quickstart-mac-codex-ja.md) の使い捨てrepoで、導入計画と変更差分を確認します。検証対象はmacOS・Node 24.x・Git・完全なASK checkoutです。
2. **ほかの構成:** [共通導入ガイド](docs/quickstart-ja.md) から、Skill対応 / 非対応ツールやClaude Codeの手順を選びます。
3. **最初の作業:** [Mac初回開発受入の準備](docs/first-workflow-mac-codex-ja.md) または [依頼レシピ](docs/prompt-recipes-ja.md) で、対象・制約・期待する証拠を指定します。

Mac / Codex向けに、まずモデル通信なしで導入・復旧の処理を確認する場合は、ASK checkoutで次を実行できます。

```bash
git clone https://github.com/ist-h-i/agent-spectrum-kernel.git
cd agent-spectrum-kernel
node scripts/test-release-install-recovery.mjs
```

この確認は自分で作成した人工repoだけを操作し、最後に削除します。実プロジェクトへの導入や開発タスクの実行ではありません。実際の導入では [setupの計画](docs/adoption-setup.md) と [確認した計画の適用](docs/adoption-apply.md) に従い、`inspect → recommend → plan → check → dry-run → apply → doctor` を進めます。`recommend` は能力に基づく候補で、効果実測済みの推奨ではありません。

導入後の依頼例:

```text
このrepoのAGENTS.mdと利用可能なSkillを確認し、この依頼に必要な工程だけで進めてください。
対象は〇〇です。変更してよい範囲は△△です。
実行した検証と結果、未確認事項、次に必要な判断を最後に示してください。
```

`doctor` の導入整合性の成功だけで、実務での稼働や効果を判定しません。`Installed`、`Activated`、`Operational` の区別は [導入・運用の判定基準](docs/adapter-deployment-governance.md) を参照してください。

## 現在使えるものと検証中のもの

以下は **2026-10-20、main [`4c0b9d3`](https://github.com/ist-h-i/agent-spectrum-kernel/commit/4c0b9d348cc5c705ba1a72f20df3a79660a9d857) 時点**の実装・記録の要約です。日々の進捗はリンク先で確認してください。

| 領域 | 存在する実装・記録 | そこからは言えないこと・残る確認 |
| --- | --- | --- |
| 開発手順と導入 | Kernel、Skill、adapter、setup / doctor、モデル不要の導入復旧試験 | 導入先での工程適用、実務上の品質改善、全環境での動作 |
| 証拠と採否判断 | 証拠再利用、Asset Registry、Portfolio、Evolutionの契約と実装 | 保存・登録・採用判断だけで実適用や有効性が成立すること |
| 個人改善CLI | Prompt候補から比較・確認・人の判断へつなぐ入口と合成試験 | 任意Skillの自律改善、Mac設定への自動適用、実運用の成功 |
| 24課題評価 | 公開入力・契約・portfolio登録24件。明示`catalog24`によるP / K2 / Fの72枠準備、CLIでの選択、fake比較・採点処理 | 全24課題のprivate採点・native受入の完成、実モデルでの比較結果 |

24課題の基盤はPR407/408でmainへ統合済みです。この確認時点で [PR409](https://github.com/ist-h-i/agent-spectrum-kernel/pull/409) は開発中のDraftで、採点・受入の追加作業が残っています。課題別の根拠と残件は [組立・採点検証状況](docs/primary-24-task-assembly.md)、公開入力と未実行枠の扱いは [公開入力点検](docs/primary-24-public-inputs.md) を参照してください。

実装の存在、合成試験、実モデルの測定、実務での効果はそれぞれ別の証拠です。[リリース判定資料](docs/release-package-2026-10.md) も対象revisionと日付を持つ記録であり、その後の開発を自動的に完成扱いにはしません。

## 評価結果と限界

手順を追加すると品質が上がる、という前提は置きません。過去の測定には、Fullを広げる根拠にならなかった結果もあります。

| 過去の測定 | 記録された結果 | 解釈の範囲 |
| --- | --- | --- |
| [Checkpoint B2](benchmarks/results/checkpoint-b2-report.md) | 4課題すべてでFull ASKはKernel-onlyに対する品質上積みなし。トークンはすべて2倍超 | 当時の固定条件の測定。Kernel-onlyは難しい実装課題1件で改善したが、他の3件では品質改善なし |
| [Checkpoint C](benchmarks/results/checkpoint-c-report.md) | Fullは`retain` 1件、`simplify` 3件、`expand` 0件 | レビュー1件の得点改善もトークン増で拡大基準を満たさず。別の実装課題ではKernel-only / Fullとも未検証の完了主張が記録された |

これらは固定された人工課題での限定的な実モデル測定です。反復が少なく、モデル・CLI・adapter・repo等の差があるため、現行構成の効果や一般的な因果関係には拡張できません。**進行中の24課題評価の結果でもありません。** 人の修正時間、再作業、金銭費用など、測定されていない値も推測しません。

現在の比較を準備する場合は [利用者repoでの三条件比較](docs/user-repository-comparison-mac-codex-ja.md)、環境差や不明点を残して観測する場合は [探索的評価](docs/pragmatic-evaluation.md) を参照してください。準備・報告の処理と実モデルの実行承認は別です。

## 目的から資料を探す

| 目的 | 読む資料 |
| --- | --- |
| 導入して最初の依頼をする | [Mac / Codex導入](docs/quickstart-mac-codex-ja.md)、[共通導入](docs/quickstart-ja.md)、[依頼レシピ](docs/prompt-recipes-ja.md) |
| 用語や工程の選び方を知る | [用語集](docs/glossary-ja.md)、[ルーティング](docs/routing-model.md)、[Skill一覧](docs/skill-matrix.md) |
| 改善候補を評価して判断する | [個人改善CLI](docs/personal-evolution-cli.md)、[個人ループの手順](docs/personal-evolution-primary-loop.md)、[Evolution契約](docs/evolution-loop-contract.md) |
| 評価の根拠・未完事項を調べる | [24課題の状況](docs/primary-24-task-assembly.md)、[過去の測定](benchmarks/results/)、[リリース判定](docs/release-package-2026-10.md) |
| 運用の説明・報告を作る | [readiness報告テンプレート](docs/ai/stakeholder-readiness-report-template.md)、[人工データによる報告例](docs/ai/reports/examples/) |
| 契約・実装・詳細手順を探す | [文書索引](docs/README.md)、[manifest](manifest.json)、[変更履歴](CHANGELOG.md) |
