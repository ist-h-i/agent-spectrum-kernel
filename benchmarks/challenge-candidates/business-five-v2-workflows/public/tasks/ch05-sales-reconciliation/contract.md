# 業務契約

共通C01〜C06と以下は受入条件です。方式や修正箇所を指定せず、同じ業務結果を満たす別設計を受け入れます。

## S01 売上identity

eventはtenant・eventId・revision・不変eventTime・整数最小通貨単位amount・deletedを持つ。同じIDの最大revisionのみ有効。同revision同内容は再送、異内容は競合拒否。eventTime変更は拒否し、金額はsafe integerを超えても正確に集計する。

## S02 窓と締め

windowはUTC固定60分の半開区間。tenantの単調watermark以下で終わるwindowを締める。締め出力は有効な非deleted売上の正確な合計を一度だけ外部へ確定し、別tenantのwatermarkで締めない。締めた窓を古い売上や訂正で再開しない。

出力対象は受理済みeventが一度以上属した窓だけである。全eventがdeletedになった既知窓も合計0を出力する。eventの属したことがない窓は生成も出力もしない。初期時刻より無限に過去へ窓を列挙しない。

## S03 原子的取込

batch内に不正event、競合内容、締め済み対象があればbatchのevent/window状態と出力を全く変えず、理由を返す。正当batchは全件を同じ確定単位で反映する。producerの耐久結果とsequenceについてはS04の規則を適用する。評価sinkの局所冪等性だけではアプリのbatch原子性を代行しない。

## S04 生産者再接続

tenant・producerIdごとのdelivery sequenceと直近の内容/結果を保持する。期待sequenceは初回0から1ずつ。直近sequence同内容は同じ受理結果、異内容・飛び越し・それ以前は拒否する。別producerの進行を妨げない。

既に記録された直近deliveryの同内容再送は、現在のwatermark等による再検証より先に保存結果を返す。したがって締め後にも過去の受理済み結果を再取得でき、新規eventを受理したことにはならない。期待sequenceのdeliveryは、業務的拒否を含む耐久結果を保存してsequenceを一つ進める。拒否batchのevent/window/出力は不変だが、producerの直近sequence・内容・拒否結果は変わる。外形が読めない入力、権限拒否、飛び越し等のsequenceエラーはsequenceを消費しない。処理中に結果がまだ確定していなければ不明とし、同内容再送/照会で確定させる。

## S05 保存と復元

checkpointの旧形式はeventsとwatermarks、新形式はproducer受理情報も含む。旧形式復元時はproducer履歴なしと扱う。保存と復元で有効売上・watermark・新形式の直近受理事実を保ち、返値の呼出側編集で内部状態を変更しない。

## S06 出力不明

締め出力の受理後応答喪失と再起動で同じ出力を重ねない。受理されていない出力を確定済みと表示せず、有限障害回復後に正当な出力を進行させる。

## S07 必要な状態

締め済みeventの全revision履歴を処理用に保持し続ける必要はない。一方、有効ID・未締め窓・既知tenant・producerと直近batch内容が増えれば必要状態も増える。監査の永続履歴と処理中の生存状態を区別し、復元に必要な受理事実を捨てない。

## S08 利用者体験

送信結果、訂正の採否、未締め/締め済み、出力不明、再接続sequenceを役割に応じて画面で追える。監査で元入力・受理・合計・外部出力を照合できる。
