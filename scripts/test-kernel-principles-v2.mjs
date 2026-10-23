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

test("historical source retains exact v1, candidate and v2 body and generation identities", () => {
  const historicalSource = read("docs/fixtures/kernel-principles-source-5f36081.md");
  assert.equal(digest(historicalSource), "173b0ae1cbb3a92cb434b60c5d233dbd0e2b68b75be9732818d8b53cbb3b5d6c");
  for (const [render, expected] of [
    [renderKernelPrinciples, "06ca47b28967a24f9acd54b69d5dd3a18cfec3005331dc546aa2fcf36e8f8db5"],
    [renderKernelPrinciplesV2Candidate, "f9551b86755ed217ea47d4b3b5d59067ae97f0e0ff0cd39bf63bb78517dcba44"],
    [renderKernelPrinciplesV2, "6c709d52a23c44a754e2cdb72423702ff00b843dcdf43eab5077b8de4f217019"],
  ]) {
    const entry = render(historicalSource);
    assert.equal(digest(JSON.stringify(entry)), expected);
    assert.equal(entry.generation.renderer_revision, 1);
    assert.throws(() => render(Buffer.concat([historicalSource, Buffer.from("\n")])), /canonical source changed/u);
  }
  const candidate = renderKernelPrinciplesV2Candidate(historicalSource);
  assert.equal(candidate.generation.id, "kernel_principles_v2_candidate");
  assert.equal(candidate.generation.proposal_status, "unadopted");
  assert.match(candidate.body, /proposed, unadopted/u);
});

test("current scope principles use a distinct reviewed revision without new procedure dependencies", () => {
  for (const render of [renderKernelPrinciples, renderKernelPrinciplesV2Candidate, renderKernelPrinciplesV2]) {
    const entry = render(source);
    assert.equal(entry.generation.renderer_revision, 2);
    assert.equal(entry.generation.source_digest, `sha256:${digest(source)}`);
    assert.match(entry.body, /sufficient change boundary before keeping it narrow/u);
    assert.match(entry.body, /Retire paths, state, and configuration made obsolete by this change/u);
    assert.match(entry.body, /Fewer lines or files alone do not prove a simpler system/u);
    assert.deepEqual(entry.generation.dependencies, []);
    assert.throws(() => render(Buffer.from(source.toString().replace("current behavior", "hypothetical behavior"))), /canonical source changed/u);
  }
});
