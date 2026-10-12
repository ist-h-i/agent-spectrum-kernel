import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { renderKernelPrinciples } from "./kernel-principles.mjs";
import { renderKernelPrinciplesV2Candidate } from "./kernel-principles-candidate-v2.mjs";
import { KERNEL_PRINCIPLES_V2_ID, renderKernelPrinciplesV2, principlesV2Capability, kernelPrinciplesV2FixtureDescriptor } from "./kernel-principles-v2.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const digest = value => createHash("sha256").update(value).digest("hex");
const source = read("AGENTS.md");
const descriptor = task_class => ({ task_class, requirement_scan: { status: "complete", evidence_refs: ["explicit caller assessment: all task requirements reviewed"] }, required_procedures: [] });
const matrix = [
  ["mp-frontend-state-review", "pr_review", "review", "none"],
  ["mp-accessibility-interaction-review", "pr_review", "review", "none"],
  ["mp-performance-investigation", "investigation", "investigation", "none"],
  ["mp-ci-evidence-gap", "review_verification", "review", "none"],
  ["mp-iac-rollback-design", "design_gate", "design", "approval_required"],
  ["mp-data-migration-handoff", "handoff_resume", "handoff", "rollback_required"],
  ["mn-focused-regression-test", "verification_only", "implementation", "none"],
  ["mn-build-option-update", "configuration", "implementation", "none"],
  ["mn-doc-config-correction", "documentation", "trivial", "none"],
];

test("adopted evaluation identity preserves every extracted principle and boundary", () => {
  const entry = renderKernelPrinciplesV2(source);
  const candidate = renderKernelPrinciplesV2Candidate(source);
  const v1 = renderKernelPrinciples(source);
  assert.deepEqual(entry, renderKernelPrinciplesV2(source));
  assert.equal(KERNEL_PRINCIPLES_V2_ID, "kernel_principles_v2");
  assert.equal(entry.generation.id, KERNEL_PRINCIPLES_V2_ID);
  assert.equal(entry.generation.generated_digest, `sha256:${digest(entry.body)}`);
  assert.equal(Object.hasOwn(entry.generation, "proposal_status"), false);
  assert.doesNotMatch(entry.body, /proposed|unadopted|evaluation candidate/u);
  assert.deepEqual(entry.generation.dependencies, []);
  assert.deepEqual(entry.generation.included, v1.generation.included);
  assert.deepEqual(entry.generation.excluded, v1.generation.excluded);
  assert.deepEqual(entry.generation.supported_task_classes, candidate.generation.supported_task_classes);
  assert.equal(entry.body.slice(entry.body.indexOf("## Operating intent")), candidate.body.slice(candidate.body.indexOf("## Operating intent")));
  assert.match(entry.body, /stop its dependent work as capability_missing/u);
  assert.match(entry.body, /Do not claim those protocols or Skills ran/u);
  assert.doesNotMatch(entry.body, /(?:skills|docs|schemas|scripts)\/|SKILL\.md|ask\.[a-z-]+@/u);
  assert.throws(() => renderKernelPrinciplesV2(Buffer.concat([source, Buffer.from("\n")])), /canonical source changed/u);
});

test("explicit assessments require complete scans and cannot supply formal or specialized procedures", () => {
  for (const taskClass of ["implementation", "trivial", "review", "investigation", "design", "handoff"]) {
    const signal = descriptor(taskClass);
    assert.equal(principlesV2Capability(signal).status, "available");
    signal.requirement_scan.status = "unknown";
    assert.equal(principlesV2Capability(signal).status, "capability_missing");
    signal.requirement_scan.status = "complete";
    for (const kind of ["formal", "specialized"]) {
      signal.required_procedures = [{ kind, name: "required procedure", evidence_refs: ["project instruction requiring procedure"] }];
      assert.deepEqual(principlesV2Capability(signal).missing, [`required ${kind} procedure unavailable: required procedure`]);
    }
  }
  assert.equal(principlesV2Capability(descriptor("risk-gated")).status, "capability_missing");
});

