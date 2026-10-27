const scales={USD:2,JPY:0};
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function fromV1(value){
 if(value===null)return null;
 if(!fields(value,['price','currency'])||!Object.hasOwn(scales,value.currency)||typeof value.price!=='string'||!/^(0|[1-9][0-9]*)(\.[0-9]+)?(?![\s\S])/u.test(value.price))throw Error('INVALID_MONEY');
 const [whole,fraction='']=value.price.split('.'),scale=scales[value.currency];
 return {amountMinor:String(Math.round(Number(value.price)*10**scale)),currency:value.currency,taxMode:'included'};
}
export function validV2(value){return value===null||!!(fields(value,['amountMinor','currency','taxMode'])&&Object.hasOwn(scales,value.currency)&&typeof value.amountMinor==='string'&&/^(0|[1-9][0-9]*)(?![\s\S])/u.test(value.amountMinor)&&['included','excluded'].includes(value.taxMode));}
export function toV1(value){if(value===null)return null;if(!validV2(value)||value.taxMode!=='included')throw Error('UNREPRESENTABLE');const scale=scales[value.currency],n=BigInt(value.amountMinor),power=10n**BigInt(scale);return {price:String(n/power)+(scale?'.'+String(n%power).padStart(scale,'0'):''),currency:value.currency};}
export const same=(a,b)=>a===null||b===null?a===b:a.amountMinor===b.amountMinor&&a.currency===b.currency&&a.taxMode===b.taxMode;
