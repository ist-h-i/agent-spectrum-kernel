# ASK v1 release package — 2026年10月

判定は **`not_ready`** です。対象は
[`main@d4ad39ead0f13965aeaf5aa919ef35f830a50e26`](https://github.com/ist-h-i/agent-spectrum-kernel/commit/d4ad39ead0f13965aeaf5aa919ef35f830a50e26)
と、この revision に対する文書・モデル不要の Mac 導入復旧検証の差分です。
GitHub の main / Issue / merged PR を2026年10月10日に再確認しました。
GitHub Release は未作成です。これは release candidate の公開や v1 完成宣言ではありません。

ASK が提供するのは、AI coding agent の変更について根拠、未確認事項、検証、
人間の判断を揃えるためのプロジェクト内の方針と資料です。承認可能な変更に
近づけることが目的ですが、実務成果の改善はまだこの package の証拠に含みません。
入口は [Mac / Codex quickstart](quickstart-mac-codex-ja.md) です。

English claim boundary: ASK provides project-local instructions and selected
workflow assets to make evidence, verification, and human decisions explicit.
This package does not establish operational Codex adoption or measured engineering
value. The v1 release assessment remains `not_ready`.

## 現行 main の根拠と訂正

| 領域 | 確認できた実装 / 出典 | 未確認の実利用・release 残件 |
| --- | --- | --- |
| claim / release gate | canonical claim status と [release gate](release-evidence-gate-contract.md) は実装済み。固定16条件を維持 | root の code / schema と実行証拠の整合を査定する仕組みであり、fixture の成功は v1 成功ではない |
| #274 verification store / coverage | [#297](https://github.com/ist-h-i/agent-spectrum-kernel/pull/297)、[#302](https://github.com/ist-h-i/agent-spectrum-kernel/pull/302)、[#306](https://github.com/ist-h-i/agent-spectrum-kernel/pull/306) が merged。exact reuse / scoped revalidation の基盤あり | Issue は open。古い本文の NOT STARTED は現行 main の状態ではない。release scope の実行・coverage と独立レビューを区別 |
| #275 epic admission / rollover | [#307](https://github.com/ist-h-i/agent-spectrum-kernel/pull/307) が merged。Work Package / admission の決定的契約検査あり | Issue は open。static / fake 検査を実ホストの enforcement・rollover 証拠へ昇格しない |
| #276 Asset Registry / #277 Portfolio | 両 Issue は closed。現行 code と既存の決定的テストを確認 | registry / selection の存在だけで、導入先の Asset 効果や Portfolio activation を保証しない。再実装しない |
| governed candidate lifecycle | generic Evolution 実装あり | [#278](https://github.com/ist-h-i/agent-spectrum-kernel/issues/278) / [#291](https://github.com/ist-h-i/agent-spectrum-kernel/issues/291) は open。real successor の disposition を generic fixture で置換しない |
| #173 setup | Issue は closed。[#304](https://github.com/ist-h-i/agent-spectrum-kernel/pull/304)、[setup の範囲](adoption-setup.md)、[apply の範囲](adoption-apply.md) は local installer 適用まで | 初回 workflow / 実ホスト Operational は対象外と明記済み。Issue closed をその受入成功に読み替えない |
| #197 evaluation/report authority | Issue は closed。[#308](https://github.com/ist-h-i/agent-spectrum-kernel/pull/308) に report infrastructure の closure。再実装しない | 現行 main の Mac test temp-path 問題は今回の小さな fixture 修正で扱う。report infrastructure と #192/#198 の測定・公開完了は別 |
| #315 Mac 利用受入 | local distribution と adapter の導入基盤あり | [#315](https://github.com/ist-h-i/agent-spectrum-kernel/issues/315) は open。clean-user の初回実務 task、保存・再読込、運用と復旧の実ホスト受入が残る |
| #318 実価値 screen | plain / Kernel / Full の準備が main に存在 | [#318](https://github.com/ist-h-i/agent-spectrum-kernel/issues/318) は open。小規模 screen は必須の [#192](https://github.com/ist-h-i/agent-spectrum-kernel/issues/192) / [#198](https://github.com/ist-h-i/agent-spectrum-kernel/issues/198) の本評価を代替しない |

各 completed implementation claim の wording は存在・契約検査の範囲に限定します。
[claim matrix](fixtures/release-evidence-gate/current-main-d4ad39-claim-matrix.json) と
[evidence catalog](fixtures/release-evidence-gate/current-main-d4ad39-evidence.json) が
既存 gate への入力です。[main の観測記録](fixtures/release-evidence-gate/current-main-d4ad39-observations.json)
は clean detached checkout での検査を記録します。
[独立した main 根拠のレビュー](fixtures/release-evidence-gate/current-main-d4ad39-independent-review.md)
は code の存在と記録された static / synthetic 検査の範囲だけを確認しています。

`756c72` の [旧 matrix](fixtures/release-evidence-gate/current-main-756c72-claim-matrix.json)
と [旧 catalog](fixtures/release-evidence-gate/current-main-756c72-evidence.json) は履歴として
保存します。その時点の #173 / #197 の open 記述を現状判断には使いません。

## Mac 導入・復旧の証拠の読み方

実行対象は使い捨ての人工 Git repository だけです。既存 Node CLI による
inspect / plan / check / apply / doctor、同じ Plan の再適用、同じ source での
`minimal` → `implementation` 更新、rollback / detach、drift 拒否を確認します。
グローバル設定や本物のプロジェクトには apply しません。

現行 main では、setup / consumer report の一部 fixture が Mac の一時ディレクトリの
symlink ancestor で止まりました。また fresh install の doctor は、生成済み
Codex prompt を元テンプレートと比較して false-stale warning を出しました。
この差分では owned test temp directory だけを実パスにし、doctor は現行 renderer
の prompt と正しい Skill asset source を比較します。symlink / drift の拒否は維持します。
独立レビューで見つかった、source から削除された retained Skill の診断終了も修正し、
整合する retained target は構造化 warning、改変された target は failure として検証します。

[candidate の検証記録](fixtures/release-evidence-gate/mac-install-recovery-candidate.json)
は差分込みの source hash と実行結果を持ちます。**この記録を pristine main の
成功や、新しい release revision の runtime 証拠として転用しません。**
初回 workflow、Activated / Operational、異なる version 間の upgrade は未検証です。
private Plan、raw prompt、evaluator、認証・利用者情報は公開記録に含めません。
[差分の独立レビュー](fixtures/release-evidence-gate/mac-install-recovery-review.md) に
修正した回帰、最終 source の整合と検証範囲を記録しています。

## release gate の現在地

上記の main 根拠と独立レビューを既存 gate に入力した結果は、16条件のうち
4条件が `pass`、12条件が `not_ready` です。8つの狭い実装存在 claim は
`supported`、必須の6つの runtime / outcome claim は `unknown` のままです。

| 固定 gate | 現在の根拠 / 足りない証拠 |
| --- | --- |
| repository validation | clean main の `validate-repo`。candidate は別に再検証 |
| verification evidence store / coverage | 現行 main の focused static tests。実利用の効果は対象外 |
| epic admission / Work Package | static implementation は確認。required runtime evidence は未収録 |
| Asset Registry | 現行 main の focused static contract tests |
| Portfolio Manager | 現行 main の focused static contract tests。実務 activation は別 |
| governed candidate lifecycle | generic 実装は確認。release scope の実行・real candidate disposition は未収録 |
| guided setup / first run | local CLI あり。初回 workflow の証拠は未収録 |
| evaluation/report authority | #197 infrastructure 完成。release-scoped passing evidence は未投影 |
| measured activation / bypass | #192/#198 の task-class・adapter 別測定が必須。未収録 |
| clean install / upgrade | この差分の人工 Mac local smoke は狭い証拠。release version 間・clean-user の確認は未収録 |
| supported adapter runtime | 実 Codex / Claude の bounded workflow と適用 contract の証拠が未収録 |
| benchmark / report publication | #192/#198 の結果、negative / lower-tail / variance、公開状態・許諾が未収録 |
| documentation claim consistency | この package と全公開 wording の final revision の一致確認が必要 |
| rollback / migration notes | local managed recovery と文書を追加。release upgrade / migration scope の証拠は未収録 |
| semantic version / changelog | 製品 v1 の version / release notes を final candidate に束縛する判断が未収録。既存 package version を改名しない |
| explicit human release approval | 未取得。この Draft の作成許可は release approval ではない |

machine assessment の再実行:

```bash
node scripts/release-evidence-gate.mjs assess \
  --matrix docs/fixtures/release-evidence-gate/current-main-d4ad39-claim-matrix.json \
  --evidence docs/fixtures/release-evidence-gate/current-main-d4ad39-evidence.json \
  --source-revision d4ad39ead0f13965aeaf5aa919ef35f830a50e26 --root .
```

`not_ready` は assessment の成功結果であり、release の許可ではありません。
main / candidate が進んだら新しい revision と根拠を追加し、古い記録を上書きしません。
unknown、未実行、許諾不明を pass / zero / accepted risk にしません。

## 12月までの目標と依存

日付は作業目標であり確約ではありません。

| 目標月 | 具体的な成果 | 依存 / 未達リスク |
| --- | --- | --- |
| 10月 | Mac のモデル不要 install / profile update / managed recovery、quickstart、main の claim/evidence 整理を Draft としてレビュー可能にする | local smoke の不具合解消と source ごとの証拠分離。これだけでは #315 Operational を満たさない |
| 11月 | #315 の clean-user bounded 実務受入と軽量 bypass / stop、#192/#198 の必須本評価・task-class 別判断・公開 material | runtime・実行先・認可・予算と evaluator authority の確認を別途要する。#318 の screen で代替不可。#274/#275 の実行証拠、#278/#291 の release-relevant disposition が未達なら gate は残る |
| 12月 | 残不具合、対応条件、privacy / migration / rollback、最終 source と version / changelog の freeze、既存16条件の再評価 | 11月の測定・受入・公開許諾が遅れると v1 は延期。全必須条件を満たした後に人間の go/no-go と tag / Release の別承認が必要 |

Windows / Linux と未確認の Mac architecture は後続の実ホスト検証として残し、
#315 の三 OS 目標を削除・完了扱いにしません。v1 の対応表には実測済み scope
だけを載せます。任意の ROI / operator-dependence の claim は今回拡張しません。

次の一つは **#315 の初回実務受入について、task・runtime・実行先・認可条件と
必要な証拠を確定すること**です。この package は実モデル実行を開始しません。
