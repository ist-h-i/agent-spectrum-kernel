# Installed route desk and kiosk

From the workspace, each command is a new process. Run `node release/desk.mjs DIRECTORY 'JSON'`, `node release/kiosk.mjs DIRECTORY 'JSON'` or the maintenance tool `node release/console.mjs DIRECTORY 'JSON'`. They share a directory and print one JSON result. The database and printer persist across process exits, including abrupt exits. Names, IDs, sites and slots are opaque nonempty strings. Different sites reuse the same names. An issue ID is unique within the lifetime of its site/slot and is never reinstated. Inputs conform to the documented data formats.

Kiosk commands remain installed at customer sites.

|Operation|Input besides op|Result|
|---|---|---|
|install|site, slot, issue, format, raw|Installs an independent issue in an available or reused slot at version 1.|
|edit|site, slot, issue, version, raw|Replaces raw at that exact issue and revision and increments the version. A stale edit returns `{"status":"stale"}`.|
|raw|site, slot|Stored row with parsed raw, or null.|
|monitor|site, id|Dispatch `{stage,attempt}` from the installed jobs table, or null.|

Both paper-era (format 1) and tablet-era (format 2) cards remain writable. On either, the desk's `read` takes site and slot and returns `{site,slot,issue,version,document}`, or null. The document has only title, driver and ordered stops. Each stop has id, label and units (a positive integer). A document uses distinct stop IDs. Text fields can be empty. The kiosk may store other properties at the root and on a stop.

|View|title|driver|stops|stop id|label|units|
|---|---|---|---|---|---|---|
|Format 1 raw|caption|crew|visits|code|name|count|
|Format 2 raw and desk document|title|driver|stops|id|label|units|

A desk edit stays readable and writable in the installed format. Preserve all other properties of the live root and each surviving stop, including opaque nested objects. Removed stops leave no residual data. Existing populated installations may already have ready, uncertain or printed jobs and completed or partially received sheets in the released tables. In a partial sheet, completed positions need not be consecutive. No migration can require every client to stop. The frozen modules in `release/` are the supported public entry points. The three source modules may use the provided SQLite connection and ordinary Node 24 APIs. Do not read or change the printer database or use the maintenance console from application code. The printer is a different system in production.

## Relief depot accounting

The desk also accepts `handover` forms. A form contains `site`, `id`, `legs` (an ordered array of distinct route slots, each `{slot,issue,job}`) and `loads` (an ordered array of `{from,to,stop,units}`). From and to are different zero-based leg positions, stop is a stop ID and units is a positive integer. Forms have at least two legs and one load; all positions exist. A leg's job identifies the waybill authorizing its use. All legs belong to the form site; each job ID is distinct on a form.

A form ID belongs to the first submitted body, even while waiting for paperwork. A different body under that ID returns `{"status":"identity_conflict"}`. A completed repeat returns the original receipt through any restart or later replacement. For an uncompleted repeat, consult current conditions again. Object property order is immaterial; list order is significant. The handover and sheet ID spaces are independent.

Every waybill must be recorded as printed by the desk. If any is missing, ready or uncertain, return `{"status":"waiting"}`. The depot does not send, recover or close a print attempt on behalf of a handover. Once all are printed, a waybill for another slot/issue, a retired leg, or a discrepancy in the freight returns `{"status":"disputed"}`. Waiting and disputed forms have no effect on inventory or paper allowances.

Each outgoing quantity is charged to the sending waybill and stop. Across all completed handovers it cannot exceed that stop's units on that printed packet. Replenishment, issue replacement, and other sites reusing the same names do not renew the allowance. The sending card must also hold enough units at the start of this exchange. Its current stop label must still match its own waybill. Receipts into a leg during the same exchange cannot fund its outgoing loads. Pool all outbound loads before allocating incoming freight, including multiple destinations for one stop.

A partially retained stop keeps its position, label and kiosk annotations. If fully unloaded it leaves the card. Incoming units join a still-present stop of the same ID when the labels agree, otherwise the exchange is disputed. New stops follow retained ones in the order of first arrival in the loads list. Later arrivals for that ID must agree on the label. Use the sending waybill's label; neither the old destination's annotations for a fully unloaded stop nor the sender's annotations travel with freight. Each route keeps its own title, driver, encoding and unrelated raw fields.

A successful form returns `{site,id,items:[{slot,issue,version},...]}` in leg order. A route whose stored raw document changes gains exactly one revision; an unchanged route retains its revision. Settlement covers every changed card, all waybill charges and the receipt as one business transaction. A failed storage operation cannot expose a partial settlement. Clerks can retry the same form after the storage is restored. Different forms sometimes compete for the last units on a waybill.
