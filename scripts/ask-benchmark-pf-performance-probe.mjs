import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { inspectPfPerformanceMeasurement, sha256 } from './ask-benchmark-pf-performance-source.mjs';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';

export const PF_PERFORMANCE_PROBE_VERSION = 'isolated-private-timing-v1';
export const PF_PERFORMANCE_PRIVATE_AUDIT_VERSION = 'private-performance-probe-audit-v1';
export const PF_PERFORMANCE_PRIVATE_BODY_HEADER = `export const performanceProbeVersion = ${JSON.stringify(PF_PERFORMANCE_PROBE_VERSION)};\n`;
const fixture = 'benchmarks/fixtures/checkpoint-b2/pf-performance-regression/workspace';
const nativeQualificationEvidence = null;

// Serialized into the isolated child. No candidate object leaves this child.
// Candidate callables receive realm-created data only; host validates data
// descriptors/identities instead of invoking candidate accessors or serializers.
async function probe({ vm, fs, crypto, performance, types, referenceSource, dataSource, config }) {
  const source = fs.readFileSync(0, 'utf8');
  const sourceDigest = 'sha256:' + crypto.createHash('sha256').update(source).digest('hex');
  const emit = value => process.stdout.write(JSON.stringify({ probe_version: 'isolated-private-timing-v1', candidate_source_digest: sourceDigest, ...value }));
  if (Buffer.byteLength(source) > 262144 || /\bimport\b/u.test(source)) {
    emit({ state: 'unavailable', reason: 'unsupported_module', report: null }); return;
  }
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  const load = async text => {
    const module = new vm.SourceTextModule(text, { context });
    // Reject re-exports too, without passing a host error/loader into the realm.
    if (module.dependencySpecifiers.length) return null;
    await module.link(() => { throw new Error('unreachable dependency'); });
    await module.evaluate({ timeout: 1000 });
    return module;
  };
  try {
    const reference = (await load(referenceSource)).namespace.lookupEvents;
    const makeData = (await load(dataSource)).namespace.makeData;
    // Module construction updates a Node-owned context counter. Construct it
    // before the snapshot; candidate evaluation still happens after it.
    const candidateModule = new vm.SourceTextModule(source, { context });
    if (candidateModule.dependencySpecifiers.length) { emit({ state: 'unavailable', reason: 'unsupported_module', report: null }); return; }
    const guarded = [], seen = new Set(), pending = [vm.runInContext('globalThis', context)];
    while (pending.length) {
      const value = pending.pop();
      if (value === null || !['object', 'function'].includes(typeof value) || seen.has(value)) continue;
      seen.add(value); guarded.push(value); pending.push(Object.getPrototypeOf(value));
      for (const key of Reflect.ownKeys(value)) {
        const d = Object.getOwnPropertyDescriptor(value, key);
        pending.push(d.value, d.get, d.set);
      }
    }
    const snapshot = values => values.map(value => ({ value, prototype: Object.getPrototypeOf(value), extensible: Object.isExtensible(value),
      descriptors: Reflect.ownKeys(value).map(key => [key, Object.getOwnPropertyDescriptor(value, key)]) }));
    const unchanged = before => before.every(({ value, prototype, extensible, descriptors }) => {
      if (Object.getPrototypeOf(value) !== prototype || Object.isExtensible(value) !== extensible) return false;
      const keys = Reflect.ownKeys(value);
      return keys.length === descriptors.length && descriptors.every(([key, d], i) => keys[i] === key &&
        ['value', 'get', 'set', 'enumerable', 'configurable', 'writable'].every(field => Object.is(d[field], Object.getOwnPropertyDescriptor(value, key)?.[field])));
    });
    const globals = snapshot(guarded);
    await candidateModule.link(() => { throw new Error('unreachable dependency'); });
    await candidateModule.evaluate({timeout:1000});
    const names = Object.keys(candidateModule.namespace);
    if (!unchanged(globals) || names.length !== 1 || names[0] !== 'lookupEvents' || typeof candidateModule.namespace.lookupEvents !== 'function') {
      emit({ state: 'fail', reason: 'module_contract', report: null }); return;
    }
    const candidate = candidateModule.namespace.lookupEvents;
    const objectGraph = roots => {
      const objects = [], visited = new Set(), queue = [...roots];
      while (queue.length) {
        const value = queue.pop();
        if (value === null || typeof value !== 'object' || visited.has(value)) continue;
        visited.add(value); objects.push(value);
        for (const key of Reflect.ownKeys(value)) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if ('value' in descriptor) queue.push(descriptor.value);
        }
      }
      return objects;
    };
    const property = (object, key) => {
      if (types.isProxy(object)) throw new Error('proxy output is unsupported');
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('output is not ordinary data');
      return descriptor.value;
    };
    const checkResult = (actual, expected) => {
      if (types.isProxy(actual) || !Array.isArray(actual) || property(actual, 'length') !== expected.length || Reflect.ownKeys(actual).length !== Reflect.ownKeys(expected).length) return false;
      const groups = new Set(), eventArrays = new Set();
      for (let i = 0; i < expected.length; i++) {
        if (!Object.hasOwn(expected, i)) { if (Object.hasOwn(actual, i)) return false; continue; }
        const group = property(actual, i), target = expected[i];
        if (!group || types.isProxy(group) || typeof group !== 'object' || groups.has(group) || Reflect.ownKeys(group).length !== 2 ||
          !Object.is(property(group, 'request_id'), target.request_id)) return false;
        groups.add(group);
        const events = property(group, 'events');
        if (types.isProxy(events) || !Array.isArray(events) || eventArrays.has(events) || property(events, 'length') !== target.events.length || Reflect.ownKeys(events).length !== target.events.length + 1) return false;
        eventArrays.add(events);
        for (let j = 0; j < target.events.length; j++) if (property(events, j) !== target.events[j]) return false;
      }
      return true;
    };
    const histories = new Map();
    const run = (rows, queries, expected, timing = false, fn = candidate) => {
      if (!histories.has(fn)) histories.set(fn,{previousOutput:[],firstOutput:null});
      const history = histories.get(fn);
      const inputs = snapshot(objectGraph([rows, queries]));
      const started = performance.now();
      const actual = fn(rows, queries);
      const duration = performance.now() - started;
      if (!checkResult(actual, expected) || !unchanged(inputs) || !unchanged(globals) || !unchanged(history.previousOutput) || (history.firstOutput && !unchanged(history.firstOutput))) throw new Error('functional_contract');
      const outputs = [actual];
      for (let i=0; i<expected.length; i++) if (Object.hasOwn(expected,i)) { const group=property(actual,i); outputs.push(group,property(group,'events')); }
      history.previousOutput = snapshot(outputs); history.firstOutput ??= history.previousOutput;
      return timing ? duration : 0;
    };
    // All objects, including identity keys, holes and functions, originate in
    // the candidate realm. No host callback/assert/reference is exposed.
    const cases = vm.runInContext(`(() => {
      const q=(tenant,kind,start=0,end=10)=>({request_id:'same',tenant,kind,start,end});
      const e=(tenant,kind,timestamp)=>({tenant,kind,timestamp});
      const row=e('a','b',2), a={}, b={}; const holeQueries=[q('a','b'),,q('a','b')];
      const arrayEvent=Object.assign([],e('a','b',2)), arrayQuery=Object.assign([],q('a','b'));
      return [ [[],[]], [[],[q('a','b')]], [[row],[q('x','b')]],
        [[e('a','b',10),e('a','b',0),e('a','b',5)],[q('a','b')]],
        [[e('a','b',1),e('a','b',9)],[q('a','b',0,2),q('a','b',8,10)]],
        [[row,row],[q('a','b')]], [[e('a|b','c',2),e('a','b|c',2)],[q('a|b','c'),q('a','b|c')]],
        [[e(1,false,2),e('1','false',2)],[q(1,false),q('1','false')]],
        [[e(a,b,2),e({},b,2)],[q(a,b),q({},b)]],
        [[e(null,undefined,2),e(undefined,undefined,2)],[q(null,undefined),q(undefined,undefined)]],
        [[e(NaN,'b',2),e('a',NaN,2)],[q(NaN,'b'),q('a',NaN)]], [[e(-0,0,2)],[q(0,-0)]],
        [[null,0,()=>0,e('a','b',2),e('a','b',NaN),e('a','b',Infinity),e('a','b','2')],[q('a','b')]],
        [[row],[null,0,()=>0,{},q('a','b',10,0),q('a','b',NaN,10),q('a','b',0,Infinity)]],
        [Object.freeze([Object.freeze(e('a','b',8)),Object.freeze(e('a','b',1))]),Object.freeze([Object.freeze(q('a','b'))])],
        [[e('a','b',8),e('a','b',1),e('a','b',5),e('a','b',8)],[q('a','b',0,8),q('a','b',5,5),q('a','b',8,8)]],
        [[e('a','b',8)],[q('a','b',0,1),q('a','b',4,4),q('a','b',2,9),q('a','b',6,7),q('a','b',12,15)]],
        [[row,,row],holeQueries], [[e('a','b',-Number.MAX_VALUE),e('a','b',Number.MAX_VALUE)],[q('a','b',-Number.MAX_VALUE,Number.MAX_VALUE)]],
        [[arrayEvent],[arrayQuery]], [[row],(()=>{const request=q('a','b');return [request,request]})()] ];
    })()`, context, { timeout: 1000 });
    let observations = 0;
    for (const [rows, queries] of cases) { run(rows, queries, reference(rows, queries)); observations++; }
    const repeated = vm.runInContext(`({ rows:[{tenant:'a',kind:'b',timestamp:2}], queries:[{request_id:'same',tenant:'a',kind:'b',start:0,end:10}] })`, context);
    for (let i = 0; i < 3; i++) {
      run(repeated.rows, repeated.queries, reference(repeated.rows, repeated.queries)); observations++;
      if (i === 0) repeated.rows[0].timestamp = 12;
      else repeated.queries[0].end = 20;
    }
    const records = [], median = series => [...series].sort((a,b)=>a-b)[Math.floor(series.length/2)];
    for (const workload of config.workloads) {
      // JSON literals enter the realm; never pass host workload objects.
      const realmWorkload = vm.runInContext('(' + JSON.stringify(workload) + ')', context);
      const { rows, queries } = makeData(realmWorkload), expected = reference(rows, queries);
      run(rows, queries, expected);
      for (let i = 0; i < config.warmups; i++) { run(rows, queries, expected); run(rows, queries, expected,false,reference); }
      const durations = { candidate: [], reference: [] };
      const measureReference = () => durations.reference.push(run(rows, queries, expected,true,reference));
      for (let i = 0; i < config.samples; i++) {
        if (i % 2) measureReference();
        durations.candidate.push(run(rows, queries, expected, true));
        if (!(i % 2)) measureReference();
      }
      const baseline = median(durations.reference), improved = median(durations.candidate), ratio = improved/baseline;
      const bounded = Number.isFinite(ratio) && baseline >= config.minimum_baseline_ms && Object.values(durations).every(series=>Math.max(...series)/Math.max(Math.min(...series),Number.EPSILON)<=config.maximum_dispersion_ratio);
      const outputCount = expected.reduce((sum, group)=>sum+group.events.length,0);
      records.push({workload:workload.name,event_count:rows.length,request_count:queries.length,output_count:outputCount,consumed:outputCount*config.samples*2,
        durations_ms:durations,reference_median_ms:baseline,candidate_median_ms:improved,candidate_to_reference_ratio:Number.isFinite(ratio)?ratio:null,
        state:!bounded?'inconclusive':ratio<=config.maximum_candidate_median_ratio?'within_local_target':'local_regression'});
    }
    const report = { measurement_version:'1.0.0', candidate_source_digest:sourceDigest, clock:'performance.now', fictional_local_workloads:true,
      measured_external_service:false,runtime:process.version,platform:process.platform,architecture:process.arch,records };
    emit({ state:'measured',reason:null,functional_observations:observations,report });
  } catch (error) {
    if (error && !types.isProxy(error) && Object.getOwnPropertyDescriptor(error,'code')?.value === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      emit({state:'unavailable',reason:'candidate_timeout',report:null}); return;
    }
    emit({ state:'fail',reason:'functional_or_module_contract',report:null });
  }
}

