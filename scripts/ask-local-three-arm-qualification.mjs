import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { validateMpCiEvidenceGapInputClosure } from "./ask-benchmark-mp-ci-evidence-gap.mjs";
import { verifyPublicEvaluatorReference } from "./ask-benchmark-evaluator-boundary.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
const REFERENCE="benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/evaluator-reference.json";
const REFERENCE_SHA="sha256:16aa4e11e6dd3cae7ae9b1d445b388f3b4177d9c797fa833657bc5ed03f7ddb2";
const hash=b=>`sha256:${createHash("sha256").update(b).digest("hex")}`;
function raw(root,path){
 if(typeof path!=="string"||isAbsolute(path)||path.includes("\\")||path.split("/").some(x=>!x||x==="."||x===".."))throw new Error("invalid_public_source_path");
 return readStableFile(resolve(root,path),"public qualification source",1048576).bytes;
}
function canonicalRoot(root){
 if(typeof root!=="string"||!isAbsolute(root)||resolve(root)!==root||realpathSync(root)!==root
  ||!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink())throw new Error("invalid_frozen_source_root");
 return root;
}
/** Existing public contracts only. No private bundle, old result, generation or execution. */
export function qualifyThreeArmPublicTask(root,options={}) {
  const result = { task: "mp-ci-evidence-gap", status: "blocked", live_ready: false,
    public_inputs: { status: "unknown" }, public_evaluator_task_binding:{status:"blocked",reason:"input_reference_binding_unverified"}, public_evaluator_reference: { status: "unknown" },
    private_evaluator: "unknown", human_admission_review: "unknown", kernel_zero_skill_workflow: "unknown",
    actual_cli_capability_use: "unknown", actual_process_denies: "unknown" };
  if(Object.keys(options).some(x=>x!=="frozenSourceRoot"))throw new Error("invalid_qualification_options");
  try {
    const input = validateMpCiEvidenceGapInputClosure({ root });
    result.public_inputs = { status: "verified", input_digest: input.inputDigest, verification_digest: input.verificationDigest };
  } catch { result.public_inputs = { status: "blocked", reason: "public_input_contract_refused" }; }
  let reference;
  try{const bytes=raw(root,REFERENCE);if(hash(bytes)!==REFERENCE_SHA)throw new Error();reference=parseJsonRejectDuplicateKeys(bytes.toString("utf8"));}
  catch{result.public_evaluator_reference={status:"blocked",reason:"pinned_public_reference_refused"};return result;}
  // Report only paths already declared in the public source identity. Never
  // discover private stores or echo arbitrary verifier errors into records.
  try{
    const drift=reference.evaluator_source_identity.source_files.filter(entry=>{
      try{const b=raw(root,entry.path);return b.length!==entry.bytes||hash(b)!==entry.sha256;}catch{return true;}
    }).map(x=>x.path);
    result.current_checkout_evaluator={status:drift.length?"blocked":"source_bytes_match",drift_paths:drift};
  }catch{result.current_checkout_evaluator={status:"blocked",reason:"public_source_inventory_refused"};}
  try {
    const sourceRoot=options.frozenSourceRoot===undefined?root:canonicalRoot(options.frozenSourceRoot);
    const ref = verifyPublicEvaluatorReference({ root:sourceRoot, referencePath:resolve(root,REFERENCE) });
    if(hash(raw(root,REFERENCE))!==REFERENCE_SHA)throw new Error("pinned_public_reference_refused");
    if(options.frozenSourceRoot!==undefined){
      const head=execFileSync("git",["-C",sourceRoot,"rev-parse","HEAD"],{encoding:"utf8",timeout:10000,maxBuffer:1024,stdio:["ignore","pipe","ignore"]}).trim();
      if(head!==ref.evaluator_revision)throw new Error("frozen_source_revision_refused");
    }
    result.public_evaluator_task_binding=result.public_inputs.status==="verified"
      &&ref.fixture_id===result.task&&ref.fixture_input_digest===result.public_inputs.input_digest
      ?{status:"verified",fixture:ref.fixture_id,input_digest:ref.fixture_input_digest}
      :{status:"blocked",reason:"input_reference_binding_refused"};
    result.public_evaluator_reference = { status: "verified", fixture: ref.fixture_id,
      bundle_digest: ref.evaluator_bundle_digest, source_revision: ref.evaluator_revision,
      source_tree_digest:ref.evaluator_source_identity.source_tree_digest,
      source_mode:options.frozenSourceRoot===undefined?"current_checkout":"existing_frozen_checkout" };
  } catch {
    result.public_evaluator_reference = { status: "blocked", reason: "existing_public_evaluator_source_or_binding_refused" };
  }
  return result;
}
/** Static missing-route proof only; never invent a replacement Kernel policy. */
export function qualifyKernelWorkflow(root,preparation){
 const files=preparation?.conditions?.kernel_only?.files,inputs=preparation?.task_inputs;
 const guidance=raw(root,"AGENTS.md");
 if(preparation?.task!=="mp-ci-evidence-gap"||!files||!inputs
  ||JSON.stringify(Object.keys(files).sort())!==JSON.stringify([...Object.keys(inputs),"AGENTS.md"].sort())
  ||files["AGENTS.md"]?.digest!==hash(guidance)||files["AGENTS.md"]?.bytes!==guidance.length
  ||!guidance.toString("utf8").includes("Non-trivial delivery/quality, design, investigation, review, risk-gated, or handoff work | `skill-router`"))throw new Error("kernel_condition_refused");
 return {status:"blocked",reason:"capability_missing",condition:"kernel_only",task_class:"review_verification",
  guidance_digest:hash(guidance),selected_skills:[],missing_routes:["skill-router"],required_baseline_gate:"review-ai-quality",
  action:"stop_before_native_launch",substitute_instructions:false,fair_successful_workflow:"not_admitted",actual_runtime_behavior:"unknown"};
}
