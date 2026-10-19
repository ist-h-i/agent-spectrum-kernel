// Additive exact-source task descriptors. The v2 renderer and legacy nine closure stay byte-exact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {kernelPrinciplesV2FixtureDescriptor as legacyDescriptor, principlesV2Capability as legacyCapability} from './kernel-principles-v2.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const prefix = 'kernel_principles_v2.task_signal@catalog24-1:';
const fixtures = new Map([
  ["hi-authorization-exception", "pr_review", "review", "security_boundary", "c6aad90c430b4a8a48c3ad8ef5722e80a856118de4d37621008275a1eefc341b", "b14ddb23d2d9c2e81efc18fbcc67ab7495a2b161b3089bcfe92a472b21d3b2ce"],
  ["hi-external-action-approval", "operation_boundary", "design", "external_effect", "8b065a53f88da86e655b90ca99a23703189314c9060da1a72ac309833ed10267", "52f6ec9df34f0e2fa8fea2b5d32fcac57e8e578f79b0b2a342a18d6e05347770"],
  ["hi-financial-state-integrity", "investigation_implementation", "implementation", "financial_integrity", "5244dda996f874f01871685f0f6db3fb42342e4d6d35eff87ce5904e7ddd5d65", "e6bbf3b307cb24aa7f4dbf10ccbc047cb28d4a90d1a931ad80fcfdb857bbdb78"],
  ["hi-versioned-migration-safety", "migration_design", "design", "data_integrity", "1a187cbd0cf7ff96b34c8e749dcaf34672162cde546e2c6e0e9726aad32d8e86", "840b9bb3e73f1ffece0cef8a21edadf2165b8b3015763b2452da4dbafb8631a8"],
  ["mn-client-compatibility-fix", "local_implementation", "implementation", "none", "5257ecb3066b8382766d5a4193fa1ee0eeb6b25a0bd3f405882eb8ace3189356", "08b06312ceefa59b7133b9df51814a90cad82a47898aff9e1a216da9744b57ce"],
  ["mn-frontend-default-fix", "local_bug_fix", "implementation", "none", "83573d35a482fe08277dc6a19b8d476f6cca035ea8609fa248b2db101ae43ba1", "1246cb2b29232a3ccad9116d10e574d957becb44d5cf00fd605d72a486e3fb19"],
  ["mn-schema-field-alignment", "small_feature", "implementation", "none", "83473c67c7aa4762b1f2d861ae26e6f4a4de03468fbf2ab7a7aeaa40bd2b3b97", "37eb7275d39f4f4765c1df95ae4c387a9758ccf10c667a84a88c2b74d97f069d"],
  ["pf-api-pagination-behavior", "implementation_verification", "implementation", "none", "ad441a90a6e8a0ac878e5873b99b14010077f1610bfa7d814c4b17e17a34ba66", "2c04911ec32d3997a7beb7a93404e805e66e7aa24fc1e28fc1e765f9eb2ef1a0"],
  ["pf-ci-cache-flake", "investigation", "investigation", "none", "d514b2e3db7112454ea34247b3632d995dd1fa7173b7e98cb3ecba462ef3904c", "9b096cf6f5dcb9d24ec7534732f1bd63a956851f224feb055b197b7e14ed7b5f"],
  ["pf-data-schema-evolution", "implementation_verification", "implementation", "rollback_required", "824c949a00ae0a5f7539d0280126aa025d468b819e147c36faea2ad2f68f7451", "41dea0e7273d33ebe4d312722e15ea4af6a8e7e2c4c12662daf15c4c402ee68a"],
  ["pf-frontend-async-state", "investigation_implementation", "implementation", "none", "bbf8c0fcc5db005958a0ddc531279a7a5bfc4a5f7ed424441dea629dd72d89dd", "5bda94e51b82acc23ddabd5472aa2d9101e8d5336f47d8c2ee6e33b6440b5b06"],
  ["pf-library-compat-upgrade", "dependency_migration", "implementation", "rollback_required", "9bd5fb4ce2660b02e5e3d2ce55aeb8b0631c74e790962143e590428500dea2ee", "faa0aa58e94fd40aa07187eddedee77b9a6517d9196e2e7e8e907f0849975d7f"],
  ["pf-observability-redaction", "implementation_review", "review", "security_boundary", "eca02950ba10488accb9529ead7f622dff91ca94d130789e8a21904fa7f31b66", "552d9ccfe54fa319800bff1648bae94110a8b08516374d55cf37efd015babdf4"],
  ["pf-performance-regression", "investigation_implementation", "implementation", "none", "5cc8c8ea485e46b9931006a75ccc7cbf9ba971e915757ae7737c167df87d8465", "35eda9b698e574636d06bdc83b17b06c2aa79d9500a3b31dfc39b067c551533b"],
  ["pf-review-error-contract", "pr_review", "review", "none", "26059d1c2ed472de461778213f77cbc172a69e6946a9ff711e2393e0fabf3928", "1f9c1a0b0d0ff439d9a10d23339cce637756138b23aa1dd97687d1a6e2dd1869"],
].map(([id,declared,selected,risk,taskDigest,metadataDigest])=>[id,{declared,selected,risk,taskDigest,metadataDigest}]));
const refsFor=(id,f)=>[`benchmarks/fixtures/checkpoint-b2/${id}/task.md#sha256:${f.taskDigest}`,
 `benchmarks/fixtures/checkpoint-b2/${id}/metadata.json#sha256:${f.metadataDigest}`,
 `${prefix}${JSON.stringify({fixture_id:id,declared_task_class:f.declared,selected_task_class:f.selected,risk_boundary:f.risk})}`];