export function buildPfPerformanceProbeSource({ referenceSource, dataSource, config }) {
  if (typeof referenceSource !== 'string' || typeof dataSource !== 'string' || !config ||
    !Number.isInteger(config.warmups) || config.warmups < 0 || config.warmups > 100 ||
    !Number.isInteger(config.samples) || config.samples < 3 || config.samples > 101 || config.samples % 2 !== 1 ||
    !Array.isArray(config.workloads) || config.workloads.length !== 2 || config.workloads.some((w,i)=>w?.name !== ['sparse','dense'][i] || !Number.isSafeInteger(w.events) || w.events <= 4 || !Number.isSafeInteger(w.requests) || w.requests < 1 || !Number.isSafeInteger(w.tenants) || w.tenants < 1) ||
    !Number.isFinite(config.minimum_baseline_ms) || config.minimum_baseline_ms <= 0 ||
    !Number.isFinite(config.maximum_dispersion_ratio) || config.maximum_dispersion_ratio < 1 ||
    !Number.isFinite(config.maximum_candidate_median_ratio) || config.maximum_candidate_median_ratio <= 0) throw new Error('invalid trusted probe inputs');
  return `const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),{types}=require('node:util');\n(${probe.toString()})({vm,fs,crypto,performance,types,...${JSON.stringify({referenceSource,dataSource,config})}}).catch(()=>{process.exitCode=2;});\n`;
}

