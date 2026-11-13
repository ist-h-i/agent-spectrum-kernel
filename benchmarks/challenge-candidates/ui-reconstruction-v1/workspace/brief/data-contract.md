# データと受け渡し契約 v1

## 共通
外部入出力はUTF-8 JSON。下記で示すキーをすべて持ち、追加キー、NaN、非整数のrevision、重複ID、参照切れは拒否する。IDは空でない文字列、revisionは1以上の整数。文字列は空欄可と書いた欄以外はtrim後1文字以上。日付は実在する `YYYY-MM-DD`、時刻はUTC ISO8601。分は0以上の整数、週時間は0より大きく168以下。nullと欠落は別である。IDは同じ配列内で一意、conditionとactionのIDは相互にも一意。全データは合成情報。内部構造・保存技術は自由だが、バックアップ入出力とAIの入出力はこの契約で相互運用する。

初期状態は `fixtures/seed.json` のJSONバックアップを復元できること。空で開始してもよい。固定AI回答はseedの未消費依頼に対応する。新しく発行した依頼で同じpayloadを使う場合は、回答のrequest_id、goal_id、goal_revisionを実際の依頼の値に置き換える。payloadの根拠revisionも現在の依頼snapshotに一致させる。UIに固定回答を現在依頼へ結び付ける試験操作を置く場合も、この3欄以外とpayloadは変更しない。構造・制約・依頼の検証を迂回しない。

## バックアップの正規形
ルートは `{schema_version:1, workspace_id, revision, goals:[], conditions:[], actions:[], records:[], requests:[], evaluations:[], approvals:[], careers:[]}`。workspace revisionは保存に成功した変更で1増やす。復元では取り込んだrevisionより大きくする。空状態のrevisionも1。採用操作は後述のイベントの追加であり、過去イベントの書換えではない。

| 配列 | 1件の全キーと型 |
|---|---|
| goals | id（文字列）, revision（整数）, title, wish, current, capability（文字列）, due（日付）, weekly_hours（数値）, exclusions（`{from,to}`の日付配列、from<=to）, plan_state（undecided / provisional / ready） |
| conditions | id, revision, goal_id, title, standard（文字列） |
| actions | id, revision, goal_id, condition_ids（同目標の条件ID配列、1件以上・重複不可）, title, next_action, artifact（空欄可）, minutes（分）, status（todo / done / held / replaced）, replaces_id（同目標の別取組IDまたはnull）。置換関係は循環不可。replaces_idがある新取組の旧取組はreplaced |
| records | id, revision, date, title, result, self_rating（insufficient / not_met / partial / achieved）, artifact（空欄可）, minutes, assisted（boolean）, goal_id（IDまたはnull）, condition_ids, action_ids（重複不可）, voided（boolean）, history（下記） |
| requests | id, kind（plan / assessment / career）, goal_id, goal_revision, scope（下記）, snapshot（下記）, consumed（boolean） |
| evaluations | id, request_id, results（下記の評価結果配列） |
| approvals | id, evaluation_id, target_type（condition / action）, target_id, operation（adopt / revoke）, at（時刻） |
| careers | id, request_id, payload（下記career payload）, stale（boolean） |

記録のgoal_id=nullなら両リンク配列は空。目標があればリンクは同目標内に限る。条件・取組リンクはいずれも空を許可する（目標だけの記録）。goal_idがあるだけの記録は、目標全体の根拠候補であり、個々の条件・取組の根拠には自動でしない。
historyは各更新直前の `{revision, date, title, result, self_rating, artifact, minutes, assisted, goal_id, condition_ids, action_ids, voided}` の配列。初回は空。編集、紐付け、取消、復元の度に旧値を追加し、revisionを1増やす。historyは1から現revision-1まで欠番なく昇順。記録の物理削除は不要。他エンティティの編集履歴表示は不要だがrevisionは同様に増やす。評価・依頼・採用イベントは追記のみ。ただし依頼のconsumedはfalseからtrueへ一度だけ更新できる。失効も例外として結果のstaleをfalseからtrueへ一度だけ更新できる。

## 依頼のsnapshot
依頼IDは再利用しない。再作成した依頼は同目標・同kindの旧未消費依頼を消費済みにする。consumedは適用済み／置換済みを表し、再利用不可。コピーしただけでは消費しない。

scopeはplanとcareerでは `"all"`、assessmentでは `"all"` または `{condition_ids:[...]}`（1件以上）。snapshotの全キーは `goal, conditions, actions, records, constraints`。goalは依頼時のgoal全体、conditions/actionsは対象目標の全件、recordsは対象目標の有効記録全件（historyを除く上記記録の全キー）。constraintsはplanだけ下記配列、それ以外は空。

planの制約は `{field,mode,value}` 配列。fieldはdue / weekly_hours / exclusions、modeはfixed / maximum / flexible。重複field不可。fixedはJSON値の等値維持。maximumはweekly_hoursのみ許可し数値以下。flexibleは変更可（valueは依頼時値）。due/exclusionsはfixedまたはflexible。除外期間内に計画期限を置かない。その他のカレンダー計算、週数や取組分の総量による自動判定は不要。

