// Public-catalog selection, not a grader or an answer reader. Inputs describe
// observed cost and changed instruction coverage; people approve the result.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalDigest,readJsonFileStrict,writeCanonicalJsonNoReplace,readStableBytes } from './content-addressed-store.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
export function selectInstructionLoopCases({catalog,changedTags=[],observedCosts={},limit}){
  assert.ok(Number.isSafeInteger(limit)&&limit>0&&limit<=catalog.length);
  const candidates=catalog.map(c=>{assert.ok(c.id&&Array.isArray(c.tags)&&typeof c.domain==='string');return {...c};});
  const result=[],covered=new Set(),domains=new Set();
  while(result.length<limit){
    const score=c=>{
      const relevant=c.tags.filter(tag=>changedTags.includes(tag));
      const fresh=relevant.filter(tag=>!covered.has(tag)).length;
      const cost=observedCosts[c.id]??0;assert.ok(Number.isFinite(cost)&&cost>=0);
      return fresh*100+(domains.has(c.domain)?0:30)+relevant.length*5+Math.log1p(cost);
    };
    candidates.sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
    const c=candidates.shift();result.push(c);domains.add(c.domain);for(const tag of c.tags)covered.add(tag);
  }
  return {case_ids:result.map(c=>c.id),reason:'Public changed-instruction coverage, domain diversity and prior observed cost; not holdout selection.',
    selection_kind:'public_cost_coverage_v1',holdout_claimed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [settingsFile,settingsDigest,request,result]=process.argv.slice(2);
  assert.equal(instructionBytesDigest(readStableBytes(settingsFile,'host selection settings')),settingsDigest);
  const settings=readJsonFileStrict(settingsFile),job=readJsonFileStrict(request);assert.equal(job.kind,'select');
  const output=selectInstructionLoopCases({...settings,catalog:job.input.catalog});
  writeCanonicalJsonNoReplace({outputPath:result,artifact:{request_digest:canonicalDigest(job),status:'completed',output},label:'public case selection result'});
}