export function inspectPfPerformanceProbeOutput(bytes, { candidateSource, config }) {
  const unavailable = reason => ({ state:'unavailable',reason,quality:null,report:null });
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > 1024*1024) return unavailable('probe_output_invalid');
    const result = parseJsonRejectDuplicateKeys(bytes,'isolated performance probe output');
    if (result.probe_version !== PF_PERFORMANCE_PROBE_VERSION || result.candidate_source_digest !== sha256(candidateSource)) return unavailable('probe_source_binding_invalid');
    if (result.state === 'unavailable' && result.report === null && ['unsupported_module','candidate_timeout'].includes(result.reason)) return unavailable(result.reason);
    if (result.state === 'fail' && result.report === null && ['module_contract','functional_or_module_contract'].includes(result.reason)) return { ...result,quality:null };
    if (result.state !== 'measured' || result.reason !== null || result.functional_observations !== 24) return unavailable('probe_output_invalid');
    const checked = inspectPfPerformanceMeasurement(result.report, {sourceDigest:sha256(candidateSource),config});
    if (['invalid','unavailable'].includes(checked.state)) return unavailable(checked.reason);
    return {...result,state:checked.state,quality:null,evidence_role:'candidate_correctness_only',authentication:'requires_qualified_isolated_child'};
  } catch { return unavailable('probe_output_invalid'); }
}

