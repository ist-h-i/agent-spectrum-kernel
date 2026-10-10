# 実利用に近い ASK の探索的評価

計画 `PLAN-315-318-PRAGMATIC-1` revision 1、2026-10-10。
基準 source は main@cbcc6eff（PR #331 / #332 取り込み）。利用者の方針変更により、
実行→評価→改善を小さく回し、実利用上の価値を説明する材料を集めます。
**まだ実タスク・モデル比較は実行していません。** 今回の実装はローカル記録・
オフライン集計と計画だけで、実行許可、認証操作、安全確認の代わりにはなりません。

グローバル設定・Skill は実利用でも完全には制御できない外部要因として受け入れます。
削除・退避・変更せず、分かる範囲の設定の種類、ASK の存在、変更有無、不明を記録します。
全指示の同定、global ASK がないことの証明、全 arm の完全な同一環境は、
この探索的評価を始めるための研究上の必須条件にしません。
利用者・ホスト・課題・入力・モデル・reasoning・制約・成功基準は可能な範囲で近づけ、
残る差と影響の見込み／不明を説明します。普段の実務と eval の CLI 版が異なっても、
実際の版と差を記録します。旧 0.157.1 への downgrade や、環境差だけの一律停止は不要です。
この方針は認証・秘密・送信先・管理ポリシーに関する安全制限を緩めません。

## 三条件のローカル差

新しい人工 repository／作業コピーと新しい session を使い、前 arm の変更や回答を
次の入力へ入れないようにします。これは完全な memory 隔離の証明ではありません。
開始前に三つの予定 slot、順序、課題と成功基準を記録します。

| condition | 意図する project-local の差 | 解釈の限界 |
| --- | --- | --- |
| `plain` / ASKなし | 共通 task/workspace のみ。local ASK Kernel・Skills・Router・状態を加えない | global ASK が存在する／不明なら厳密な無ASKではない。報告では「local ASK 追加なし」と書く |
| `kernel_only` / Kernelのみ | 同じ task に source の canonical `AGENTS.md` をそのまま加える。local ASK Skills/adapter は追加しない | Kernel の既存定義を変更しない。参照 Skill が使えず `capability_missing` になった結果も残す。Skill 追加や代替指示で成功へ修復しない |
| `full_ask` / Full ASK | 実際の core install と Codex `full` profile。Skills/Router、prompts/command、contracts/runtime、状態と追加 managed guidance を記録 | [既存 Full 準備](local-full-static-preparation.md) の reference supplement を使う場合は明記。縮小 pack や #332 の implementation profile を Full と呼ばない。設置・読取り・呼出しは別の観測 |

local asset の source/version/hash と差分、課題・入力・成功基準の ref、実際の CLI/model/
reasoning/platform、実行順・時刻を各 slot に残します。知らない値は null/unknown。
global を完全列挙するために秘密、通常 config、環境変数値を読む作業は不要です。
途中の環境変更や actual model fallback も同等だったことにはせず、その slot に記録します。

