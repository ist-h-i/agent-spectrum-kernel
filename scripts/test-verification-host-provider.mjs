import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trustedHostProviders } from './verification-host-provider.mjs';
function fixture(t, source) {
  const root=mkdtempSync(join(tmpdir(),'ask-host-provider-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const modulePath=join(root,'host.mjs');writeFileSync(modulePath,source);
  const expectedDigest='sha256:'+createHash('sha256').update(source).digest('hex');
  return {modulePath,expectedDigest,providerIds:['host']};
}
test('explicit pinned module is invoked freshly and its query binding preserved',async t=>{
  const f=fixture(t,`export const providers={host:async query=>({query,status:'satisfied',actor_id:null,evidence_digest:'sha256:'+ 'a'.repeat(64)})};`);
  const provider=trustedHostProviders(f).host;
  for(const phase of ['initial','confirm']){
    const query={phase,challenge:'test'};
    const result=await provider(query,{signal:new AbortController().signal});
    assert.deepEqual(result.query,query);
  }
  writeFileSync(f.modulePath,'throw new Error("changed")');
  await assert.rejects(provider({}, {signal:new AbortController().signal}), /digest mismatch/);
});
test('provider pin is mandatory; wrong pin and relative path never execute',t=>{
  const f=fixture(t,'throw new Error("must not execute")');
  assert.throws(()=>trustedHostProviders({...f,expectedDigest:'sha256:'+'0'.repeat(64)}),/digest mismatch/);
  assert.throws(()=>trustedHostProviders({...f,modulePath:'host.mjs'}),/absolute/);
});
test('provider errors, extra output and missing exports are not observations',async t=>{
  for(const source of ['throw new Error("secret")',`console.log('noise'); export const providers={host:()=>({})}`, 'export const providers={}']){
    const f=fixture(t,source);
    await assert.rejects(trustedHostProviders(f).host({}, {signal:new AbortController().signal}),/unavailable|invalid host/);
  }
});
test('abort terminates unresponsive provider',async t=>{
  const f=fixture(t,'export const providers={host:()=>new Promise(()=>{})}; setInterval(()=>{},1000);');
  const control=new AbortController();const pending=trustedHostProviders(f).host({}, {signal:control.signal});
  setTimeout(()=>control.abort(),50);
  await assert.rejects(pending,/unavailable/);
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForFile(path) {
  const deadline=Date.now()+3000;
  while(!existsSync(path)) {
    assert.ok(Date.now()<deadline,'descendant did not start');
    await delay(20);
  }
}
for(const mode of ['abort','normal-exit']) test(`owned descendant is terminated on ${mode}`, {skip:process.platform==='win32',timeout:10000},async t=>{
  const root=mkdtempSync(join(tmpdir(),'ask-host-descendant-'));
  const beat=join(root,'heartbeat'), pidFile=join(root,'pid');
  t.after(()=>{
    if(existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile,'utf8')),'SIGKILL'); } catch {} }
    rmSync(root,{recursive:true,force:true});
  });
  const childCode=`const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(beat)},'ready'); const timer=setInterval(()=>fs.appendFileSync(${JSON.stringify(beat)},'.'),20); setTimeout(()=>{clearInterval(timer);},5000);`;
  const source=`import {spawn} from 'node:child_process'; import {writeFileSync,existsSync} from 'node:fs';
export const providers={host:async query=>{
  const child=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'inherit'});
  writeFileSync(${JSON.stringify(pidFile)},String(child.pid)); child.unref();
  while(!existsSync(${JSON.stringify(beat)})) await new Promise(r=>setTimeout(r,10));
  ${mode==='abort' ? 'return new Promise(()=>{});' : "return {query,status:'satisfied',actor_id:null,evidence_digest:'sha256:'+'a'.repeat(64)};"}
}};`;
  const f=fixture(t,source), control=new AbortController(), started=Date.now();
  const pending=trustedHostProviders(f).host({phase:'initial'},{signal:control.signal});
  // Attach the rejection handler before abort, then prove the descendant really
  // started. A provider killed before spawn would not exercise group cleanup.
  const outcome=pending.then(value=>({value}),error=>({error}));
  await waitForFile(beat);
  if(mode==='abort') control.abort();
  const result=await outcome;
  if(mode==='abort') assert.match(result.error?.message??'',/unavailable/);
  else assert.equal(result.value?.status,'satisfied');
  assert.ok(Date.now()-started<2500,'inherited descendant pipes delayed provider completion');
  await delay(100);
  const before=readFileSync(beat,'utf8');
  await delay(150);
  assert.equal(readFileSync(beat,'utf8'),before,'owned descendant survived provider termination');
});