// This is a lossless private carrier, not an issuer or an isolation admission.
// Only the controller-owned launcher may supply it to a production worker.
export function createPfPerformancePrivateAudit({ raw = null, candidateSource, config }) {
  const stream = bytes => {
    if (!Buffer.isBuffer(bytes) || bytes.length > 1024*1024) throw new Error('invalid private probe stream');
    return {base64:bytes.toString('base64'),bytes:bytes.length,digest:sha256(bytes)};
  };
  return {audit_version:PF_PERFORMANCE_PRIVATE_AUDIT_VERSION,probe_version:PF_PERFORMANCE_PROBE_VERSION,
    candidate_source_digest:sha256(candidateSource),config_digest:canonicalDigest(config),
    raw:raw===null?null:{stdout:stream(raw.stdout),stderr:stream(raw.stderr),exit_code:raw.exit_code,signal:raw.signal,error_code:raw.error_code}};
}

export function inspectPfPerformancePrivateAudit(audit, { candidateSource, config }) {
  const unavailable = () => ({state:'unavailable',reason:'private_probe_evidence_unavailable',quality:null});
  try {
    if (audit?.audit_version!==PF_PERFORMANCE_PRIVATE_AUDIT_VERSION || audit.probe_version!==PF_PERFORMANCE_PROBE_VERSION ||
      audit.candidate_source_digest!==sha256(candidateSource) || audit.config_digest!==canonicalDigest(config) || !audit.raw) return unavailable();
    const decode = stream => {
      if (typeof stream?.base64!=='string' || stream.base64.length>1398104) throw new Error('invalid stream');
      const bytes=Buffer.from(stream.base64,'base64');
      if (bytes.length>1024*1024 || bytes.toString('base64')!==stream.base64 || bytes.length!==stream.bytes || sha256(bytes)!==stream.digest) throw new Error('changed stream');
      return bytes;
    };
    const stdout=decode(audit.raw.stdout);decode(audit.raw.stderr);
    if (audit.raw.exit_code!==0 || audit.raw.signal!==null || audit.raw.error_code!==null) return unavailable();
    const result=inspectPfPerformanceProbeOutput(stdout,{candidateSource,config});
    return {state:result.state,reason:result.reason,quality:null};
  } catch { return unavailable(); }
}

