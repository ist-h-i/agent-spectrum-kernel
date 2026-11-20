import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(process.argv[2]??'review.json','utf8')),schema=JSON.parse(readFileSync(new URL('../review.schema.json',import.meta.url),'utf8'));
function validate(value,s,path='$'){
 if(s.enum&&!s.enum.includes(value))throw new Error(path+' enum');
 const types=Array.isArray(s.type)?s.type:[s.type];const actual=value===null?'null':Array.isArray(value)?'array':typeof value;
 if(s.type&&!types.some(type=>type===actual||type==='integer'&&Number.isInteger(value)))throw new Error(path+' type');
 if(typeof value==='string'&&s.minLength!==undefined&&value.length<s.minLength)throw new Error(path+' empty');
 if(Number.isInteger(value)&&s.minimum!==undefined&&value<s.minimum)throw new Error(path+' minimum');
 if(Array.isArray(value)){if(s.uniqueItems&&new Set(value.map(item=>JSON.stringify(item))).size!==value.length)throw new Error(path+' duplicates');if(s.minItems!==undefined&&value.length<s.minItems)throw new Error(path+' items');for(const [index,item]of value.entries())validate(item,s.items,path+'['+index+']')}
 if(value!==null&&typeof value==='object'&&!Array.isArray(value)){for(const key of s.required??[])if(!Object.hasOwn(value,key))throw new Error(path+'.'+key+' missing');for(const [key,item]of Object.entries(value)){const child=Object.hasOwn(s.properties??{},key)?s.properties[key]:(typeof s.additionalProperties==='object'?s.additionalProperties:null);if(!child&&s.additionalProperties===false)throw new Error(path+'.'+key+' extra');if(child)validate(item,child,path+'.'+key)}}
}
validate(report,schema);if(report.verification.state==='passed'&&[...report.verification.commands].sort().join('\0')!==['npm test','npm run trace','npm run validate:review'].sort().join('\0'))throw new Error('passed declaration requires all commands');console.log(JSON.stringify({shape:'valid',semantic_correctness:'not_assessed',finding_count:report.findings.length}));
