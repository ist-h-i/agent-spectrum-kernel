// Single-trial capture adapter. Process ownership/termination stays in the
// existing executeCodexSession primitive; this module creates no qualification.
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStableFile } from './ask-benchmark-stable-file.mjs';

const CLEANUP_MS = 4000;
const SIGNALS = new Set(['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGHUP','SIGSEGV','SIGBUS','SIGPIPE']);
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const fail = (code, receipt) => Object.assign(new Error(code), { code, ...(receipt ? { receipt } : {}) });
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected;

function validate(options) {
  if (!keys(options,'cleanup,deadlineAtMs,outputMode,outputRoot,request,signal,trialId')) throw fail('native_probe_arguments_invalid');
  const { request:r, outputRoot, trialId, signal, deadlineAtMs, cleanup, outputMode } = options;
  if (!keys(r,'args,cwd,env,executable,input,max_buffer_bytes,timeout_ms') || typeof r.executable !== 'string' || !r.executable || r.executable.includes('\0')
    || !Array.isArray(r.args) || r.args.some(x => typeof x !== 'string' || x.includes('\0')) || !Buffer.isBuffer(r.input)
    || typeof r.cwd !== 'string' || !r.cwd || r.cwd.includes('\0') || !r.env || typeof r.env !== 'object' || Array.isArray(r.env)
    || Object.values(r.env).some(x => typeof x !== 'string' || x.includes('\0'))
    || !Number.isSafeInteger(r.timeout_ms) || r.timeout_ms < 1 || r.timeout_ms > 15000
    || !Number.isSafeInteger(r.max_buffer_bytes) || r.max_buffer_bytes < 1 || r.max_buffer_bytes > 1024*1024
    || typeof outputRoot !== 'string' || typeof trialId!=='string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(trialId) || !Number.isFinite(deadlineAtMs)
    || typeof cleanup !== 'function' || !['raw_stdio_v1','focused_frames_v1'].includes(outputMode)
    || (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')))
    throw fail('native_probe_arguments_invalid');
  try {
    const s=lstatSync(outputRoot);
    if (!s.isDirectory() || realpathSync(outputRoot)!==outputRoot || (s.mode&0o777)!==0o700 || s.uid!==process.getuid()) throw new Error();
  } catch { throw fail('native_probe_log_root_invalid'); }
  // Snapshot before the first yield; caller mutation cannot substitute input,
  // paths, observers or a transport after preflight.
  return {request:{...r,args:[...r.args],input:Buffer.from(r.input),env:{...r.env}},outputRoot,trialId,signal,deadlineAtMs,cleanup,outputMode};
}

// No MAC bytes or fd3/fd4 receipts cross this framing boundary. Only the
// parent-verified finite fields below and bounded candidate streams survive.
function finiteFocusedResult(value) {
  if (!keys(value,'assertion_failure,authenticated_mixed_boundary,exit_code,observed,requests,status')
    || !['succeeded','failed','unavailable'].includes(value.status)
    || [value.observed,value.assertion_failure,value.authenticated_mixed_boundary].some(x=>typeof x!=='boolean')
    || !(value.exit_code===null || Number.isInteger(value.exit_code)&&value.exit_code>=0&&value.exit_code<=255)
    || !Number.isInteger(value.requests)||value.requests<0||value.requests>1000
    || value.status==='succeeded'&&value.exit_code!==0 || value.status==='failed'&&!(value.exit_code>0)
    || (value.authenticated_mixed_boundary && !value.observed)) throw fail('native_probe_frame_invalid');
  return Object.freeze({...value});
}

async function runPrepared(options, deps, synthetic, lifetime) {
  const o=validate(options), {request:r}=o;
  const {executeSession,signalProcess=process.kill,platform=process.platform,now=Date.now,monotonicNow=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,write=writeFileSync}=deps;
  if (typeof executeSession!=='function' || typeof signalProcess!=='function' || typeof now!=='function' || typeof monotonicNow!=='function' || typeof setTimer!=='function' || typeof clearTimer!=='function' || typeof write!=='function') throw fail('native_probe_transport_invalid');
  const startWall=now(),startMono=monotonicNow();let lastMono=startMono,clockInvalid=false,deadlineExpired=false;
  const reservation=Math.min(r.timeout_ms+CLEANUP_MS,o.deadlineAtMs-startWall);
  const remaining=()=>{const wall=now(),mono=monotonicNow();if(!Number.isFinite(wall)||!Number.isFinite(mono)||mono<lastMono){clockInvalid=true;return 0;}lastMono=mono;return Math.min(o.deadlineAtMs-wall,reservation-(mono-startMono));};
  if (o.signal?.aborted) throw fail('native_probe_cancelled');
  if (!Number.isFinite(remaining()) || remaining()<=CLEANUP_MS) throw fail('native_probe_deadline');
  const stem=o.trialId, buffers={stdout:[],stderr:[]}, sizes={stdout:0,stderr:0};
  const controller=new AbortController();
  let observerCode=null, resultFrame=null, frameBytes=Buffer.alloc(0), framesClosed=false, pid=null, dispatched=false, transportFailed=false, groupSignalFailed=false;
  const capture=(stream,bytes)=>{
    const accepted=bytes.subarray(0,Math.max(0,r.max_buffer_bytes-sizes[stream]));
    if(accepted.length){buffers[stream].push(Buffer.from(accepted));sizes[stream]+=accepted.length;}
    if(accepted.length!==bytes.length)throw fail('native_probe_output_limit');
  };
  const observe=({stream,chunk})=>{
    try {
      if(!['stdout','stderr'].includes(stream)||!Buffer.isBuffer(chunk))throw fail('native_probe_output_invalid');
      if(o.outputMode==='raw_stdio_v1'){capture(stream,chunk);return;}
      // Parent stderr is a control channel. It is never retained or interpreted
      // as candidate output; diagnostics are finite error codes only.
      if(stream==='stderr'){if(chunk.length)throw fail('native_probe_parent_stderr');return;}
      if(framesClosed&&chunk.length)throw fail('native_probe_frame_invalid');
      frameBytes=Buffer.concat([frameBytes,chunk]);
      const lineLimit=Math.ceil(r.max_buffer_bytes*4/3)+4096;
      while(frameBytes.includes(10)){
        const end=frameBytes.indexOf(10), line=frameBytes.subarray(0,end);frameBytes=frameBytes.subarray(end+1);
        if(framesClosed||!line.length)throw fail('native_probe_frame_invalid');
        if(line.length>lineLimit)throw fail('native_probe_frame_limit');
        let f;try{
          const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(line);f=JSON.parse(text);
          // Trusted parent emits canonical JSON.stringify frames. Rejecting any
          // normalization also rejects duplicate keys, BOM and hidden fields.
          if(JSON.stringify(f)!==text)throw new Error();
        }catch{throw fail('native_probe_frame_invalid');}
        if(keys(f,'data,type')&&['stdout','stderr'].includes(f.type)&&typeof f.data==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(f.data)){
          const bytes=Buffer.from(f.data,'base64');if(bytes.toString('base64')!==f.data)throw fail('native_probe_frame_invalid');capture(f.type,bytes);
        }else if(keys(f,'result,type')&&f.type==='result'){resultFrame=finiteFocusedResult(f.result);framesClosed=true;}
        else throw fail('native_probe_frame_invalid');
      }
      if(frameBytes.length>lineLimit)throw fail('native_probe_frame_limit');
    } catch(error){observerCode??=error?.code??'native_probe_output_invalid';controller.abort();throw fail(observerCode);}
  };
  const intent={kind:'ask_native_probe_intent_v2',trial_id:stem,synthetic,output_mode:o.outputMode,timeout_ms:Math.min(r.timeout_ms,Math.floor(remaining()-CLEANUP_MS)),max_buffer_bytes:r.max_buffer_bytes};
  try{write(join(o.outputRoot,`${stem}.intent.json`),JSON.stringify(intent)+'\n',{flag:'wx',mode:0o600});}catch{throw fail('native_probe_capture_failed');}
  const cancel=()=>controller.abort();o.signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimer(()=>{deadlineExpired=true;controller.abort();},Math.max(1,Math.floor(remaining()-CLEANUP_MS)));timer?.unref?.();
  let result={};
  try {
    // Loader resolution happens before this function. Check again at the last
    // dispatch boundary, including an already-fired deadline/cancel signal.
    if(o.signal?.aborted||controller.signal.aborted||remaining()<=CLEANUP_MS)throw fail('native_probe_cancelled');
    dispatched=true;lifetime.dispatched=true;
    result=await executeSession({executable:r.executable,argv:r.args,cwd:r.cwd,env:r.env,input:r.input,timeoutMs:Math.min(r.timeout_ms,Math.floor(remaining()-CLEANUP_MS)),signal:controller.signal,retainOutput:false,terminationScope:'process_group',onSpawn:({pid:value})=>{if(Number.isInteger(value)&&value>0)pid=value;},onOutput:observe},undefined,{platform,signalProcess:(target,value)=>{try{return signalProcess(target,value);}catch(error){if(error?.code!=='ESRCH')groupSignalFailed=true;throw error;}}});
    if(!result||typeof result!=='object'||Array.isArray(result)){transportFailed=true;result={};}
  }catch{transportFailed=true;}
  finally{clearTimer(timer);o.signal?.removeEventListener('abort',cancel);}
  // Only a PID observed at spawn may authorize a group query. A returned PID
  // alone is not ownership evidence, and a mismatch refuses cleanup.
  const spawned=pid!==null, pidMismatch=result.pid!=null&&result.pid!==pid;
  let gone=false;
  if(spawned&&platform!=='win32')try{signalProcess(-pid,0);}catch(error){if(error?.code==='ESRCH')gone=true;else groupSignalFailed=true;}
  const exit=Number.isInteger(result.exitCode)&&result.exitCode>=0&&result.exitCode<=255?result.exitCode:null;
  const signal=SIGNALS.has(result.signal)?result.signal:null;
  const invalidSignal=result.signal!=null&&!SIGNALS.has(result.signal);
  const completed=spawned&&(exit!==null||signal!==null), confirmed=completed&&gone&&!groupSignalFailed&&!pidMismatch&&!invalidSignal&&!result.cleanupError&&!transportFailed;
  const cancelled=o.signal?.aborted===true||controller.signal.aborted||result.interrupted===true;
  let errorCode=observerCode??(clockInvalid?'native_probe_clock_invalid':deadlineExpired?'native_probe_deadline':result.timedOut?'native_probe_timeout':cancelled?'native_probe_cancelled':transportFailed?'native_probe_transport_failed':!confirmed?'native_probe_termination_unknown':result.error||exit!==0||signal!==null?'native_probe_process_failed':null);
  if(o.outputMode==='focused_frames_v1'&&!errorCode&&(frameBytes.length||!framesClosed))errorCode='native_probe_frame_incomplete';
  let cleanupStatus='retained_termination_unknown';
  if(confirmed)try{
    const returned=o.cleanup();
    if(returned&&typeof returned.then==='function'){Promise.resolve(returned).catch(()=>{});throw new Error();}
    cleanupStatus='removed';
  }catch{cleanupStatus='retained_cleanup_failed';errorCode??='native_probe_cleanup_failed';}
  if(!Number.isFinite(remaining())||remaining()<0)errorCode??='native_probe_deadline';
  const stdout=Buffer.concat(buffers.stdout),stderr=Buffer.concat(buffers.stderr);
  const ref=(name,bytes)=>({path:`${stem}.${name}.log`,bytes:bytes.length,digest:hash(bytes)});
  const receipt={kind:'ask_native_probe_lifetime_v2',trial_id:stem,synthetic,qualification:false,dispatch_status:dispatched?'dispatched':'not_dispatched',spawn_observed:spawned?true:transportFailed?null:false,process_completed:completed,termination_confirmed:confirmed,cleanup_status:cleanupStatus,exit_code:exit,signal,cancelled,timed_out:result.timedOut===true,error_code:errorCode,stdout:ref('stdout',stdout),stderr:ref('stderr',stderr),log_capture_status:'incomplete'};
  try{
    write(join(o.outputRoot,receipt.stdout.path),stdout,{flag:'wx',mode:0o600});
    write(join(o.outputRoot,receipt.stderr.path),stderr,{flag:'wx',mode:0o600});
    write(join(o.outputRoot,`${stem}.receipt.json`),JSON.stringify({...receipt,log_capture_status:'complete'})+'\n',{flag:'wx',mode:0o600});receipt.log_capture_status='complete';
  }catch{receipt.error_code='native_probe_capture_failed';throw fail('native_probe_capture_failed',receipt);}
  // A synchronous disk write can consume the remaining reservation. Retain
  // the immutable process capture; its completeness is not a lifetime pass.
  const finalRemaining=remaining();
  const lateCode=clockInvalid?'native_probe_clock_invalid':finalRemaining<0?'native_probe_deadline':o.signal?.aborted?'native_probe_cancelled':null;
  if(lateCode)throw fail(lateCode,{...receipt,post_capture_failure_code:lateCode});
  if(errorCode)throw fail(errorCode,receipt);
  return {stdout,stderr,result:resultFrame,receipt};
}

async function run(options,deps,synthetic){
  const lifetime={dispatched:false};
  try{return await runPrepared(options,deps,synthetic,lifetime);}
  catch(error){
    if(error?.receipt||lifetime.dispatched)throw error;
    // Every pre-dispatch refusal has a known empty ownership set. Release a
    // scratch allocated by the caller without inferring anything about a PID.
    let cleanupStatus='not_created';
    try{if(typeof options?.cleanup==='function'){
      const returned=options.cleanup();
      if(returned&&typeof returned.then==='function'){Promise.resolve(returned).catch(()=>{});throw new Error();}
      cleanupStatus='removed';
    }}catch{cleanupStatus='retained_cleanup_failed';}
    const codes=new Set(['native_probe_arguments_invalid','native_probe_log_root_invalid','native_probe_transport_invalid','native_probe_cancelled','native_probe_deadline','native_probe_capture_failed']);
    const code=codes.has(error?.code)?error.code:'native_probe_preflight_failed';
    const receipt={kind:'ask_native_probe_lifetime_v2',trial_id:/^[a-z0-9][a-z0-9-]{0,63}$/u.test(options?.trialId)?options.trialId:null,synthetic,qualification:false,dispatch_status:'not_dispatched',spawn_observed:false,process_completed:false,termination_confirmed:true,cleanup_status:cleanupStatus,exit_code:null,signal:null,cancelled:code==='native_probe_cancelled',timed_out:false,error_code:code,log_capture_status:'incomplete'};
    try{
      // Invalid roots are never touched. An intent collision also retains the
      // earlier evidence; exclusive writes prevent a replacement receipt.
      validate(options);
      const write=deps.write??writeFileSync;
      write(join(options.outputRoot,`${options.trialId}.receipt.json`),JSON.stringify({...receipt,log_capture_status:'complete'})+'\n',{flag:'wx',mode:0o600});receipt.log_capture_status='complete';
    }catch{/* The finite error carries the missing capture state. */}
    throw fail(code,receipt);
  }
}

export async function runOwnedPrivateNativeProbe(options){
  return run(options,{executeSession:async(...args)=>{
    const {executeCodexSession}=await import('./codex-exec-runner.mjs');
    return executeCodexSession(...args);
  }},false);
}

// Artificial transport only. No default spawn/import, qualification or scoring
// authority is provided when a caller omits the fake implementation.
export async function runOwnedPrivateNativeProbeForTest(options,dependencies){
  const {executeSession,...rest}=dependencies??{};
  if(typeof executeSession!=='function')throw fail('native_probe_fake_transport_required');
  return run(options,{...rest,executeSession},true);
}

// Retention only: a finite failure sidecar cannot qualify a process or replace
// missing observations. Raw/control/input data never enters this projection.
export function capturePrimaryNativeProbeFailure(context,receipt){
  try{
    const outputRoot=context?.outputRoot,trialId=context?.trialId,root=lstatSync(outputRoot);
    if(typeof trialId!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(trialId)||!root.isDirectory()||realpathSync(outputRoot)!==outputRoot
      ||(root.mode&0o777)!==0o700||root.uid!==process.getuid())throw new Error();
    const codes=new Set(['native_probe_arguments_invalid','native_probe_log_root_invalid','native_probe_transport_invalid','native_probe_cancelled','native_probe_deadline',
      'native_probe_capture_failed','native_probe_preflight_failed','native_probe_output_limit','native_probe_output_invalid','native_probe_parent_stderr','native_probe_frame_invalid',
      'native_probe_frame_limit','native_probe_clock_invalid','native_probe_timeout','native_probe_transport_failed','native_probe_termination_unknown','native_probe_process_failed',
      'native_probe_frame_incomplete','native_probe_cleanup_failed']);
    const boolean=value=>typeof value==='boolean',nullableBoolean=value=>value===null||boolean(value);
    const validators={synthetic:boolean,qualification:value=>value===false,dispatch_status:value=>['dispatched','not_dispatched'].includes(value),spawn_observed:nullableBoolean,
      process_completed:nullableBoolean,termination_confirmed:nullableBoolean,cleanup_status:value=>['not_created','removed','retained_termination_unknown','retained_cleanup_failed'].includes(value),
      exit_code:value=>value===null||Number.isInteger(value)&&value>=0&&value<=255,signal:value=>value===null||SIGNALS.has(value),cancelled:boolean,timed_out:boolean,
      error_code:value=>value===null||codes.has(value),log_capture_status:value=>['complete','incomplete'].includes(value)};
    let receiptStatus=receipt==null?'unavailable':'invalid',metadata=null,owned=null;
    try{
      const kind=receipt?.kind,id=receipt?.trial_id;
      if(kind==='ask_native_probe_lifetime_v2'&&(id===trialId||id===trialId+'-1')){
        owned={trialId:id,stdout:receipt.stdout,stderr:receipt.stderr};
        const candidate={kind,trial_id:id};let valid=true;
        for(const [field,check]of Object.entries(validators)){const value=receipt[field];if(!check(value)){valid=false;break;}candidate[field]=value;}
        const postCaptureFailure=receipt.post_capture_failure_code;
        if(postCaptureFailure!==undefined){if(!codes.has(postCaptureFailure))valid=false;else candidate.post_capture_failure_code=postCaptureFailure;}
        if(valid){receiptStatus='available';metadata=candidate;}
      }
    }catch{/* Unknown metadata remains invalid; never infer false or zero. */}
    const inspectStream=name=>{
      let reference=null;
      try{
        const supplied=owned?.[name];
        if(supplied){const value={path:supplied.path,bytes:supplied.bytes,digest:supplied.digest};
          if(value.path===owned.trialId+'.'+name+'.log'&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=1048576
            &&typeof value.digest==='string'&&/^sha256:[a-f0-9]{64}$/u.test(value.digest))reference=value;}
        if(reference){const saved=readStableFile(join(outputRoot,reference.path),'native failure retained stream',1048576);
          if(saved.bytes.length===reference.bytes&&saved.rawByteDigest===reference.digest)return {status:'saved_verified',reference};}
      }catch{/* A partial capture remains usable even when its peer is missing. */}
      return {status:'missing_or_changed',expected_reference:reference};
    };
    const record={kind:'ask_primary_native_probe_failure_v1',trial_id:trialId,receipt_status:receiptStatus,receipt:metadata,stdout:inspectStream('stdout'),stderr:inspectStream('stderr')};
    const path=trialId+'.failure.json',bytes=Buffer.from(JSON.stringify(record)+'\n');
    writeFileSync(join(outputRoot,path),bytes,{flag:'wx',mode:0o600});
    const saved=readStableFile(join(outputRoot,path),'native failure sidecar',16384);
    if(saved.rawByteDigest!==hash(bytes)||saved.bytes.length!==bytes.length||(saved.evidence.finalPath.mode&0o777)!==0o600)throw new Error();
    return Object.freeze({path,bytes:bytes.length,digest:hash(bytes)});
  }catch{throw fail('native_controller_capture_failed');}
}
