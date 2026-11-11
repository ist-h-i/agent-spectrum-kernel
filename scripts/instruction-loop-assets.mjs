// Reuse Registry lifecycle and preserve immutable blobs/snapshots. The caller
// supplies owner authority as a trusted host capability, not generation output.
import assert from 'node:assert/strict';
import { canonicalDigest } from './content-addressed-store.mjs';
import { verifyAssetRegistry, buildAssetLifecycleAuthorityContext,
  applyAssetLifecycleTransitions } from './asset-registry.mjs';
const same=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
export function validateInstructionLoopAssetAuthority(authority){
  assert.ok(authority&&typeof authority==='object','Asset lifecycle authority is required before reserving a version operation');
  assert.deepEqual(Object.keys(authority).sort(),['authority_evidence_digest','authority_id','authority_revision','kind'],'Asset lifecycle authority has unsupported fields');
  assert.equal(authority.kind,'external_asset_lifecycle_authority');
  assert.match(authority.authority_id??'',/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/,'Asset lifecycle authority_id is required');
  assert.ok(typeof authority.authority_revision==='string'&&authority.authority_revision.length<=254&&/\S/.test(authority.authority_revision),'Asset lifecycle authority_revision is required');
  assert.match(authority.authority_evidence_digest??'',/^sha256:[a-f0-9]{64}$/,'Asset lifecycle authority evidence digest is required');
}
export function transitionInstructionLoopAssets({storeRoot,snapshotDigest,trustedAuthorityContexts=[],
  candidateAssets,baselineAssets=[],action,authority,baselineSnapshotDigest=null}){
  assert.ok(['activate','retire','restore'].includes(action));
  validateInstructionLoopAssetAuthority(authority);
  assert.ok(candidateAssets.length>0);
  let snapshot=verifyAssetRegistry({storeRoot,snapshotDigest,trustedAuthorityContexts});
  const history=[],trusted=[...trustedAuthorityContexts];
  const ref=e=>({asset_type:e.asset_type,stable_id:e.stable_id,version:e.version,record_digest:e.record_digest,content_digest:e.content_digest});
  const entry=asset=>{const e=snapshot.assets.find(e=>same(ref(e),asset));assert.ok(e,'loop Asset missing from Registry');return e;};
  const change=(transitions,kind='external_asset_lifecycle_authority')=>{
    if(!transitions.length)return;
    const context=buildAssetLifecycleAuthorityContext({registryId:snapshot.registry_id,repositoryId:snapshot.repository_id,
      scopeId:snapshot.scope_id,predecessorSnapshotDigest:snapshotDigest,transitions,
      authority:{...authority,kind,authority_revision:`${authority.authority_revision}.${history.length}`}});
    const saved=applyAssetLifecycleTransitions({storeRoot,predecessorSnapshotDigest:snapshotDigest,authorityContext:context,trustedAuthorityContexts:trusted});
    trusted.push(context);snapshotDigest=saved.snapshot_digest;history.push(saved);
    snapshot=verifyAssetRegistry({storeRoot,snapshotDigest,trustedAuthorityContexts:trusted});
  };
  const move=(assets,from,to)=>assets.filter(a=>entry(a).state===from).map(asset=>({asset,from_state:from,to_state:to}));
  let originalStates=null;
  if(action==='restore'){
    if(baselineSnapshotDigest){
      const original=verifyAssetRegistry({storeRoot,snapshotDigest:baselineSnapshotDigest,trustedAuthorityContexts});
      originalStates=new Map(baselineAssets.map(asset=>{
        const found=original.assets.find(a=>same(ref(a),asset));assert.ok(found&&['candidate','admitted','current','historical','superseded'].includes(found.state),'baseline lifecycle anchor missing or retired');
        assert.equal(entry(asset).state,found.state==='current'?'historical':found.state,'baseline lifecycle changed after application');return [canonicalDigest(asset),found.state];
      }));
    }else{
      assert.ok(baselineAssets.length>0,'baseline Asset bindings required for restore');
      assert.ok(baselineAssets.every(a=>['current','historical','superseded'].includes(entry(a).state)),
        'baseline was never an authorized current version');
    }
  }
  if(action==='activate'){
    change(move(candidateAssets,'candidate','admitted'));
    change([...move(baselineAssets,'current','historical'),...move(candidateAssets,'admitted','current')]);
    assert.ok(candidateAssets.every(a=>entry(a).state==='current'));
  }else if(action==='retire'){
    assert.ok(candidateAssets.every(a=>entry(a).state!=='current'),'cannot clean an active candidate');
    change(candidateAssets.filter(a=>entry(a).state!=='retired').map(asset=>({asset,from_state:entry(asset).state,to_state:'retired'})));
  }else{
    assert.ok(originalStates||baselineAssets.length>0,'baseline Asset bindings required for restore');
    change(move(candidateAssets,'current','historical'));
    const restore=originalStates?baselineAssets.filter(a=>originalStates.get(canonicalDigest(a))==='current'):baselineAssets;
    change([...move(restore,'historical','current'),...move(restore,'superseded','current')],'external_asset_rollback_authority');
    // A baseline captured only as a candidate is not silently promoted into a
    // historical current version. Its lifecycle needs an explicit owner basis.
    assert.ok(baselineAssets.every(a=>entry(a).state===(originalStates?.get(canonicalDigest(a))??'current')),'baseline lifecycle was not exactly restored');
  }
  return {snapshot_digest:snapshotDigest,trusted_authority_contexts:trusted,history,action,
    physical_application_claimed:false,formal_quality_admission_implied:false};
}
