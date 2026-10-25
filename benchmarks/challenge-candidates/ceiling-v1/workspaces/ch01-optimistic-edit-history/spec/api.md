# CH01 実行契約

`src/editor.mjs` は `createEditor({transport, tenantId})` をexportする。`harness/views.mjs` の `mountList` / `mountDetail` は固定利用側である。編集は自動送信しない。呼び出し側は返されたoperationIdに対して `flush(id)` を呼ぶ。再送が必要な処理では同じIDをflushできること。送信要求が拒否された場合はIDを再利用してbaseVersionとpatchを更新できる。受理済みの要求内容は変えない。識別子は空でない文字列、versionは1以上のsafe integer。

- `open(rowId, listener)` は即座にsnapshotを1回通知し、解除関数を返す。解除は冪等。複数viewは独立に解除できる。
- `snapshot(rowId)` は `{confirmed, pending, conflicts, status}` のdeep copy。confirmedはサーバー行、pendingは未確定フィールドのpatch、conflictsは競合フィールド名配列（順序不問）。statusは `idle | pending | confirming | conflict`。行は存在する入力だけを編集する。
- `edit(rowId, patch)` は履歴にこの利用者の編集を追加し、一意のoperationIdを返す。nameは文字列、quantityは0以上のsafe integer。空patch・未知field・不正値はthrowし、既存状態を変えない。confirmedは送信完了まで変わらない。
- `flush(operationId)` は送信する。未知・取消済みIDは何もしない。再flushは同じ編集を増やさない。自動的な競合再送は必須ではないが、異なるfieldのremote更新後に同じIDをflushすれば新しいbaseで送信できること。同一fieldの競合は上書きしない。
- `receive(row)` はサーバー通知。tenantId,rowId,version,name,quantityを持つ。古いversionや重複で巻き戻さず、別tenantは無視。最新confirmedとpendingを別に保持し、ローカルbase以降に同じfieldが更新されればconflictsに載せる。サーバー自身が受理したこのoperationの更新は競合にしない。各fieldの更新履歴は下記changesSinceで観測でき、値が元へ戻った場合も後続更新を隠さない。
- `undo(rowId)` は直近の未取消のこの利用者の編集を対象とする。取消は履歴の対象にしない。未送信は取消してnull、送信結果不明はconfirmingにしてlookupで確定状況を確認する。lookupがnullなら送信未実行とは断定しない。次回undo/flushで再確認できる。確定済みなら対象fieldだけの補償編集を作りそのIDを返す（呼出側がflushする）。対象の受理versionより後に同じfieldが更新されていればconflictとしてnullを返し、上書きしない。
- `switchTenant(tenantId)` はviewを新tenantへ切り替える。既存viewには新tenantの状態を通知する。旧tenantの遅延応答は現viewに届かない。履歴・operationId・rowはtenantで分離する。旧tenantの未確定操作は旧tenantに属したままであり、新tenantへ移さない。

`changesSince(tenantId,rowId,version)` は指定versionより後に受理されたpatchに含まれるfieldの集合（文字列配列、順序不問）を返す。値が同じpatchも更新として含む。呼出側はsnapshot通知だけでは判別できない同field更新も確認できる。履歴はこの有限シミュレーターのprotected storeが保持する。

transportの `load(t,r)` は行のcopy、`lookup(t,id)` は受理済み `{status:'accepted', row, operationId}` またはnull。lookupは受理の事実であり、nullは将来の受付を妨げない。`send(request, callback)` は即時返り `{attempt,cancel()}` を返す。cancelは応答通知を止めるだけでサーバー処理を取り消さない。

`EditServer(rows)` はtenant付き行のcopyを保持する。`request(req)` は同期CAS（accepted/conflict/id_conflict/invalid/missing）。同じIDの既受理requestは同内容なら同じ結果、異内容ならid_conflict。`external(t,r,patch)` は他者の更新を確定して行を返す。通知は自動送信しない。

`EditTransport(server)` は `accept(id,attempt?)` と `deliver(id,attempt?)` を分ける。acceptはサーバー確定、deliverは応答。sendの返すattemptは同operationId内の0起点通番で、省略時は最新の送信を選ぶ。再送後も古いattemptを受付・配信できる。duplicateはdeliverと同じ。disconnectは指定attemptの応答のみ停止する。pendingは全送信requestのcopy配列。有限の順序列で動作を確認する。

`test/added/*.test.mjs` にはnode:testで回帰テストを追加できる。公開通常テストはseedで成功しても、全契約の成立を意味しない。
