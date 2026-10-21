import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {classifyPrimarySqliteStartupLineV3,createPrimarySqliteStderrDiagnosticsV3} from './ask-primary-sqlite-startup-diagnostics-v3.mjs';
const secret='SECRET_PATH_AUTH_ERROR_SENTINEL';
const hash=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
const refs={default_home_digest:hash('/private/'+secret),declared_output_parent:'/declared/task'};
const fatal=p=>`Error: failed to initialize sqlite state runtime under ${p}: failed to initialize state runtime at ${p}`;
test('D1 canonical repeated home gives a text class only',()=>{
 const result=classifyPrimarySqliteStartupLineV3(fatal('/private/'+secret),refs);
 assert.equal(result.reported_sqlite_home_text_class,'default_codex_home_text');
 assert.equal(result.db_role,'unknown');assert.equal(result.phase,'unknown');assert.equal(result.cause,'not_reported');
 assert.ok(!JSON.stringify(result).includes(secret));
});
for(const [path,expected]of [['/declared/task','within_declared_output_parent_text'],['/declared/task/db','within_declared_output_parent_text'],['/declared/tasks/db','other_absolute_text'],['/else/space user/日本語','other_absolute_text'],['/tmp/db','other_absolute_text']])test('D1 lexical segment relation '+path,()=>{
 const result=classifyPrimarySqliteStartupLineV3(fatal(path),refs);assert.equal(result.reported_sqlite_home_text_class,expected);assert.equal(result.db_role,'unknown');
});
for(const [name,line]of Object.entries({mismatch:fatal('/private/'+secret).replace('at /private/','at /other/'),relative:fatal('relative/home'),dot:fatal('/declared/task/../db'),double_slash:fatal('/declared//task'),colon:fatal('/path:marker'),wrapper:fatal('/private/failed to initialize state runtime at x'),trailing:fatal('/private/'+secret)+' suffix',inner_role:`Error: failed to initialize sqlite state runtime under /private/${secret}: failed to migrate state DB at /private/${secret}/state_5.sqlite: ${secret}`,ansi:fatal('/private/'+secret)+'\u001b[0m',control:fatal('/private/'+secret)+'\t',extra_error:fatal('/private/'+secret)+' (os error 13)'}))test('D1 unknown or rejected ambiguous '+name,()=>{
 const result=classifyPrimarySqliteStartupLineV3(line,refs);assert.ok(!JSON.stringify(result).includes(secret));
 assert.ok(result.reported_sqlite_home_text_class===undefined||result.reported_sqlite_home_text_class==='unknown');assert.notEqual(result.phase,'migrate');
});
const warning='WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)\n';
for(const step of [1,2,7,4096])test('D2 bounded chunks preserve fatal diagnosis '+step,()=>{
 const parser=createPrimarySqliteStderrDiagnosticsV3(refs),raw=Buffer.from(warning+fatal('/private/'+secret)+'\n');let reason;
 for(let at=0;at<raw.length;at+=step)reason=parser.push(raw.subarray(at,at+step));
 assert.equal(reason,'stderr_startup_error');const result=parser.summary();assert.equal(result.records[1].reported_sqlite_home_text_class,'default_codex_home_text');
 assert.equal(result.policy,'closed_sqlite_location_diagnostics_v3');assert.equal(result.reported_path_hashes_exported,false);assert.equal(result.reported_path_lengths_exported,false);
 for(const bad of [secret,hash('/private/'+secret),'/private/',fatal('/private/'+secret)])assert.ok(!JSON.stringify(result).includes(bad));
});
for(const [name,raw,reason]of [
 ['BOM',Buffer.from('\ufeff'+warning),'stderr_unknown'],['invalid UTF8',Buffer.from([0xff,10]),'stderr_invalid_encoding'],
 ['ANSI',Buffer.from('\u001b[31m'+warning),'stderr_unknown'],['oversize',Buffer.from('x'.repeat(4097)+'\n'),'stderr_limit'],
 ['repeat',Buffer.from(warning+warning),'stderr_known_warning_repeat'],['recovery',Buffer.from('WARNING: Codex local database at /'+secret+' appears damaged. Moving it into a backup folder so the app server can rebuild it from saved data.\n'),'stderr_unknown'],
])test('D2 fail closed '+name,()=>{const parser=createPrimarySqliteStderrDiagnosticsV3(refs);assert.equal(parser.push(raw),reason);assert.ok(!JSON.stringify(parser.summary()).includes(secret));});
test('D2 truncated lines cannot become partial positive classification',()=>{const p=createPrimarySqliteStderrDiagnosticsV3(refs);assert.equal(p.push(Buffer.from(fatal('/private/'+secret))),null);assert.equal(p.finish(),'stderr_unterminated');assert.equal(p.summary().records[0].kind,'unknown');});
for(const invalid of [{...refs,allow:true},{default_home_digest:'x',declared_output_parent:'/a'},{...refs,declared_output_parent:'/a/../b'},{...refs,declared_output_parent:'relative'},null])test('D1 reference shape rejected '+JSON.stringify(invalid),()=>assert.throws(()=>createPrimarySqliteStderrDiagnosticsV3(invalid)));

