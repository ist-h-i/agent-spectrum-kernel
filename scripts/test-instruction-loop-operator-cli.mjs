import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {componentLoopFixture} from './test-helpers-instruction-loop-component.mjs';
const cli=join(import.meta.dirname,'supervised-instruction-loop-cli.mjs');
function invoke(args){const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
test('operator CLI configures and advances the connected real local lifecycle through its exact two judgments',t=>{
  const f=componentLoopFixture(t),configured=invoke(['configure','--root',join(f.workspaceRoot,'configuration'),'--profile',f.profilePath]);
  assert.equal(configured.models_started,false);assert.equal(configured.owner_mutated,false);
  const root=join(f.workspaceRoot,'operation'),args=['operate','--root',root,'--profile',f.profilePath,'--config',configured.config_path,'--cycles','1'];
  let s=invoke(args);assert.equal(s.status,'awaiting_evaluation_approval');const before=readRunJournal(root).previous;
  assert.equal(invoke(['operation-status','--root',root]).pending_packet_digest,s.pending_packet_digest);assert.equal(readRunJournal(root).previous,before,'status does not write a journal');
  const approve=s=>[...args,'--decision','approved','--packet',s.pending_packet_digest,'--reason','Synthetic exact CLI judgment.'];
  assert.equal(s.pending_packet_digest,canonicalDigest(s.pending_gate));s=invoke(approve(s));assert.equal(s.status,'awaiting_change_approval');
  s=invoke(approve(s));assert.equal(s.operation_status,'completed');assert.equal(s.final.outcome,'applied');
  assert.equal(readFileSync(join(f.target,'.agents/skills/new-local/SKILL.md'),'utf8'),'Check the actual boundary.\n');
  s=invoke([...args,'--request-restore']);assert.equal(s.status,'awaiting_change_approval');s=invoke(approve(s));assert.equal(s.final.outcome,'restored');
});
test('operator CLI no-op is repeatable without another generation or a fabricated case gate',t=>{
  const f=componentLoopFixture(t);f.profile.candidate.authoring.provider.response={changes:[]};writeFileSync(f.profilePath,JSON.stringify(f.profile));
  const configured=invoke(['configure','--root',join(f.workspaceRoot,'configuration'),'--profile',f.profilePath]),root=join(f.workspaceRoot,'operation');
  const args=['operate','--root',root,'--profile',f.profilePath,'--config',configured.config_path,'--cycles','3'];
  let s=invoke(args);assert.equal(s.final.outcome,'no_change');assert.equal(s.pending_gate,null);const before=readRunJournal(root).previous;
  s=invoke(args);assert.equal(s.final.outcome,'no_change');assert.equal(readRunJournal(root).previous,before);
});
