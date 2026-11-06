import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {readJsonFileStrict,readStableBytes,canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
// A complete set of executable bindings. No ports/no-op placeholders remain.
export function createNativeInstructionLoopConfiguration(profilePath){
  profilePath=resolve(profilePath);const p=readJsonFileStrict(profilePath);
  assert.equal(p.kind,'full_native_reference_loop_profile_v1');assert.equal(p.normal.target,p.policy.normal_target);
  const paths=['instruction-loop-native-worker.mjs','instruction-loop-native-host.mjs','instruction-loop-full-candidate.mjs','instruction-loop-reference-report.mjs',
    'instruction-loop-native-prepare.py','instruction-loop-assets.mjs','instruction-loop-case-selection.mjs','instruction-loop-normal-owner-worker.mjs',
    'retained-instruction-comparison.mjs','retained-instruction-layout.mjs','instruction-environment.mjs','codex-exec-runner.mjs','asset-registry.mjs','content-addressed-store.mjs','instruction-loop-source-binding.mjs'];
  const pins=[{path:profilePath,digest:hash(readStableBytes(profilePath,'Full/native profile',16*1024*1024))},...paths.map(name=>({path:join(import.meta.dirname,name),digest:hash(readStableBytes(join(import.meta.dirname,name),'Full/native adapter'))}))];
  if(p.native.executionKind==='model_free_fixture')pins.push({path:p.native.fixtureExecutable,digest:p.native.fixtureExecutableDigest});
  const worker=join(import.meta.dirname,'instruction-loop-native-worker.mjs'),prefix=[process.execPath,worker,profilePath,pins[0].digest];
  const runtime={commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(kind=>[kind,{
    argv:[...prefix,'execute'],inspect_argv:[...prefix,'inspect'],pins,
    model_calls:kind==='generate'?p.generator.provider.kind==='codex':kind==='trial'&&p.native.executionKind==='real_codex'}]))};
  return {policy:{...p.policy,runtime_digest:canonicalDigest(runtime)},runtime};
}
