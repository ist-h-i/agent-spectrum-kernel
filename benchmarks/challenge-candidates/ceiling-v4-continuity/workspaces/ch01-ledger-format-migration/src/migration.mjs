import {reportRows} from './events.mjs';
export class BatchReport {
 constructor(journal){this.journal=journal;this.positions=new Map();this.completed=new Set();}
 page(tenant,limit){const start=this.positions.get(tenant)??0, rows=this.journal.scan(tenant,start,limit);const cursor=rows.at(-1)?.seq??start;this.positions.set(tenant,cursor);const complete=rows.length<limit;if(complete)this.completed.add(tenant);return {cursor,complete,version:0,rows:reportRows(rows)};}
 activate(tenant){return {activated:this.completed.has(tenant)};}
 state(tenant){return {...this.journal.inspect(tenant),ready:this.completed.has(tenant)};}
}
