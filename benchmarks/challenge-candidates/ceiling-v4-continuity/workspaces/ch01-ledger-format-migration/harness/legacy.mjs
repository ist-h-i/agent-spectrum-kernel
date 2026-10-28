const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/u.test(v);
const valid=value=>value===null||(value&&['USD','EUR'].includes(value.currency)&&typeof value.amount==='string'&&/^-?(0|[1-9][0-9]*)\.[0-9]{2}$/u.test(value.amount)&&value.amount!=='-0.00'&&value.amount.replace(/[-.]/gu,'').length<=48);
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function legacyClient(journal){return {
 write(tenant,requestId,changes,expectedHead){
  if(!id(tenant)||!id(requestId)||!Number.isSafeInteger(expectedHead)||expectedHead<0||!Array.isArray(changes)||changes.length<1||changes.length>8||changes.some(c=>!c||typeof c!=='object'||Array.isArray(c)||!id(c.id)||!Object.hasOwn(c,'value')||!valid(c.value))||new Set(changes.map(c=>c.id)).size!==changes.length)fail('INVALID_INPUT');
  const wire=changes.map(c=>({id:c.id,value:c.value===null?null:{currency:c.value.currency,amount:c.value.amount}}));
  const prior=journal.request(tenant,requestId);if(prior){if(JSON.stringify(prior.changes)!==JSON.stringify(wire))fail('REQUEST_CONFLICT');return {head:prior.seq,duplicate:true};}
  const event=journal.append(tenant,expectedHead,{requestId,changes:wire});if(!event)fail('HEAD_CONFLICT');return {head:event.seq,duplicate:false};
 },
 read(tenant,rowId){let row=null;for(const event of journal.scan(tenant,0,4096))for(const change of event.changes)if(change.id===rowId)row={id:rowId,revision:event.seq,deleted:change.value===null,value:structuredClone(change.value)};return row;}
};}
