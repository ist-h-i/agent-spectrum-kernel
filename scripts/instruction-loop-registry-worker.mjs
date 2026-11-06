#!/usr/bin/env node
// This configuration is an owner-supplied capability file pinned by the host
// command definition. Neither generated text nor CAS claims supply authority.
import assert from 'node:assert/strict';
import { canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace } from './content-addressed-store.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
import { verifyAssetRegistry } from './asset-registry.mjs';
import { transitionInstructionLoopAssets } from './instruction-loop-assets.mjs';
const [configFile,configDigest,request,resultFile]=process.argv.slice(2);
assert.equal(instructionBytesDigest(readStableBytes(configFile,'host Registry settings')),configDigest);
const config=readJsonFileStrict(configFile),job=readJsonFileStrict(request);
try{
  let output;
  if(job.kind==='register'){
    const generated=job.input.candidate;
    // The generation connector already registered exact bytes. Verify and
    // carry that publication forward; never manufacture another registration.
    const snapshot=generated.imported.registration.snapshot_digest;
    const checked=verifyAssetRegistry({storeRoot:config.storeRoot,snapshotDigest:snapshot,trustedAuthorityContexts:config.trustedAuthorityContexts});
    const asset=generated.candidate_asset;
    assert.ok(checked.assets.some(a=>a.record_digest===asset.record_digest&&a.content_digest===asset.content_digest));
    output={registry:{snapshot_digest:snapshot,trusted_authority_contexts:config.trustedAuthorityContexts},
      candidate_assets:[asset],baseline_assets:config.baselineAssets,generation_receipt:generated.generation_receipt};
  }else{
    assert.equal(job.kind,'version');
    const previous=job.input.previous_version??job.input.candidate.registry;
    output=transitionInstructionLoopAssets({storeRoot:config.storeRoot,snapshotDigest:previous.snapshot_digest,
      trustedAuthorityContexts:previous.trusted_authority_contexts,candidateAssets:job.input.candidate.candidate_assets,
      baselineAssets:config.baselineAssets,action:job.input.action,authority:config.authority});
  }
  writeCanonicalJsonNoReplace({outputPath:resultFile,artifact:{request_digest:canonicalDigest(job),status:'completed',output},label:'Registry loop result'});
}catch(error){
  writeCanonicalJsonNoReplace({outputPath:resultFile,artifact:{request_digest:canonicalDigest(job),status:'failed',output:{reason:String(error.message).slice(0,2048)}},label:'Registry loop failure'});
  process.exitCode=1;
}
