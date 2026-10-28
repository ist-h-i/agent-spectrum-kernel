# Price migration API

Node 24.21.0。`npm test` で公開テストを実行する。外部依存はない。
提出可能なのは `src/**`, `test/added/**`, `RESULT.md`。その他は固定入力である。

`src/migration.mjs` は `MigrationService` を export する。constructor は `PriceStore` を受け取る。各メソッドは同期処理で、非同期処理は checkpoint で再現する。公開利用側を変えずに内部の module を追加・変更できる。

## 値と結果

ID は空でない文字列。v1 値は `null` または `{price,currency}`、v2 は `null` または `{amountMinor,currency,taxMode}`。USD=2 桁、JPY=0 桁。金額は非負。v1 の文字列は `0` または先頭ゼロのない整数に、必要なら小数部を続けたもの。通貨の桁を超す小数部、符号、指数、空文字、未知通貨は無効。amountMinor は `0` または先頭ゼロのない整数文字列で、桁数上限はない。`taxMode` は `included|excluded`。null は未設定であり 0 とは異なる。

書込は `{ok:true}` または `{ok:false,reason:<nonempty string>}`。無効値を受理せず、それまでのデータを変えない。未存在 ID の read は null。mixed 中の v2 read は未移行の正常 v1 を変換できる。不正旧値の v2 read は `{unmigratable:true,raw:<original v1>}` を返す。readV1 は v1 値を返し、v2 専用値なら `{unrepresentable:true}`。

## サービス

- `readV1(id)`, `readV2(id)` は read 時点の業務値を返す。
- `writeV1(id,value,{writerId,epoch})`, `writeV2(...)`。登録済みの同版 active writer を要求する。mixed では両版を整合させ、excluded は拒否する。v2 phase では v1 を拒否し、新 epoch の v2 writer のみを受理する。writer の epoch は呼出引数で与え、queue に保存された古い値を置換しない。登録メタデータに epoch はなく、現在 control epoch との一致で判断する。
- `backfill()` は全レコードの現在値を対象にでき、再実行可能。返値は `{migrated:[id],skipped:[{id,reason}],conflicts:[id]}`。不正旧値はそのまま保持し skipped で説明する。既に v2 を持つ整合レコードを飛ばしてよい。read 後の concurrent write による CAS 競合は conflicts で返すか、最新値から再試行してよい。古い値で上書きしない。v2 専用値を v1 から再構築しない。
- `drainQueue()` は pending を処理し、全 queue 履歴を返す。各 command は `{version,id,value,writerId,epoch}`。退役済み writer の queue も受理当時の epoch が現在で mixed なら適用できる。ただし cutover 後の旧 epoch は拒否し、理由を履歴へ保存する。通常直接書込には active 登録が必要。
- `activateV2()` は active v1 writer と pending queue がない場合だけ phase を v2 にして epoch を 1 増やす。全正常レコードの両版整合を確認し、不正旧値があれば ID 付き理由で拒否する。再度 v2 に切り替える要求は成功するが epoch を変えない。
- `rollback()` は現データが損失なく v1 で表現できる場合だけ mixed に戻す。excluded の行があれば `{ok:false,reason:<string>,ids:[id]}`。新たな正当な値を保持し、snapshot 復元で消さない。成功時 epoch は 1 増やす。既に mixed なら成功で epoch 不変。

## Protected store と scheduler

`PriceStore(records)` の record は `{id,revision,v1,v2}`。入力・read・scan・state は deep copy。`read(id)`、ID 昇順 `scan()`、`state()` が観測API。
`compareAndSet(id,expectedRevision,next)` は一致時だけ全 record を置換し revision を +1、新規は expectedRevision=0。一連の比較と置換は原子的。`updateControl(expectedRevision,next)` も control を原子的に置換し revision を +1。同期処理の途中で暗黙の割込はない。
control は `{revision,phase:'mixed'|'v2',epoch,writers,queue}`。
`registerWriter(id,'v1'|'v2')` は active 登録して現在 epoch を返す。v2 phase の v1 登録は throw。`retireWriter(id)` は inactive にする。`enqueue(id,command)` は pending 履歴を追加、重複 queue ID は throw。`settle(id,result)` は applied/rejected と reason を保存する。各操作で control revision が増える。
`once('backfill:read',fn)` の fn は次の `checkpoint('backfill:read')` で一度だけ同期実行する。backfill は各候補 record を読み、CAS 前にこの checkpoint を呼ぶ。これで writer と backfill の交互実行を指定する。中断は hook から throw で再現し、サービスを同じ store で作り直せる。

`harness/clients.mjs` は固定 reader/writer。現代版 client は cutover 後に新たに登録して新 epoch を取得する。古い client の失敗を勝手な再登録や queue 消去で隠さない。

追加テストの有効性 10 点の提出形式・分離実行は `scenario-tests.md` に従う。通常の追加テストは `test/added/` で実行でき、採点用 scenario は `test/added/scenarios/` に置く。
