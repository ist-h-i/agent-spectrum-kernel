import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptCoreControllerAttribution,inspectCoreControllerAttribution,requireCoreControllerAttribution } from './ask-core-controller-attribution.mjs';
import { digest } from './ask-core-bundle-product.mjs';

const SHA='sha256:'+'a'.repeat(64),OTHER='sha256:'+'b'.repeat(64),HEAD='c'.repeat(40);
function fixture(){
 const journal={kind:'ask_core_controller_scoring_journal_v1',evidence_class:'synthetic_controller_fixture',git_head:HEAD,source_digests:{'products/ask-core-bundle/manifest.json':SHA},product_digest:SHA,request_digest:SHA,connection_source_digest:SHA,connected_normalization_digest:SHA,connected_capture_digest:SHA,connected_terminal_task_digest:SHA,public_task_inventory_digest:SHA,
  binding:{condition:'core',fixture_id:'synthetic',fixture_input_digest:SHA,normalized_result_id:'normalized-example',normalized_result_digest:SHA,terminal_workspace_tree_digest:SHA,terminal_workspace_authority_digest:SHA,terminal_workspace_authority_bytes:10,outcome:'completed',run_instance_id:'synthetic-run',case_id:'synthetic-case',attempt:'0001'},grader_input_inventory_digest:SHA,evaluator_bundle_digest:SHA,scoring_input_freeze_digest:SHA,calculation_digests:{normalized:SHA,result:SHA,evaluationReady:SHA,scoringInputs:Object.fromEntries(['freezeManifest','freezeManifestSourceDigest','catalog','policyManifest','scoringPolicy','admissionRecord','requirementRecord','outputContract','evaluatorReference'].map(k=>[k,SHA]))},producer_execution_id:'synthetic-producer',producer_context_export_digest:SHA};
 const archive={kind:'ask_core_controller_scoring_review_v1',journal_digest:SHA,git_head:HEAD,producer_execution_id:journal.producer_execution_id,producer_context_export_digest:SHA,reviewer_execution_id:'synthetic-reviewer',reviewer_context_export_digest:OTHER,reviewer_type:'independent_agent',decision:'approved',author_self_approval:false,blocking_findings:0};
 const owner={kind:'ask_core_controller_owner_attestation_v1',decision:'accept_attribution',assurance:'repository_owner_attested_controller_archive',cryptographic_provider_signature_present:false,purpose:'scoring_only_no_execution_permission',evidence_class:journal.evidence_class,journal_digest:SHA,review_archive_digest:SHA,producer_context_export_digest:SHA,reviewer_context_export_digest:OTHER};
 return {journal,archive,owner};
}
function seal(f){
 const journalBytes=Buffer.from(JSON.stringify(f.journal)),journalDigest=digest(journalBytes);f.archive.journal_digest=journalDigest;f.owner.journal_digest=journalDigest;
 const reviewArchiveBytes=Buffer.from(JSON.stringify(f.archive)),reviewArchiveDigest=digest(reviewArchiveBytes);f.owner.review_archive_digest=reviewArchiveDigest;
 const ownerAttestationBytes=Buffer.from(JSON.stringify(f.owner));return {journalBytes,journalDigest,reviewArchiveBytes,reviewArchiveDigest,ownerAttestationBytes,ownerAttestationDigest:digest(ownerAttestationBytes),expectedHead:HEAD,expectedSources:{'products/ask-core-bundle/manifest.json':SHA}};
}
test('synthetic controller fixture is opaque, immutable, noncryptographic and never execution permission',()=>{
 const input=seal(fixture()),a=acceptCoreControllerAttribution(input),p=requireCoreControllerAttribution(a.token);
 assert.equal(a.status,'synthetic_controller_fixture_not_native');assert.equal(p.realm,'synthetic');assert.equal(a.execution_permission,false);assert.equal(a.cryptographic_provider_signature_present,false);assert.equal(a.live_ready,false);
 assert.throws(()=>requireCoreControllerAttribution({}),/opaque/);assert.throws(()=>requireCoreControllerAttribution(JSON.parse(JSON.stringify(a.token))),/opaque/);
 assert.throws(()=>{p.journal.binding.condition='full';},TypeError);input.journalBytes.fill(0);assert.equal(p.journal.binding.condition,'core');
});
test('native record label only accepts owner attribution, never authenticates capture or permits execution',()=>{
 const f=fixture();f.journal.evidence_class=f.owner.evidence_class='native_controller_record';
 const a=acceptCoreControllerAttribution(seal(f));assert.equal(a.status,'owner_attested_attribution_pending_capture_verification');assert.equal(a.execution_permission,false);assert.equal(a.live_ready,false);
});
const mutations={
 same_context:f=>{f.archive.reviewer_execution_id=f.journal.producer_execution_id;},same_export:f=>{f.archive.reviewer_context_export_digest=f.owner.reviewer_context_export_digest=SHA;},self_review:f=>{f.archive.author_self_approval=true;},unapproved:f=>{f.archive.decision='unknown';},finding:f=>{f.archive.blocking_findings=1;},reviewer:f=>{f.archive.reviewer_type='producer';},changed_head:f=>{f.journal.git_head='d'.repeat(40);},archive_head:f=>{f.archive.git_head='d'.repeat(40);},changed_source:f=>{f.journal.source_digests['products/ask-core-bundle/manifest.json']=OTHER;},relabel:f=>{f.journal.binding.condition='kernel_only';},unknown_outcome:f=>{f.journal.binding.outcome='unknown';},bad_attempt:f=>{f.journal.binding.attempt=1;},bad_id:f=>{f.journal.producer_execution_id='../escape';},owner_signature:f=>{f.owner.cryptographic_provider_signature_present=true;},owner_assurance:f=>{f.owner.assurance='signed_provider_identity';},execution_grant:f=>{f.owner.purpose='allow_model_execution';},synthetic_promotion:f=>{f.journal.evidence_class='native_controller_record';},extra:f=>{f.journal.live_ready=true;},owner_absent:f=>{delete f.owner.decision;},archive_producer:f=>{f.archive.producer_execution_id='foreign';},owner_export:f=>{f.owner.producer_context_export_digest=OTHER;}
};
for(const [name,change]of Object.entries(mutations))test(`coherent rehash refuses ${name}`,()=>{const f=fixture();change(f);assert.throws(()=>acceptCoreControllerAttribution(seal(f)));});
test('external raw digests, duplicate keys, bounded UTF8 bytes and closed input remain mandatory',()=>{
 for(const key of ['journalDigest','reviewArchiveDigest','ownerAttestationDigest']){const input=seal(fixture());input[key]=OTHER;assert.throws(()=>acceptCoreControllerAttribution(input));}
 for(const bytes of [Buffer.alloc(1048577),Buffer.from([0xff]),Buffer.from('{"kind":"one","kind":"two"}')]){const input=seal(fixture());input.ownerAttestationBytes=bytes;input.ownerAttestationDigest=digest(bytes);assert.throws(()=>acceptCoreControllerAttribution(input));}
 const input=seal(fixture());input.privateRoot='/private';assert.throws(()=>acceptCoreControllerAttribution(input));
});
test('pure inspection creates no active opaque context and retains failure outcomes',()=>{
 for(const outcome of ['failed','unavailable','interrupted','invalid']){const f=fixture();f.journal.binding.outcome=outcome;const p=inspectCoreControllerAttribution(seal(f));assert.equal(p.journal.binding.outcome,outcome);assert.throws(()=>requireCoreControllerAttribution(p),/opaque/);}
});
