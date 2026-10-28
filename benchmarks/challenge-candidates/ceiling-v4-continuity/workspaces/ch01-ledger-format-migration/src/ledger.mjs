import {legacyClient} from '../harness/legacy.mjs';
import {validId,invalid,wireChanges} from './codec.mjs';
import {readRow} from './read.mjs';
import {BatchReport} from './migration.mjs';
export class Ledger {
 constructor(journal){this.journal=journal;this.client=legacyClient(journal);this.report=new BatchReport(journal);this.receipts=new Map();}
 read(tenant,id){if(!validId(tenant)||!validId(id))invalid();return readRow(this.journal,tenant,id);}
 apply(tenant,requestId,changes,expectedHead){if(!validId(tenant)||!validId(requestId)||!Number.isSafeInteger(expectedHead)||expectedHead<0)invalid();const wire=wireChanges(changes),key=JSON.stringify([tenant,requestId]);const receipt=this.receipts.get(key);if(receipt)return {...receipt,duplicate:true};const accepted=this.client.write(tenant,requestId,wire,expectedHead);this.receipts.set(key,accepted);return accepted;}
 migratePage(tenant,limit){if(!validId(tenant)||!Number.isSafeInteger(limit)||limit<1||limit>32)invalid();const {rows,...result}=this.report.page(tenant,limit);return result;}
 activate(tenant){if(!validId(tenant))invalid();return this.report.activate(tenant);}
 state(tenant){if(!validId(tenant))invalid();return this.report.state(tenant);}
 history(tenant,after,limit){if(!validId(tenant)||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>32)invalid();return this.journal.scan(tenant,after,limit);}
}
