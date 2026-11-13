# npm配布

npmパッケージは、ASKのCLI・標準スキル・自己改善の実行処理を配布します。
`npm install`の途中で利用者のプロジェクトを書き換える処理はありません。
公開準備の対象は `@hiroshi.inoue/agent-spectrum-kernel@1.0.0`、ライセンスは[MIT](../LICENSE)です。
公開操作は別途行います。この文書や公開設定の変更だけではnpmに公開されません。
パッケージ版と、manifestの資産版、過去のpersonal-v1公開タグは区別します。

## 導入と保存先

公開後は `npm install @hiroshi.inoue/agent-spectrum-kernel@1.0.0` で導入できます。

公開前は、チェックアウトで `npm pack` を実行し、生成したtgzを別のプロジェクトに
`npm install /absolute/path/hiroshi.inoue-agent-spectrum-kernel-1.0.0.tgz` で導入します。
その後 `npx --no-install ask init --workspace /absolute/path/my-ask` を実行します。

作成されるフォルダには、実行コードと標準資産の `source/`、候補・評価・版管理のための
`state/`、版と保存先を記録した `.ask-workspace.json` が入ります。GitやGitHubアカウントは不要です。
既存の保存先は上書きしません。npmのキャッシュやnode_modulesから独立しているため、
npmの更新やキャッシュ削除によって途中の評価や採用資産は消えません。

