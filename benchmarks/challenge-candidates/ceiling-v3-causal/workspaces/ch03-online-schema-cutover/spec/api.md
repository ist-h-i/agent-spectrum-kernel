# サービス観測契約

A1 `MigrationService(store)`はreadV1/readV2(t,id),writeV1/writeV2(t,id,value,handle,expectedIncarnation?),remove(t,id,handle,expectedIncarnation),backfillPage(t,limit=2),drainQueue(t),activateV2(t),rollback(t)を提供する。メソッドは同期で、割込はproviders.mdのhookだけ。既知業務失敗はthrowせず `{ok:false,error:{code,retryable,ids?}}`、成功は `{ok:true}` または `{ok:true,value}`。retryable=trueはREVISION_CONFLICTだけ。任意の説明文やidsの順番は採点しない。

A2 write/removeの失敗が重なる場合、外形の不正INVALID_INPUT、登録の不一致UNKNOWN_WRITER、v2 phaseでv1操作LEGACY_DISABLED、epoch不一致STALE_EPOCH、対象incarnation不一致STALE_RECORD、値の不正INVALID_MONEY、mixedのexcluded MIXED_TAX、最後にCAS不受理REVISION_CONFLICTの優先順位。拒否に副作用はない。removeはhandle.versionの操作として同じ権限を要求し、削除済みの同incarnationへは成功する。expectedIncarnation省略の直接writeは呼出時の対象を使用する。

A3 backfillPageのlimitは1..8、1呼出に返すmigrated/skipped/conflictsの合計はlimit以下。未変更passの末尾はcomplete:true。削除済みは商品を復活させず、正しい既存v2を旧値で上書きしない。不正旧値はskipped:{id,code:UNMIGRATABLE}へ記録し保持する。read後の変更と移行CASが競合した対象はconflictsに載せるか最新値で処理できる。再生成したserviceも同じstoreから再開できる。先のidへの新しい書込・削除再作成も後のpassで対象となる。

A4 checkpointは `{after:null|string,clock:nonnegative integer,complete:boolean}` の公開形式。completeはそのclockまでの現在商品が検査済みであることを表す。新しいbusiness writeがある場合、その古いcompleteだけで切替は成功しない。候補内のCAS成功後、checkpoint保存前に停止しても再呼出で正当値を保つ。

A5 drainQueueは全pendingを適用または理由付きrejectedへ置き、全履歴を成功value配列で返す。applied/rejectedは消さず、再drainでbusiness writeを重複させない。tenant、handle、expectedIncarnationの束縛はR4。commandの順序はenqueue順。予約と商品再作成が競合しても別の商品を旧commandで更新しない。

A6 activateV2は既にv2ならepoch不変の成功。active v1登録またはpending queueがあればBARRIER_BLOCKED。次に現businessClockを覆うcomplete、および現存商品の同値な表現が不足すればNOT_BACKFILLED。削除済みは障害にしない。検査とtransitionの間にmetadata/dataが変わった場合はREVISION_CONFLICTまたは新状態に基づく拒否で、staleな成功は不可。成功はそのtenantだけphase=v2,epoch+1。rollbackは既にmixedならepoch不変の成功。現在の商品にexcludedがあればUNREPRESENTABLEとids、phase/data不変。それ以外は最新値を失わずmixed,epoch+1。削除を復活させない。

A7 hooksが止まり公平に再呼出されれば、正常商品は有限passで移行し、障害のないtenantのcutoverは完了できる。他tenantのwriter/queue/旧不正値はこのtenantを止めない。

Removing an absent id with expectedIncarnation 0 succeeds without creating a row; any other explicit incarnation returns STALE_RECORD. Omitting the optional incarnation applies to the current row.
