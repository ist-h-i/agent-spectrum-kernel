# 個人Prompt候補と既存本評価の接続

Artifact: IMPL-PERSONAL-PRIMARY-CONNECTION。固定upstreamは #373 `a31beae7ebe2f53655367a9b413d238143bd350b`。実比較をこの実装タスクから起動しない。本書は接続APIと将来の本人直接開始手順であり、候補の品質・実source安全性・実行承認を証明しない。

## 範囲と停止条件

既存 `prompt_v2_exact` のCodex rendered Prompt bundleを扱う。parent/candidateそれぞれを別の新規P / `kernel_principles_v1` / Fセッション群へ接続し、比較するのは両役割の **新しいF同士**。P/K結果は診断contextであり、historical P/K/Fをcandidate改善証拠として移植しない。正式なcanonical Kernel/Adaptiveを含む四条件評価と同一視せず、formal aggregateへの投入を禁止する。新しいrunner、採点方法、Evolution状態機械、課題、カタログは作らない。

生成済みcandidateの `safety.status=not_evaluated` は既存Portfolio選択の `safety_unknown` で停止する。`applyPersonalEvolutionBaselineAlignment` は `NOT_RUN/action:hold/quality:null` と実role/理由を返す。選択済みrolesや準備完了experimentを返さず、Skill不足も0点にしない。permissionsがboundedでない、maintenanceがfreshでない、task applicability不足等も旧guardに従う。

source安全分類はモデル品質評価と別の事前適格性である。独立したsourceレビュー事実がある場合だけ、その根拠を別versionに記録できる。元生成record/receiptは変えず、同じ生成content・実current baselineを直接derivation parent/rollbackとする別immutable version、元candidateとの明示的source-reviewリンク、fresh preparation/experimentを使う。supported enumやdigestだけではレビュー者・source事実の真正性を証明しない。機構・評価履歴は評価前のnot_evaluatedを保つ。この接続は実sourceの自動分類を行わない。

Skill Asset、unrendered template、非Codex bundle、空/非UTF8のrendered fileは対応外。task種別やAsset型を言い換えず、必要なruntime projectionの不足を報告する。

## 評価前の固定

1. 専用独立copyの評価CASへ、旧current parent lock/Portfolio・新Registry・observation-bound候補を持ち込む。開発worktreeからの書込み領域共有、途中main intakeを禁止する。
2. `planPersonalEvolutionBaselineAlignment` で同じparent Asset/政策の新Registry baselineと、parentだけcandidateに置換したshadow/exploratory challengerを作る。両方は旧currentを正確なrollbackとする **兄弟** 評価branch。後日のbaselineからcandidateへの採用には別途そのbaselineをrollbackとする既存lifecycle計画が必要。
3. 作成・適用の両入口でRegistryが旧baselineの子孫であること、candidate評価履歴がnot_evaluatedであること、high-impact別経路でないことを公開前に再検査する。自己digestと外部pinだけを計画作成手順の実施証拠にしない。独立したalignment object pinと **全体が一致する** 外部Portfolio authority contextsを受け、`applyPersonalEvolutionBaselineAlignment` を使う。runtime trustを返却metadataから自動生成しない。旧heads・Asset bytes・globalポインタは変更しない。CASは非transactionalなので、停止時も承認済みimmutable lock/selection metadataが残る場合がある。
4. aligned baselineをparent/rollbackとして同じobservationからfresh prepを作る。既存 `buildEvolutionExperiment/publishEvolutionExperiment` を使い、固定roles、実code commit/tree、CLI/model、task scope、採点policy、repetition=1、recommendation/action mappingを事前固定する。各formal task classにはそのclassのexact pre-result eligible selectionが必要。
5. 各role/fixtureに既存 `prepareUserComparison` の `personalPrompt` optionを渡す。closed fieldsは `storeRoot,registrySnapshotDigest,asset,entrypoint,trustedAssetAuthorityContexts`。task inputは先頭にそのまま保ち、登録済み公開bundleの全UTF8ファイルをentrypoint優先・残りpath順・pathラベル付きでF stdinへ渡す。control snapshotだけを全bundleが渡った証拠にしない。P/K inputは従来のtask入力。実際のmodel read/効果/因果関係はUnknown。
6. `sealPersonalEvolutionPromptPair` は既定で未開始の1–9既存fixture、明示`fixtureSet:"catalog24"`では正本順24件を受け、fresh run/plan/source/input/criteria/role Asset/materialization/selection/runtime/予算/controller code closureを結ぶ。catalog24はv7 selectorと両roleの完全24件resource mapを照合し、descriptionへ集合を固定する。旧結果後の固定を拒否。全rolesはobservedかsyntheticのどちらかに統一する。登録を独立pinし、後からbindingを再解釈しない。