現在の目標revisionがgoal_revisionと違う、関連記録の内容・リンク・有効性がsnapshotと違う、同目標に有効記録が増減した、または依頼が消費済みなら、その依頼への回答はkindによらず適用不可。目標内の条件・取組の編集でもgoal revisionを増やす。別目標の変更はこの判定に影響しない。回答をプレビューした後、適用直前にも再検証する。

## 回答の包み
全kind共通で `{schema_version:1, kind, request_id, goal_id, goal_revision, payload}`。3つの対応欄が未消費依頼と完全一致すること。未知のkind、コードフェンス付テキスト、不正構造は拒否し、エラーで現状を変えない。依頼文にはこの包みとpayloadの仕様を含める。

plan payloadは `{goal, conditions, actions}`。goalのキーはid/revision/plan_stateを除くgoalの全キー。conditionsは `{id,title,standard}`、actionsはid/revision/goal_idを除くactionの全キー。全件置換案で、参照整合を検証する。既存の条件・取組IDを省略してはいけない（旧IDを保持し、取組は置換済みにできる）。追加IDは既存IDに衝突させない。変更前後は項目別に表示する。採用でgoalと変更された条件・取組のrevisionを1増やし、新規は1とし、goalのplan_stateをreadyにする。条件・取組が同値ならそのrevisionは維持する。検証済み未採用案は暫定案として別領域に保持し、現行データや依頼snapshotを書き換えない。

assessment payloadは `{results:[...]}`（1件以上、同じ対象は1回）。1件は `{target_type, target_id, judgment, evidence, rationale, limits, next_action}`。judgmentはinsufficient / not_met / partial / achieved。evidenceは `{record_id,revision}` 配列（重複不可）、rationale/limits/next_actionは非空文字列。insufficientは根拠0件を許可し、他の判定は1件以上。根拠は依頼snapshotに存在する有効な関連記録に限る。条件への関連はcondition_idsで直接リンク、またはaction_idsでリンクされた取組のcondition_idsに対象があること。取組への関連はaction_idsに対象があること。allなら目標内の全対象、部分scopeなら指定条件とその条件に属する取組だけを回答できる。回答は全対象を網羅しなくてもよい。
保存した評価結果は回答1件の全キーに `stale:false, stale_reason:null` を追加する。評価の保存は依頼を消費するが、採用しない。最新approvalは時刻atではなく配列順で最後の対象一致イベントとする（同一時刻でも末尾優先）。現在の採用判断は対象ごとの最新approvalがadoptで、その評価結果がstale=falseのときだけ有効。最新がrevokeなら未判定。revokeは現に有効採用中の同じevaluation/対象だけ許可し、二重adopt/revokeはno-op。取組のdoneはこの判断を変更しない。

### 失効の契約（隠し判定なし）
各結果について、依頼snapshotから次のいずれかが変わった最初の時点でstale=trueとし、stale_reasonをcondition_changed / action_changed / record_changedのいずれかにする（複数ならこの順）。対象conditionのtitle/standard/revision、対象actionの全欄と所属条件revisionのいずれか、またはevidenceに列挙された記録のrevision/有効性/リンクが変わった場合が該当する。条件結果では、その条件に関連した取組のstatusやnext_actionだけの変更では失効しない。ただし、根拠記録が取組経由でのみ対象条件に関連しており、取組のcondition_ids変更でその関連が切れた場合はrecord_changedで失効する（記録revisionが変わらなくても同じ）。直接のcondition_idsリンクか別の有効な取組経由の関連が残れば、この理由では失効しない。根拠に含まれない記録追加・別対象変更は既存結果を失効させない。古い依頼への新回答の拒否とは判定範囲が異なる。staleな採用は履歴として示し、現在の採用件数・達成件数から除く。元に戻してもstaleは維持し、新しい依頼・評価・採用が必要。

career payloadは `{current, after_goal, ideal, market_context}`。各pointは `{responsibility_level, axes, evidence, uncertainty}`。axesは delivery / design / collaboration / leadership / learning の5キー、値は整数1〜5。evidenceは現在のpointではassessmentと同じ根拠記録配列（1件以上）、他2点では空配列を許す。uncertaintyとmarket_contextは非空文字列。責務レベルは非空の説明文字列で序列の自動換算は不要。現在もAIによる参考推定と明記し、after_goalとidealは将来推定として見せる。保存時は依頼を消費し、目標revisionまたは根拠記録revision/有効性が変わったらcareer.stale=true、戻しても復活しない。

## バックアップ検証と復元
この契約の型・enum・一意性・参照・history・snapshot・回答payloadを検証する。保存済みの消費依頼や古いsnapshotは履歴として許可する。現在データと一致しないことを理由にバックアップ全体を拒否しない。評価結果がsnapshotに対応すること、approvalが存在する評価の対象を参照すること、careerがcareer依頼に対応することは検証する。古い結果をstale=falseで取り込んだ場合は、失効規則によりstaleへ正規化してから確認画面に進む。復元は評価・採用履歴を削除しない。読込失敗・取消・保存失敗では現在の正式状態を変更しない。

## レポートの選択規則
from/toは両端を含むdate比較、from<=to。goal=allは未紐付けも含む。個別目標ではそのgoal_idだけを選ぶ。事実セクションは生成時点で有効な記録の最新内容を使い、期間末時点の履歴復元は不要。集計は件数とminutes合計。現時点セクションは期間外の根拠による採用も含むが、「現在」と日付を付け、期間内の成果と混ぜない。
