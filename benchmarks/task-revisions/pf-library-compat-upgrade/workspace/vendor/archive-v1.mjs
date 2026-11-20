import {win32,posix} from 'node:path';
const usage=[];export function readUsage(){return structuredClone(usage)};
export function openArchive(root,platform){usage.push({method:'openArchive',root,platform});const api=platform==='win32'?win32:posix;const items=[];return {write(relativePath,text){usage.push({method:'write',relativePath,text});items.push({path:api.join(root,relativePath),bytes:Buffer.byteLength(text,'utf8')})},finish(){usage.push({method:'finish'});return {version:1,items:items.map(item=>({...item}))}}}}
