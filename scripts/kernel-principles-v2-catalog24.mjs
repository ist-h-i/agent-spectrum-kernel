// Reviewed current public task/metadata pins; historical closures remain in their matching Git sources/resources.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {kernelPrinciplesV2FixtureDescriptor as legacyDescriptor, principlesV2Capability as legacyCapability} from './kernel-principles-v2.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
import { validatePrimaryMetadataTaskBytes, PRIMARY_METADATA_TASK_POLICY } from './ask-primary-metadata-task-contract.mjs';
const semanticPins = new Map([
  [
    "hi-financial-state-integrity",
    "sha256:afea6283cd67005b7eaef6c630e60f7920830600a89cd05bc70625dbf4af8a67"
  ],
  [
    "mn-frontend-default-fix",
    "sha256:962fd1449651077a4e51475459edb7afc048b3da65f5704ec72e585cae057be4"
  ],
  [
    "pf-api-pagination-behavior",
    "sha256:da720fd53c9d80a07d43865c8169aa241297ed040fb992222e67cc26358f5870"
  ],
  [
    "pf-frontend-async-state",
    "sha256:950599f11b934c82fde72f5fda2b4931323a75d452826c576c9dd260e8ee67ec"
  ]
]);
const semanticPrefix = 'kernel_principles_v2.task_signal@catalog24-2:';
const prefix = 'kernel_principles_v2.task_signal@catalog24-1:';
const fixtures = new Map([
  ["hi-authorization-exception", "pr_review", "review", "security_boundary", "d63648ae9c68342c8ab6d06129ddea0126794c5cb1ed0501d171828975d0da04", "214e37d7f3c7f2f10a9acc5f0a9cce32ad6d88eaa0de1cdc8fe831f3d2062a39"],
  ["hi-external-action-approval", "operation_boundary", "design", "external_effect", "aac0e8939e90ca010a094d0a1b9b9c97620024a336a6114a65d8ee938089df63", "f41663faf1437f359dd0d52a8bc32c36f9c88102739e19b29b5fc8a7268bf715"],
  ["hi-financial-state-integrity", "investigation_implementation", "implementation", "financial_integrity", "27f0fa070778accebc11dc3cc97037b7582a71a478c87eb2b4728f147a80418c", "97e049730a530e52cf512f971ad9be20e491b8312c1914afc6ca663b57b5bc48"],
  ["hi-versioned-migration-safety", "migration_design", "design", "data_integrity", "e471420832367631d065d04d53cd94fed1f1b0aba7863a1418cab515ca5c0a34", "34f5df9ea2b83e1f83ef1c37227344165f45be42a6c15fe549f56917db4a6b70"],
  ["mn-client-compatibility-fix", "local_implementation", "implementation", "none", "3cdefd561b94e3f6a78df193c93555eeed5b46a69bfc1a98f3ccb94a143216c7", "32eb52eb50f561d2aa46f5ce33f5c32b817d6751b4b08d6aea86af6dd0aaf4c0"],
  ["mn-frontend-default-fix", "local_bug_fix", "implementation", "none", "ff61638ce2f18e9b8734646ea7af5f2ebbb5c62c4e8457151b143426bc536150", "51adde148cdd6ee95a630583d286aaaaa12b9832d5c7ac8b8fea656b5060f1dc"],
  ["mn-schema-field-alignment", "small_feature", "implementation", "none", "1172c442e52f22fe633cf337455d9dedbf0ae29e377507cafcb6574bf4c01dcc", "824eb45ccc25139650cb76bc733fbc18f666de16061c4d9648cdc5e52b2bf4cb"],
  ["pf-api-pagination-behavior", "implementation_verification", "implementation", "none", "40c4bcb69ef647878b8e655d132326aa1691869d7925a0ee7d615074d8456999", "664de0da41a0f557e9a704fb6ecc782fa79e11e6d75104c9467713fdf57790d7"],
  ["pf-ci-cache-flake", "investigation", "investigation", "none", "2a71b04e7cba6076a01ec9a818d217d97a5ac1179d142ba67927079939484aa5", "3fe263ba476ec8ee954a69f4cfc4e8a45bbcbed4e7762912e7e1cc4d5ff8b88d"],
  ["pf-data-schema-evolution", "implementation_verification", "implementation", "rollback_required", "8fa6ea6b5755f2f424ac4a6e2d526b683ebe116d7eb1d86c673f8533878d8e18", "b3cf829f19f9944c4f97174c28a16345157de55571d2f932ca25200f6e621a65"],
  ["pf-frontend-async-state", "investigation_implementation", "implementation", "none", "a1aaa101028939b31f171d8dc7531a1aa1b605c67dc2356162f6dc0b051b0127", "77972b4372115cb6750ab13aaa240db5cedcb7a8089a7d6a19e3643a88b637c1"],
  ["pf-library-compat-upgrade", "dependency_migration", "implementation", "rollback_required", "2eb765aca7a50805b863c4fbdc1ff4b0c593e17f232587b2a8b3ae35e6feb74a", "d06eb6da883d2e2093b56ce6620e852f385c69b5aff062c3b4befb82b47d0229"],
  ["pf-observability-redaction", "implementation_review", "review", "security_boundary", "79b4aacb74fbdb14fd096abaeb5e73c2c5854f873bba7fa3462cf679f18f36cf", "e09f6e5d1dbc07c67da4c39035e3c79e54b8f99249b6a7825436729ac301f0f9"],
  ["pf-performance-regression", "investigation_implementation", "implementation", "none", "46bb7cda29d207deb0460791710f53378ad4eedca49b5e675f54b3726f8c1782", "bf14482e073cccbf22f9a2699391c8ecf5365a0bf8b345e0badab30d4c8b5587"],
  ["pf-review-error-contract", "pr_review", "review", "none", "800778683315b66db315c3cc691fa79c8502302dd5217b43085bf7cfb918d622", "c26f291c5c6e9b4bc410bbed20d8106dcc09d9679adad0a795c6e88fad885823"],
].map(([id,declared,selected,risk,taskDigest,metadataDigest])=>[id,{declared,selected,risk,taskDigest,metadataDigest}]));
const refsFor=(id,f,rawDigest=f.metadataDigest)=>[`benchmarks/fixtures/checkpoint-b2/${id}/task.md#sha256:${f.taskDigest}`,
 `benchmarks/fixtures/checkpoint-b2/${id}/metadata.json#sha256:${rawDigest}`,
 `${semanticPins.has(id)?semanticPrefix:prefix}${JSON.stringify({fixture_id:id,declared_task_class:f.declared,selected_task_class:f.selected,risk_boundary:f.risk})}`,
 ...(semanticPins.has(id)?[`${PRIMARY_METADATA_TASK_POLICY}:${id}:${semanticPins.get(id)}`]:[])];
