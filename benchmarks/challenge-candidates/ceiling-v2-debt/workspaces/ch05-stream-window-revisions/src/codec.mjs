export function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const canonical = Object.hasOwn(input,'tenantId');
  const e = canonical ? {tenantId:input.tenantId,eventId:input.eventId,revision:input.revision,eventTime:input.eventTime,amountMinor:input.amountMinor,deleted:input.deleted}
    : {tenantId:input.tenant,eventId:input.id,revision:input.rev,eventTime:input.at,amountMinor:String(Number(input.cents)),deleted:input.remove};
  if (![e.tenantId,e.eventId].every(x=>typeof x==='string'&&x.length>0) || ![e.revision,e.eventTime].every(x=>Number.isSafeInteger(x)&&x>=0)
    || typeof e.amountMinor!=='string' || !/^(0|-?[1-9][0-9]*)$(?![\s\S])/.test(e.amountMinor) || typeof e.deleted!=='boolean') return null;
  return e;
}
