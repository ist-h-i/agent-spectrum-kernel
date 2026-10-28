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

追加テストの有効性 10 点の提出形式・分離実行は `scenario-tests.md` に従う。通常の追加テストは `test/added/` で実行でき、採点用 scenario は `test/added/scenarios/` に置く。

## v2追加公開条項

C1 多端末: createEditor({transport,tenantId,clientId='local'})。clientIdは空でない文字列。異なるclientIdの端末が生成するoperationIdは、同tenant/row/生成順でも衝突しない。両端末は独立履歴を持つ。編集を別端末のundoへ混ぜない。operationIdはopaque文字列で、利用側は解析しない。clientId省略は旧caller互換のlocalを用い、同じtenantで同clientIdを使う複数instance（省略同士を含む）の同時編集ID一意性は対象外。復元済IDとそのinstanceの将来IDは衝突させない。

C2 旧wire: src/legacy.mjs は createLegacyAdapter(editor) をexportする。setCell(rowId,column,value) は column='label'をname、'stock'をquantityへ写し `{op:operationId}` を返す。未知columnは変更前にthrow。send({op}) はflush。undo(rowId) は補償IDを `{op}` で返すかnull。view(rowId) は `{rowId,label,stock,dirty,busy,conflict}` のcopy。label/stockはconfirmedにpendingを重ねた値、dirtyはpendingが空でないこと、busyはstatus=confirming、conflictはconflicts配列のlabel/stock名への変換（順序不問）。旧pollは毎回現在のeditor状態を反映し、旧独自cacheを真実源にしない。固定harness/legacy-clients.mjs のlegacyEdit、legacyRead、legacyUndoAndSendを保持する。

C3 draft保存: editor.saveDrafts() は `{format:2,tenantId:<current>,drafts:[{operationId,tenantId,rowId,patch,baseVersion,before,order}]}` のJSON copy。draftsは未送信queued、およびrequestがなく未確定のconflict編集だけ、順番はorder昇順。beforeは編集時に見えたname/quantity、baseVersionは競合検出の基準。未取消の通常編集だけでなく未送信補償も保存するが、draftは復元後通常の未確定編集としてundo可能とする。送信結果不明またはundo確認中のoperationが1件でもあれば code='BUSY' をthrowし、状態を変えない。accepted履歴/cancelled操作/購読は保存しない。これは未送信draftの移行APIであり、端末プロセス終了を跨ぐ確定履歴undoは非対象。

C4 draft復元: editor.restoreDrafts(blob) は空のローカル履歴のeditorへ一度だけ読み込む（空draft読込後も次の呼出は拒否可）。format2および旧format1 `{format:1,tenantId,entries:[{id,tenant,row,base,changes,before,order}]}` を受容。意味はC3と同じ。全項目を検証してから一括反映し、違反時はcode='INVALID_ARCHIVE'、既存履歴があればcode='NOT_EMPTY'、どちらもsnapshot・tenant・通知・履歴を変えない。重複id、空識別子、未知/空patch、不正値、base/orderが正のsafe integerでない、欠けたbefore(name:string,quantity:非負safe integer)、存在しないrowを拒否。未知formatを黙って無視しない。draft.operationId/baseVersion/before/orderを保持し、archiveと内部状態はcopy分離。restore後の現tenantはblob.tenantId。各tenant/rowのconfirmedは現在のtransport.loadに照合し、古いbaseは保持してchangesSinceによるABA競合を検出。同tenant同fieldの既存更新は復元で上書きしない。current confirmedが新しくても異fieldなら既存flush契約でrebaseできる。復元後のedit IDは復元済IDと衝突しない。restoreは送信しない。

C5 src/session.mjs の decodeDrafts(blob) と encodeDrafts(tenantId,drafts) は公開codec。decodeはformat2正規形のcopyへ変換しC4の構造検証を行う（row存在検証はeditor責任）。encodeも同じ構造検証を行う。src/history.mjs のEditHistory(record/latest)は旧内部利用のため残るが、private採点は内部形式/クラスの使い方を要求しない。

C6 同期callback/固定view: protected transportとstoreは同期primitiveであり、sendの処理受理とdeliverは別。viewの解除はその購読だけを止める。tenant切替で生きているviewは新tenantへ移るが、draftとundo対象はtenant/端末に属する。複数viewの通知順の固定や不要な重複抑止は要求しない。公開状態に別tenantの行内容が出ることは安全性違反として品質点と別に判定する。

負荷条件: 有限シミュレーター最大100row/tenant、10tenant、端末10、操作1000。order/row versionとこの有限操作列での増分はsafe integer範囲内とする。性能点・時間しきい値は設けない。サーバー履歴はprotected側が保持する。draft巨大JSONや不正プロトタイプ、実ネットワーク、ディスク書込、複数processの同clientIdは非対象。
