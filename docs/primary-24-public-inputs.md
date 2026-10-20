# 既存24課題の公開入力をまとめて点検する

正本は [portfolio-catalog.json](../benchmarks/portfolio-catalog.json) の primary 24件
（機構あり6、軽量抑制6、実務頻度8、高影響4）。
この入口は、各課題の公開入力・成果物契約・要件・検証コマンドを列挙し、契約も揃う入力を
新しい保存先へ準備・再検証する。モデルや課題の検証コマンド、private evaluator は起動しない。

**24件の比較・意味採点の完成ではない。** main `281c6a93` を調べた時点では公開資産15件、
個人比較・採点の登録9件。未統合9件には既存候補PRと未解決依存がある。
このbranchには既存9候補の資産を固定headから取り込み、公開入力・成果物/要件契約・portfolio登録24件がある。
性能回帰の独立admissionと計測証拠の接続は保留。[課題の組立・採点検証](primary-24-task-assembly.md)を継続する。
既存9件も、この点検だけで正常例・不良例の意味採点が確認済みになるわけではない。

2026-10-20追記: primary evaluation batchの明示`catalog24`と共通v7 APIは接続済み。
個人ループCLIにも明示`catalog24`を接続し、省略時は従来9件内の選択を維持する。以下のmain比較・候補PR点検は当時の記録であり、
現在の未完一覧は[組立状況](primary-24-task-assembly.md)を参照する。性能consumerは実装済みだが、
新しいprivate authorityの固定とnative受入は未完である。

## 同じ既存入口から使う

```sh
node scripts/ask-benchmark.mjs list-primary-inputs
node scripts/ask-benchmark.mjs prepare-primary-inputs --output /absolute/new-primary-inputs
node scripts/ask-benchmark.mjs verify-primary-inputs --input /absolute/new-primary-inputs --output /absolute/new-verification.json
```

保存先は未使用の絶対パスで、親ディレクトリが存在し、symlink を通らないものを指定する。
準備先は実装checkoutの外、検証レポートは準備先の外に置く。同じ出力を上書きしない。
`list-primary-inputs` は一覧表示のため exit 0、準備・再検証は24件の公開入力がすべて妥当なら
exit 0、一部の欠損・不整合が残れば **レポートを保存したうえで exit 2**。
出力の再利用や準備全体の破損など、入口自体の失敗は exit 1。

基点main由来の15件を維持し、このbranchでは全24件をコピーする。改変・欠損を検出した課題は理由付きで記録する。
独立した課題は処理を続ける。存在しない課題を削って分母を変えたり、他の課題で代用したりしない。

```text
new-primary-inputs/
  catalog.json
  preparation.json              # 全24件、P/K2/F の72枠、契約・要件・不足理由
  preparation.digest
  inputs/<fixture-id>/           # 妥当だった課題の task.md + workspace/** だけ
  records/<fixture-id>/
    status.json                 # 不足・失敗した課題にも必ず作る
    input-manifest.json          # 以下の契約はコピーできた課題の管理側だけ
    verification-command-contract.json
    output-contract.json
    requirement-record.json
    evidence-map.json
```

`inputs` にprivate資産や採点契約を混ぜない。`records` と `preparation.json` はモデルに渡さない。
再検証は保存した契約と入力digestを使い、元のfixtureや過去のrunを変更しない。
準備途中の例外も該当課題の状態として保存し、その出力先を修復・再利用しない。
ディスクへの保存自体が失敗した場合は入口が失敗し、未完の出力を成功扱いしない。

## 結果の読み方

| 項目 | 意味 |
| --- | --- |
| `public_input_status` | 課題ごとの `valid` / `prepared` / `invalid`。全体は `complete` / `partial` |
| `public_files` / `contract_digests` | 公開入力の全ファイルと、準備した契約の正確なdigest |
| `output_contract` / `candidate_scope` | 成果物形式と変更可能・保護対象の範囲 |
| `requirements` | 元の要件ID、配点、根拠参照。追加の採点基準は作らない |
| `verification_commands` | 既存の公開検証契約。ここでは実行しない |
| `portfolio_registered` | 既存のadaptive configにIDがある。実行許可・admissionの証明ではない |
| `primary_comparison_registered` | 既存の閉じた9課題への登録。private resource preflightの成功ではない |
| `semantic_controls.status` | この入口では常に `not_run`。mutationの宣言数は実行済み証拠ではない |
| `slots` | 課題×plain / kernel_principles_v2 / full_ask。未開始または入力不備によるblocked |
| `quality` / `points` | すべて `null`。未評価・採点不能を品質0へ変換しない |
| `failures` / `comparison_blockers` | 入力の不足・不整合と、比較・意味採点の未接続を分けた理由 |
| `comparison_start_allowed` | 常にfalse。このレポートから比較開始の権限を作らない |

