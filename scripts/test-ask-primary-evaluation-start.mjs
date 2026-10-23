import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function artificialModuleProcess(source) {
  const value = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-'], {
    input: source, cwd: root, encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: 'C' },
  });
  assert.equal(value.status, 0, JSON.stringify({ status: value.status, error: value.error?.message, stdout: value.stdout, stderr: value.stderr }));
  return value.stdout;
}

test('manual start uses the registered factory and existing API once; refuses pins/blockers/consumption and relays cancellation', () => {
  const output = artificialModuleProcess(`
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    const hash = 'sha256:' + 'a'.repeat(64), resourcesHash = 'sha256:' + 'b'.repeat(64);
    const resources = {path:'/artificial/private/resources.json',digest:resourcesHash};
    const factoryCalls = [], starts = [], adapter = Object.freeze({artificial:true});
    let mode = 'completed', options, inspections = 0;
    mock.module('./scripts/ask-primary-evaluation-batch.mjs', {namedExports:{
      inspectPrimaryEvaluationBatch(root, value) {
        inspections++; assert.equal(root,'/artificial/batch');
        if(value) assert.equal(value.gradingAdapter,adapter);
        const second = mode==='resource-drift' ? {...resources,digest:'sha256:'+'c'.repeat(64)} : resources;
        return {manifest_digest:hash,start_consumed:mode==='consumed',
          blockers: value && mode==='blocked' ? [{fixture_id:'artificial',reason:'v10_runtime_authority_unqualified'}] : [],
          manifest:{blocks:[{grading:{resources:mode==='missing' ? null : resources}},{grading:{resources:second}}]}};
      },
      async startPrimaryEvaluationBatch(root,digest,value) {
        assert.equal(root,'/artificial/batch');assert.equal(digest,hash);assert.equal(value.gradingAdapter,adapter);
        assert.equal(typeof value.signal.addEventListener,'function');starts.push(root);options=value;
        if(mode==='interrupt') {process.emit('SIGINT');assert.equal(value.signal.aborted,true);}
        if(mode==='terminate') {process.emit('SIGTERM');assert.equal(value.signal.aborted,true);}
        if(mode==='throw') throw new Error('artificial saved-result failure');
        return {kind:'artificial_report',state:mode==='completed'?'completed':mode==='unknown'?'consumption_unknown':'stopped'};
      }
    }});
    mock.module('./scripts/ask-primary-evaluation-grading.mjs',{namedExports:{createPrimaryEvaluationGradingAdapter(value){
      factoryCalls.push(value);assert.deepEqual(value,{resourcesPath:resources.path,resourcesDigest:resourcesHash});return adapter;
    }}});
    const {runPrimaryEvaluationStartCommand:run}=await import('./scripts/ask-primary-evaluation-start.mjs');
    const args=['/artificial/batch','--confirm',hash];
    const sigint=process.listenerCount('SIGINT'),sigterm=process.listenerCount('SIGTERM');
    for(const bad of [[],[...args,'--retry'],['/artificial/batch','--resume',hash],['/artificial/batch','--confirm','bad']]) await assert.rejects(run(bad));
    await assert.rejects(run(['/artificial/batch','--confirm','sha256:'+'f'.repeat(64)]),/exact manifest digest/);
    assert.equal(starts.length,0);assert.equal(factoryCalls.length,0);
    for(mode of ['missing','resource-drift']) await assert.rejects(run(args),/resources/);
    assert.equal(starts.length,0);assert.equal(factoryCalls.length,0);
    for(mode of ['blocked','consumed']) {
      const value=await run(args);assert.equal(value.exitCode,9);assert.equal(value.report.status,'blocked');
      if(mode==='blocked')assert.equal(value.report.blockers[0].reason,'v10_runtime_authority_unqualified');
    }
    assert.equal(starts.length,0);
    for(mode of ['completed','unknown','interrupt','terminate','throw']) {
      const before=starts.length;
      if(mode==='throw') await assert.rejects(run(args),/saved-result failure/);
      else {const value=await run(args);assert.equal(value.exitCode,mode==='completed'?0:1);}
      assert.equal(starts.length,before+1,'no command retry');
      assert.equal(process.listenerCount('SIGINT'),sigint);assert.equal(process.listenerCount('SIGTERM'),sigterm);
    }
    assert.ok(inspections>0);console.log('artificial manual command assertions passed; model/native/grader starts=0');
  `);
  assert.match(output, /artificial manual command assertions passed/u);
});

test('existing batch CLI forwards only explicit start arguments and preserves its returned exit status', () => {
  const output = artificialModuleProcess(`
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    import { resolve } from 'node:path';
    mock.module('./scripts/ask-primary-evaluation-start.mjs',{namedExports:{async runPrimaryEvaluationStartCommand(argv){
      assert.deepEqual(argv,['/artificial/batch','--confirm','sha256:'+'a'.repeat(64)]);
      return {exitCode:0,report:{kind:'artificial_report',state:'completed',model_calls:0}};
    }}});
    process.argv=[process.execPath,resolve('scripts/ask-primary-evaluation-batch.mjs'),'start','/artificial/batch','--confirm','sha256:'+'a'.repeat(64)];
    await import('./scripts/ask-primary-evaluation-batch.mjs');
  `);
  assert.equal(JSON.parse(output).kind, 'artificial_report');
  assert.equal(JSON.parse(output).model_calls, 0);
});
