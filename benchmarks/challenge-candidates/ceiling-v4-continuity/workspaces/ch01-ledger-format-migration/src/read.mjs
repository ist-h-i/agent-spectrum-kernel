import {reportRows} from './events.mjs';
export function readRow(journal,tenant,id){return reportRows(journal.scan(tenant,0,4096)).find(row=>row.id===id)??null;}
