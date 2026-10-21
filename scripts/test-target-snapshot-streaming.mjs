import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { captureApplyTree, captureApplyTarget } from './ask-setup-apply-state.mjs';
const MiB=1024*1024, rootModule=new URL('./ask-setup-apply-state.mjs',import.meta.url).href;
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'ask-streaming-snapshot-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function sparse(root,path,size){const p=join(root,path);fs.mkdirSync(join(p,'..'),{recursive:true});const fd=fs.openSync(p,'wx');try{fs.ftruncateSync(fd,size);}finally{fs.closeSync(fd);}}
function zeroHash(bytes){const hash=createHash('sha256'),chunk=Buffer.alloc(65536);for(let n=0;n<bytes;n+=chunk.length)hash.update(chunk.subarray(0,Math.min(chunk.length,bytes-n)));return hash.digest('hex');}
function child(root,body){const script=`import fs from 'node:fs';import assert from 'node:assert/strict';import {syncBuiltinESMExports} from 'node:module';import {captureApplyTree} from ${JSON.stringify(rootModule)};const root=${JSON.stringify(root)};${body}`;const p=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});assert.equal(p.status,0,p.stderr||p.error?.message);return JSON.parse(p.stdout);}
test('full-tree hashing supports >512MiB without excluding ignored output/reports/dependencies',t=>{
 const root=fixture(t),size=60*MiB;for(let n=0;n<9;n++)sparse(root,`${['output','reports','node_modules'][n%3]}/part-${n}.bin`,size);
 fs.writeFileSync(join(root,'.gitignore'),'output/\nreports/\nnode_modules/\n');
 const git=(...args)=>{const p=spawnSync('git',['--no-optional-locks','-C',root,...args],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);return p.stdout;};
 git('init','--quiet');git('add','.gitignore');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','-m','owned streaming fixture');
 git('check-ignore','--quiet','node_modules/part-2.bin');assert.equal(git('status','--porcelain'),'');
 const before=captureApplyTarget(root),files=before.entries.filter(x=>x.path.endsWith('.bin'));
 assert.equal(files.length,9);assert.equal(new Set(files.map(x=>x.sha256)).size,1);assert.equal(files[0].sha256,zeroHash(size));
 const p=join(root,'node_modules/part-2.bin'),fd=fs.openSync(p,'r+');try{fs.writeSync(fd,Buffer.from([1]),0,1,size-1);}finally{fs.closeSync(fd);}
 assert.equal(git('status','--porcelain'),'');const after=captureApplyTarget(root);assert.deepEqual(after.binding.git,before.binding.git);assert.notEqual(after.binding.digest,before.binding.digest);assert.notEqual(after.entries.find(x=>x.path==='node_modules/part-2.bin').sha256,files.find(x=>x.path==='node_modules/part-2.bin').sha256);
});
test('ordinary byte reads are streaming, exactly hashed and never buffered wholesale',t=>{
 const root=fixture(t);for(const size of [0,65536,65537,3*MiB+17])sparse(root,`data-${size}`,size);
 const result=child(root,`let largest=0,calls=0;const read=fs.readSync;fs.readSync=(fd,b,o,l,p)=>{largest=Math.max(largest,l,b.length);calls++;return read(fd,b,o,l,p);};fs.readFileSync=()=>{throw Error('whole-file read forbidden');};syncBuiltinESMExports();const entries=captureApplyTree(root);console.log(JSON.stringify({entries,largest,calls}));`);
 assert.ok(result.calls>4);assert.ok(result.largest<=65536,`read allocation/request ${result.largest}`);for(const e of result.entries)assert.equal(e.sha256,zeroHash(Number(e.path.slice(5))));
});
test('aggregate and per-file budgets refuse during metadata scan without ordinary reads',t=>{
 const huge=fixture(t);for(let n=0;n<129;n++)sparse(huge,`part-${n}`,64*MiB);
 const one=fixture(t);sparse(one,'oversized',64*MiB+1);
 for(const root of [huge,one]){const result=child(root,`let reads=0;fs.readSync=()=>{reads++;throw Error('data read after known oversize');};fs.readFileSync=()=>{reads++;throw Error('buffered read after known oversize');};syncBuiltinESMExports();let code=null;try{captureApplyTree(root);}catch(e){code=e.code;}assert.ok(['target_snapshot_limit','unsafe_or_oversized_file'].includes(code));assert.equal(reads,0);console.log(JSON.stringify({code,reads}));`);assert.equal(result.reads,0);}
});
test('entry bound closes bounded directory iterator without hashing a partial tree',t=>{
 const root=fixture(t);const result=child(root,`let n=0,closed=0,reads=0;const stat=fs.lstatSync(root);fs.opendirSync=()=>({readSync:()=>n++<100001?{name:'entry-'+n}:null,closeSync:()=>{closed++;}});fs.lstatSync=()=>({...stat,size:0,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false});fs.readSync=()=>{reads++;throw Error('ordinary read');};fs.readFileSync=()=>{reads++;throw Error('buffered read');};syncBuiltinESMExports();assert.throws(()=>captureApplyTree(root),e=>e.code==='target_snapshot_limit');assert.equal(closed,1);assert.equal(reads,0);console.log(JSON.stringify({closed,reads}));`);assert.equal(result.closed,1);
});
test('streaming refuses truncation/growth/replacement/mode/time drift and closes descriptors',async t=>{
 for(const kind of ['truncate','grow','replace','mode','time'])await t.test(kind,()=>{
  const root=fixture(t);sparse(root,'file',3*MiB);const result=child(root,`const path=root+'/file',read=fs.readSync,close=fs.closeSync;let fired=false,opened=0,closed=0;const open=fs.openSync;fs.openSync=(...a)=>{opened++;return open(...a);};fs.closeSync=(...a)=>{closed++;return close(...a);};fs.readSync=(...a)=>{const r=read(...a);if(!fired){fired=true;switch(${JSON.stringify(kind)}){case 'truncate':fs.truncateSync(path,1);break;case 'grow':fs.appendFileSync(path,'x');break;case 'replace':fs.renameSync(path,path+'.old');fs.writeFileSync(path,'replacement');break;case 'mode':fs.chmodSync(path,0o600);break;case 'time':fs.utimesSync(path,100,100);break;}}return r;};syncBuiltinESMExports();assert.throws(()=>captureApplyTree(root),e=>e.code==='file_changed_during_read');assert.ok(fired);assert.equal(opened,closed);console.log(JSON.stringify({opened,closed}));`);assert.equal(result.opened,result.closed);
 });
});
test('known secret directories stay opaque and unrelated symlinks stay unfollowed',t=>{
 const root=fixture(t);fs.mkdirSync(join(root,'.aws'));fs.writeFileSync(join(root,'.aws/credentials'),'SECRET_NEVER_READ');fs.symlinkSync('/nonexistent-private',join(root,'link'));
 const result=child(root,`fs.readSync=()=>{throw Error('secret data read');};fs.readFileSync=()=>{throw Error('secret buffered read');};syncBuiltinESMExports();console.log(JSON.stringify(captureApplyTree(root)));`);assert.equal(result.find(x=>x.path==='.aws').type,'opaque');assert.equal(result.some(x=>x.path.includes('credentials')),false);assert.equal(result.find(x=>x.path==='link').type,'symlink');assert.equal(JSON.stringify(result).includes('SECRET_NEVER_READ'),false);
});
test('special-file replacement immediately before open refuses without waiting for a FIFO writer',{skip:process.platform==='win32'},t=>{
 const root=fixture(t);sparse(root,'file',65537);
 const result=child(root,`const {spawnSync}=await import('node:child_process');const open=fs.openSync;let changed=false,opened=0,closed=0;const close=fs.closeSync;fs.closeSync=(...a)=>{closed++;return close(...a);};fs.openSync=(path,flags,...rest)=>{if(!changed){changed=true;fs.unlinkSync(path);assert.equal(spawnSync('mkfifo',[path],{timeout:2000}).status,0);assert.ok((flags&fs.constants.O_NONBLOCK)!==0);}const fd=open(path,flags,...rest);opened++;return fd;};syncBuiltinESMExports();assert.throws(()=>captureApplyTree(root),e=>e.code==='file_changed_during_read');assert.equal(opened,closed);console.log(JSON.stringify({opened,closed,changed}));`);assert.equal(result.changed,true);
});
