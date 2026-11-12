# npm配布

npmパッケージは、ASKのCLI・標準スキル・自己改善の実行処理を配布します。
`npm install`の途中で利用者のプロジェクトを書き換える処理はありません。
現在の名前 `@hiroshi.inoue/agent-spectrum-kernel` と版 `0.1.0-dev.0` は仮のものです。
誤公開を防ぐため `private: true` にしています。名前・ライセンス・公開の判断は別途必要です。
パッケージ版と、manifestの資産版、過去のpersonal-v1公開タグは区別します。

## 導入と保存先

公開前は、チェックアウトで `npm pack` を実行し、生成したtgzを別のプロジェクトに
`npm install /absolute/path/hiroshi.inoue-agent-spectrum-kernel-0.1.0-dev.0.tgz` で導入します。
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
