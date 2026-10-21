# 個人の比較・改善ループを使う手順

**最終受入との整合待ちの準備版です。** [提供範囲と制約](personal-v1-release-preparation-ja.md)を先に確認してください。ここでは準備→一度の開始→保存結果の確認→次サイクルと、失敗時の扱いをつなぎます。

プロジェクトへKernel/Skillを入れる[Mac / Codexの導入](quickstart-mac-codex-ja.md)と、改善候補を比較するこの手順は別です。現在の個人CLIはPrompt向けで、比較が終わってもPortfolioやMacへ自動適用しません。

## 1. 問題と実行条件を準備する

問題の公開用要約、対象Prompt、許可する候補ファイル、比較対象・課題・採点版、source review方法、許可する判断、停止条件と予算を結果を見る前に決めます。private答案、生の開発履歴、秘密情報を問題要約に入れません。

[管理設定](personal-evolution-cli.md#one-time-management-input)と[runの設定](personal-evolution-unattended.md#configuration-and-one-shot-procedure)に従い、既存のRegistry/Portfolio、固定した資産と両roleの採点参照を使います。この段階は設定知識が必要で、未設定の環境へ一行で全機能を導入できるという手順ではありません。

sourceとprofileは版を固定します。古い保存runを読む場合も、そのrunのsource・入力・採点資産を保持します。source更新を理由に旧profile・結果・承認を書き換えません。

以下のpathは置き換え用の例です。`configure`は新しいローカルprofileを作りますが、モデルを起動しません。モデルや採点を始める操作とは分けて内容を確認します。

```sh
node scripts/ask-personal-evolution-cli.mjs configure --config /absolute/management.json --profile /absolute/new-profile
```

## 2. 承認済みの条件で一度だけ開始する

設定済みprofileの対象・送信内容・reviewer・実効モデル設定・保存先・予算とpolicy digestを確認し、今回の開始に対する本人の直接指示がある場合だけ実行します。文書の閲覧やガントの予定は開始許可ではありません。

```sh
node scripts/ask-personal-evolution-cli.mjs run --profile /absolute/new-profile --output /absolute/new-run --target TARGET --problem /absolute/public-problem.txt --confirmed-policy-digest DIGEST_FROM_CONFIGURE
```

`TARGET`は設定済みPromptのstable ID、digestは`configure`が返した確認対象です。未使用の出力先を指定します。この`run`は実際の生成・source review・比較・元採点・許可された判断保存を起動し得るため、デモを見るために実行してはいけません。

設定したreviewerの実確認と、policy内の権限・回数・時間・比較予算に従って進みます。無条件の自動承認ではなく、確認不足や拒否は停止・保留として残します。複数サイクルを指定した場合はその上限も確認し、単発のつもりで複数回を許可しないでください。

## 3. 保存結果を確認する

生成や比較を再開せずに読む入口は次です。保存された`cycle-1`等を指定します。原本を保ったまま、対応する固定sourceで読みます。

```sh
node scripts/ask-personal-evolution-cli.mjs status --cycle /absolute/saved-run/cycle-1
node scripts/ask-personal-evolution-cli.mjs result --cycle /absolute/saved-run/cycle-1
```

これらはモデルを起動しない読取りです。`readout.json`は表示用cacheなので、cacheの一行だけで完了・採用・実適用を判断せず、CLIが再確認した元の比較・採点・判断・receiptを追います。表示される`next_command`も、実行許可そのものではありません。

| 分けて見るもの | 確認する内容 |
| --- | --- |
| 処理の状態 | 予定slot、未開始・途中失敗・終了、保存比較の整合。`completed`だけで品質を判定しない |
| 品質・採点 | 元採点と出所、fail、manual/null、採点不能。未実施や不明を0点にしない |
| 採否判断 | recommendation、許可されたdecision、理由、receipt。source reviewの承認は品質の承認ではない |
| 費用・時間 | 取得できた比較usageと時間、取得できない生成/review usage・総費用を分ける |
| 実際の変更 | no-op、候補棄却、別承認待ちの適用を区別する。現状維持receiptをMacへの適用と呼ばない |

[保存デモ](demos/personal-loop-saved-demo-ja.md)では、一巡完了でも元の品質6行はすべてfail、判断は証拠不足だった例を説明します。現在の9条件Eval結果ではありません。

## 4. 次サイクルへ引き継ぐ

完了receiptと不足した証拠・次の問題を確認し、新しい公開用要約と未使用の保存先を用意します。次の`next`は新しい要求をローカルに作る操作で、モデルを開始する操作ではありません。元のreceiptや結果は残します。

```sh
node scripts/ask-personal-evolution-cli.mjs next --cycle /absolute/saved-run/cycle-1 --output /absolute/new-cycle --problem /absolute/next-public-problem.txt
```

この入口は完了したno-opまたは対応する候補棄却receiptを前提にします。次requestが準備されたことと、次サイクルが実行されたことは別です。新しい生成・比較の開始は別途条件と本人の直接指示を確認し、[CLIの次サイクル手順](personal-evolution-cli.md#user-procedure)に従います。既存`run`の範囲・問題を変える場合は新runとして扱います。

保存済み`run-main-1`では、次のreceipt参照はありますが、次requestの作成も次サイクル開始も確認されていません。今回の資料作成でも実行しません。

## 失敗・中断したとき

| 状況 | 最初にすること | 避けること |
| --- | --- | --- |
| 応答が返らない・途中終了 | `status`と元の起動・review・比較・採点記録で、処理が終わったかと保存状態を確認 | 新出力へ同じ処理を起動して、不明な結果を隠すこと |
| lockが残る | 元の処理が動いていないか、実行結果が確定しているかを確認し、既存の復旧手順へ | lockや消費済みattemptを削除して再試行を可能にすること |
| 比較や採点が一部だけ保存 | 部分出力、失敗理由、未開始slot、manual/nullを保持して不足を特定 | 不明をpass/0/tieへ補完すること、無断再採点 |
| source確認が拒否・不明 | 正確な候補とreview記録を保ち、停止理由を読む | 別reviewerや許可経路で同じ拒否を迂回すること |
| source/profileが変わった | 旧runの元sourceを保持し、新規実行なら新しい確認済みprofileを準備 | 保存profileやPlanを編集して新sourceへ偽装すること |
| 未開始の比較準備だけが中断 | [既存の準備復旧](personal-evolution-cli.md#recover-interrupted-local-preparation)の前提・digest・新出力先を確認 | started/unknownの処理に準備専用復旧を適用すること |

正常な応答消失からの継続と、消費済みで終端不明の処理の再試行は違います。`run --output`は読取り専用ではなく、残る許可済み処理を進め得ます。先に保存状態を確認し、[既存run手順](personal-evolution-unattended.md#configuration-and-one-shot-procedure)の条件を満たす場合だけ扱います。拒否されたnative検証・モデル実行を、隔離外や設定変更でやり直す手順は提供しません。

継続運用・停止復旧の最終受入はA5.4/A3.1の確認待ちです。このガイドが存在することをその受入成功としません。