観測実行のseedは独立`.git` directoryが必要でworktree `.git` file/alternatesを拒否する。`git clone --no-local --no-hardlinks`等の独立copyを使い、条件workspace・public入力・CAS・producer/grading/outputを開発領域と分離する。共通Git refs/prune/cleanupを共有しない。既存runnerのworkspace制限とpath検査はOS単位の完全隔離ではなく、親controllerやglobal指示/CLIの差を消さない。差を記録し、実際に影響する解釈のみ限定する。private evaluator/正解を公開Prompt sourceへ入れない。

## 事前回数・順序・予算

最初は `mp-ci-evidence-gap`, `mp-data-migration-handoff`, `mn-focused-regression-test`。完成済み他6件は同じ手順で別の事前固定scopeへ展開する。scopeを後から有利な結果だけ増やさない。fixture id昇順、baseline全fixture→challenger全fixture、各child内の既存P/K/F順序で固定。各role/fixtureは1回、retry/resumeなし。単発は製品判断に用いる記述的差の確認でありvariance推定をしない。追加反復が製品判断に必要なら、結果閲覧前に別の明示的protocolで決める。

本評価では60分/条件、5分/検査、overall4時間/child、5M tokens/childを明示指定し、原採点reservation185分を維持する。汎用prepareの既定値（10分/条件、1分/検査、overall1時間、tokens未指定）を本評価へ流用しない。pair全体の使用量開始判断予算は既存9課題batch84時間/45Mの2role分をscope件数で比例させる。

| fixture数 | 新規比較child数 / 条件session数 | pair全体時間 | 使用量開始判断予算 |
| --- | --- | --- | --- |
| 1 | 2 / 6 | 18時間40分 | 10M tokens |
| 3 | 6 / 18 | 56時間 | 30M tokens |
| 9 | 18 / 54 | 168時間 | 90M tokens |
| 明示catalog24 | 48 / 144 | 340時間 | 240M tokens |

catalog24は既存24件batchの170時間／120Mを両role分予約する。無人実行の開始判断も
同じ`personalEvolutionPairLimits`を使い、従来9件式を24件へ暗黙延長しない。

これはstart間のadmission予算で、モデルproviderの厳密な課金上限を保証しない。既知tokens下限と全child+採点時間reservationを確認する。未知usage、global指示、CLI差を隠さない。

## 一度の開始から保存・報告

本人がこのタスク「Prepare primary ASK evaluation」に直接、固定済みpair digestを指定して開始指示を渡した場合だけ、role別の既存 `createPrimaryEvaluationGradingAdapter` 二つと `startPersonalEvolutionPromptPair` を一度使う。closed optionは `gradingAdapters:{baseline,challenger}` で、旧singular adapterは拒否する。既存factoryはoutput_root/fixture_idへexclusive書込みするため、別config/digest/fresh outputRootを事前固定する。readonly fixtures mapは両roleで同一、write rootsはrole/CAS/model/public/seed/controller/固定資産/保存先から分離する。instanceだけ別で同じrootを向く設定、既存root、dangling link、config改変は最初のstart前に拒否する。observedではregistered grading factory以外を拒否し、fake startは全syntheticだけ許す。preflightがreadyで全blockerが空、capability available、未開始を確認してからexclusive `output_root/invocation` を消費する。

