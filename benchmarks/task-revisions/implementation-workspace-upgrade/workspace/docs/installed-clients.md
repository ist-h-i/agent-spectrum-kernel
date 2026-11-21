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
