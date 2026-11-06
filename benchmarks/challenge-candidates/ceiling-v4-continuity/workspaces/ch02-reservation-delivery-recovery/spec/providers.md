# Provider境界

Journal(image=null)はnow/advance/read/insert/cas/page/dump/statsを持ちます。insert(key,row)は不存在だけにrevision1で挿入、cas(key,revision,row)は現在revision一致だけrevision+1で置換します。false/既存返値に副作用なし。read/pageはcopy、page(after,limit)は辞書順。nowは論理時計、advanceは非負整数だけ加算します。dumpは復元用JSON imageで候補専用fieldも保持します。provider内部indexとdumpは走査負荷計測対象外ですが候補からdumpを使うとallRowsに全件加算されます。

Inventory(image=null, capacities=[])はreserve(key,digest,tenant,sku,quantity)、finish(key,digest,mode)、lookup、dump、statsを持ちます。capacity入力は[{tenant,sku,quantity}]、未設定capacity=0。reserveは同じkey/digestで冪等、容量不足ならrefusedを永続化。finishのmodeはcommit/release。releaseは未存在にもreleased tombstoneを作り以後reserveを遮断、reservedなら容量を戻します。committedをreleaseしてもcommitted維持、released/refusedをcommitしても維持。各entryは{key,digest,tenant,sku,quantity,status}、未存在releaseのtenant/sku/quantityはnullです。異digestはCONFLICT。全primitiveは一つのentryと同じtenant/sku容量だけを局所原子的に扱います。

Delivery(image=null)はputIfAbsent(key,digest,sku,quantity)、closeIfAbsent(key,digest)、lookup、dump、statsを持ちます。putは未存在に{key,digest,sku,quantity,status:'stored',receipt:'delivery:'+key}を一度だけ作成、closeは未存在に{key,digest,status:'closed'}作成。既存はそのcopy、異digestはCONFLICT。これ以外のproviderは参照しません。在庫確認やjournal更新を代行しません。

Inventory/DeliveryのloseNextReply(method)は次の指定局所methodの更新と観測確定の後、返答前にREPLY_LOSTをthrowします。JournalではloseNextReply('cas'|'insert')も同様です。throwにより更新を巻き戻しません。各providerのonce(method, callback)は次のそのmethod実行の局所原子区間の直前に一度callbackを呼びます。callback throwはその呼出を中断します。callbackは有限で再入操作可。配送putとcloseの順序は実行された局所原子区間の順序です。

Faults.stop(point)、hook(point,callback)、hit(point)を持ち、pointはafter-reserve/after-delivery/after-inventory/before-journalの4種です。hookとstopは一度だけです。hitはhook実行後、設定stopをPROCESS_CRASHでthrow。候補は各該当外部結果を受けてから次の結果永続化までの間に対応pointを通知します。内部アルゴリズムの特定の呼出し回数は要求せず、外側が指定した最初の該当境界だけに作用します。

全providerはcopyを返し、public以外のfieldやprototypeを変更/参照することは契約に含みません。stats.operationsは論理仕事量です。Inventoryのreserve/finish/lookup、DeliveryのputIfAbsent/closeIfAbsent/lookupは各1単位、Inventory.dumpは1+出力reservation entry数+capacity entry数、Delivery.dumpは1+出力entry数です。Journalのread/insert/cas/page/dumpは各1単位で、dumpは従来通りallRowsにも出力row数を加えます。Journalのread/page/dumpは別カウンタも持ちます。stats、論理時計の観測・前進、fault/hook設定とconstructorは検査制御なので計数しません。network・実時計・外部DBは使いません。画像はprovider永続内容のモデルでありサービス状態は含みません。
