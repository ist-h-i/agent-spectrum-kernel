# 提供境界と定量条件

P1 `PriceStore(records=[])`はcallerと分離した状態を持つ。read/all/scan/state/changes/statsはcopyで返す。scan(t,after,limit)はid昇順の最大limit件(削除記録も含む)。changes(t,clock)はそれより後の `{clock,id}` 配列。stateはmetadataRevision/dataRevision/businessClock/phase/epoch/writers/queue/checkpoint。初期は1/0/0/mixed/1/空/空/{after:null,clock:0,complete:false}。

P2 writePrice(t,id,revision,{v1,v2})は現revision(未存在0)の原子的CASでrevision+1、削除から再作成ならincarnation+1、businessClock/dataRevision+1。erase(t,id,revision,incarnation)は原子的比較でdeleted:true,v1/v2:nullを保存し同じ増分。同じ削除状態は冪等。backfill(t,id,revision,incarnation,v2)は両識別値と未削除を原子的比較し、v1を変えずrevision/dataRevisionだけ増やす。falseに副作用はない。storeは金額変換を行わない。

P3 setCheckpoint(t,metadataRevision,next)はmetadata CAS。transition(t,metadataRevision,dataRevision,{phase,epoch})は二つを同じ不可分区間で比較しmetadataRevision+1。register/retire/enqueue/settleもmetadataRevisionを増やす。settleはpendingだけに一度作用する。登録・queue・checkpointはservice再生成と独立に残る。

P4 once(point,callback)はprovider内部の指定境界で一度同期実行され、callbackのthrowを伝播する。scan:returnedはscanのsnapshot確定後、copyを返す直前。checkpoint:beforeCommitはsetCheckpointの比較・保存直前。transition:beforeCommitはtransitionの二重比較直前。それぞれcallback中の別provider操作は呼出したprimitiveの不可分比較より前/後の定義に従う。onceが受け付けるpointは上記3種だけで、候補から発火させるAPIはない。サービスの内部呼出順や追加通知は要求しない。外部割込はこの有限callbackだけ。

P5 counterはprotected store内部で保持し変更・リセットできない。stats()はread/scanRows/allRows/changesRows/cas/metadataの累計copy。scanRows/allRowsは返したrecord数、changesRowsは返した変更数、readは単件read数、casは比較試行数。計測対象はservice呼出前後の差分で、外側の検査readを除く。

P6 固定負荷: tenant数4以下、各tenant64商品以下、idはASCIIで一意、各価格48桁以内、queue32件以下、登録8件以下。定常のN件(0..64)をlimit4で最後までページ処理する一つのpassで、serviceのread+scanRows+allRowsは4N+2ceil(N/4)+16以下。store primitiveの内部index計算・外側の検査はこの論理値に含まない。walltimeだけの性能点は設けない。割込/再起動は別の有限scenarioで観測し、無限の書込・巨大dump・別process同時アクセスは対象外。