import {EventEmitter}from'node:events';import{PassThrough,Writable}from'node:stream';
import{mkdtempSync,realpathSync,rmSync,writeFileSync,existsSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{collectPrimarySqliteCatalogProtocolV3,CATALOG_REQUESTS}from'./ask-primary-protocol-catalog-probe.mjs';
import{runPrimarySqliteCatalogProbeV3}from'./ask-primary-sqlite-catalog-probe-v3.mjs';
function fake(onRequest=()=>{},stderr=''){
 const writes=[];let active;const spawn=()=>{const c=new EventEmitter();active=c;Object.assign(c,{pid:43219,exitCode:null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough(),unref(){}});
 const close=(code,signal)=>{if(c.exitCode!==null||c.signalCode!==null)return;c.exitCode=code;c.signalCode=signal;c.stdout.end();c.stderr.end();c.emit('exit',code,signal);c.emit('close',code,signal);};
 c.kill=signal=>{close(null,signal);return true;};let pending='';c.stdin=new Writable({write(chunk,encoding,done){pending+=chunk.toString();while(pending.includes('\n')){const e=pending.indexOf('\n'),q=JSON.parse(pending.slice(0,e));pending=pending.slice(e+1);writes.push(q);queueMicrotask(()=>onRequest(q,c));}done();},final(done){queueMicrotask(()=>close(0,null));done();}});
 queueMicrotask(()=>{c.emit('spawn');if(stderr)c.stderr.write(stderr);});return c;};
 const signalProcess=(pid,signal)=>{if(!active||active.exitCode!==null||active.signalCode!==null)throw Object.assign(new Error(secret),{code:'ESRCH'});if(signal!==0)active.kill(signal);};return{spawn,writes,signalProcess};
}
const invocation={executable:'/synthetic/node',argv:['/synthetic/codex.js','app-server','--listen','stdio://'],cwd:'/synthetic/workspace'};
const init={id:1,result:{codexHome:'/private/'+secret,userAgent:secret,platformOs:'macos',platformFamily:'unix'}};
const catalog={id:2,result:{data:[],nextCursor:null}};
const emit=(c,v)=>c.stdout.write(JSON.stringify(v)+'\n');
const collect=f=>collectPrimarySqliteCatalogProtocolV3(invocation,refs,{spawnProcess:f.spawn,runtime:{platform:'darwin',signalProcess:f.signalProcess},timeoutMs:1000});
test('D3 known fatal stops after initialize; no path/raw/length/model authority',async()=>{
 const f=fake((q,c)=>{if(q.id===1)c.stderr.write(fatal('/private/'+secret)+'\n');}),r=await collect(f);assert.equal(r.kind,'ask_primary_catalog_observation_v3');assert.equal(r.reason,'stderr_startup_error');assert.equal(r.status,'unavailable');assert.equal(r.termination,'confirmed');
 assert.deepEqual(f.writes,[CATALOG_REQUESTS[0]]);assert.equal(r.stderr_diagnostics.records[0].reported_sqlite_home_text_class,'default_codex_home_text');
 assert.equal(r.stdout_lines,0);assert.ok(!Object.hasOwn(r,'stdout_reply_lines'));assert.ok(!Object.hasOwn(r,'output_bytes'));assert.ok(!Object.hasOwn(r,'output_lines'));assert.ok(!JSON.stringify(r).includes(secret));assert.ok(!JSON.stringify(r).includes(refs.default_home_digest));assert.equal(r.model_calls,0);assert.equal(r.scoring_authority,false);assert.equal(r.runtime_attestation,'unknown');
});
test('D3 catalog success still gives no startup/cwd/edit/scoring acceptance',async()=>{
 const f=fake((q,c)=>{if(q.id===1)emit(c,init);if(q.id===2)emit(c,catalog);},warning),r=await collect(f);
 assert.equal(r.status,'observed');assert.deepEqual(f.writes,CATALOG_REQUESTS);assert.equal(r.model_calls,0);assert.equal(r.runtime_attestation,'unknown');assert.equal(r.scoring_authority,false);
});
for(const [name,value]of Object.entries({auth:{id:8,method:'account/login/start',params:{secret}},model:{id:8,method:'turn/start',params:{secret}},config:{id:8,method:'config/read',params:{}},unknown:{method:'unknown',params:{secret}}}))test('D3 reject '+name,async()=>{
 const f=fake((q,c)=>{if(q.id===1)emit(c,value);}),r=await collect(f);assert.equal(r.status,'unavailable');assert.equal(f.writes.length,1);assert.ok(!JSON.stringify(r).includes(secret));
});
test('D3 fatal after catalog invalidates settings and retains diagnosis',async()=>{
 const f=fake((q,c)=>{if(q.id===1)emit(c,init);if(q.id===2){emit(c,catalog);c.stderr.write(fatal('/private/'+secret)+'\n');}}),r=await collect(f);
 assert.equal(r.status,'unavailable');assert.ok(r.settings.every(v=>v.status==='not_observed'));assert.equal(r.stderr_diagnostics.records[0].reported_sqlite_home_text_class,'default_codex_home_text');
});
test('D4 old or changed-output plan refuses before process/persistence',async t=>{
 const area=realpathSync(mkdtempSync(join(tmpdir(),'ask-sqlite-v3-plan-')));t.after(()=>rmSync(area,{recursive:true,force:true}));
 for(const plan of [{kind:'ask_primary_catalog_probe_plan_v2'},{kind:'ask_primary_catalog_probe_plan_v3',output_root:join(area,'other')}]){
  const path=join(area,'plan.json'),raw=JSON.stringify(plan);writeFileSync(path,raw);
  await assert.rejects(()=>runPrimarySqliteCatalogProbeV3(path,join(area,'output'),hash(raw)));assert.equal(existsSync(join(area,'output')),false);
 }
});

test('D3 failure before input channel ready sends zero RPCs and is not retried',async()=>{
 const f=fake(()=>{},fatal('/private/'+secret)+'\n'),r=await collect(f);assert.equal(r.status,'unavailable');assert.equal(f.writes.length,0);assert.deepEqual(r.sent,[]);assert.equal(r.termination,'confirmed');
});
