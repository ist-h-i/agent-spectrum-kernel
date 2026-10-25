# CH04 v2 public contract

Node24.21.0、標準ライブラリのみ。同期 API と指定 hook で有限の割込を再現する。本文は ASCII、chunkSize は正整数。ID は空でない文字列。

## C04-P: policy と context

P1: PolicyStore は tenantごとの `{revision,users,groups,resources,rules,links}`。users配列、groups は groupID→`user:id|group:id`配列(入れ子/cycle可)、resources は id→`{parent:null|id,body}`。rules は `{subject,resource,action:'read'|'export',effect:'allow'|'deny'}`。本人/到達groupと対象/祖先の同actionが適用。deny優先、allowなければ拒否。未存在user/target拒否。未知親は探索終了、cycle有限。tenant間でID/権限を共有しない。

P2: links は token→`{resource,actions,active}`。token省略は通常判定。明示したtokenが同tenantのactive/同resource/同actionでなければ通常allowがあっても拒否。有効linkはallow候補だがdeny優先。read と export は別権限。判断に使ったsnapshotのrevisionを保持する。

P3: ContextStore.open({tenant,user,linkToken?}) は contextId文字列。get(id) は `{id,revision:1,active:true,tenant,user,linkToken:null|string}` deep-copy、未知はnull。replace(id,context) は identityを置換しrevision+1、active=true。close(id) はactive=false,revision+1。context revision は再利用しない。

## C04-L: legacy利用側・cache・寿命

L1: src/service.mjs の `DocumentService(policyStore,contextStore,chunks,{chunkSize=4,logger=()=>{}}={})`。openContext, switchContext, closeContext は上記context APIを操作する。switchContext後に旧identityのデータ/通知を新contextの結果として見せない。

L2: decide(contextId,resource,action) はboolean。list(contextId) は `{status:'allowed',items:[id],contextRevision,policyRevision}`、detail(contextId,resource) は allowedなら `{status:'allowed',body,contextRevision,policyRevision}`、拒否は `{status:'denied',contextRevision,policyRevision}`。未知/inactive contextは `{status:'closed'}`。list順は任意。失効完了後に開始した取得は新revisionで判定し、通知遅延/重複/逆順でも古いallow/denyを残さない。grantやdeny解除も反映。キャッシュ使用自体は必須でない。

L3: subscribe(contextId,descriptor,callback) は unsubscribe関数。descriptor は `{kind:'list'}` または `{kind:'detail',resource}`。登録直後に1frameを通知。refresh(contextId) は現在のidentity/policyでactiveな利用側へ通知。switchContextは現在contextへrefreshし、closeContext自体は最終frameを送らず購読を解放し、以後通知しない。unsubscribeは冪等で、他の利用側の処理を止めない。PolicyStore.deliverによる通知は該当tenantのactive contextだけrefreshする。古い通知でも現在snapshotを用い、通知のrevisionへ巻き戻さない。

service.close() はpolicy通知購読と全view購読を解放する。他serviceが所有するcontextを閉じない。ContextStore から直接、または別 service から開いた active context にも購読できる。複数 service は同じ policy/context store と sink を共有でき、export job の受理・取消・完了は所有 job のみに作用する。

L4: harness/consumers.mjs の固定 mountList(service,contextId), mountDetail(service,contextId,resource) は frames配列/getLast()/close()。legacyLookup(service,contextId).read(resource) は detail allowedならbody、denied/closedならnull。legacyExport(service,contextId).start(resource),tick(jobId),ack(jobId,receipt),cancel(jobId),status(jobId) は下記APIを使う。これらのcallerを変えずに修正する。

## C04-E: export の受理・完了・取消

E1: requestExport(contextId,resource) は受付時の export 権限を確認し `{status:'queued',jobId}` または `{status:'denied'|'closed'}`。jobは受付したcontext revision/identityに束縛し、新identityへ付け替えない。runChunk(jobId) は各chunk直前に現policyで同じidentityを確認。異なる/inactive contextなら cancelled、失効なら denied。終端後は出力しない。

E2: runChunk は最大chunkSize文字を beginChunk で受理させ、acceptedなら `{status:'running',receipt}`。前chunk未ackでもcontext変更/失効が判明したら上記終端状態へ移り、同identityが現在も許可される間だけ同receiptを返して新規受理しない。context/policy競合は新snapshotで最大3回再判定、それでも収束しなければretry。取消競合ならcancelled。unknown応答はjobをunknownとし自動再送しない。

E3: accepted chunkは protected sink.finish(receipt) で後から完了できる。サービスの completeChunk(jobId,receipt) は sink.receipt(receipt) のcompleted事実を照合してoffsetを一度だけ進める。未完了/他job/未知receiptは無視。全bytesが確認済みのときだけcompleted。ack重複/遅着でoffsetを二重加算しない。cancelled/deniedは遅いackでも成功へ変更しないが、許可時に受理済みchunkの確定offsetは反映できる。空bodyも有限回でcompleted。

E4: cancelExportはまずsink.cancel(jobId)で以後の受理を原子的に閉じ、queued/runningをcancelledへ。completed/deniedは維持、unknownはunknown維持(出力なしと断定できない)。accepted済み1chunkは取消/失効後もfinish可。exportStatusは `{status,offset}`。未知job操作はmissing。loggerに本文/token/他tenant情報を渡さない。

## Protected adapters / 原子的保証

PolicyStore(policies) の snapshot/revision/replace/subscribe/deliver は v1と同じ公開構造。replaceはrevisionを+1してから完了応答。deliver(index=0,duplicate=false) は保存通知を任意順に配信できる。subscribe はunsubscribeを返す。

ChunkAdapter(policyStore,contextStore) は accepted Map/completed配列を観測用に持つ。beforeAccept(fn) は次beginChunkの原子的区間直前に一度だけ呼ぶ。beginChunk({jobId,attemptId,contextId,expectedContextRevision,tenant,expectedPolicyRevision,resource,bytes}) は、policy replace/context replace・close/sink cancelと直列化された不可分な区間で、現在のpolicy revision、context revision/active、cancelled jobを比較し一致時だけ受理。不一致は revision-conflict/context-conflict/cancelled で何も出力しない。この保証はprotected adapterが担う。提出側は許可判断に使ったrevisionを渡す。

同job+attemptIdの同一内容再要求は元receipt、異内容はconflict。finish(receipt) は受理済みを一度だけcompleted配列へ保存し `{status:'completed',receipt}`。receipt(id) はその事実/accepted情報deep-copyまたはnull。cancel(jobId) は以後beginChunkを閉じる。loseNextReplyは次の受理後にunknownを返す。accepted Mapはテスト観測専用で、サービスがunknownを成功へ解決するために使わない。

固定利用側とのbusiness動作で判定する。private field・cache実装・module数・説明文の一致は要求しない。
