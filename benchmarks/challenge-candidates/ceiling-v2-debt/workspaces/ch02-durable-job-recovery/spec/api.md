# CH02 実行契約

`src/queue.mjs` は `createQueue({store,sink,renderer,faults,leaseMs})` をexportする。既定rendererは固定 `render`、既定leaseMsは10。呼出側は同期的であり、fault hookだけが処理の途中へ別操作を挿入する。payloadはJSON互換値で、識別子は空でない文字列。時刻は0以上safe integer。

- `enqueue(tenantId, requestId, payload)` は永続jobを返す。同一識別子/同一JSON意味（object key順序を除く）は同じjob。異payloadはthrow。payloadとdigestは不変。
- `claim(worker)` はqueuedまたは期限切れrunningから処理可能なjobを1件原子的に取得し、返す。なければnull。leaseは `{worker,token,until}` でtokenは取得ごとに変わる。`until <= store.now()` は失効。期限内の他workerから横取りしない。
- `run(key,worker)` はこのworkerの有効leaseで1件を進め、最新jobを返す。無資格はnullで副作用なし。取得時のlease tokenを確定時にも検証し、失効/再取得後の古い処理が現在jobを変更しない。sinkの冪等性は旧workerの遅い出力でも保持される。
- `cancel(key)` は原子的closeIfAbsentで出力と取消を調停する。既出力ならreceipt付きsucceeded（その事実を保つ）。未出力を閉じた場合はcancelled。応答喪失で確定不明ならconfirming。失効前後/遅いputとの競合でも虚偽cancelを確定しない。不存在はnull。
- `recover()` は永続store/sinkを照合し、期限切れjobを再処理可能にする。確定出力はreceipt付きsucceeded、closedはcancelledに整合する。期限内の有効leaseを奪わない。成功/取消は最終状態。failedは恒久失敗理由付き最終状態で、cancelで既出力の事実を隠さない。
- `snapshot(key)` は永続jobのcopyまたはnull。jobは `{key,tenantId,requestId,payload,digest,state,lease,receipt,reason,version}`。stateは `queued|running|confirming|succeeded|cancelled|failed`、receiptは文字列かnull、reasonは文字列かnull。追加内部フィールドを許す。停止後に新しいcreateQueueへ同じstore/sinkを渡して再開する。プロセス内の新規queueには旧メモリーは渡さない。

`DurableStore` は `now()`, `advance(ms)`, `read(key)`, `scan()`, `putIfAbsent(key,value)`, `cas(key,version,value)`, `transaction(fn)`。keyは `jobKey(t,r)=JSON.stringify([t,r])`。putIfAbsentは `{inserted,job}` を返し初回version=1、casはboolで成功時version+1。read/scanはcopy。transactionは同期、throwで全job状態をrollbackする。関数内でread/CAS等を使える。時計はrollbackしない。transaction内にsink処理を含めても、sinkはrollbackしない。

`IdempotentSink` のputIfAbsentは `{status:'stored',receipt,digest,bytes}` / `{status:'closed'}` / `{status:'conflict'}`。同key/digestはbytesの再送内容によらず最初のreceiptとbytesを返す。異digestはconflictで既存出力を変更しない。closeIfAbsentは既出力storedを返すか、未出力を永続closedへする。lookupはstored/closed/null。entriesはcopyであり検査用。`loseNextReply('put'|'close')` は次の該当操作を実行した後 `code='RETRYABLE'` でthrow。ネットワーク越しの実体はない。

`Faults` の `stop(point)` は次の該当hitで `code='PROCESS_CRASH'` をthrowする。catchして正常失敗に変換せず上位へ伝播する。`hook(point,fn)` は該当hitで1回fnを実行し、別workerやcancelを挿入できる。pointは `before-render,after-render,before-put,after-put,before-complete,after-complete`。実行する処理段階がある限り名前を維持する。既に確定済みで処理段階を省略する再開は許す。

固定rendererはJSON payloadを決定的bytes（文字列）へ変換する。title文字列とrows配列がなければ `code='PERMANENT'`。渡されたrendererがRETRYABLEをthrowする場合は再試行できる。全jobに公平なtickと回復後の十分な有限再試行がある場合、無関係なjobの処理と完了を妨げない。全拒否/常時停止は契約を満たさない。

公開通常テストはseedの一般動作のみを確認する。追加回帰テストは `test/added/*.test.mjs`、確認記録はRESULT.mdへ。

追加テストの有効性 10 点の提出形式・分離実行は `scenario-tests.md` に従う。通常の追加テストは `test/added/` で実行でき、採点用 scenario は `test/added/scenarios/` に置く。

## v2追加公開条項

