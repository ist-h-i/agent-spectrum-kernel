export const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,40}$/u.test(value);
export function invalid(){throw Object.assign(new Error('INVALID_INPUT'),{code:'INVALID_INPUT'});}
export function toWire(value){if(value===null)return null;if(!value||!['USD','EUR'].includes(value.currency)||typeof value.minor!=='string'||!(/^-?(0|[1-9][0-9]*)$/u.test(value.minor))||value.minor==='-0'||value.minor.replace(/^-/u,'').length>48)invalid();const cents=Number(value.minor);return {currency:value.currency,amount:(cents/100).toFixed(2)};}
export function fromWire(value){return value===null?null:{currency:value.currency,minor:String(Math.round(Number(value.amount)*100))};}
export function wireChanges(changes){if(!Array.isArray(changes)||changes.length<1||changes.length>8||changes.some(c=>!c||!validId(c.id)||!Object.hasOwn(c,'value'))||new Set(changes.map(c=>c.id)).size!==changes.length)invalid();return changes.map(c=>({id:c.id,value:toWire(c.value)}));}
