# Document authorization API

Node 24.19.0。`npm test` で公開テストを実行する。外部依存はない。
提出可能なのは `src/**`, `test/added/**`, `RESULT.md`。他のファイルは固定。

## Policy data

`PolicyStore` は tenant ごとに `{revision,users,groups,resources,rules,links}` を持つ。すべての ID は tenant 内だけで意味を持つ空でない文字列で、他 tenant の同じ ID との関連はない。user は `users` に存在する必要がある。

- `groups` は group ID から member subject 配列への map。subject は `user:<id>` または `group:<id>`。有効な所属だけを含む。未知 member は所属にならない。入れ子と cycle があり、有限時間で到達する全 group を扱う。
- `resources` は ID から `{parent:<id|null>,body:<string>}` への map。parent は同 tenant の親 resource。親が未知ならそこで探索終了し、それ以前の正常な祖先は有効。cycle は一度訪問した場所で終了。対象自体がない場合は拒否。
- `rules` は `{subject,resource,action,effect}` 配列。action は `read|export`、effect は `allow|deny`。本人か到達 group の subject、対象かその祖先の resource、同 action の rule が適用される。適用 deny が一つでもあれば allow より優先。適用 allow がなければ拒否。
- `links` は token から `{resource,actions:[...],active:<boolean>}` への map。有効な token が要求された場合、同 tenant で active、対象 ID が完全一致、要求 action を含むなら allow 候補になる。明示 deny があればリンクでも許可しない。不正・期限切れ相当(active=false)・他 tenant の token を明示した要求は、通常 allow があっても拒否する。token 省略(null/undefined)は通常の rule 判定を行う。

## Service API

`src/service.mjs` の `DocumentService(store,chunks,{chunkSize=4,logger=()=>{}}={})`。chunkSize は正整数。内部 module を追加できる。操作は同期で、指定 hook 以外に割込はない。

- `decide({tenant,user,resource,action,linkToken?})` は boolean。
- `list({tenant,user})` は read 許可のある resource ID 配列。配列順序は任意。
- `detail(request)` は `{status:'allowed',body}` または `{status:'denied'}`。未存在や不正入力も拒否する。
- `requestExport(request)` は export 権限を受付時に確認し、許可なら `{status:'queued',jobId}`、拒否なら `{status:'denied'}`。
- `runChunk(jobId)` は各 chunk の実行直前にも export 権限を確認し、最大 chunkSize 文字を adapter に渡す。fixture の本文は ASCII。成功ごとに offset を進め、全体が完了したときだけ completed。それまでは running。空本文も有限回で完了。拒否なら denied の終端状態。revision-conflict なら最新 policy で再試行してよいが、1呼出につき最大3回。収束しなければ `{status:'retry'}` とし後続呼出で再開可能にする。取りこぼし・重複出力は不可。
- adapter の unknown は、その chunk が受理されたか呼出側が確定できない状態。job は unknown とし、成功や cancelled と断定しない。提供 API には unknown を安全に照会する手段がないため自動再送しない。
- `cancelExport(jobId)` は queued/running を cancelled にする。completed/denied/unknown はそのまま返す。cancelled 後の runChunk は追加出力をしない。
- `exportStatus(jobId)` は `{status,offset}`。unknown job は各 job 操作で `{status:'missing'}`。
- `close()` は通知購読を解放する。

通知が未配信でも失効完了後に開始する decide/list/detail は現 revision で判定する。grant や deny 解除も同条件。ログの形式や出力回数は任意だが、本文・token・他 tenant の情報を logger に渡さない。

## Protected adapters と原子的境界

`PolicyStore(policies)` は deep copy を保持する。`snapshot(tenant)` は deep copy または null、`revision(tenant)` は number または null。`replace(tenant,policy)` は policy を置換し、tenant revision を必ず +1 してから `{tenant,revision}` を返す。これが失効完了応答。`subscribe(fn)` は unsubscribe を返す。`deliver(index=0,duplicate=false)` は保存された変更通知を配信し、duplicate=true のとき queue に残す。通知の順序は任意。

`ChunkAdapter(store)` の `beginChunk({tenant,expectedRevision,resource,bytes})` は revision 比較と chunk 受理を同じ同期の不可分な区間で実行する。この区間は PolicyStore.replace と直列化され、比較後・受理前には割り込めない。**この原子的保証は提出コードでなく protected adapter が担う。** 提出コードは許可を得た snapshot の revision を expectedRevision として渡す。単に直前に revision を読んだ事実では、過去の許可を新 revision の許可へ変換できない。

`beforeAccept(fn)` は次の beginChunk の不可分区間の直前に一度だけ同期実行される。ここで replace できるため「権限判定後、受理前の失効」を決定的に再現できる。比較失敗は `{status:'revision-conflict'}` であり何も受理しない。比較成功は `{status:'accepted',receipt}` で accepted map に保存。失効前に受理済みの chunk は、その後 `finish(receipt)` により完了できる。`finish` は completed 配列へ receipt ごとに一度だけ記録する。

`loseNextReply()` は次の比較成功時、受理後に `{status:'unknown'}` を返す。accepted/completed は観測用で、サービスが unknown の解決や権限判定の代用として参照しない。`harness/clients.mjs` は固定利用側である。
