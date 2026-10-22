#!/usr/bin/env node
// Preparation is read-only to Codex state. Running still requires separate
// operator authorization for the program's normal database/auth startup effects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {closeSync,fsyncSync,mkdirSync,openSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparePrimaryCatalogProbe,collectPrimarySqliteCatalogProtocolV3} from './ask-primary-protocol-catalog-probe.mjs';
import {validatePrimarySqliteDiagnosticReferencesV3} from './ask-primary-sqlite-startup-diagnostics-v3.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {parseJsonRejectDuplicateKeys} from './content-addressed-store.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),SOURCE=resolve(HERE,'..');
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const serialize=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const POLICY='initialize_catalog_only_sqlite_location_diagnostics_v3';
const effects=Object.freeze(['database_directory_file_creation','read_write_WAL_sidecars','schema_migrations_and_backfill','conditional_backup_move_and_rebuild','existing_auth_state_updates_and_background_traffic']);
function outputPath(output){
 assert.ok(isAbsolute(output)&&resolve(output)===output&&realpathSync(dirname(output))===dirname(output),'canonical existing output parent required');
 const local=relative(SOURCE,output);assert.ok(local.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(local),'output cannot overlap probe source');
 return output;
}
function sourcePins(){return ['scripts/ask-primary-sqlite-catalog-probe-v3.mjs','scripts/ask-primary-sqlite-startup-diagnostics-v3.mjs','docs/fixtures/primary-codex-command-wire-01621.json'].map(path=>({path,digest:readStableFile(join(SOURCE,path),'V3 reviewed source',2*1024*1024).rawByteDigest}));}
/** No Codex/CLI/DB/config/auth operation. Pins existing executable files only. */
export function preparePrimarySqliteCatalogProbeV3(launcher,output){
 outputPath(output);
 return{kind:'ask_primary_catalog_probe_plan_v3',policy:POLICY,output_root:output,catalog_plan:preparePrimaryCatalogProbe(launcher),source_pins:sourcePins(),
  diagnostic_references:validatePrimarySqliteDiagnosticReferencesV3({default_home_digest:hash(join(homedir(),'.codex')),declared_output_parent:dirname(output)}),
  reference_meaning:'conventional_home_dot_codex_and_lexical_output_parent_not_effective_config',attempt:1,retry:0,timeout_ms:60000,
  startup_effects_requiring_separate_permission:[...effects]};
}
function writeNew(path,value){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,serialize(value));fsyncSync(fd);}finally{closeSync(fd);}}
export async function runPrimarySqliteCatalogProbeV3(planPath,output,confirm){
 const raw=readStableFile(planPath,'V3 approved one-shot plan',64*1024).bytes;assert.equal(hash(raw),confirm,'V3 plan confirmation mismatch');
 const plan=parseJsonRejectDuplicateKeys(raw.toString('utf8'));assert.equal(plan.kind,'ask_primary_catalog_probe_plan_v3','V3 plan required');
 assert.equal(output,plan.output_root,'V3 fixed output changed');assert.equal(plan.policy,POLICY);
 assert.deepEqual(plan,preparePrimarySqliteCatalogProbeV3(plan.catalog_plan.launcher.path,output),'V3 plan or pinned chain changed');
 assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'Node injection variables outside V3 contract');
 mkdirSync(output,{mode:0o700});const cwd=join(output,'workspace');mkdirSync(cwd,{mode:0o700});
 writeNew(join(output,'intent.json'),{kind:'ask_primary_catalog_probe_intent_v3',policy:POLICY,plan_digest:confirm,attempt:1,retry:0,timeout_ms:60000,
  expected_startup_effects:[...effects],diagnostic_references:plan.diagnostic_references,source_pins:plan.source_pins});
 const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
 let summary;try{summary=await collectPrimarySqliteCatalogProtocolV3({executable:plan.catalog_plan.node.path,
  argv:[plan.catalog_plan.launcher.path,'app-server','--listen','stdio://'],cwd},plan.diagnostic_references,{signal:controller.signal});}
 finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);}
 writeNew(join(output,'summary.json'),summary);return summary;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{
  assert.ok(args.length===5&&args[0]==='run'&&args[3]==='--confirm','expected run PLAN OUTPUT --confirm DIGEST');
  const result=await runPrimarySqliteCatalogProbeV3(args[1],args[2],args[4]);console.log(JSON.stringify(result));process.exitCode=result.status==='observed'?0:1;
 }catch{console.log(JSON.stringify({kind:'ask_primary_catalog_probe_refusal_v3',status:'unavailable',reason:'preflight_or_persistence_refused',model_calls:0}));process.exitCode=1;}
}
