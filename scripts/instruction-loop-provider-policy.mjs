// Shipped model-port selection only. This does not probe executables/auth,
// authorize model calls, or constrain custom trusted runtime implementations.
import assert from 'node:assert/strict';
const supported=new Set(['fixture','codex']);
function providerKind(provider,role,externalHost=false){
  assert.ok(provider&&typeof provider==='object'&&!Array.isArray(provider)&&(supported.has(provider.kind)||externalHost&&provider.kind==='external_host'),
    `unsupported ${role} provider; shipped automatic ports support codex or synthetic fixture; Claude app dispatch is not implemented`);
  return provider.kind;
}
export function inspectInstructionLoopProviderSelection(p){
  if(p.report?.scoringProvider)assert.equal(p.kind,'full_native_reference_loop_profile_v1','host scoring provider is native-only');
  assert.ok(['component_practical_instruction_loop_profile_v1','full_practical_instruction_loop_profile_v1','full_native_reference_loop_profile_v1'].includes(p.kind),'unsupported standard instruction-loop profile');
  const component=p.kind==='component_practical_instruction_loop_profile_v1';
  const authoring=component?(p.candidate?.authoring?providerKind(p.candidate.authoring.provider,'authoring',true):'not_configured'):providerKind(p.generator?.provider,'authoring');
  const native=p.kind==='full_native_reference_loop_profile_v1';
  if(native)assert.ok(['model_free_fixture','real_codex'].includes(p.native?.executionKind),'unsupported native trial execution kind');
  const assessor=native?'not_configured':p.practical?.assessor==null?'host_ai':providerKind(p.practical.assessor,'recovery assessor');
  const commands=native?[]:Object.values(p.practical?.conditions??{}),standard=commands.filter(c=>c.codex).length;
  return {instruction_adapter:component?p.adapter:'codex',authoring_provider:!component&&p.generator.provider.retainedAuthoring?'retained_codex_response':authoring,
    recovery_assessor:assessor,
    trial_transport:native?'codex_native_reference':standard===0?'pinned_commands':standard===commands.length?'standard_codex':'mixed_standard_codex_and_pinned_commands',normal_target_configured:p.normal?.target!=null,
    ...(p.normal?.kind==='ask_source_repository_v1'?{application_transport:'source_publication_external_host'}:{})};
}
