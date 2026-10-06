import { posix } from 'node:path';
import { parseJsonRejectDuplicateKeys,canonicalDigest } from './content-addressed-store.mjs';
import { captureSuccessorUsage } from './ask-benchmark-prompt-successor-usage.mjs';
import { turnBudget,CODEX_TIME_POLICY } from './ask-local-codex-time-budget.mjs';
import { CORE_EXTENSION_SKILLS } from './ask-core-capabilities.mjs';
export const CORE_NATIVE_POLICY=Object.freeze({kind:'ask_core_mac_native_proposal_v1',model:'gpt-6.1-sol',effort:'medium',cli_version:'0.157.1',provider:'ask_core_openai_no_retry',project_doc_max_bytes:32768,time:CODEX_TIME_POLICY,trial_tokens:50000,cumulative_tokens:150000,accounting:'input_plus_output_including_cached',enforcement:'post_trial',retry:0});
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
function closed(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||!same(Object.keys(v).sort(),[...keys].sort()))throw new Error('invalid_native_contract_shape');}
export function contractPath(p){if(typeof p!=='string'||!p.startsWith('/')||p==='/'||posix.normalize(p)!==p||p.includes('\\')||p.includes(':')||/[\0\r\n]/u.test(p))throw new Error('invalid_declared_path');return p;}
const within=(a,b)=>a===b||a.startsWith(b+'/');
/** Strings only: neither filesystem probing nor process execution. Paths/image are unverified proposals. */
export function buildCoreCodexLaunch(binding){
 closed(binding,['condition','workspace','evidence_root','runtime_root','controller_root','auth_home','executable','tool_path']);
 if(!['plain','core','full'].includes(binding.condition))throw new Error('unknown_condition');
 for(const key of ['workspace','evidence_root','runtime_root','controller_root','auth_home','executable'])contractPath(binding[key]);
 if(!Array.isArray(binding.tool_path)||binding.tool_path.length<1||binding.tool_path.length>8||new Set(binding.tool_path).size!==binding.tool_path.length)throw new Error('invalid_tool_path');for(const p of binding.tool_path)contractPath(p);
 const roots=['workspace','evidence_root','runtime_root','controller_root','auth_home'];
 for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)if(within(binding[roots[i]],binding[roots[j]])||within(binding[roots[j]],binding[roots[i]]))throw new Error('declared_root_overlap');
 if(roots.some(k=>within(binding.executable,binding[k])))throw new Error('executable_root_overlap');
 const home=`${binding.runtime_root}/${binding.condition}/home`,denies=[binding.evidence_root,binding.runtime_root,binding.controller_root,binding.auth_home];
 const settings=['approval_policy="never"',`model_reasoning_effort="${CORE_NATIVE_POLICY.effort}"`,`default_permissions="ask_core_native"`,'permissions.ask_core_native.extends=":read-only"',`permissions.ask_core_native.filesystem={ ${denies.map(p=>`${JSON.stringify(p)} = "deny"`).join(', ')}, ":workspace_roots" = "write" }`,'permissions.ask_core_native.network.enabled=false','project_doc_max_bytes=32768','project_doc_fallback_filenames=[]','mcp_servers={}','plugins={}','web_search="disabled"','forced_login_method="chatgpt"','cli_auth_credentials_store="file"',`model_provider="${CORE_NATIVE_POLICY.provider}"`,`model_providers.${CORE_NATIVE_POLICY.provider}={name="OpenAI",base_url="https://chatgpt.com/backend-api/codex",wire_api="responses",requires_openai_auth=true,request_max_retries=0,stream_max_retries=0,supports_websockets=false,supports_standalone_web_search=false}`,'sqlite_home='+JSON.stringify(`${binding.runtime_root}/${binding.condition}/sqlite`),'log_dir='+JSON.stringify(`${binding.runtime_root}/${binding.condition}/logs`),'history.persistence="none"','analytics.enabled=false','feedback.enabled=false','check_for_update_on_startup=false','memories.generate_memories=false','memories.use_memories=false',...['plugins','plugin_hooks','remote_plugin','recommended_plugins','apps','enable_mcp_apps','multi_agent','multi_agent_v2','memory_tool','external_agent_memory_import','skill_mcp_dependency_install','responses_websockets','responses_websockets_v2'].map(k=>`features.${k}=false`)];
 const argv=['--strict-config','exec','--json','--skip-git-repo-check','--model',CORE_NATIVE_POLICY.model,'--cd',binding.workspace,'--output-last-message',`${binding.evidence_root}/${binding.condition}-final.txt`,...settings.flatMap(v=>['-c',v]),'-'];
 return {kind:'ask_core_codex_launch_proposal_v1',binding,argv,env:{PATH:binding.tool_path.join(':'),HOME:home,CODEX_HOME:binding.auth_home,TMPDIR:`${binding.workspace}/.ask-tmp`},stdin:'Complete task.md using workspace. Follow the task scope and report the checks and result.',deny_roots:denies,policy:CORE_NATIVE_POLICY,discovery:{requested_project_agents:binding.condition!=='plain',expected_local_skills:binding.condition==='full'?CORE_EXTENSION_SKILLS:[],global_user_admin_system:'unknown',actual_read_and_use:'unknown'},auth_behavior:'normal_cli_read_refresh_writeback_requires_separate_approval',host_read_risk:'host_reads_except_declared_denies; personal_files_and_other_auth_stores_not_isolated; tool_outputs_may_be_sent_to_OpenAI',launch_authority:null,live_ready:false,model_calls:0,native_cli_starts:0};
}
function jsonLines(bytes){const b=Buffer.from(bytes);if(!b.length||b.length>4194304)throw new Error('capture_size_refused');const t=new TextDecoder('utf8',{fatal:true}).decode(b);if(!t.endsWith('\n'))throw new Error('capture_line_refused');return t.trimEnd().split('\n').map(x=>parseJsonRejectDuplicateKeys(x));}
/** Supplied capture contracts, never physical/native attestation. No grant can be passed. */
export function inspectCoreCodexCapture(launch,capture){
 if(!same(launch,buildCoreCodexLaunch(launch?.binding)))throw new Error('launch_contract_changed');
 try{closed(capture,['stdout','session','status','signal','error','received_ms','elapsed_ms','cleanup']);}catch{return {status:'blocked',reason:'invalid_capture_shape',usage:captureSuccessorUsage({status:null,stdout:''}),evidence_class:'synthetic_or_untrusted_supplied_capture',native_attestation:'unknown',semantic_score:null,live_ready:false,model_calls:0,native_cli_starts:0};}
 const usage=captureSuccessorUsage({...capture,error:capture.error===null?null:new Error('supplied_failure'),workspace_descendants_detected:false});
 const fail=reason=>({status:'blocked',reason,usage,evidence_class:'synthetic_or_untrusted_supplied_capture',native_attestation:'unknown',semantic_score:null,live_ready:false,model_calls:0,native_cli_starts:0});
 if(capture.status!==0||capture.signal!==null||capture.error!==null||capture.cleanup!=='closed')return fail('process_failed_or_unknown');
 try{
  const events=jsonLines(capture.stdout),sessions=jsonLines(capture.session);
  if(!Array.isArray(capture.received_ms)||capture.received_ms.length!==events.length||!Number.isFinite(capture.elapsed_ms)||capture.elapsed_ms<0)throw new Error('timing_capture_refused');
  let now=0;const budget=turnBudget({now:()=>now});
  for(let i=0;i<events.length;i++){if(!Number.isFinite(capture.received_ms[i])||capture.received_ms[i]<now)throw new Error('timing_capture_refused');now=capture.received_ms[i];budget.event(events[i]);}
  if(capture.elapsed_ms<now)throw new Error('timing_capture_refused');now=capture.elapsed_ms;budget.finish();if(budget.evidence().stop!==null)return fail(budget.evidence().stop);
  const threads=events.filter(e=>e.type==='thread.started'),metas=sessions.filter(r=>r.type==='session_meta'),contexts=sessions.filter(r=>r.type==='turn_context');
  if(threads.length!==1||metas.length!==1||contexts.length<1||contexts.length>32)throw new Error('session_cardinality_refused');
  const meta=metas[0].payload,b=launch.binding;
  if(meta?.id!==threads[0].thread_id||meta.cli_version!==CORE_NATIVE_POLICY.cli_version||meta.model_provider!==CORE_NATIVE_POLICY.provider||meta.cwd!==b.workspace)throw new Error('session_identity_refused');
  let observedRuntime;const turns=new Set();for(const row of contexts){const c=row.payload;
   if(c?.model!==CORE_NATIVE_POLICY.model||c.effort!==CORE_NATIVE_POLICY.effort||c.cwd!==b.workspace||c.approval_policy!=='never'||c.sandbox_policy?.type!=='workspace-write'||c.sandbox_policy.network_access!==false||c.active_permission_profile?.id!=='ask_core_native'||c.permission_profile?.type!=='managed'||c.permission_profile.network!=='restricted'||c.permission_profile.file_system?.type!=='restricted'||typeof c.turn_id!=='string'||c.turn_id.length<10)throw new Error('resolved_context_refused');
   const entries=c.permission_profile.file_system.entries;if(!Array.isArray(entries))throw new Error('resolved_permissions_refused');
   const runtimeParent=`${b.runtime_root}/${b.condition}/home/tmp/arg0`;
   const runtimeRead=e=>e.access==='read'&&e.path?.type==='path'&&typeof e.path.path==='string'&&posix.dirname(e.path.path)===runtimeParent&&/^codex-arg0[A-Za-z0-9]{6}$/u.test(posix.basename(e.path.path));
   const runtime=entries.filter(runtimeRead);if(runtime.length>1)throw new Error('runtime_read_ambiguous');
   const observed=runtime[0]?.path.path??null;if(observedRuntime!==undefined&&observedRuntime!==observed)throw new Error('runtime_read_changed');observedRuntime=observed;
   for(const e of entries){closed(e,['access','path']);closed(e.path,['type','path']);if(e.path.type!=='path'||!['read','write','deny'].includes(e.access)||typeof e.path.path!=='string'||!e.path.path.startsWith('/')||posix.normalize(e.path.path)!==e.path.path||e.path.path.includes('\\'))throw new Error('resolved_entry_refused');}
   if(entries.filter(e=>e.access==='read'&&e.path.path==='/').length!==1||entries.some(e=>!(e.access==='read'&&e.path.path==='/'||e.access==='deny'&&launch.deny_roots.includes(e.path.path)||e.access==='write'&&e.path.path===b.workspace||runtimeRead(e))))throw new Error('unexpected_resolved_entry');
   for(const root of launch.deny_roots)if(entries.filter(e=>e.access==='deny'&&e.path?.type==='path'&&e.path.path===root).length!==1||entries.some(e=>e.access!=='deny'&&e.path?.type==='path'&&within(e.path.path,root)&&!(root===b.runtime_root&&runtimeRead(e))))throw new Error('resolved_deny_refused');
   if(entries.filter(e=>e.access==='write'&&e.path?.type==='path'&&e.path.path===b.workspace).length!==1||entries.some(e=>e.access==='write'&&e.path?.type==='path'&&!within(e.path.path,b.workspace)))throw new Error('resolved_write_refused');turns.add(c.turn_id);
  }
  if(turns.size!==1)throw new Error('turn_identity_refused');
  if(usage.provider_stop.status!=='not_detected'||usage.metrics.total_tokens.status!=='known')return fail('usage_or_provider_unknown');
  return {...fail(null),status:'supplied_capture_contract_verified',time_budget:budget.evidence(),session_identity_digest:canonicalDigest({session:meta.id}),turn_identity_digest:canonicalDigest({session:meta.id,turn:[...turns][0]}),requested_discovery:launch.discovery,actual_discovery:'unknown'};
 }catch(e){return fail(/^[a-z_]+$/u.test(e.message)?e.message:'capture_contract_refused');}
}
export function refuseCoreNativeLaunch(){throw new Error('native_launch_not_authorized_or_implemented_in_preparation_slice');}