test("malformed descriptors are rejected rather than repaired by global declarations", () => {
  for (const invalid of [undefined, "review", {}, { ...descriptor("review"), task_class: "other" },
    { ...descriptor("review"), global_capabilities: ["full_ask"] },
    { ...descriptor("review"), requirement_scan: { status: "complete", evidence_refs: [] } },
    { ...descriptor("review"), requirement_scan: { status: "complete", evidence_refs: ["ref", "ref"] } },
    { ...descriptor("review"), required_procedures: undefined },
    { ...descriptor("review"), required_procedures: [{ kind: "basic_review", name: "review", evidence_refs: ["task"] }] },
    { ...descriptor("review"), required_procedures: [{ kind: "formal", name: "proof", evidence_refs: [] }] },
    { ...descriptor("review"), required_procedures: Array(2).fill({ kind: "formal", name: "proof", evidence_refs: ["task"] }) }]) {
    assert.throws(() => principlesV2Capability(invalid));
  }
});

for (const [id, declared, selected, risk] of matrix) test(`sealed public fixture descriptor: ${id}`, () => {
  const root = `benchmarks/fixtures/checkpoint-b2/${id}`;
  const task = read(`${root}/task.md`); const metadata = read(`${root}/metadata.json`);
  const signal = kernelPrinciplesV2FixtureDescriptor(id, task, metadata);
  assert.deepEqual(Object.keys(signal).sort(), ["task_class", "requirement_scan", "required_procedures"].sort());
  assert.equal(signal.task_class, selected);
  assert.deepEqual(signal.required_procedures, []);
  assert.deepEqual(signal.requirement_scan, { status: "complete", evidence_refs: [
    `${root}/task.md#sha256:${digest(task)}`,
    `${root}/metadata.json#sha256:${digest(metadata)}`,
    `kernel_principles_v2.task_signal@1:${JSON.stringify({ fixture_id: id, declared_task_class: declared, selected_task_class: selected, risk_boundary: risk })}`,
  ] });
  assert.equal(principlesV2Capability(signal).status, "available");
  assert.throws(() => kernelPrinciplesV2FixtureDescriptor(id, Buffer.concat([task, Buffer.from("\n")]), metadata), /public task drift/u);
  assert.throws(() => kernelPrinciplesV2FixtureDescriptor(id, task, Buffer.concat([metadata, Buffer.from("\n")])), /public metadata drift/u);
  assert.throws(() => principlesV2Capability({ ...signal, task_class: selected === "review" ? "implementation" : "review" }), /fixture task class changed/u);
  const missingRef = structuredClone(signal); missingRef.requirement_scan.evidence_refs.pop();
  assert.throws(() => principlesV2Capability(missingRef), /fixture evidence refs incomplete/u);
  const changedRecord = structuredClone(signal);
  changedRecord.requirement_scan.evidence_refs = [changedRecord.requirement_scan.evidence_refs[2].replace(`"selected_task_class":"${selected}"`, '"selected_task_class":"risk-gated"')];
  assert.throws(() => principlesV2Capability(changedRecord), /fixture task signal record changed/u);
  signal.required_procedures.push({ kind: "specialized", name: "later explicit requirement", evidence_refs: ["additional project instruction"] });
  assert.equal(principlesV2Capability(signal).status, "capability_missing");
  assert.deepEqual(kernelPrinciplesV2FixtureDescriptor(id, task, metadata).required_procedures, []);
});

test("unknown fixtures and arbitrary task prose never receive an automatic complete descriptor", () => {
  for (const id of ["unknown", "review-001", "implementation-001", "../mp-frontend-state-review", "toString"]) {
    assert.equal(kernelPrinciplesV2FixtureDescriptor(id, Buffer.from("Review this"), Buffer.from("{}")), null);
  }
});

test("old v1 and unadopted candidate source identities remain immutable", () => {
  assert.equal(digest(read("scripts/kernel-principles.mjs")), "e63b711af8e4431ec48318a4932f8a50a13b896949141a2f2ce7b11cbcaed741");
  assert.equal(digest(read("scripts/kernel-principles-candidate-v2.mjs")), "389c9478a2141b08f380859bb3fd3d1147b7ab1041771f1ed0457d9ae345650d");
  assert.equal(digest(read("scripts/test-kernel-principles-candidate-v2.mjs")), "255e4e489fdc2ef4d6f13f03fb7416da03b84c5ff99d6280c1ef04102b83a504");
  assert.equal(renderKernelPrinciples(source).generation.generated_digest, "sha256:e9b15717e9c257f44639a7bb56b6450574f93976631fa3840b84574ad1caf3c8");
  const candidate = renderKernelPrinciplesV2Candidate(source);
  assert.equal(candidate.generation.id, "kernel_principles_v2_candidate");
  assert.equal(candidate.generation.proposal_status, "unadopted");
  assert.match(candidate.body, /proposed, unadopted/u);
});
