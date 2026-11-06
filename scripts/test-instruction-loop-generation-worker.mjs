import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {instructionBytesDigest} from './instruction-environment.mjs';
test('generation worker invokes the existing prepared Codex connector instead of just prepare/import',async t=>{
  const handle={},calls=[];
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-generation-loop-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const staging=join(root,'candidate');mkdirSync(staging);writeFileSync(join(staging,'SKILL.md'),'Fixture only.');
  t.mock.module('./ask-personal-evolution-codex-generation.mjs',{namedExports:{
    inspectPreparedPersonalEvolutionCodexGenerationFile:(path,digest)=>{calls.push(['prepare',path,digest]);return {handle,cwd:join(root,'session'),request_object_digest:'request',preparation_digest:'preparation'};},
    startPreparedPersonalEvolutionCodexGeneration:async(h,confirmation)=>{
      assert.equal(h,handle);assert.deepEqual(confirmation,{confirmedRequestObjectDigest:'request',confirmedPreparationDigest:'preparation'});
      calls.push(['start']);return {status:'candidate_ready',execution_receipt_object_digest:'receipt',receipt:{candidate_asset:{version:'fixture'},files:[{path:'SKILL.md',raw_digest:instructionBytesDigest(Buffer.from('Fixture only.'))}]},imported:{},execution:{fake:true}};
    }
  }});
  const {generateInstructionLoopCandidate}=await import('./instruction-loop-generation-worker.mjs');
  const result=await generateInstructionLoopCandidate({contextPath:'/fixture/context',contextDigest:'fixture-digest',job:{kind:'generate'}});
  assert.deepEqual(calls,[['prepare','/fixture/context','fixture-digest'],['start']]);assert.equal(result.formal_admission_implied,false);
  assert.equal(result.owned_staging,staging);assert.ok(existsSync(join(staging,'owned-files.json')));
});
