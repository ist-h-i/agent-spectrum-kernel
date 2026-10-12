# 完成済み9課題の実用三条件本評価・準備計画

計画ID `PLAN-PRIMARY-PRACTICAL-9-20261012-r4`。2026-10-12 の本人の指示を
上流とする。対象は完成済み9課題すべてで、旧 #318 の3候補は実行順の先頭。
これは #192/#198 の正式な24課題・四条件プロトコルの開始や終了条件の変更ではない。
校正 run `86a09258-0f66-4f05-ad61-7e62dd4fbbfc` と旧結果・計画を変更しない。

**準備状態：blocked。この文書は開始承認でも実行可能な runner plan でもない。**
モデル起動、比較 start/resume、採点用モデル、旧所有権診断は実行していない。
不足を解消する前に一度の開始だけで全件実行・採点できると説明してはいけない。
現在の私的準備記録はタスク保存領域の `evidence/preparation-manifest-r2.json`、digestは
`sha256:8ec22f7858b3aa13471603803d6678f2378ad2821b5df9e7534afbb02499fc6b`。
前版 `prepared-primary/preparation-manifest.json` と課題別JSONは保持した。
r2はdocumentationの検査recipe不足の記録を補った版で、入力・採点source・criteriaは不変。

## 対象・回数・予算

| 順番 | fixture ID | 正式 task class | 今回の反復数 |
| --- | --- | --- | --- |
| 1 | mp-ci-evidence-gap | review_verification | 1 |
| 2 | mp-data-migration-handoff | handoff_resume | 1 |
| 3 | mn-focused-regression-test | verification_only | 1 |
| 4 | mp-accessibility-interaction-review | pr_review | 1 |
| 5 | mp-frontend-state-review | pr_review | 1 |
| 6 | mp-iac-rollback-design | design_gate | 1 |
| 7 | mp-performance-investigation | investigation | 1 |
| 8 | mn-build-option-update | configuration | 1 |
| 9 | mn-doc-config-correction | documentation | 1 |

各課題 P (`plain`) → K-principles (`kernel_principles_v1`) → F (`full_ask`)。
現行入口はこの固定順を使用する。順序効果は交絡として明示する。各条件1 session、
attempt 1、retry 0、concurrency 1、`single_shot_v1`、resume禁止。合計27 slots。
追加反復は今回行わない。単発の課題別判断が目的で、分散・優越性・一般的な製品採用の
確証を主張しない。正式カタログの3/5反復指定は変更せず、今回の別計画との差を記録する。
結果を見て有利な課題だけ追加測定しない。

提案予算は条件ごと60分、controllerの検査・各公開commandごと5分。private workerの予算は
採用済みbundleのexecution_budget_msを維持し、5分へ切り詰めない。
各課題の三条件ブロック4時間、9ブロック36時間。既存private採点は初回2runと保存record検証2run、
計4run／条件を維持する。既存API上限15分×3条件×4run＋変換・保存5分で課題ごと185分を予約する。
全体は84時間（最大予約63時間45分＋余裕20時間15分）、45M tokens。旧r2の48時間/r3の60時間を保持し、
結果非閲覧でr4を作る。旧manifestは読み取り可能だが、新しい本番開始には使用できない。
現行一課題入口の overall timeout は最大24時間かつ一課題単位なので、一つの84時間 plan としては
渡せない。継続実装の薄いbatch controllerで9個の固定ブロックを逐次処理する。夜間・複数日の
実行は可能だが、同一runの中断を resume する設計にはしない。

開始判断予算は報告 input＋output 合計45,000,000 tokensを提案する。
以前の3セッション5Mに対し、27セッションで9倍の45M。cached input を重複加算しない。
これはproviderのhard cap、料金保証、利用枠の確保ではない。未知usageを0にしない。
基準mainの一課題入口には全体予算共有がなく、継続実装のbatchがblock間の下限予約を担う。起動前に利用枠を確認し、
27セッションを処理できない枠なら、結果非閲覧の段階で分割計画と新しい開始指示を確定する。
開始判断に必要な予約分を確保し、予算不足で未開始となったslotも報告に残す。

## 固定と隔離