export function kernelPrinciplesV2DescriptorSourcePaths(id){
 const paths=['scripts/kernel-principles-v2.mjs','scripts/kernel-principles-candidate-v2.mjs','scripts/kernel-principles.mjs'];
 return fixtures.has(id)?[...paths,'scripts/kernel-principles-v2-catalog24.mjs','scripts/ask-primary-metadata-task-contract.mjs','scripts/content-addressed-store.mjs']:paths;
}
export function kernelPrinciplesV2FixtureDescriptor(id,taskBytes,metadataBytes){
 const fixture=fixtures.get(id);if(!fixture)return legacyDescriptor(id,taskBytes,metadataBytes);
 assert.equal(hash(taskBytes),fixture.taskDigest,'public task drift requires descriptor review');
 if(!semanticPins.has(id))assert.equal(hash(metadataBytes),fixture.metadataDigest,'public metadata drift requires descriptor review');
 const metadata=semanticPins.has(id)?validatePrimaryMetadataTaskBytes(metadataBytes,semanticPins.get(id)):JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(metadataBytes));
 assert.equal(metadata.fixture_id,id);assert.equal(metadata.fixture_role,'primary');
 assert.equal(metadata.task_class,fixture.declared);assert.equal(metadata.risk_boundary,fixture.risk);
 return {task_class:fixture.selected,requirement_scan:{status:'complete',evidence_refs:refsFor(id,fixture,hash(metadataBytes))},required_procedures:[]};
}
export function principlesV2Capability(descriptor,{metadataBytes}={}){
 const refs=descriptor?.requirement_scan?.evidence_refs;
 assert.ok(Array.isArray(refs),'requirement scan evidence refs required');
 for(const ref of refs.filter(ref=>typeof ref==='string'&&(ref.startsWith(prefix)||ref.startsWith(semanticPrefix)))){
  const record=JSON.parse(ref.slice(ref.startsWith(semanticPrefix)?semanticPrefix.length:prefix.length)),fixture=fixtures.get(record.fixture_id);
  assert.ok(fixture,'unknown catalog24 fixture task signal record');assert.equal(ref,refsFor(record.fixture_id,fixture)[2],'fixture task signal record changed');
 }
 for(const ref of refs.filter(ref=>typeof ref==='string'&&ref.startsWith(`${PRIMARY_METADATA_TASK_POLICY}:`))){
  const id=ref.slice(PRIMARY_METADATA_TASK_POLICY.length+1).split(':')[0];
  assert.ok(semanticPins.has(id),'unknown task metadata semantic fixture');
  assert.equal(ref,`${PRIMARY_METADATA_TASK_POLICY}:${id}:${semanticPins.get(id)}`,'task metadata semantic evidence changed');
 }
 for(const [id,fixture]of fixtures){
  const rawDigest=semanticPins.has(id)&&metadataBytes?hash(metadataBytes):fixture.metadataDigest;
  const expected=refsFor(id,fixture,rawDigest),root=`benchmarks/fixtures/checkpoint-b2/${id}/`;
  if(refs.some(ref=>typeof ref==='string'&&(ref.startsWith(root)||ref===expected[2]||(semanticPins.has(id)&&ref===expected[3])))){
   if(semanticPins.has(id)){
    assert.ok(metadataBytes instanceof Uint8Array,'catalog task capability requires metadata bytes');
    validatePrimaryMetadataTaskBytes(metadataBytes,semanticPins.get(id));
   }
   assert.equal(descriptor.task_class,fixture.selected,'fixture task class changed');
   assert.ok(expected.every(ref=>refs.includes(ref)),'fixture evidence refs incomplete or changed');
  }
 }
 return legacyCapability(descriptor);
}
