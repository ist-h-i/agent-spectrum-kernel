import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, rmdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalDigest, assertNoSymlinkPathSegments, readJsonFileStrict, writeCanonicalJsonNoReplace } from './content-addressed-store.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const maximumBytes=16*1024*1024;
function journal(root){
  const names=readdirSync(root).filter(n=>/^\d{6}\.json$/u.test(n)).sort();
  let previous=null,state=null;
  const events=names.map((name,i)=>{
    assert.equal(name,`${String(i).padStart(6,'0')}.json`,'journal gap');
    const record=readJsonFileStrict(join(root,name),'instruction run journal',maximumBytes),{record_digest,...body}=record;
    assert.equal(record_digest,canonicalDigest(body),'journal content drift');
    assert.equal(body.previous,previous,'journal chain drift');
    previous=record_digest;state=body.state;return record;
  });
  return {events,state,previous};
}
function append(root,kind,state,detail={}){
  const old=journal(root),body={previous:old.previous,kind,detail,state:copy(state)};
  writeCanonicalJsonNoReplace({outputPath:join(root,`${String(old.events.length).padStart(6,'0')}.json`),
    artifact:{...body,record_digest:canonicalDigest(body)},label:'supervised loop event',maximumBytes});
}
function lock(root){
  const path=join(root,'.advance-lock');
  try {mkdirSync(path,{mode:0o700});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    assertNoSymlinkPathSegments(path,'loop lock');
    if(!existsSync(join(path,'pid')))throw new Error('lock owner uncertain; inspect before recovery');
    const pid=Number(readFileSync(join(path,'pid'),'utf8'));
    assert.ok(Number.isSafeInteger(pid)&&pid>0,'invalid lock owner');
    try {process.kill(pid,0);throw new Error('loop already running or lock PID reused');}
    catch(e){if(e.code!=='ESRCH')throw e;}
    // Only remove the exact two objects that this module creates; never recurse.
    assert.deepEqual(readdirSync(path),['pid']);
    // A dead coordinator is not evidence that its worker has stopped. The
    // persisted job below is inspected, never re-launched, after this unlock.
    unlinkSync(join(path,'pid'));rmdirSync(path);mkdirSync(path,{mode:0o700});
  }
  writeFileSync(join(path,'pid'),String(process.pid),{flag:'wx',mode:0o600});
  return ()=>{unlinkSync(join(path,'pid'));rmdirSync(path);};
}

export {journal as readRunJournal,append as appendRunJournal,lock as lockRunJournal};
