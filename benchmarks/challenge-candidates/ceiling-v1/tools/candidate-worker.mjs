// Public execution adapter. Inputs only; grading expectations stay outside.
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeData, safeStringify } from './safe-json.mjs';
const root = process.cwd(), program = JSON.parse(readFileSync(0, 'utf8'));
const modules = new Map(), refs = new Map(), observations = Object.create(null);
const get = Function.call.bind(Map.prototype.get), set = Function.call.bind(Map.prototype.set), has = Function.call.bind(Map.prototype.has);
const own = Object.hasOwn, entries = Object.entries, isArray = Array.isArray, ArrayType = Array;
const define = Object.defineProperty, create = Object.create, objectPrototype = Object.prototype;
const apply = Reflect.apply, construct = Reflect.construct, stringifyValue = String;
const resolvePath = resolve, toUrl = pathToFileURL, separator = sep;
const trustedError = Error, invalidPrograms = new WeakSet();
const isInvalidProgram = invalidPrograms.has.bind(invalidPrograms), addInvalidProgram = invalidPrograms.add.bind(invalidPrograms);
const writeOutput = process.stdout.write.bind(process.stdout), transportNonce = program.transportNonce ?? null;
const exit = process.exit.bind(process);
function send(fields) { define(fields,'transportNonce',{value:transportNonce,enumerable:true});writeOutput(safeStringify(fields)+'\n'); }
function programError(message) { const error = new trustedError(message);addInvalidProgram(error);return error; }
function scan(value) {
 if(!value||typeof value!=='object')return;
 if(typeof value.module==='string')set(modules,value.module,null);
 const children=entries(value);for(let index=0;index<children.length;index++)scan(children[index][1]);
}
scan(program);
const names=[...modules.keys()];
try {
 for(let index=0;index<names.length;index++){
  const name=names[index],path=resolvePath(root,name);
  if(!path.startsWith(root+separator)||!name.endsWith('.mjs'))throw programError('module outside workspace');
  set(modules,name,await import(toUrl(path).href));
 }
}catch(error){send({status:isInvalidProgram(error)?'evaluator_input_error':'candidate_load_error',error:{name:error?.name??null,code:error?.code??null}});exit(0)}
function arrayOf(length){return new ArrayType(length)}
function put(target,key,value){define(target,key,{value,writable:true,enumerable:true,configurable:true})}
function pathValue(value,path=[]){for(let index=0;index<path.length;index++)value=value?.[path[index]];return value}
function value(input,args=[]){
 if(!input||typeof input!=='object')return input;
 if(own(input,'$ref')){if(!has(refs,input.$ref))throw programError('unknown ref');return pathValue(get(refs,input.$ref),input.path)}
 if(own(input,'$arg'))return pathValue(args[input.$arg],input.path);
 if(own(input,'$callback'))return (...callbackArgs)=>{const list=input.$callback;for(let index=0;index<list.length;index++)executeSync(list[index],callbackArgs)};
 if(isArray(input)){const out=arrayOf(input.length);for(let index=0;index<input.length;index++)put(out,index,value(input[index],args));return out}
 const out=create(objectPrototype),fields=entries(input);for(let index=0;index<fields.length;index++)put(out,fields[index][0],value(fields[index][1],args));return out;
}
function raw(step,args){
 const inputs=()=>{const list=own(step,'args')?step.args:[],out=arrayOf(list.length);for(let index=0;index<list.length;index++)put(out,index,value(list[index],args));return out};
 if(step.op==='construct')return construct(get(modules,step.module)[step.export],inputs());
 if(step.op==='invoke')return apply(get(modules,step.module)[step.export],undefined,inputs());
 if(step.op==='call'){const target=get(refs,step.target);return apply(target[step.method],target,inputs())}
 if(step.op==='get')return pathValue(get(refs,step.target),step.path);
 if(step.op==='await')return get(refs,step.target);
 if(step.op==='record'){
  const next=safeData(value(step.value,args));if(!step.append)return next;
  const prior=get(refs,step.as)??[];if(!isArray(prior))throw programError('append target must be an array');
  const out=arrayOf(prior.length+1);for(let index=0;index<prior.length;index++)put(out,index,prior[index]);put(out,prior.length,next);return out;
 }
 throw programError('unknown operation');
}
function store(step,result){if(own(step,'as')&&step.as){set(refs,step.as,result);put(observations,step.as,safeData(result))}}
function errorResult(error){return {error:{name:error?.name??null,code:error?.code??null,message:error?.message??stringifyValue(error)}}}
function executeSync(step,args=[]){try{store(step,raw(step,args))}catch(error){if(!own(step,'catch')||!step.catch)throw error;store(step,errorResult(error))}}
try{
 for(let index=0;index<program.steps.length;index++){
  const step=program.steps[index];try{const result=raw(step,[]);store(step,own(step,'await')&&step.await===false?result:await result)}catch(error){if(!own(step,'catch')||!step.catch)throw error;store(step,errorResult(error))}
 }
 send({status:'completed',observations});
}catch(error){send({status:isInvalidProgram(error)?'evaluator_input_error':'candidate_error',error:errorResult(error),observations})}