export function kernelPrinciplesV2DescriptorSourcePaths(id){
 const paths=['scripts/kernel-principles-v2.mjs','scripts/kernel-principles-candidate-v2.mjs','scripts/kernel-principles.mjs'];
 return fixtures.has(id)?[...paths,'scripts/kernel-principles-v2-catalog24.mjs']:paths;
}
export function kernelPrinciplesV2FixtureDescriptor(id,taskBytes,metadataBytes){
 const fixture=fixtures.get(id);if(!fixture)return legacyDescriptor(id,taskBytes,metadataBytes);
 assert.equal(hash(taskBytes),fixture.taskDigest,'public task drift requires descriptor review');
 assert.equal(hash(metadataBytes),fixture.metadataDigest,'public metadata drift requires descriptor review');
 const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(metadataBytes));
 assert.equal(metadata.fixture_id,id);assert.equal(metadata.fixture_role,'primary');
 assert.equal(metadata.task_class,fixture.declared);assert.equal(metadata.risk_boundary,fixture.risk);
 return {task_class:fixture.selected,requirement_scan:{status:'complete',evidence_refs:refsFor(id,fixture)},required_procedures:[]};
}
export function principlesV2Capability(descriptor){
 const refs=descriptor?.requirement_scan?.evidence_refs;
 assert.ok(Array.isArray(refs),'requirement scan evidence refs required');
 for(const ref of refs.filter(ref=>typeof ref==='string'&&ref.startsWith(prefix))){
  const record=JSON.parse(ref.slice(prefix.length)),fixture=fixtures.get(record.fixture_id);
  assert.ok(fixture,'unknown catalog24 fixture task signal record');assert.equal(ref,refsFor(record.fixture_id,fixture)[2],'fixture task signal record changed');
 }
 for(const [id,fixture]of fixtures){
  const expected=refsFor(id,fixture),root=`benchmarks/fixtures/checkpoint-b2/${id}/`;
  if(refs.some(ref=>typeof ref==='string'&&(ref.startsWith(root)||ref===expected[2]))){
   assert.equal(descriptor.task_class,fixture.selected,'fixture task class changed');
   assert.ok(expected.every(ref=>refs.includes(ref)),'fixture evidence refs incomplete or changed');
  }
 }
 return legacyCapability(descriptor);
}
