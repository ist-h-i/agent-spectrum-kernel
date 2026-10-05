import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { qualifyThreeArmPublicTask, qualifyKernelWorkflow } from "./ask-local-three-arm-qualification.mjs";
import { prepareThreeArm, runSyntheticThreeArm, replayThreeArm } from "./ask-local-three-arm.mjs";
const SOURCE=join(dirname(fileURLToPath(import.meta.url)),"..");
const REVISION="ab2ce5fedf1e5fe12eff2b161048332da09ce0de";
function fixture(t){
 const parent=mkdtempSync(join(realpathSync(tmpdir()),"ask-public-qualification-")),frozen=join(parent,"frozen");
 execFileSync("git",["-C",SOURCE,"worktree","add","--detach",frozen,REVISION],{stdio:"ignore"});
 t.after(()=>{execFileSync("git",["-C",SOURCE,"worktree","remove","--force",frozen],{stdio:"ignore"});rmSync(parent,{recursive:true,force:true});});
 return {parent,frozen};
}
test("existing frozen public source qualifies without resealing or private admission",t=>{
 const {frozen}=fixture(t),q=qualifyThreeArmPublicTask(SOURCE,{frozenSourceRoot:frozen});
 assert.equal(q.public_inputs.status,"verified");
 assert.equal(q.current_checkout_evaluator.status,"blocked");
 assert.ok(q.current_checkout_evaluator.drift_paths.includes("benchmarks/schemas/private-evaluator-fragment.schema.json"));
 assert.equal(q.public_evaluator_reference.status,"verified");
 assert.equal(q.public_evaluator_reference.source_revision,REVISION);
 assert.equal(q.public_evaluator_reference.bundle_digest,"sha256:55f918d99437d514614beaa814637a6643b96abe1810fa074451e063f85cfe01");
 assert.equal(q.private_evaluator,"unknown");assert.equal(q.live_ready,false);
 const path=join(frozen,"benchmarks/schemas/private-evaluator-fragment.schema.json");
 writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from("\n")]));
 assert.equal(qualifyThreeArmPublicTask(SOURCE,{frozenSourceRoot:frozen}).public_evaluator_reference.status,"blocked");
});
test("bound frozen qualification replays and source drift refuses replay",t=>{
 const {parent,frozen}=fixture(t),root=join(parent,"comparison"),p=prepareThreeArm(root,{frozenSourceRoot:frozen});
 assert.equal(p.task_qualification.public_evaluator_reference.status,"verified");
 assert.equal(p.kernel_workflow.status,"blocked");assert.equal(p.kernel_workflow.reason,"capability_missing");
 assert.deepEqual(p.kernel_workflow.selected_skills,[]);assert.ok(p.kernel_workflow.missing_routes.includes("skill-router"));
 const r=runSyntheticThreeArm(root,p.protocol_digest);
 assert.deepEqual(replayThreeArm(root,p.protocol_digest,r.result_digest),r);
 writeFileSync(join(frozen,"benchmarks/schemas/private-evaluator-fragment.schema.json"),"{}");
 assert.equal(replayThreeArm(root,p.protocol_digest,r.result_digest).status,"blocked");
});
test("canonical zero-Skill review route cannot be silently replaced",()=>{
 assert.throws(()=>qualifyKernelWorkflow(SOURCE,{conditions:{kernel_only:{files:{}}}}),/kernel_condition_refused/);
 assert.equal(qualifyThreeArmPublicTask(SOURCE).public_evaluator_reference.status,"blocked");
});

test("linked or task-overlapping authority roots are not admitted",t=>{
 const {parent,frozen}=fixture(t),root=join(parent,"comparison"),linked=join(parent,"linked");
 symlinkSync(frozen,linked);
 assert.equal(qualifyThreeArmPublicTask(SOURCE,{frozenSourceRoot:linked}).public_evaluator_reference.status,"blocked");
 assert.throws(()=>prepareThreeArm(root,{frozenSourceRoot:parent}),/invalid_frozen_source_root/);
 assert.throws(()=>qualifyThreeArmPublicTask(SOURCE,{privateRoot:frozen}),/invalid_qualification_options/);
});

test("changed public reference is refused before its source inventory is followed",t=>{
 const root=mkdtempSync(join(realpathSync(tmpdir()),"ask-ref-pin-negative-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const relative="benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap/evaluator-reference.json";
 const ref=JSON.parse(readFileSync(join(SOURCE,relative)));
 ref.evaluator_source_identity.source_files[0].path="../not-public";
 mkdirSync(dirname(join(root,relative)),{recursive:true});
 writeFileSync(join(root,relative),JSON.stringify(ref));
 const q=qualifyThreeArmPublicTask(root);
 assert.equal(q.public_evaluator_reference.reason,"pinned_public_reference_refused");
 assert.equal(q.current_checkout_evaluator,undefined);assert.equal(q.live_ready,false);
});