coordinatorは既存 `startUserComparison` を逐次使用し、ネイティブterminal/process closure/usageを読んで既存graderを呼ぶ。request・child report・grading receipt・最終saved-result-connectionをatomic no-replaceで保存。失敗/期限/interrupt/半端なpublication後は再開始しない。復旧は別判断として元receiptを保全する。

保存結果consumerは元producer/normalizer/scoring-root lineage/public engineering validatorを再使用し、exact run/plan/condition/attempt/source outcome、freeze・admission・requirement authority・evaluator id/revision/criteria、rawgrade digestの独立trustを確認する。private scorerやgrading modelを再起動しない。quality deltaは原値の差、negativeも保持。UnknownはUnknownのまま、partial unsafe witnessも保持。mechanism/variance/external未収集をunavailableにする。既存Evolution recommendationを導くが、candidate採用やreal Mac変更へ自動進行しない。既存saved-result action/no-opには別の評価全体trustとhuman decisionが必要。returned evidenceを自動trustに追加しない。

## 本人直接開始用コピペ本文

以下は **実source分類・固定prep/experiment/pair・独立trust・既存採点resourcesがそろった後** の本文。未固定のplaceholderやsource不適格が残る場合は実行せずNOT_RUN/holdを報告する。旧の一回限り承認は使わない。

```text
このタスク「Prepare primary ASK evaluation」で、今回私が直接、本評価の新しいparent/candidate Prompt比較の開始を指示します。

固定controller設定の絶対path: <本人が確認したcontroller設定JSON>
設定JSONのraw sha256: <本人が確認したdigest>
今回独立固定したpairRegistrationObjectDigest: <本人が確認したpair digest>
評価専用code commit/tree: <検査・独立レビュー済みの固定ID>
対象fixture、role、回数、順序、時間・使用量開始判断予算は固定pairに記載したとおりです。

1. 設定とcode/source/採点資産のID・digest、Portfolio authority、source安全分類/permissions/freshness、task class別eligible selection、exact未開始run/plan、runtime input、独立copy/.git、条件workspace・CAS・公開入力・採点・保存先を検査してください。development側のmain/branch変更は取り込まないでください。設定自身のdigestだけを外部trustの代わりにせず、controller-ownedな根拠を照合してください。
2. 欠落・不適格・Capability/Skill不足・既存consumed invocationがあればNOT_RUN/hold、quality:nullと実理由を保存して停止してください。Asset型やtask種別の言換え、Skillの無断追加、採点基準変更、旧P/K/F結果の移植、結果後の再基準化は禁止です。
3. baseline/challenger別の既存createPrimaryEvaluationGradingAdapterを各固定resourcesから作り、両roleのpreflightを閉じ、gradingAdapters:{baseline,challenger}を渡して、既存startPersonalEvolutionPromptPairをconfirmedPairObjectDigestとして上の本人確認digestを渡して一度だけ起動してください。コードのfake start overrideを使わず、実観測roleに既存startUserComparisonを使ってください。start/resume/retryを重ねないでください。
4. 固定全role/fixtureを順に実行し、既存原採点経路で採点・保存まで完結してください。task/public Prompt inputにprivate evaluator/正解を含めないでください。期限・使用量admission・unresolved child・採点不備を検出したらreceiptを保全して停止し、同じ消費済み起動をやり直さないでください。
5. 保存producerとpublic gradingのexact lineage/固定採点資産/rawdigestを検証し、既存Evolution recommendationを保存してください。parent/candidate Fの原値と差、P/K/F診断context、Unknown/unsafe/未収集、CLI/global指示差、完了・不完了と証拠pathを日本語で報告してください。正式四条件評価や因果的改善とは主張しないでください。候補採用、Mac apply/restore、release、global設定、権限変更はこの指示には含みません。
```

このタスク時点で実モデル起動は0。synthetic検査の成功は実候補のsource適格性・モデル品質・実採点資産接続・本人開始を証明しない。実source事実や固定IDが未用意なら本書だけで開始可能とは扱わない。