実行系の基準は main `4b1bf37961d6f2f23acf950413ac956d20a5ab01`、tree
`cd8cc43d9f235736999bb7b4f035312fd392faf6`。#339 single_shot_v1 を含む。
準備タスクの独立repoと実装worktreeは、元repoや15課題開発repoのGit共通領域を共有しない。
公開source snapshotはGitなしの独立コピーとする。採点source rootは歴史Git revision照合のため、
それぞれ独立したobjectsを持つread-only repoを使用する。worktree共有・alternates・hardlinkは
使わず、全ファイルhashを保存する。
課題入力は各fixtureの既存 `input-manifest.json` が指定する `task.md` と `workspace/**`
のbytesだけを別の公開入力rootへコピーする。比較用seed repoと条件別workspaceはそれぞれ
独立したGit管理領域を持つ。採点root、control、結果rootは条件別workspaceの外に置く。

採点workerの source closure はfixtureの既存 `evaluator_source_identity.source_files` の
revision・bytes・sha256で歴史版から復元する。workerを現行版へ置き換えない。
実際のhost adapterと三条件profileは接続PRの固定版を別のsource digestで記録する。
raw portfolio scorer、旧schema、旧freezeのbytes・criteriaは変更しない。
private evaluator bundle・review archive は採用済みdigestと完全一致する実体を復元・検査し、
その後独立コピーを固定する。再生成で別版にしない。評価版固定後のfetch、pull、merge、
checkout変更、開発branchからの取り込みを禁止する。接続PRを統合する場合は先に検査済みheadと
影響を親へ報告し、その後明示的な計画改版で最終版を固定する。

私的な原本・採点資産・結果は比較モデルへ渡さない。source checkout全体を課題repoにしない。
同一利用者・同一ホスト上のpath分離とread-only modeはOS権限の完全分離ではなく、
プロンプトでのread禁止も機密性の強制ではない。global指示・Skills・CLI差は記録し、
変えたり未知値だけで別の停止条件を追加したりしない。通常のprovider・認証を使い、
認証ファイルや環境変数全体を収集しない。single_shotのdirect child終了は
孫process/providerの完全停止を証明しない。限界は条件別レポートに残す。

## 接続の具体的な不足

1. **K-principles適用範囲**。現行projectionは `implementation/trivial` のみ。
   review・investigationは `capability_missing`、handoff/designも構造的な対応がない。
   CI、a11y、frontendレビュー、性能調査、移行handoff、IaC計画に原則だけの公平な経路を
   定義する最小の設計判断が必要。Skill追加、trivial偽装、品質0点化はしない。
   対応範囲を変えるなら既存v1の意味を黙って拡張せず、別候補版として結果非閲覧でレビューする。
2. **検査recipe**。r2時点の `prepareUserComparison` は公開固定 `.mjs` node:testのみ。
   CIとhandoffの構造validatorや、IaC計画などの成果物採点をそのまま扱えない。
   focused regressionは既存testの編集が課題で、独立固定テストとの重複禁止に当たる。
   既存検査契約・private evaluatorをcontroller側に接続する必要がある。
   wrapperテストを新設して公開seedを変更したり、公開テスト成功だけを正解としたりしない。
   docs/config修正とfocused test追加は実際の編集作業としてimplementation/trivialへの
   根拠ある対応づけが可能だが、正式task classを保持し、metadataの文字列を無条件に
   implementationへ変換しない。build-optionの構造validatorも接続不足の対象である。
   継続実装では閉じたnative fixture recipeを既存controllerへ接続した。
   [接続契約](primary-fixture-recipe-contract.md)のO1/O2で9件の元の検査・入力・scopeと
   focused test編集を検査する。公開検査の実行経路は実装済み。private意味採点の原本と採用authorityは未復元。
3. **採点condition／証拠lineage**。旧normalized/evaluator schemasは
   `plain/kernel_only/adaptive_ask/full_ask`。`kernel_principles_v1` は含まれない。
   既存Core grading bridgeの `plain/core/full` も別条件なので代用しない。
   旧schemas・freeze・raw scorerを保持したまま、既存の追加profileパターンを参考に
   三条件の明示profileとcontroller-owned journal／terminal／command証拠を接続する必要がある。
   user-comparisonのテスト結果だけで旧scorerの実行証拠を捏造しない。
