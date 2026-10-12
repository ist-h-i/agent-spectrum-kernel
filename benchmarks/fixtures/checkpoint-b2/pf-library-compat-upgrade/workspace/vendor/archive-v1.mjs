import {win32,posix} from 'node:path';
export function openArchive(root,platform){const api=platform==='win32'?win32:posix;const items=[];return {write(relativePath,text){items.push({path:api.join(root,relativePath),bytes:Buffer.byteLength(text,'utf8')})},finish(){return {version:1,items:items.map(item=>({...item}))}}}}
