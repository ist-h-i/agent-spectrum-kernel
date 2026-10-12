export function makeData({events,requests,tenants}){
 const rows=Array.from({length:events},(_,index)=>({tenant:'tenant-'+(index%tenants),kind:'event',timestamp:(index*7919)%events,value:index}));
 const queries=Array.from({length:requests},(_,index)=>{const start=(index*3571)%(events-4);return {request_id:index,tenant:'tenant-'+(index%tenants),kind:'event',start,end:start+3}});
 for(const value of [...rows,...queries])Object.freeze(value);return {rows:Object.freeze(rows),queries:Object.freeze(queries)};
}
