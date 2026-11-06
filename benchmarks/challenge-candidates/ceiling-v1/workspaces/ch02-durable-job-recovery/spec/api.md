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
