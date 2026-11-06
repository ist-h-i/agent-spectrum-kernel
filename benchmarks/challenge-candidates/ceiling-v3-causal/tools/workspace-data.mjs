// Pure data identity and regular-file inventory. Same canonical digest contract
// as ASK's materializer; no target implementation is imported or executed.
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function stableCanonicalJson(value){
  if(Array.isArray(value))return '['+value.map(stableCanonicalJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableCanonicalJson(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const canonicalDigest=value=>'sha256:'+sha256(stableCanonicalJson(value));
export const isSubmission=path=>path.startsWith('src/')||path.startsWith('test/added/')||path==='RESULT.md';
export function noLinks(path){
  for(let current=resolve(path);;current=dirname(current)){
    if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw Error('symlink path: '+current);
    if(dirname(current)===current)break;
  }
}
export function inventory(directory){
  directory=resolve(directory);noLinks(directory);const result=[];
  const walk=path=>{
    for(const name of readdirSync(path).sort()){
      const full=resolve(path,name),stat=lstatSync(full);
      if(stat.isSymbolicLink())throw Error('symlink entry: '+name);
      if(stat.isDirectory())walk(full);
      else if(stat.isFile()&&stat.nlink===1){const bytes=readFileSync(full);result.push({path:relative(directory,full).split(sep).join('/'),sha256:sha256(bytes),bytes:bytes.length});}
      else throw Error('not an independent regular file: '+name);
    }
  };walk(directory);return result;
}