4. **private実体／実行採用証拠**。repoのlatest admission overlayは採用記録だが、
   実行resolverにはreview authority source digestとprivate review archiveが必要。
   見つからない実体はUnknown/不足のままとし、原本保存先を所有者から復元する。
   標準private-evaluators保存先で見つかったbuild-option bundleも、現行採用referenceとは
   ID/digest/revisionが異なる旧版だった。9件の固定referenceに一致する実体は未発見。
   旧focused新系列のcustom evaluatorは採用済みbundleの代替ではない。
5. **9ブロックの一度の開始**。r2時点の入口は一課題の三条件まで。新しい評価基盤を作らず、
   既存single_shot startを9個の固定planに順次呼び、全体期限／usage下限／未開始slotを
   一つのreceiptで保存する最小接続が必要。denial/authentication/unknown child終了では
   後続モデルと採点processを止め、同runの自動resume／retry／新ID生成をしない。
   継続実装の[薄いバッチ接続](primary-evaluation-batch-contract.md)は9個の既存single_shotを
   束ねる。全27枠を保存し、一度の消費・予算予約・不明終了時停止をfake-onlyで検査した。
   r3のdigest固定resources adapterは原constructor・初回2worker・原fragment/record/envelope保存・
   原score内2worker検証を再利用する。実原本なしの現在は本番dispatchが拒否される。

不足がある課題を対象から除外しない。各slotの品質・使用量は未実行ならnull/unknown。
現状は全27slots未実行。K候補採用・原本・採点authorityが未解決なので、最初の一度の開始はまだ提示できない。

## 採点・報告の固定方針

各fixtureの採用overlay、input manifest、requirement/output contract、verification contract、
scoring-input freeze、evaluator reference／bundle／source closureと共通scoring policyを固定する。
private evaluatorの観測を既存 `verifyEvaluatorAuthority` と `scoreEvaluatorResult` に接続し、
既存partial credit、blocker、scope、安全、false-positive、equivalenceの意味を維持する。
採点モデルは不要。hidden evaluatorのNode processと採点モデルを混同しない。
profile非対応／authority欠落はinsufficient_evidenceで、0点や成功へ変換しない。

課題別にP、K-principles、Fの観測・未開始・不足を並べ、K-principles−P、F−P、
F−K-principlesを分けて報告する。条件名をcanonical KernelやAdaptiveへ変更しない。
品質とコスト・時間を別々に示し、機構使用は自己申告と実証を区別する。
人手補正・レビュー時間は実測がなければunknown。practice weighted aggregateや旧#198の
製品採用判定は行わない。生の答え・private evaluatorをGitHubへ載せない。

## 課題別の読み取り用事後解析

9件のadmissionを課題・採点の完全性保証としない。既存reportとslot receiptを再利用し、
各課題×各条件の固定入力・仕様・evaluator版、出力、許可範囲の完全差分、実行・採点の
stdout/stderrと終了状態、要件別判定・根拠、時間、input/output/cached usage、scope、
切詰めと欠測をrun ID／plan digest／artifact digestで関連づける。
redacted patchはレビュー用と明示し、完全な比較はcontrollerの保存済みbytesを参照する。
採点ログをrunnerログで代用しない。出力がない条件もnull/unknownの行を残す。

読み取り用の課題別JSON/日本語レポートには、以下を別フィールドで保持する。

- モデルの実装不良
- ASKによる手順や判断の問題
- 課題の曖昧さ・解けなさ
- 採点器の誤検知・見逃し
- 実行環境の失敗

初期値は全てunknown。自己申告や単一の機械合否だけで原因を断定しない。
全条件同点・全滅・不自然な差は事後見直し候補として表示するが、新しい起動前ゲートには
しない。固定入力の仕様、各条件出力・差分、既存の要件別根拠を照合するための参照を残す。
秘密値、認証、過去sessionの追加収集はしない。
採点器・課題を修正するときは原採点・原出力・版とdigestを保存し、別版の事後解析を追加する。
原runを新基準で上書きせず、将来の再評価は別計画・別run・別の本人開始指示にする。

## 次の完了条件