J1 旧保存形式: DurableStoreは前リリースのrecordを含められる。format:1 recordは `{key,version,format:1,tenantId,requestId,body,fingerprint,status,owner,deadline,generation,receipt,error}`。statusはpending/working/done/aborted/error、新stateはqueued/running/succeeded/cancelled/failed。body→payload、fingerprint→digest、error→reason。workingのleaseは{worker:owner,token:generation,until:deadline}。正しいfingerprintはharness/renderer.mjsのpayloadDigest(body)。新recordはformat:2および通常公開job形（format無しの既存新形も許す）。src/records.mjsはnormalizeRecord(record)をexportし、旧→新copyを返す。識別子/キー/JSON digest/状態/leaseを検証し、違反はcode='INVALID_RECORD'。unknownformatを無視しない。旧doneはreceipt非空string、abortedはreceipt=null、errorはreason非空string。正規状態でsucceededはreceipt必須、failedはreason必須、それ以外receipt=null。leaseはrunningのみ、worker非空、token正safe integer、until非負safe integer。payloadはJSON互換。理由の文言は既存reasonを保持する以外固定しない。

J2 原子的移行: recover() はまず全storeを検証し、旧recordをstore.transaction内で正規形へ移す。1件でも不正ならINVALID_RECORDをthrowし、store全件を変更せずsinkも操作しない。正しい移行はkey/tenant/request/payload/digest/既存lease token/deadline/失敗理由/receiptを保持し、CASでversionは通常に増える。既に新形なら移行だけの不要CAS不要。queued旧jobはclaim可能。APIはrecover完了後に新旧clientが共存する。recover前にenqueue/claim/run/cancelを呼ぶ必要はない。snapshotは旧recordが残っていればnormalizeしたcopyを返す（永続書換え不要）。旧abortedは取消の永続意図でもある。sinkが未確定ならrecoverは移行commit後にcloseIfAbsentで閉じ、既storedならreceipt付きsucceededを優先する。これにより旧cancelled表示と遅いputも矛盾させない。migration途中にsink呼出は行わず、移行commit後の照合でreceipt優先の最終状態を回復する。store.transactionはstoreだけatomicでsinkrollbackは提供しない。

J3 旧wire: src/legacy.mjs のcreateLegacyQueue(queue) は submit({tenant,request,document})→`{id:<job.key>,status:<legacy enum>,receipt,error}`、poll(tenant,request)→同形/null、cancel(tenant,request)→同形/null。legacy statusはqueued:pending,running:working,confirming:waiting,succeeded:done,cancelled:aborted,failed:error。payloadを状態応答へ含めない。同一JSON意味の依頼は同じkey、tenantを省略/混同しない。failed reasonは旧errorへ、successful receiptは旧receiptへ保持。固定legacySubmit/legacyPoll/legacyCancelと既存submitReport/workerTick/jobViewの両方から見て同じ永続状態を返す。未知fieldのwire入力は無視可だがtenant/request/document必須。

J4 最終証拠と失敗: recover/cancelではsinkのstored（同digest）をfailedを含むstore最終表示より優先し、receipt付きsucceededへ照合する。failedでも出力が無いときは理由付きfailedを維持し、cancelで虚偽cancelへ変えない。closedは未成功jobをcancelledへ整合。既出力に異digestを上書きしない。期限内のrunningでsink証拠がなければrecoverはleaseを変更しない。claim/recoverの走査順は固定しないが、有限件を公平に処理でき、恒久失敗jobで他jobを塞がない。出力済みなのにcancelledを確定表示すること、別tenantへ出力内容またはそのreceiptを表示することは直接観測された時のみ安全性違反。

J5 lease fencing: 期限切れ→別queue再取得は同worker名でもtokenが変わる。古いrunはafter-render/before-put/after-put/before-complete等の公開hook中にexpire/reclaim/cancelが入っても、新tokenの状態や理由を書換えない。sinkはkey+digest冪等putとatomic closeIfAbsentが出力/取消を直列化する。古いworkerの遅いputを許す実装も、close/stored事実と整合し虚偽cancelを表示しなければ受容。より早いleaseチェックでputを止めてもよい。runは成功、失敗、cancel、不明の扱いを永続storeに残す。PROCESS_CRASHは正常failureにせず伝播し、RETRYABLEは将来のclaim/recoverで再試行可能。

負荷条件: 有限100job/10tenant、payload各64KiB以下、時刻はsafe integer範囲内、leaseMs正safe integer。性能点/固定走査順はない。現実の分散store、複数threadのJS同時実行、暗号衝突、実ネットワークは非対象。hookは同期で有限の別操作を挿入する。必要atomic primitiveの責任は上記store/sinkであり提出コードに未提供のatomic性を要求しない。