export function pfPerformancePrivateProbeRoute(hiddenSource) {
  const source=Buffer.isBuffer(hiddenSource)?hiddenSource.toString('utf8'):hiddenSource;
  if (typeof source!=='string') throw new Error('private performance body source missing');
  if (!source.startsWith('export const performanceProbeVersion = ')) return null;
  if (!source.startsWith(PF_PERFORMANCE_PRIVATE_BODY_HEADER)) throw new Error('unknown private performance probe version');
  return PF_PERFORMANCE_PROBE_VERSION;
}

// There is no qualified native probe evidence in the current source revision.
// A caller flag, admission assertion, supplied report or synthetic test cannot
// close that obligation. Keep the production connection inert until reviewed
// native qualification supplies a separately reviewed source change.
export function runQualifiedPfPerformancePrivateProbe({ candidateSource, config, referenceSource, dataSource }) {
  if(nativeQualificationEvidence===null)return {observation:{probe_version:PF_PERFORMANCE_PROBE_VERSION,candidate_source_digest:sha256(candidateSource),
    state:'unavailable',reason:'native_probe_qualification_unavailable',quality:null},
    audit:createPfPerformancePrivateAudit({candidateSource,config})};
  const result=launchPfPerformanceProbe({candidateSource,config,referenceSource,dataSource});
  const audit=createPfPerformancePrivateAudit({candidateSource,config,raw:result.raw??null});
  return {observation:{probe_version:PF_PERFORMANCE_PROBE_VERSION,candidate_source_digest:sha256(candidateSource),
    ...inspectPfPerformancePrivateAudit(audit,{candidateSource,config})},audit};
}

// No runner injection or unsandboxed fallback is available on this path. Read
// trusted public reference/config from a pinned source root, never candidate cwd.
export function runPfPerformanceProbe({ sourceRoot, candidateSource }) {
  if (process.platform !== 'darwin' || process.version !== 'v24.19.0') return {state:'unavailable',reason:'platform_or_runtime_not_qualified',quality:null,report:null};
  const root = resolve(sourceRoot, fixture);
  const config = JSON.parse(readFileSync(resolve(root,'data/measurement-config.json')));
  return launchPfPerformanceProbe({candidateSource,config,referenceSource:readFileSync(resolve(root,'reference/scan-lookup.mjs'),'utf8'),dataSource:readFileSync(resolve(root,'scripts/generate-data.mjs'),'utf8')});
}

function launchPfPerformanceProbe({candidateSource,config,referenceSource,dataSource}) {
  if (process.platform !== 'darwin' || process.version !== 'v24.19.0') return {state:'unavailable',reason:'platform_or_runtime_not_qualified',quality:null,report:null};
  const script = buildPfPerformanceProbeSource({referenceSource,dataSource,config});
  const scratch = mkdtempSync(resolve(tmpdir(),'ask-performance-probe-'));
  try {
    const literal = value => JSON.stringify(value);
    const policy = `(version 1)(deny default)(allow process*)(allow sysctl-read)(allow mach-lookup)(allow file-read*)(deny file-read-data (require-all (subpath "/Users") (require-not (subpath ${literal(dirname(process.execPath))}))) (subpath "/private/tmp") (subpath "/private/var/folders"))`;
    const child = spawnSync('/usr/bin/sandbox-exec',['-p',policy,process.execPath,'--permission','--experimental-vm-modules','-e',script],{
      input:candidateSource,cwd:scratch,env:{PATH:'/usr/bin:/bin',LANG:'C',TZ:'UTC'},timeout:300000,maxBuffer:1024*1024,encoding:null,stdio:['pipe','pipe','pipe']});
    const raw = {stdout:child.stdout ?? Buffer.alloc(0),stderr:child.stderr ?? Buffer.alloc(0),exit_code:child.status,signal:child.signal ?? null,error_code:child.error?.code ?? null};
    if (child.error || child.status !== 0) return {state:'unavailable',reason:'isolated_probe_unavailable',quality:null,report:null,raw};
    return {...inspectPfPerformanceProbeOutput(raw.stdout,{candidateSource,config}),raw};
  } finally { rmSync(scratch,{recursive:true,force:true}); }
}
