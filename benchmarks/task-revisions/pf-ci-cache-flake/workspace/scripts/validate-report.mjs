import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const schema=JSON.parse(readFileSync(new URL('../investigation.schema.json',import.meta.url),'utf8'));
export function validateReport(report) {
 const fail=path=>{throw new Error('Invalid report structure at '+path)};
 const check=(value,rule,path)=>{
  if(rule.enum&&!rule.enum.some(expected=>Object.is(expected,value)))fail(path);
  if(rule.type){const types=Array.isArray(rule.type)?rule.type:[rule.type];
   const matches=type=>type==='null'?value===null:type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):type==='array'?Array.isArray(value):type==='integer'?Number.isSafeInteger(value):typeof value===type;
   if(!types.some(matches))fail(path);
  }
  if(typeof value==='number'&&(!Number.isFinite(value)||(rule.minimum!==undefined&&value<rule.minimum)))fail(path);
  if(typeof value==='string'&&rule.minLength!==undefined&&value.trim().length<rule.minLength)fail(path);
  if(Array.isArray(value)){
   if(value.length<(rule.minItems??0)||value.length>(rule.maxItems??Infinity))fail(path);
   value.forEach((item,index)=>check(item,rule.items,path+'['+index+']'));
  }else if(value!==null&&typeof value==='object'){
   for(const key of rule.required??[])if(!Object.hasOwn(value,key))fail(path+'.'+key);
   for(const [key,item]of Object.entries(value)){
    if(!Object.hasOwn(rule.properties??{},key)){if(rule.additionalProperties===false)fail(path+'.'+key)}
    else check(item,rule.properties[key],path+'.'+key);
   }
  }
 };
 check(report,schema,'investigation');return true;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 validateReport(JSON.parse(readFileSync('investigation.json','utf8')));
 console.log('Report structure accepted; causal meaning and command execution require separate evidence');
}