不足1の設計判断と不足4の原本復元を親へ報告し、その間は公開入力の固定と非モデル検査を完了する。
不足2/3/5を変更する場合、15課題担当と共有script/schema/CI所有権を調整する。
継続実装の共有変更はuser-comparisonのnative recipe seamと、既存schema/normalizer/execution/
evaluator-boundaryのprimary専用scope seam。fixture・raw scorer・原schema・カタログ・CIは不変。
boundaryのpure private asset検査は元の検査を抽出して再利用し、開始前に偽markerを作らない。
primary raw responseは保存済みsanitized last-messageの平文と正確なdigestを保持し、
agent-output JSONを捏造しない。旧scopeのJSON要件は変えない。
専用worktreeの最小差分・fake-only検査・fresh independent review・Draft PRを経て、
検査済みheadを親に伝える。採点基準変更や旧終了条件緩和を混ぜない。
全ての不足が解消した後に、固定run IDとplan digestを含む日本語開始プロンプトを完成させる。
貼る先は **Prepare primary ASK evaluation**。過去の一度限りの起動承認は再利用しない。

準備・検査での成功はモデル実行／採点成功の証明ではない。

## 準備作業の検査契約

`SPEC-PRIMARY-PREP-1` は上記の対象・分離・未実行表示・不足の保存を定義する。
`IMP-PRIMARY-PREP-1` の所有範囲はこの文書とタスク外部領域の入力・採点source snapshot、
manifest、課題別の未実行readoutだけ（初回文書段階）。
`FVC-PRIMARY-PREP-1` は `ask.verification-proof-policy@1.0.0` のFormal Verification Contract。
根拠となるtriggerは `multi_session_multi_agent_or_handoff`、`multiple_specialized_checks`、
`merge_release_or_stable_trace`。O1：main/tree・全公開input bytes・歴史source bytesのhash照合。
O2：9件の採用overlayと実行resolver結果を区別し、全27条件を未開始nullで保存。
O3：source/公開input/採点source/報告の領域分離と制限を明示。O4：既存single_shotの
fake-only試験、独立読取りレビュー、文書差分・Git状態検査。
モデル実行や採点を完了したという証明義務は満たしていない。実行接続はblockedのまま。

## 継続実装の現在状態

`IMP-PRIMARY-CONNECTION-2` はnative recipe/prepare seam、9block coordinator、保存済み
controller証拠の採点request/readout exportを所有する。証明は上記recipe契約と
`FVC-PRIMARY-BATCH-1`、`VER-PRIMARY-GRADING-EXPORT-1`を参照する。
新しい[`kernel_principles_v2_candidate`](kernel-principles-candidate-v2.md)は、v1原則抽出を
再利用した未採用の別候補。専門/形式手順が明示必須または要求調査不明ならmissingに閉じる。
6公開課題のsignalは原則範囲内と分析したが、版選択とdescriptor判断責任は親の判断待ち。
旧v1の登録・bytes・過去runは不変。

[採点export接続](primary-evaluation-grading-contract.md)は9件×実条件を別々に、
入力・採点版・controller receipt・native command・要件IDと根拠・五原因unknownへ結ぶ。
public validatorをprivate scorerの代用にしない。profile・正規化・原採点を呼ぶ接続は実装済みだが、
原本・review authorityの存在とoriginal private runtime互換性は未検証。
固定資産の非モデルpreflightと実際のprivate実行成功を混同しない。
所有者が復元すべき9件のbundle/review archive locatorと、残る最小shared seamを別途記録する。
稼働checkoutの計画をあとから書換えず、候補選択・source最終統合後の固定は新しい準備で行う。


## 非モデル接続検査とレビュー修正

開発用 `connection-preparation-r2` はsource head
`a312adb9bc9a9b8f69244e483b5552dc789f5e04` から9件の既存公開入力だけを使い準備した。
manifest digestは `sha256:1f59fbcfcc47e741bf5f58ce0ce02c8f3a7ac9ca38e23ffa63ea43b422cd06da`。
27枠全てnot_started、開始未消費、品質nullを読み取り確認し、課題別exportを9件保存した。
その後のbatch欠測保護・export先保護はrecipe生成器を変更していない。
これは接続の開発証拠で、K版選択・private原本復元・最終統合後の評価freezeではない。

