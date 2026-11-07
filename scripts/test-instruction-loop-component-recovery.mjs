import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest,listContentAddressedJson} from './content-addressed-store.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
const approve=s=>({disposition:'approved',packet_digest:canonicalDigest(s.pending_gate),reason:'Synthetic recovery case/change decision.'});
test('lost final stage receipts recover from exact owned evidence without repeating generation or owner writes',async t=>{
  const f=componentLoopFixture(t),calls=[],lost=new Set();
  for(const kind of ['generate','register','select','plan','apply','version','cleanup','restore']){
    const original=f.runtime[kind];f.runtime[kind]=async(job,context)=>{
      calls.push({kind,key:job.key});const result=await original(job,context),id=kind+':'+job.key;
      if(!lost.has(id)){
        lost.add(id);unlinkSync(join(f.profile.stateRoot,'stages',canonicalDigest(job).slice(7),'result.json'));
        throw new Error('Synthetic loss after known completion, before coordinator consumption.');
      }
      return result;
    };
  }
  const drain=async s=>{for(let i=0;s.status==='operation_uncertain'&&i<16;i++)s=await f.run();assert.notEqual(s.status,'operation_uncertain',JSON.stringify(readRunJournal(f.root).events.at(-1).detail));return s;};
  let s=await drain(await f.run());assert.equal(s.status,'awaiting_evaluation_approval');
  s=await drain(await f.run({decision:approve(s)}));assert.equal(s.status,'awaiting_change_approval');
  s=await f.run({decision:approve(s)});assert.equal(s.status,'operation_uncertain');assert.equal(s.active_job.kind,'apply');
  const marker=join(f.target,'.agent-spectrum-kernel/personal-prompt-target-state.json.operation.json');writeFileSync(marker,'{"unverified":"pending owner state"}');
  s=await f.run();assert.equal(s.status,'operation_uncertain');assert.equal(existsSync(marker),true);unlinkSync(marker);
  const file=join(f.target,'.agents/skills/new-local/SKILL.md'),approved=readFileSync(file);
  writeFileSync(file,'Local owner edit after application.\n');s=await f.run();assert.equal(s.status,'operation_uncertain');
  assert.equal(readFileSync(file,'utf8'),'Local owner edit after application.\n');assert.equal(calls.filter(c=>c.kind==='apply').length,1);
  writeFileSync(file,approved);s=await drain(await f.run());assert.equal(s.final.outcome,'applied');
  s=await f.run({requestRestore:true});s=await drain(await f.run({decision:approve(s)}));assert.equal(s.final.outcome,'restored');
  assert.equal(calls.filter(c=>c.kind==='generate').length,1);assert.equal(calls.filter(c=>c.kind==='apply').length,1);assert.equal(calls.filter(c=>c.kind==='restore').length,1);
  const history=listContentAddressedJson({storeRoot:join(f.target,'.agent-spectrum-kernel/environment-operation-history')}).map(e=>e.value);
  assert.equal(history.filter(e=>e.phase==='applied').length,1);assert.equal(history.filter(e=>e.phase==='restored').length,1);
  assert.equal(readFileSync(file,'utf8'),'New root Skill.\n');
});
