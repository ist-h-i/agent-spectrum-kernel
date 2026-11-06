# CH03 v2 public contract

この文書の clause ID が受入条件を識別する。Node24.21.0、標準ライブラリのみ。API は同期であり、指定 checkpoint 以外に暗黙の割込はない。入力列は有限、競合停止後に公平に再呼出される。

## C03-M: 金額・境界 schema

M1: scenario が渡す tenant/id/writerId は空でない文字列(未知 ID は含む)。レコードは `(tenant,id)` ごとに独立する。v1 は null または `{price,currency}`、v2 は null または `{amountMinor,currency,taxMode}`。USD2桁/JPY0桁。price は符号/指数/空白を含まず `0|[1-9][0-9]*` と任意の小数部からなる文字列。小数部は1桁以上かつ通貨桁以下。amountMinor は `0|[1-9][0-9]*` の文字列。先頭ゼロ、未知通貨、余分な小数、余分なフィールドは拒否。桁数に業務上の上限はなく Number に丸めない。taxMode は included|excluded。null と0は別。

M2: サービスの既知業務失敗は throw せず `{ok:false,error:{code,retryable,ids?}}`。code の enum は INVALID_INPUT, INVALID_MONEY, UNMIGRATABLE, UNKNOWN_WRITER, STALE_EPOCH, LEGACY_DISABLED, MIXED_TAX, REVISION_CONFLICT, BARRIER_BLOCKED, NOT_BACKFILLED, UNREPRESENTABLE。retryable=true は REVISION_CONFLICT のみ。他の code は false。任意の説明文は採点しない。成功書込/切替は `{ok:true}`。read は `{ok:true,value}`。不正旧値の readV2 は UNMIGRATABLE、元の v1 を変更しない。未知 ID は value:null。

M3: `harness/consumers.mjs` の `legacyScreen(service,tenant)` は `src/legacy.mjs:createLegacyGateway` を使う固定旧 client。gateway の load(id) は `{status:200,body:<v1|null>}`、save(id,value,handle) は成功 `{status:204}`、業務失敗はいずれも `{status:409,body:{code:<service code>}}`。追加の error 文言は不要。v2 excluded を readV1 すると UNREPRESENTABLE。両 reader は現在の同じ業務値を表す。readV1/legacy load は保存済みv1をそのまま返す。v2 included書込時は通貨桁まで0埋めしたv1を保存する。

## C03-B: ページ移行と checkpoint

B1: `MigrationService(store)` を src/migration.mjs が export。readV1(tenant,id), readV2(...), writeV1(tenant,id,value,handle), writeV2(...)。backfillPage(tenant,limit=2) は最大 limit 件(整数1..8)の候補を処理し、`{ok:true,value:{migrated:[id],skipped:[{id,code:'UNMIGRATABLE'}],conflicts:[id],complete:boolean}}`。不正旧値を報告し、元データを保持。既存 v2 値を v1 から破壊しない。CAS 競合は報告するか最新値から再試行できる。変更のない pass の末尾では complete=true を返す。

B2: 固定の旧dump供給口 `harness/consumers.mjs:legacyBatchImport(store,handle,id,value)` は activeな同epoch/v1 writerがmixed中にだけ `{v1:value,v2:null}` をbusiness writeする。移行期間に営業処理とは別に届く旧dumpを表す。falseは不受理。これもbackfillの対象に含める。

checkpoint は protected store に永続化。service 再生成後も再開可能。途中停止後に再呼出して全正常値を移行できる。ページ間/ページ内で先の ID に旧新 writer が書いた場合も、その最新値を反映する。完了済み表示は新しい business write の後、再検証なしに切替根拠にならない。参照 checkpoint schema `{after:null|string,clock:number,complete:boolean}`。after は最後に検査した ID、clock は対象 businessClock。別内部状態を保持する設計でも、公開完了と切替の整合性を満たせばよい。

## C03-T: writer・切替・rollback

T1: handle は store.registerWriter(tenant,writerId,'v1'|'v2') が返す `{tenant,writerId,version,epoch}`。直接書込は同tenant/同versionの active 登録と現在epochを要求。mixed 中は v1/v2 を同じ意味に保ち、excluded は MIXED_TAX。v2 phase は v1 を LEGACY_DISABLED、旧epochを STALE_EPOCH として拒否する。拒否でデータを変えない。

T2: enqueue(tenant,queueId,command) の command は `{version,id,value,handle}`。drainQueue(tenant) は pending を適用または理由付き rejected にし、`{ok:true,value:<全履歴配列>}`。退役済み writer の受付済み queue は同epoch/mixed中なら適用できる。cutover 後の旧epochは拒否。履歴削除/旧epochの書換で成功扱いにしない。

T3: activateV2(tenant) は active v1/pending queue があれば BARRIER_BLOCKED。checkpoint が complete かつ現 businessClock を覆い、全正常行の両表現が同値、不正旧値がないことを要する。不足は NOT_BACKFILLED。検査後・transition前に writer/queue/record が変わった場合も stale 検査で切替しない。原子的 transition が metadataRevision と dataRevision を同時比較する。成功時 phase=v2, epoch+1。既にv2なら成功しepoch不変。

T4: rollback(tenant) は現在の実データから判断。excluded があれば UNREPRESENTABLE と ids を返し、phase/data を保持する。戻せる場合も新しい正当な値を失わせない。成功で mixed,epoch+1。既にmixedなら成功でepoch不変。

## Protected store / consumers

`PriceStore(records=[])` の records は `{tenant,id,revision,v1,v2}`。read(tenant,id), scan(tenant,after=null,limit=8), all(tenant), state(tenant), changes(tenant,clock) は deep-copy。scan は id 昇順。tenant 未登録時も初期stateは `{metadataRevision:1,dataRevision:0,businessClock:0,phase:'mixed',epoch:1,writers:{},queue:[],checkpoint:{after:null,clock:0,complete:false}}`。changes は指定 clock より後の business write ID。

writePrice(tenant,id,expectedRevision,{v1,v2}) は原子的 CAS、revision+1/dataRevision+1/businessClock+1。backfill(tenant,id,expectedRevision,v2) は v1 を変えず v2 を CAS 更新、revision+1/dataRevision+1、businessClock不変。store は変換の正しさを肩代わりしない。

setCheckpoint(tenant,expectedMetadataRevision,next) は原子的 CAS。transition(tenant,expectedMetadataRevision,expectedDataRevision,{phase,epoch}) は両 revision を原子的に比較して phase/epoch 更新、metadataRevision+1。false は不受理。

registerWriter は writer metadata 更新・metadataRevision+1、v2 phase の v1 登録は throw Error('LEGACY_DISABLED')。retireWriter は active=false、metadataRevision+1。enqueue は重複queueIdで throw、それ以外は pending 履歴追加・metadataRevision+1。settle(tenant,queueId,result) は applied/rejected と error を保存し metadataRevision+1。

once(point,callback)/checkpoint(point) は一度だけ同期 callback。backfillPage は候補 read 後・CAS 前に `backfill:read`、activateV2 は検査後・transition前に `cutover:checked` を呼ぶ。hook から raise/throw すれば停止を再現できる。checkpoint や queue は service のメモリーと別に残る。

fixed modernForm(service,store,handle) は read(id)/save(id,value)/refresh()。refresh は同writerIdを現epochへ再登録する。legacyScreen は load/save(handle) を変更せず使う。内部 module をまとめたり別の実装方法を選んでよい。src の private field 名・ファイル数・特定理由文への依存で合否を決めない。
