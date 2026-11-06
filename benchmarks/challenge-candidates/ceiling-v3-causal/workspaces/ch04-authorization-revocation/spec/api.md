# 利用側とexport

A1 `DocumentService(policies,contexts,capabilities,chunks,{chunkSize=4,logger=()=>{}}={})`。openContext/switchContext/closeContextはproviderを操作する。decide(id,resource,action)はboolean。detailは許可時 `{status:'allowed',body,contextRevision,policyRevision}`、不許可時 `{status:'denied',contextRevision,policyRevision}`。未知/inactiveは `{status:'closed'}`でclosedがdenyに優先する。listはactiveなら `{status:'allowed',items:[resourceId],contextRevision,policyRevision}`、未知/inactiveはclosed。capability不適合のresourceはitemsに含めない。順序不問。loggerへ本文・capability ID・他tenantの情報を出さない。

A2 subscribe(id,{kind:'list'}|{kind:'detail',resource},callback)は即時1frameと、冪等な解除関数。解除はその利用側だけを止める。refreshは現在のidentity/authorityで通知する。switchContextは現在の購読に新identityを通知、closeContextは購読を解放し以後通知しない。PolicyStore.deliverの該当tenant通知、およびCapabilityStore.deliverの該当tenant/全clock通知後はactive購読へ現在値が届く。遅延/重複/逆順通知で過去のallowを復元しない。通知回数の最小化や複数view間の順序は指定しない。

A3 複数serviceは同じprovider/sinkを共有する。別serviceやContextStoreから直接作ったcontextにも購読できる。service.closeは自身の全viewとauthority通知購読だけを解除し、他者のcontextやjobを取消しない。legacyLookup.readはallowedならbody、その他null。固定mountList/mountDetailとlegacyExportを保つ。

E1 requestExport(id,resource)はclosed/deniedまたは `{status:'queued',jobId}`。jobは受付したcontext identity(tenant/user/capabilityId)とその時点の本文に束縛され、後のidentity/別本文を同じjobとして出力しない。異なるserviceのjobは独立で、IDの形式はopaque。runChunk(jobId)はmissing/queued以外の終端、retry、または `{status:'running',receipt}`を返す。chunkSizeは1..16の整数、body/bytesはASCII文字列で受理するbytesの長さは最大chunkSize。未ackのreceiptがある間は新たなchunkを受理しない。

E2 取得時/受理前のcontext identity変更・inactive、または本文変更はcancelled。同identityでpolicy/capabilityが不許可ならdenied。明示cancelExportによるcancelledは後のgrant等で復活しない。既にcompleted/denied/unknownのjobはcancelでもそのstatusを維持する。unknownは受理の成否を断定できず、サービスから同offsetを自動再送・成功確定しない。終端後に新しい受理はない。競合でretryは許すが、割込が止まり許可が安定した場合、2回以内の追加runChunkで受理または正当な終端へ進む。

E3 protected sink.finish(receipt)は受理済みchunkを後から完了できる。completeChunk(job,receipt)は自jobのcompleted事実だけでoffsetを一度進める。未知/他job/未完了/重複receiptは影響しない。cancelled/denied後に既受理chunkが完了した場合、offsetは進んでも終端statusをcompletedへ変えない。全bodyがack済みの安定した非終端jobだけcompleted。空本文も有限にcompleted。offsetは受理したbytesの長さの合計。

E4 権限否定とcontext変更が同時ならcontext変更のcancelledが優先。すでに終端のjobは以後の状態を維持。新規attemptのadapter比較失敗が重なる場合はproviders.mdの優先順。受理済みreceiptのfinishは失効/取消後でも有効であり、これは新規受理権限を与えない。

If current context identity or the captured body differs, cancellation takes precedence over a simultaneous permission denial. Receipt acknowledgement never changes an existing terminal status.

E5 同一tenant/user/capabilityIdのままContextStore.replaceでrevisionだけが増えてもjobのidentityは変わらない。許可・本文が安定し有限の割込が止まればE2の進行条件を満たす。tenant/user/capabilityId変更またはinactiveはcancelled、同identityで権限/能力が失効した場合はdenied。revisionはproviderの不可分受理の比較対象であり、jobの永続identityではない。