公開inputのhash、コマンド/input/outputの結び付け、既存の成果物・要件schemaとdigest、
scopeと要件根拠の公開範囲を検査する。private evaluatorの正当性、正常例・不良例の採点、
実行時の安全性、性能測定の結び付け、ASKの優位性は判定しない。
この境界の成功から、別の判定を推測しない。

## 24件の内訳と期待する成果物

以下の「公開」はmainに入力と契約があること、「個人」は既存9課題の比較登録を表す。
正常例・不良例の意味採点は別の固定private評価と独立レビューが必要。
今回の入口は、全24件についてその状態を `not_run` と報告する。

| 課題ID | 公開 / 個人 | 入力から求める結果・成果物 | 判定上の注意 |
| --- | --- | --- | --- |
| mp-accessibility-interaction-review | あり / あり | toolbar差分とinteraction契約を根拠に `review.json` | shape成功だけではレビューの正確さを示さない |
| mp-ci-evidence-gap | あり / あり | CI・実装・テストを突き合わせた `review.json` | 検証証拠の不足を成功へ変えない |
| mp-data-migration-handoff | あり / あり | 混在version・承認・rollbackを保った `handoff.json` | 未実施チェックと次のownerを区別する |
| mp-frontend-state-review | あり / あり | inbox filter・選択状態の差分に対する `review.json` | 動作確認の範囲とfalse positiveを区別する |
| mp-iac-rollback-design | あり / あり | plan/state/承認境界を根拠に `change-plan.json` | infrastructure操作や承認の実行は課題外 |
| mp-performance-investigation | あり / あり | 観測・競合仮説・次の検証を分けた `investigation.json` | 相関を因果の証明へ変えない |
| mn-build-option-update | あり / あり | releaseの互換build設定だけを修正 | debug・target・最適化を維持する |
| mn-client-compatibility-fix | PR #341 / なし | 古いmobile clientでのpreference読取りと回帰テスト | private grading不整合が未解決 |
| mn-doc-config-correction | あり / あり | service defaultsに一致するretry文書のJSON例 | JSONブロック外を維持する |
| mn-focused-regression-test | あり / あり | mixed-case region境界の回帰テスト | production挙動を変更しない |
| mn-frontend-default-fix | あり / なし | 保存されたfalseを初期表示で保つ修正とテスト | update/resetの契約を維持する |
| mn-schema-field-alignment | あり / なし | v2 member fieldにschema・テストを整合 | callerやvalidation strictnessを変えない |
| pf-api-pagination-behavior | あり / なし | 公開pagination契約を満たす実装とテスト | 固定caller/serviceを維持する |
| pf-ci-cache-flake | あり / なし | cache観測の再現・競合説明付き `investigation.json` | 架空データから発生頻度を推定しない |
| pf-data-schema-evolution | PR #350 / なし | 旧reader互換のschemaとidempotentなmigration plan | rollback実行時観測の不足が残る |
| pf-frontend-async-state | あり / なし | 応答逆転・replacement・failure・disposeに対応するcontroller | cancellation無視のtransportも扱う |
| pf-library-compat-upgrade | PR #358 / なし | archive v2 adapterと `migration-record.json` | POSIX/Windows・v1 rollback・観測不足 |
| pf-observability-redaction | PR #359 / なし | diagnosticを保つpolicy修正と `review.json` | 架空ラベルの処理。安全性観測は未接続 |
| pf-performance-regression | PR #355 / なし | lookupの機能維持と反復runtime目標の検証 | 測定時ソース・raw測定結果の結び付け不足 |
| pf-review-error-contract | あり / なし | case/根拠/前後response付き `review.json` | shape成功を意味の正確さへ変えない |
| hi-authorization-exception | PR #361 / なし | ownership境界と正当な例外を分けた `review.json` | 架空boolean model。安全性観測はUnknown |
| hi-external-action-approval | PR #362 / なし | 特定承認・状態・rollbackを保つ `operation-plan.json` | no-effect dry-runのみ。安全性観測はUnknown |
| hi-financial-state-integrity | PR #363 / なし | duplicate transferの残高・audit・atomic rejectionを修正 | 架空台帳。安全性観測はUnknown |
| hi-versioned-migration-safety | PR #364 / なし | 混在reader/writerとrollback限界付き `migration-plan.json` | 計画のみ。安全性観測はUnknown |

