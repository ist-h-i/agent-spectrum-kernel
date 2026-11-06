// Verify the measured source before importing any executable from its checkout.
// This is identity binding, not grading/admission or application authority.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {devNull} from 'node:os';
import {canonicalDigest,readJsonFileStrict,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {fullInstructionInventory} from './instruction-loop-full-candidate.mjs';
const git=(root,args)=>{const r=spawnSync('git',['--no-optional-locks','-c',`core.hooksPath=${devNull}`,...args],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,
  env:{...Object.fromEntries(['PATH','TMPDIR','LANG','TZ'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_SYSTEM:devNull,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}});
  assert.equal(r.status,0,'candidate source Git identity unavailable');return r.stdout.trim();};
export function bindMeasuredNormalOwnerSource({sourceRoot,candidate}){
  assert.ok(candidate&&candidate.source_root===sourceRoot,'candidate source root mismatch');
  assert.match(candidate.source_revision??'',/^[a-f0-9]{40}$/u,'candidate source revision required');
  assertNoSymlinkPathSegments(sourceRoot,'measured candidate source');
  assert.equal(git(sourceRoot,['rev-parse','HEAD']),candidate.source_revision,'candidate source revision drift');
  assert.equal(git(sourceRoot,['status','--porcelain','--untracked-files=normal']),'','candidate source is not clean');
  const owned=candidate.owned_version??null;
  if(owned){
    const manifest=readJsonFileStrict(owned.manifest,'owned measured source manifest',16*1024*1024);
    assert.equal(canonicalDigest(manifest),owned.manifest_digest,'owned measured source manifest drift');
    assert.equal(manifest.path,sourceRoot);assert.equal(manifest.source_revision,candidate.source_revision);
    assert.equal(canonicalDigest(fullInstructionInventory(sourceRoot)),canonicalDigest(manifest.tracked_files),'measured source file inventory drift');
  }
  const body={kind:'measured_normal_owner_source_v1',source_root:sourceRoot,source_revision:candidate.source_revision,owned_version:owned};
  return {...body,binding_digest:canonicalDigest(body)};
}
export function verifyNormalOwnerSourceBinding({sourceRoot,binding}){
  assert.equal(binding?.kind,'measured_normal_owner_source_v1','bound measured candidate identity required');
  const {binding_digest,...body}=binding;assert.equal(binding_digest,canonicalDigest(body),'candidate binding drift');
  const current=bindMeasuredNormalOwnerSource({sourceRoot,candidate:binding});
  assert.equal(canonicalDigest(current),canonicalDigest(binding),'candidate binding changed');return current;
}
