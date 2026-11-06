# 観測可能な契約

<a id="R1"></a>
## 識別と互換性（R1:10点）
createService({journal,inventory,delivery,faults})はsubmit(tenant,id,payload)、claim(tenant,id,worker,ttl=10)、run(tenant,id,worker,token)、cancel(tenant,id)、recover(tenant,id)、snapshot(tenant,id)、recoverPage(after=null,limit=4)を持つ同期serviceを返します。payloadは{sku,quantity}、非空ASCIIのtenant/id/sku（長さ1..40）、quantityは1..100の整数。workerも同じ文字列制約、ttlは1..100整数。余分なpayload fieldは意味に含みません。

検証優先順位は引数型/範囲INVALID_INPUT、既存注文の同一key異payload CONFLICT、provider観測の不整合INCONSISTENTです。submit以外で未存在ならnull。入力不正はproviderの変更を一切行いません。keyはJSON.stringify([tenant,id])、digestはJSON.stringify([tenant,id,sku,quantity])。同一要求submitは同じ永続注文を返します。別tenantで同じidは別注文です。

永続wire format2は{format:2,key,tenant,id,sku,quantity,digest,state,token,lease,receipt,reason,revision}。stateはqueued/running/delivered/cancelled/rejected、tokenは0以上安全整数、leaseはnullまたは{worker,token,until}、terminalのleaseはnull。receiptはdeliveredの配送receiptのみ、reasonはrejectedのみ。journalのrevisionはproviderが管理します。snapshotと全methodの返値はcopyで、追加privatefieldは可。固定legacySubmit/legacyPoll/legacyCancelとauditはこのwireを直接参照します。

<a id="R2"></a>
## 所有と期限（R2:10点）
claimはqueuedまたは期限切れrunningを取得し、過去tokenより大きいtokenとnow+ttlを永続化します。有効leaseは再取得できません。取得しなかったclaimはnullを返します。同じworker名でも別claimは別所有です。runはworker/token一致かつnow<untilでのみ開始できます。不一致ならnullかつ外部変更なし。実行途中に所有が変わった場合、そのrunは新所有のjournalを変更せずnullを返します。既に始まった同一注文の冪等外部操作は完了し得ます。古い結果が別payloadや別注文の結果になることはありません。

<a id="R3"></a>
## 在庫（R3:10点）
初期在庫はtenant/sku単位です。予約と確定の合計はcapacityを超えません。deliveredは正しいquantityのcommitted予約を一つ持ちます。cancelled/rejectedは在庫を消費しません。予約拒否はrejected(reason='OUT_OF_STOCK')、配送は作成されません。入力不正以外のproviderthrowは呼出側へ伝播します。

<a id="R4"></a>
## 配送証拠（R4:10点）
deliveredと返せるのはdeliveryのstored観測がkey/digest/sku/quantityと一致し、inventoryも同じ要求でcommittedである場合だけです。配送のstoredは一度だけで、receiptはjournalとlegacyPoll/auditで一致します。異なる証拠を見た場合はINCONSISTENTで止まり、deliveredを捏造しません。terminal注文の再実行は同じterminal結果です。

<a id="R5"></a>
## 取消との競合（R5:15点）
deliveryのputIfAbsentとcloseIfAbsentの同一key局所原子順序が配送/取消の勝者を決めます。先にstoredならcancelはdeliveredへ収束し在庫をcommitします。先にclosedならcancelledとなり予約をreleaseし、その後の配送は不可能です。rejectedはそのまま保持します。取消返値がterminalなら対応する外部状態も確定済みです。取消の途中で停止した場合、まだterminal返値を要求しません。

<a id="R6"></a>
## 停止と再開（R6:15点）
各provider更新の後と応答の間で応答喪失、指定した有限境界でPROCESS_CRASH、境界hook内で別serviceによる操作が起きます。throwは成功/不成功の証明ではありません。サービス内の変数は永続ではありません。faultが尽きた後、recover一回で既存外部証拠とjournalが一致するterminalまたはqueued/runningへ収束します。外部効果なしの有効running leaseは維持してよく、期限切れで効果なしならqueuedへ戻ります。予約だけが残り有効leaseのない注文はrecoverで配送を完了してよいです。配送storedならcommitしてdelivered、closedならreleaseしてcancelledです。同じrecoverを繰り返して結果や在庫を増やしません。

<a id="R7"></a>
## 旧永続wire（R7:10点）
format1は{format:1,key,tenant,id,item,count,status,generation,owner,deadline,receipt,error,revision}です。statusはpending/working/done/aborted/errorに対応し、generation/owner/deadlineはtoken/leaseへ引継ぎます。doneのreceiptとerrorのerrorは保持します。snapshotはformat1も現在の意味で返し、claim/run/cancel/recoverはformat2へ永続更新できます。復元済みworkingの有効所有は変更しません。generation=MAX_SAFE_INTEGERの場合は新claimをTOKEN_EXHAUSTEDで拒否し、副作用なし。旧terminalは対応する整合した外部証拠とともに入力されます。

<a id="R8"></a>
## 有限走査と資源（R8:5点）
recoverPageはkey辞書順のlimit件以下を処理し、{after,done,processed}を返します。afterは最後の処理key、空ページは入力afterを維持。次ページ再生成serviceでも全件を重複なく訪問し、同じcursorの再試行は安全です。新規注文の割込は単件の競合scenarioで扱い、固定負荷の走査中は注文集合を変更しません。tenant4、各32注文、sku4、payloadとwireは各4KiB以内、測定scenario内で発生させるfault/hook総8以下、claim64以下。初期の永続imageに含まれる過去の取得・中断履歴はこの操作回数に含めません。固定負荷N=128をlimit4で走査した1passでjournal statsのread+pageRows+allRows <=10N+64、inventoryとdeliveryのoperations論理仕事量合計 <=16N+64。単件primitiveとimage出力の計数はspec/providers.mdに従い、全entryをコピーした場合も出力量を含めます。計測はservice呼出前後差で、検査側readを除きます。walltimeは得点根拠にしません。providerは局所データをJSON imageへexportでき、constructor(image)が同じ観測を復元します。全providerをそれぞれ復元してserviceを再生成しても上記契約は同じです。
