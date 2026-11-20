import {readFileSync} from 'node:fs';
import {responseFromFault as before} from '../base/response-adapter.mjs';
import {responseFromFault as after} from '../src/response-adapter.mjs';
import {consumeError} from '../src/client-policy.mjs';
const cases=JSON.parse(readFileSync(new URL('../data/cases.json',import.meta.url),'utf8'));
export const trace=cases.map(({case_id,fault,request})=>{const old=before(fault),current=after(fault);return {case_id,before:{response:old,client:consumeError(old,request)},after:{response:current,client:consumeError(current,request)}}});
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)console.log(JSON.stringify(trace,null,2));