アプリへの導入には、`ask --workspace /absolute/path/my-ask setup plan` で計画を作り、
確認後に `setup apply` を使います。具体的なオプションとコマンドは
[英語版の導入例](npm-distribution.md#plan-and-apply-installation)を参照してください。
`ask doctor` は導入先を診断します。

## 自己改善・共有・更新

`ask --workspace PATH loop prepare --spec INPUT.json --run-id ID` で、永続フォルダの
版・資産レジストリ・比較元・設定を準備します。指定するスキル、モデル、評価・採点、適用先は
[英語版の設定項目](npm-distribution.md#improvement-sharing-and-recovery)を参照してください。
準備だけではモデル呼び出しや人間の承認を記録しません。

`ask loop` は既存の自己改善ループへ接続します。評価ケースと採否の判断は人間が行います。
モデルCLI・認証・評価ケース・採点・適用先の設定は必要で、npm導入だけではモデル実行や
変更適用を許可したことにはなりません。利用する実行版を固定するため、
`--workspace` で永続フォルダを指定してください。

`ask environment COMMAND input.json` は環境・資産管理の共通コマンドです。
`ask assets preview|export|receive|plan|apply input.json` で、既存のエクスポート・インポートを使えます。
受け取った資産は候補として登録され、採用済み資産の上書きや送信者の承認の引き継ぎは行いません。
詳しくは[継続と持ち運び](instruction-improvement-continuity.md)を参照してください。

npm更新はCLIと配布物だけを更新します。進行中の評価や利用者の資産を暗黙に更新しません。
新しい実行版に移る場合は、サイクルを完了または明示的に停止し、新しいワークスペースへ
必要な資産をエクスポート・インポートします。絶対パスを設定に保存するため、進行中の
ワークスペースを単にフォルダ名変更で移動しないでください。

Node 24.xが必要です。Full候補の生成には、`/usr/bin/tar`とPATH上の`gzip`を備えたPOSIX環境も必要です。モデルCLI、認証、評価課題に必要なPython・ブラウザ・DBなどは別途必要です。
開発用テスト、CI、過去の評価結果は配布から外しますが、自己改善・採点・復旧の実行処理は残します。
npm化によって、未検証のWindowsやClaude実環境への対応まで保証されるわけではありません。

### 実モデルで使う設定例

[設定生成スクリプト](npm-loop-spec-example.mjs)と[具体的な実行手順](npm-distribution.md#a-concrete-observed-model-specification)を用意しています。
公開可能な`task.md`と、成果物を検証して成功時0・不合格時1で終了する`criterion.mjs`を用意し、workspace、Codexの絶対パス・実際の版・利用可能モデル、管理者の権限宣言ファイル、適用先を指定します。入力ファイルのハッシュを実際に計算してJSONを生成するため、ダミーのハッシュを手で置き換える必要はありません。

生成したJSONを`ask --workspace PATH loop prepare --spec FILE --run-id ID`へ渡します。設定生成とprepareではモデルを実行しません。管理者の権限設定と、各サイクルの評価ケース承認・変更適用承認は別です。例は1課題・比較元と候補の計2試行であり、性能改善の十分な証明ではありません。実際の目的に合わせてスキル、課題、採点基準と試行数を調整してください。

## 検証結果の再利用

npmで導入したASKから `ask verification prepare|coverage` を使用できます。
ASK本体はGitなしで導入できますが、この任意の変更影響判定機能は、検証対象
プロジェクトのGit履歴、コミット済みの検証条件・依存関係・完了判定方針と、
署名付きの基準証拠を必要とします。CIの選択実行を追加する機能ではありません。

```sh
ask verification prepare --repository /absolute/project --store /absolute/evidence --target FULL_CURRENT_COMMIT
ask verification coverage --repository /absolute/project --store /absolute/evidence --target FULL_CURRENT_COMMIT
```

prepareは再利用できる検証、再実行が必要な検証、差分レビューの範囲を示します。
証拠不足・依存関係不明を成功とは扱いません。必要な検証だけを信頼済みランナーで
実行し、新しい署名付き証拠を保存した後、coverageで現在の対象に対する網羅性を
確認します。両コマンドはモデル・テストの実行やマージを勝手に行いません。

現在の承認・独立レビュー等が必要な場合は、ホスト側の接続処理がなければ
coverageは非ゼロで終了します。接続する場合は、監査済みモジュールの絶対パスを
`--provider-module`、全バイトのSHA256を `--provider-sha256 sha256:...` で明示します。
これは利用者の権限・環境変数でコードを実行する指定であり、サンドボックスでは
ありません。証拠ファイルから自動的に接続コードを読み込むことはありません。

モジュールは `providers` をexportし、方針に登録したIDごとの関数を公開します。
各関数は毎回その場で正本の状態を取得し、`{query, status, actor_id, evidence_digest}`
を返します。初回と確認時に別プロセスで呼び出し、状態・対象・権限を照合します。
詳細な契約・制約は[英語版](npm-distribution.md#reusing-verification-evidence)を参照してください。

配布物の受け入れテストで確認するのは、変更なし・影響あり・証拠不足の場合の
再利用と再検証、接続処理の失敗時の扱いです。疑似の承認情報を本番の承認とみなさず、
モデルを呼んでいない測定からトークン節約や実業務の品質向上を主張しません。

### plannerの判断からレビューを実行する

`ask verification review` は、prepareで算出する対象範囲を、そのままホスト側の
モデル接続処理へ渡します。手で対象ファイルを選び直す必要はありません。

```sh
ask verification review --repository /absolute/project --store /absolute/evidence --target FULL_CURRENT_COMMIT --allow-review true --provider-module /absolute/trusted-reviewer.mjs --provider-sha256 sha256:HEX_DIGEST
```

接続モジュールは `providers.review(request)` を公開し、`{result, usage}` を返します。
モデル呼出しを行う場合があるため、明示的な実行指定が必要です。変更範囲が不明なら
開始せず、レビュー不要なら呼び出しません。実行前後の対象とplanner結果を照合し、
必要なファイル・観点の抜けや古い対象の結果を成功にしません。内容・返却形式は
[英語版](npm-distribution.md#dispatch-the-planners-review-scope)を参照してください。

問題を検出したレビューは有効な結果として保存し、非ゼロで終了します。通信失敗と
取り違えて合格するまで繰り返してはいけません。実測トークンが取れない場合は未取得の
ままにし、完了判定・人間の承認・マージとレビュー結果を混同しません。

観点のIDだけでは判定条件の本文になりません。接続側は対応する承認済み仕様を
読み込んでください。意味を解決できないIDを推測で合格にせず、不足として止めます。
テスト問題の正解を本体のレビュー処理へ埋め込むことはしません。

## レビュー指摘を再利用可能なルールにする

`ask rules prepare --spec rule-spec.json --output rule-request.json` で、
既存の自己改善ループに渡すレビュー指針の候補を準備します。
`ask rules status --request rule-request.json --root /absolute/path/loop-root`
で、承認された変更と実際の適用内容を照合します。準備だけでは適用先を変更せず、
承認も記録しません。更新・廃止にも新しい人間の判断が必要です。
採用条件、指定する項目、検証の限界は[ルールのライフサイクル](review-rule-lifecycle.md)を参照してください。
長期的な再発防止効果は、適用できたこととは分けて扱います。

`ask rules review --request rule-request.json --observations rule-observations.json`
は、確認済みの観測情報から見直し・廃止の検討を提案します。ルールは変更せず、
観測件数だけで再発防止効果が実証されたとは扱いません。

## 作業中の指摘を自動で蓄積する

`ask findings init --project /absolute/project --repository-id project-name` で、そのプロジェクトのJSON蓄積を一度有効にします。以後、ASKの指示を読むAIが作業中の発見・ユーザーの訂正・レビュー指摘を整理して `capture` を呼びます。利用者が毎回JSONを書く必要はありません。ASKの `verification review` は検証済みのレビュー結果からコードで自動保存します。

`list` で確認し、`feedback` で既存の改善候補作成につなげます。保存だけではルールの採用・適用にはなりません。一般のCodex/Claude会話をCLIが直接監視する機能ではなく、接続していない会話は取得できません。保存先・具体例・制限は[指摘の蓄積](finding-intake.md)を参照してください。