独立レビューで要求済みchild reportの消失をcompletedで再表示する問題を検出した。
修正は上位stateをconsumption_unknownへ落とし、未判明usageと要求済み欠測件数を保持する。
保存terminalのstoppedと根拠欠測を別に表示し、再開始は許さない。
offline exportはsource seedも保護し、symlinkを含む非canonical親を拒否する。
これらの負例は新しいfake-only回帰で確認する。既存の採点基準は変更していない。

PR #340の旧docs-only headに対するUbuntu fake jobは、synthetic sessionのmtimeと宣言window
の照合で失敗した。該当テスト・production readerは基準mainと同じで、文書差分が原因とは
確認されない。Macでのtargeted synthetic caseは修正前も通り、CI失敗時のmtimeは不明。
fixtureのmtimeを宣言window内へ明示固定する小修正を独立commitに分けた。
production reader、mtime許容、旧所有権診断は変更・実行していない。
修正後の同じsynthetic caseは通るが、Ubuntu全CIの再成功は別の観測である。

## r3の正規化と実採点接続

追加primary profileは旧四条件/Coreとは独立し、formal aggregateへ渡さない。モデルcommandは
保存stdoutから既存parserで抽出し、native公開検査をモデルcommandへ変換しない。
CLI完了と独立検査不合格を分け、欠測commandはunavailable、原因はunknownのまま。
採点resourcesの閉じた9件mappingはraw digestをbatchへ固定し、原本/review/sourceをread-onlyに
して、条件ごとの独立private/public出力を用いる。private workerログはprivate側に保存し、
公開receiptはdigest/終了状態だけを持つ。途中不明終了では後続採点・モデルを止める。
新規課題PR #341とそのprivate source、関連開発threadは今回の対象・入力から除外する。

## r3の開発準備証拠

`connection-preparation-r3` は接続source head
`4a8637923b7485e4dc9352c47aa1c0792c32ebaa` で新規に準備した。
採点契約の検査ログリンクだけが未commitの状態だったことも外部検査記録に残した。
manifest digestは `sha256:d6393d640ccd0ac4c0c3d3ef2696e6285524ddd99933bb1daf6b17a9df792c5e`。
60時間・45M・課題ごと採点65分、27枠not_started、開始未消費、品質nullを再読取り確認し、
`evidence/connection-preparation-r3-verification.json` と9課題exportを保存した。
private originals未復元とK-v1の6件missingを保持するblockedの開発準備で、最終評価freezeではない。

公開採点入力と9歴史source graphは、primary限定の固定graph再計算で非モデル検査が通った。
現在版で追加されたauthority schemaを旧revisionへ要求するdefaultの差は、元のgraphの
entry/authority/private-entry集合を読み取りで選択して解消した。base Git bytesとfull graphの
一致検査は維持し、source-only scopeはschema/producer/scoring/startの権限を与えない。
source/reference/root/revision/明示params/async範囲外の改変拒否も検査した。

ローカル検査はbatch13件、grading/export15件、producer16件、既存pure alias3件、
private接続6件、native recipe12件、未採用K候補11件が通った。
原本private worker、評価CLI/model、採点model、旧所有権診断は起動していない。
原本のhidden moduleが三条件ID・保存平文responseを受け入れるか、numeric scoringが完結するかは未検証。

## r4の独立レビュー修正

r3の全workerを5分とする予約は誤りだった。focused regressionの既存公開generatorは11分、
他の7件は2分、build-optionの原本private manifest予算は未確認。原本の復元後、
検査済みmanifestの予算を初回・record検証に等しく使用する。caller短縮値は拒否する。
現在の保守的予約は既存schema上限15分を使い、採点185分／課題、全体84時間／45Mとする。
r3の開発準備・検査記録は不変で、本評価開始には使用しない。結果はまだ閲覧・生成していない。

r4はsource head `b4652b907447e73bb34c4b4b063081fa79616cba` のclean状態で新規に準備した。
manifest digestは `sha256:bf9603dbf87c7444308b4fe6c268c9c07907bf057000e9fecfb697da5700d320`。
84時間・45M・採点185分／課題、27未開始、開始未消費、品質nullを確認し、
`evidence/connection-preparation-r4-verification.json` と9課題exportを保存した。
予算修正を含む4 focused suitesは51/51、runtime bundle freshness・repo validation・whitespace検査も通った。
これはblockedの開発準備であり、最終評価freezeと実採点成功の証拠ではない。