各入力の細部は対応fixtureの `task.md` / `workspace`、成果物は `output-contract.json`、
採点要件は `requirement-record.json` を正本とする。この表を新しい採点仕様にしない。

## 既存候補の依存と残る作業

2026-10-19にGitHub上の既存PRと公開sourceを確認した。次の9候補を作り直したり、
未統合・未admissionの状態をこのPRで承認へ置き換えたりしない。

| PR / 固定head | 状態・次に閉じる依存 |
| --- | --- |
| [#341](https://github.com/ist-h-i/agent-spectrum-kernel/pull/341) `f2c4a229` | grading mismatch。未公開の後続候補・過去の失敗を確認し、許可された範囲で反例を解消して再レビュー |
| [#350](https://github.com/ist-h-i/agent-spectrum-kernel/pull/350) `730721c8` | rollbackのunsafe-attempt観測/contextと独立whole admission |
| [#355](https://github.com/ist-h-i/agent-spectrum-kernel/pull/355) `d4162b36` | measurement-time sourceと最終提出source、認証済みraw結果の結び付け。元headではprivate evaluatorがgeneration_pending。本branchでは未承認の契約・固定例を作成し、認証済み計測の接続待ち |
| [#358](https://github.com/ist-h-i/agent-spectrum-kernel/pull/358) `d59a6a9b` | 個別semantic review済みというPR記録。安全性観測とwhole admissionはHOLD |
| [#359](https://github.com/ist-h-i/agent-spectrum-kernel/pull/359) `d15e2eda` | 個別semantic review済みというPR記録。安全性観測とwhole admissionはHOLD |
| [#361](https://github.com/ist-h-i/agent-spectrum-kernel/pull/361) `5505c1c7` | 個別semantic review済みというPR記録。安全性観測とwhole admissionはHOLD |
| [#362](https://github.com/ist-h-i/agent-spectrum-kernel/pull/362) `48dbb870` | 個別semantic review済みというPR記録。安全性観測とwhole admissionはHOLD |
| [#363](https://github.com/ist-h-i/agent-spectrum-kernel/pull/363) `e7099dde` | 個別semantic review済みというPR記録。安全性観測とwhole admissionはHOLD |
| [#364](https://github.com/ist-h-i/agent-spectrum-kernel/pull/364) `cf95a813` | 個別semantic review済みというPR記録。安全性観測とwhole admissionはHOLD |

共通の要件ID分類・shell証拠認識修正は別担当。この変更はそれらのscoring/parser、
primary scope/producer/selector、schema generator、handoff authority writerを編集しない。
今回の公開入力点検に成功しても、上表の依存を満たしたことにはならない。

その後も、既存9件を含む正常・不良・根拠除去例の採点妥当性確認、残る15件の個人比較への
登録、固定private resource/scoring-versionの準備、24件fake比較での失敗保存の確認が必要。
過去のrunや凍結bundleは再採点・上書きしない。
既存PR #365 は過去の残り8件の固定計画であり、新しい24件の開始計画に流用しない。
実モデル受入はこれらの前提が整った後、未使用出力先と十分な時間・token枠を固定した
一度限りのプロンプトを人間へ渡す段階。本変更には実モデル開始コマンドを含めない。

## 非モデルの検証と作業境界

```sh
node --test scripts/test-ask-primary-public-inputs.mjs
node --test scripts/test-ask-primary-fixture-recipe.mjs scripts/test-ask-primary-evaluation-batch.mjs scripts/test-ask-primary-evaluation-profile.mjs
```

既存CIの `scripts/test-ask-benchmark.mjs` が公開入力・性能source・計測データの試験も起動する。共通workflowは変更しない。
新しい試験は、実在する全24件の入力・契約、改変・欠損・範囲の不整合、部分失敗、
保存入力への追加・変更、出力の再利用拒否、CLIと72枠のnullを検査する。
別途、反復した人工レビュー入力によるtransport controlで
同じ24件ループを検査する。これは24種類の実課題・意味採点の代替ではない。

Implementation Contract:

- Artifact ID: `implementation-primary-24-public-readiness-20261019`
- Upstream refs: ユーザーの24課題整備依頼、#192/#205/#207/#208/#209、既存primary準備・catalog契約
- Actual change boundary: 既存CLI、公開入力の列挙・準備・検証、専用の非モデル試験と本手順
- Selected proof: `formal_verification_contract` / `verification-primary-24-public-readiness-20261019`
- Verification obligations: 上記試験、既存benchmark/primary回帰、repository/bundle整合性、独立diff review
- Handoff state: 24件の公開入力準備の入口を追加。全24件の比較・意味採点完成は上記依存が未解決
