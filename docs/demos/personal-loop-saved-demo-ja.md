# 保存結果でたどる個人ループの操作デモ

**A3.3の準備素材です。ライブ実行やv1完成のデモではありません。** [最終提供範囲](../personal-v1-release-preparation-ja.md)の確定後、A5.5の結果と照合して完成扱いを判断します。

一度の開始から何が保存され、結果から次へ何を引き継ぐのかを、保存済み`run-main-1`の事実だけで説明します。ここを読むために生成・比較・原採点を起動する必要はありません。

## このデモの根拠と公開境界

- 保存runのsourceは[`281c6a93`](https://github.com/ist-h-i/agent-spectrum-kernel/commit/281c6a933b489c5dcbbb46a19fbe9795f5943fa0)。最終証拠と読取り確認は2026-10-19 UTC（日本時間10/20）の記録です。
- 原本要約`run-main-1-final-evidence.json`と、保存状態の読取り確認`run-main-1-readonly-check-20261020-f00a498b.json`を読み、以下の公開用要約にしました。原本・生ログ・private採点資産はこの資料に添付しません。
- これは当時の固定source・採点版による一回の記録です。現在のmainでの再実行・再採点や、全24課題の受入結果ではありません。後の採点修正を元結果へ遡って適用していません。
- 以下の表示は必要な項目をまとめた説明用要約です。CLI出力や未公開画面をそのまま転記したものではありません。

## 説明の進め方

| 場面 | 操作者・説明者が示すもの | 保存結果から確認したこと |
| --- | --- | --- |
| 1. 準備 | 問題、対象Prompt、固定profile・policy、比較と停止の条件 | 元の入力とpolicyが保存され、読取り確認でdigestの一致が記録されている。新たな開始を許可する資料ではない |
| 2. 一度の開始 | 承認済みの条件で`run`を開始したこと | entrypointの起動1回、終了コード0、`completed / cycle_limit_reached` |
| 3. 候補生成と確認 | 保存された候補とsource reviewの結果 | 候補5ファイル、review verdictは`approved`。候補の品質向上を承認したという意味ではない |
| 4. 比較 | baseline/challengerそれぞれのP/K2/F | 計6条件の保存比較、`saved_pair_verified`。追加9条件Evalではない |
| 5. 元採点 | 元の品質と未確認事項 | 下表の6行はいずれも品質`fail`。品質改善・優位性を主張しない |
| 6. 判断と記録 | recommendation、decision、receipt | `insufficient_evidence`を承認し、`completed / approved_saved_noop`とreceiptを保存。採用・適用なし |
| 7. 再読込と次の扱い | 元結果を再起動せず読むこと、receiptを次の要求へ渡す境界 | 読取り記録ではモデル起動なし。次requestは未作成、次サイクル未開始 |

説明者は、場面2の「処理完了」と場面5の「品質fail」、場面6の「証拠不足」が同時に成立することを示します。成功結果だけを選び、保留の画面を省くデモにしません。

## 保存された元の6条件

| role | 条件 | 元の品質 |
| --- | --- | --- |
| baseline | P (`plain`) | fail |
| baseline | K2 (`kernel_principles_v2`) | fail |
| baseline | F (`full_ask`) | fail |
| challenger | P (`plain`) | fail |
| challenger | K2 (`kernel_principles_v2`) | fail |
| challenger | F (`full_ask`) | fail |

この表は元採点の保持を示します。条件間の効果量、現行採点版での品質、Skill一般の優劣は表していません。採点・検出の不具合修正と、旧結果を保持することも分けます。

## 終端で伝える内容

```text
開始: 1回、entrypoint終了0
保存比較: saved_pair_verified
cycle: completed / approved_saved_noop
判断: insufficient_evidence、承認済み
receipt: completed
Portfolio採用・Mac導入・lifecycle変更: 実施なし
元処理のrestart/retry・追加比較: 実施なし
次request作成・次サイクル開始: 未実施
```

生成の実効モデル・provider・周辺context、生成/reviewのtoken、provider総費用などはUnknownのままです。一部の比較usageを総費用にしません。追加9条件（`gpt-6.1-sol` high/low、`gpt-6-luna` maxの各K/P/F）は**準備中・実行未開始**で、グラフや順位に使える実測値はありません。

## 操作を見せるとき

公開資料だけで説明する場合は、このページを場面1から7まで順に示します。これは保存事実のウォークスルーで、実行中の画面を模したものではありません。

原本へアクセスできる本人のローカル説明では、対応sourceと元の保存先を保ったまま、[手順の結果確認](../personal-loop-quickstart-ja.md#3-保存結果を確認する)にある`status` / `result`の読取りを使います。生ログやprivate結果を画面共有・録画・公開用資料へ含めないでください。この準備作業ではそのCLI読取りも再実行せず、既存の読取り記録と原本要約を確認しました。

次の一手は、receiptと不足理由を読み、新しい問題要約・出力先・必要な許可を確認することです。[次サイクルの準備](../personal-loop-quickstart-ja.md#4-次サイクルへ引き継ぐ)は別操作であり、このデモを見たことで開始許可が生まれるわけではありません。採用・実Macへの適用を見せたい場合も、別の権限と受入証拠が必要です。

## 最終デモへ進む前の残件

- A5.4の継続運用・停止復旧、A5.5の最終範囲を反映する。
- A3.1の受入結果に合わせ、実施済み・未実施の表示を最終照合する。
- この説明素材で一度の開始から判断保存と次の扱いを説明できるか独立レビューする。
- 動画や外部向け実演を作る場合は、画面に出す情報と公開許可を確認する。今回は説明資料をDraft PRでレビューし、動画・ライブ実演やreleaseの公開は行わない。

これらの準備素材を作成しただけで、A3.3の最終受入やA3.4のreleaseを完了扱いにしません。
