// Text-only startup diagnosis; no filesystem/config/DB reads and no authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {classifyPrimaryStderrLine} from './ask-primary-stderr-diagnostics.mjs';
const PREFIX='Error: failed to initialize sqlite state runtime under ';
const CONTEXT=': failed to initialize state runtime at ';
const PATH_WARNING='WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)';
const LIMIT=4096;
const prefixes=[PATH_WARNING,'WARNING: failed to clean up stale arg0 temp dirs: ',PREFIX,
 'Error: error parsing -c overrides: ','Error: error loading default config after config error: ','Error: error loading otel config: '].map(v=>Buffer.from(v));
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const pathText=p=>typeof p==='string'&&p.isWellFormed()&&p.startsWith('/')&&p===p.trim()&&posix.normalize(p)===p
 &&!/[\\:\u0000-\u001f\u007f\u001b\ufeff]/u.test(p)&&!p.split('/').some(v=>v==='.'||v==='..')
 &&!p.includes('failed to ')&&!p.includes('Error:');
export function validatePrimarySqliteDiagnosticReferencesV3(value){
 assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
 assert.deepEqual(Object.keys(value).sort(),['declared_output_parent','default_home_digest']);
 assert.match(value.default_home_digest,/^sha256:[a-f0-9]{64}$/u);assert.ok(pathText(value.declared_output_parent));
 return Object.freeze({...value});
}
export function classifyPrimarySqliteStartupLineV3(line,references){
 const refs=validatePrimarySqliteDiagnosticReferencesV3(references),base=classifyPrimaryStderrLine(line);
 if(base.kind!=='sqlite_state_runtime_error')return base;
 const result={...base,wrapper_visibility:'other_or_unavailable',reported_sqlite_home_text_class:'unknown',db_role:'unknown',phase:'unknown',cause:'unknown'};
 // Delimiter text can occur in POSIX paths. Never choose the first/last of
 // multiple occurrences and call it an actual reported home.
 const pieces=line.slice(PREFIX.length).split(CONTEXT);
 if(pieces.length!==2||pieces[0]!==pieces[1]||!pathText(pieces[0]))return result;
 const home=pieces[0];
 result.wrapper_visibility='outer_runtime_context_only';result.cause='not_reported';
 result.reported_sqlite_home_text_class=hash(home)===refs.default_home_digest?'default_codex_home_text'
  :home===refs.declared_output_parent||home.startsWith(refs.declared_output_parent==='/'?'/':refs.declared_output_parent+'/')?'within_declared_output_parent_text':'other_absolute_text';
 return result;
}
export function createPrimarySqliteStderrDiagnosticsV3(references){
 const refs=validatePrimarySqliteDiagnosticReferencesV3(references);
 let pending=Buffer.alloc(0),reason=null,warningCount=0,bytes=0;const records=[];
 const unknown=()=>({kind:'unknown',severity:'unclassified',os_error_text:'not_classified'});
 const refuse=(code,value=unknown())=>{if(!reason){reason=code;records.push(value);pending=Buffer.alloc(0);}return reason;};
 const complete=raw=>{
  let line;try{line=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);}catch{return refuse('stderr_invalid_encoding');}
  const value=classifyPrimarySqliteStartupLineV3(line,refs);
  if(value.kind==='path_alias_warning'){warningCount++;if(warningCount>1)return refuse('stderr_known_warning_repeat',value);records.push(value);return null;}
  return refuse(value.severity==='startup_error_text'?'stderr_startup_error':value.severity==='known_nonfatal_warning'?'stderr_known_warning_requires_review':'stderr_unknown',value);
 };
 return Object.freeze({push(chunk){
  if(reason)return reason;if(!Buffer.isBuffer(chunk))return refuse('stderr_unknown');bytes+=chunk.length;if(bytes>64*1024)return refuse('stderr_limit');
  for(let offset=0;offset<chunk.length;){const newline=chunk.indexOf(10,offset),end=newline<0?chunk.length:newline;
   if(pending.length+end-offset>LIMIT)return refuse('stderr_limit');pending=Buffer.concat([pending,chunk.subarray(offset,end)]);
   if(newline>=0){const raw=pending;pending=Buffer.alloc(0);const stopped=complete(raw);if(stopped)return stopped;offset=end+1;}
   else{if(!prefixes.some(prefix=>{const size=Math.min(prefix.length,pending.length);return prefix.subarray(0,size).equals(pending.subarray(0,size));}))return refuse('stderr_unknown');break;}
  }return null;
 },finish(){return reason??(pending.length?refuse('stderr_unterminated'):null);},summary(){return{policy:'closed_sqlite_location_diagnostics_v3',records:structuredClone(records),path_alias_warning_count:warningCount,raw_values_exported:false,reported_path_hashes_exported:false,reported_path_lengths_exported:false};}});
}
