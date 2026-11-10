// Host-only observation of linked Codex sessions. Never pass session paths or
// transcripts to the solver, and never sum cumulative snapshots across resume.
import {readdirSync,openSync,readSync,closeSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {canonicalDigest} from './content-addressed-store.mjs';
const fields=['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'];
export function collectPracticalSessionUsage({sessionRoots,workspace,rootSessionId,rootTurnLowerBound=null}){
 const metas=new Map(),issues=[],records=new Map(),conflicts=new Set();let scanned=0;
 const scan=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){
  if(++scanned>20000)throw new Error('session discovery limit reached');
  const path=join(dir,item.name);if(item.isSymbolicLink())continue;
  if(item.isDirectory()){scan(path);continue;}if(!item.isFile()||!item.name.endsWith('.jsonl'))continue;
  // Index metadata only; descendants may use a different cwd. Bind the root
  // before traversing parent links or reading any session body.
  let meta;const fd=openSync(path,'r');
  try{const header=Buffer.alloc(65536);const n=readSync(fd,header,0,header.length,0);const first=JSON.parse(header.subarray(0,n).toString('utf8').split('\n',1)[0]);if(first.type!=='session_meta')continue;meta=first.payload;}catch{continue;}finally{closeSync(fd);}
  if(typeof meta.id!=='string'||!meta.id)continue;
  const parent=meta.parent_thread_id??meta.source?.subagent?.thread_spawn?.parent_thread_id??null;
  const prior=metas.get(meta.id);
  if(prior){if(canonicalDigest(prior.meta)!==canonicalDigest(meta)){prior.conflicted=true;issues.push('conflicting_session_metadata:'+meta.id);}else if(!prior.paths.includes(path))prior.paths.push(path);continue;}
  metas.set(meta.id,{path,paths:[path],parent,meta,conflicted:false});
 }};
 for(const path of sessionRoots??[])try{if(!lstatSync(path).isDirectory())throw new Error('not directory');scan(path);}catch(error){issues.push('discovery_incomplete:'+String(error.message));}
 const root=metas.get(rootSessionId),rootBound=Boolean(root&&!root.conflicted&&root.meta.cwd===workspace);
 if(rootSessionId&&root&&!rootBound)issues.push('root_workspace_binding_mismatch:'+rootSessionId);
 const ids=new Set(rootBound?[rootSessionId]:[]);let grew=true;
 while(grew){grew=false;for(const [id,m] of metas)if(!m.conflicted&&ids.has(m.parent)&&!ids.has(id)){ids.add(id);grew=true;}}
 const sessions=[],missing=rootSessionId&&!rootBound?[rootSessionId]:[];
 for(const id of [...ids].sort()){
  const m=metas.get(id);if(!m){missing.push(id);continue;}
  let text;
  try{
   const copies=m.paths.map(path=>readStableFile(path,'session usage observation',256*1024*1024).bytes.toString('utf8'));text=copies[0];
   if(copies.some(copy=>copy!==text)||canonicalDigest(JSON.parse(text.split('\n',1)[0]).payload)!==canonicalDigest(m.meta))throw new Error('session metadata or duplicate content changed');
  }catch(error){issues.push('session_unavailable:'+id+':'+String(error.message));missing.push(id);continue;}
  const own=new Map(),terminals=[],models=[];
  for(const line of text.split('\n')){if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{issues.push('invalid_event:'+id);continue;}
   const p=event.payload??{};
   if(event.type==='turn_context')models.push({model:p.model??null,reasoning:p.effort??null,turn_id:p.turn_id??null});
   if(event.type==='event_msg'&&['task_complete','task_aborted','turn_aborted'].includes(p.type))terminals.push({type:p.type,timestamp:event.timestamp??null});
   if(event.type!=='token_usage_record'||p.thread_id!==id)continue;
   if(typeof p.turn_id!=='string'||!p.turn_id||typeof p.response_id!=='string'||!p.response_id||!p.usage||fields.some(k=>p.usage[k]!==undefined&&(!Number.isSafeInteger(p.usage[k])||p.usage[k]<0))||p.usage.cached_input_tokens>p.usage.input_tokens){issues.push('invalid_usage:'+id);continue;}
   const key=JSON.stringify([id,p.turn_id,p.response_id]);
   if(records.has(key)&&canonicalDigest(records.get(key))!==canonicalDigest(p.usage)){conflicts.add(key);issues.push('conflicting_response_usage:'+id);}
   records.set(key,p.usage);own.set(key,p.usage);
  }
  const valid=[...own].filter(([k])=>!conflicts.has(k));
  if(!valid.length)missing.push(id);
  sessions.push({id,parent:m.parent,cwd:m.meta.cwd,path:m.path,models,terminal_events:terminals,unique_response_count:valid.length,observed:total(valid.map(([,v])=>v))});
 }
 const valid=[...records].filter(([k])=>!conflicts.has(k)).map(([,v])=>v);
 return {kind:'practical_linked_session_usage_v1',root_session_id:rootSessionId,scope:'root_and_recursively_linked_descendants',
  cumulative_snapshot:true,do_not_sum_stage_snapshots:true,sessions,unique_response_count:valid.length,aggregate_observed:total(valid),missing_usage_sessions:missing,issues,
  complete_total:null,complete_billed_cost:null,root_turn_lower_bound:rootTurnLowerBound,
  completeness:'Unknown: observed linked records only; discovery and descendant terminal closure are not independently certified. Cached input is a subset of input.'};
}
function total(rows){return Object.fromEntries(fields.map(k=>[k,rows.length&&rows.every(r=>Number.isSafeInteger(r[k]))?rows.reduce((s,r)=>s+r[k],0):null]));}