最初の候補は [#332 の公開 atomic batch task](first-workflow-mac-codex-ja.md)。
元の task と9ファイル、10要件を全 arm で使い、既存5つの src と test/ の patch、
独立した `node --test test/*.test.mjs`、要件照合、scope と安全境界を成功基準にします。
実装入力の ASK contract/proof 参照部分は local ASK がある条件にだけ適用し、plain に
未導入 ASK workflow の出力義務を加えません。この arm 別の指示差も保存します。
可視 test の成功だけで全要件を満たしたとはしません。private evaluator や旧回答を
入力へ追加せず、この公開練習問題を holdout／正式 #197 採点と呼びません。
実務課題を使う次の cycle は依頼者の scope と共有可否を先に決めます。

## 近づけられなかった差の扱い

| 差の種類 | 記録と比較の範囲 |
| --- | --- |
| CLI/OS/利用者/設定/実行時刻 | 実際の差、変更の観測、影響の見込みまたは不明を残す。自動棄却しない。結果をこの環境と課題に限定する |
| model/reasoning/tools | 大きな交絡の候補。品質・時間・利用量の差を ASK 単独の効果と説明しない |
| task/input/成功基準 | 比較できる部分とできない部分を明記。別 task/rubric の品質を一つの score に混ぜない。数値差をそのまま性能順位にしない |
| global ASK/Skill が存在または不明 | local 配布差の観測。global 由来か local 由来か分からない route は unknown。全 ASK 対 無ASKとは説明しない |
| actual Full 機能が使えない | 設置済みと稼働済みを分け、失敗／停止／unknown を残す。global 不明とは別に具体的な機能不足を説明する |

因果効果、一般化、統計的優越性、ROI は主張しません。一方で、環境差のために
「この課題で有用な patch／不足／過剰処理が観測された」という事実まで捨てません。
K−P、F−K、F−P を別々に見て、勝ち・負け・同程度・判断不能と overhead を残します。
比較不能な点は無理に平均せず、個別の出力と改善理由を報告します。

## 小さな cycle と記録・集計

最初は1 block / 3予定 slot。完全な Latin rotation や旧 confirmation の反復数は
この cycle の開始条件ではありません。実行回数、許可された時間／中断条件、実際の
使用量、失敗・停止理由、未開始 slot を残します。600秒等の local 終了条件も実際に
監督できる範囲を確認してから使い、server 停止や hard token/cost cap と説明しません。
勝ちだけを採用する再試行はしません。次の cycle は新しい block ID と不足・変更・
改善仮説を追加し、元の結果を保持します。無期限の無目的な試行はしません。

利用者は今回の ASK 作業で残量をこちらが確認できないことを停止理由にしないと
明示しました。残量申告を独立確認済みの証拠へ変換せず、実測使用量と unknown を
区別します。月次30%保証や旧 token 閾値をこの cycle の開始条件に持ち込みません。
reset 権の行使、追加課金、課金方法変更は今回の作業に含めません。

記録のたたき台は [notes-template.json](fixtures/pragmatic-evaluation/notes-template.json)。
全 slot 未開始の plan で、受入 authority や新しい gate ではありません。
task/input/成功基準や環境の参照が不明なら null を使います。空文字・空白だけの
context は拒否し、未知の課題を同一と判定したり、別 block を合算したりしません。
コピーを私的なローカル領域に置き、実際の task/model 等、command/exit/log、レビューに
基づく `pass` / `unknown` / `fail`、品質上の不足、scope/safety、時間・human review・
手戻り・input/output/cached tokens を記入します。cost、request 数、使用量の定義が
不明なら文章と null で残し、tokens から料金を推測しません。
環境差・通常実務の CLI 版・順序・失敗 trace は `environment_notes` / `quality_notes`
や local evidence ref で保存できます。stop reason、未実行、censored な作業時間も明記します。

次は**指定した記録のオフライン読取りだけ**です。launcher、認証 reader、model call、
設定探索、採点、upload はありません。`umask` はその shell の出力作成にだけ適用します。
input/output は私的な領域に置いてください。

```sh
umask 077
node scripts/ask-pragmatic-evaluation-report.mjs /absolute/private-notes.json > /absolute/private-summary.json
```

既存 `derivePortfolioDistribution` を再利用し、同じ task/input/成功基準の層ごとに
median/min/max 等を出します。異なる環境の反復を含む分布は記述的なものです。
欠けた測定は null のまま、完全な分布は insufficient、既知値と未知件数を併記します。
未提出 slot は `not_started / unknown` として補い、三条件を隠しません。
block 内の資源差も task/input/基準が異なる場合は arithmetic only と明記します。
CLI/model 等の差と unknown fields も残します。reported pass は元の記録の表示であり、
参照 log の検証や正式 evaluator の実行済みを認定しません。synthetic は synthetic のままです。

短い報告は、(1)課題と source、(2)三条件で得たもの・失敗、(3)品質／時間／手戻り／
利用量、(4)環境差と説明できない点、(5)次に直す一つ、の5点に絞ります。
private raw notes/session/path、認証値、private evaluator は GitHub に掲載しません。
観測値・引用・成果物の公開は利用者の許諾範囲を確認し、sanitized な要約だけにします。

## 旧計画・release gate・安全の境界

| 既存箇所 | 新しい探索的評価での扱い |
| --- | --- |
| [旧 #318 固定設計](mac-kernel-value-screening.md) の no-global/cross-arm contamination と完全 freeze | 旧仕様は保存。新 lane は外部要因の不明と残る差を記録して進められる |
| [三条件合成 protocol](local-three-arm-comparison.md) の equal runtime/input、identity/usage fail-stop | 元の driver、固定 policy、digest と replay を変更しない。新 notes を旧 protocol として通さない |
| [#315 connection](local-codex-connection.md) / [admission](local-codex-admission.md) の source/image、安全・認証契約 | launcher／permission／probe は変更しない。方法論の変更を実行許可や旧拒否の解除に使わない |
| [初回 workflow](first-workflow-mac-codex-ja.md) の未確認 runtime/traffic 欄 | 実際の版等を記録。global の同定・完全同環境・残量確認不能を一律の研究開始停止理由にしない。安全制限は維持 |

既存 v1 gate は [measured activation/bypass と publication](release-evidence-gate-contract.md)
を要求し、[必須 #192/#198](release-package-2026-10.md) は未完です。今回の結果だけで
それら、#291、#315 全OS受入、Activated/Operational を完了扱いにしません。
探索的観測は価値説明と改善の補助資料で、controlled-outcome authority を名乗りません。
旧計画・結果・fixture・source hash を新条件の結果に書き換えません。

今後「この探索的結果だけで v1 の限定的価値 claim を支持する」と決める場合、現行 gate
の controlled-outcome evidence と衝突します。次の具体案は、#192/#198 所有者が claim の
適用範囲と観測証拠の必要条件を明示し、gate 9（activation/bypass）と12（publication）
への採用条件を別変更としてレビューすることです。失敗・negative cases、品質／安全、
独立レビュー、公開許諾、明示 release approval は保持します。
**今回その変更は実装せず、16 gate と必須 claim を維持します。**

残る実行開始上の問題は一つです。選ぶ公式 CLI 経路について、認証を含む実際の
送信先・送信内容・管理ポリシーの範囲と今回の実行許可が、安全に起動できる形で
まだ確定していません。global の研究上の不明や CLI 版差を、その問題の代わりにしません。
旧 r24 は送信先・内容未確定で自動承認レビューに拒否されたままです。
この文書・report・利用枠指示は拒否解除の証拠ではありません。Codex/model/sandbox/
旧診断は起動せず、別経路や安全条件の弱化で回避しません。
