// Separately selected evaluation entry. No Skill procedures or execution.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { renderKernelPrinciplesV2Candidate } from "./kernel-principles-candidate-v2.mjs";

export const KERNEL_PRINCIPLES_V2_ID = "kernel_principles_v2";
const supported = ["implementation", "trivial", "review", "investigation", "design", "handoff"];
const classes = [...supported, "risk-gated"];
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const candidateHeading = "# K-principles evaluation candidate v2 (proposed, unadopted)";
const candidateIdentity = "This candidate contains basic engineering principles extracted from the canonical Kernel. It is a distinct evaluation condition, not the legacy Kernel, Full ASK or a standalone product commitment.";
const evaluationIdentity = "This entry contains basic engineering principles extracted from the canonical Kernel. It is the separately selected v2 evaluation condition, not the legacy Kernel, Full ASK or a standalone product commitment.";

/** Keep the reviewed candidate extraction; replace only evaluation identity glue. */
export function renderKernelPrinciplesV2(source) {
  const candidate = renderKernelPrinciplesV2Candidate(source);
  assert.ok(candidate.body.startsWith(`${candidateHeading}\n`), "v2 candidate identity glue changed");
  assert.equal(candidate.body.split(candidateIdentity).length, 2, "v2 candidate identity boundary changed");
  const body = candidate.body.replace(candidateHeading, "# K-principles evaluation v2")
    .replace(candidateIdentity, evaluationIdentity);
  const { proposal_status, ...generation } = candidate.generation;
  assert.equal(proposal_status, "unadopted", "v2 candidate proposal identity changed");
  assert.deepEqual(generation.dependencies, [], "v2 candidate instruction dependency changed");
  assert.deepEqual(generation.supported_task_classes, supported, "v2 candidate scope changed");
  return { body, generation: { ...generation, id: KERNEL_PRINCIPLES_V2_ID,
    generated_digest: hash(body), adoption_scope: "selected_evaluation_only",
    contract_delta: { ...generation.contract_delta, admission_descriptor: "kernel_principles_v2.task_signal@1" },
  } };
}

// Only exact public task/metadata bytes establish these reviewed interpretations.
// These raw metadata hashes are distinct from its self-reported metadata_digest.
const fixtures = new Map([
  ["mp-frontend-state-review", "pr_review", "review", "none", "c1eb8df947c8fbc5c3a19101077b2abde4f43d40b730178e39a27a4a3c38305a", "df8669bdbd460445b7ca9947aaed09ed48a843e811923b32e645fb1dfe552319"],
  ["mp-accessibility-interaction-review", "pr_review", "review", "none", "00d8bcc12a931a3cab4cedf814c6ea991fe2c858a32da24c675dec9870870560", "a004f95ba13278593341fdf56b0423dae01f7cb114f540ed050cb19851080e62"],
  ["mp-performance-investigation", "investigation", "investigation", "none", "6d18d0a525823f4c29c262d77f94e7b4f0e030990a3c5d334d4edf2838edff86", "8f1b161330eadd58c3c999972b3b1e1c9cd55cfafa4465d80f5f952289ba993e"],
  ["mp-ci-evidence-gap", "review_verification", "review", "none", "9d8a5c2ddc36525e2d059b7f7bce786a10123324b4c6e576db3dca52f25bf756", "2c6d359bc8fd2f85c2f7951eb45f4d6bb4b52d359350ff962c9a438af5cd4848"],
  ["mp-iac-rollback-design", "design_gate", "design", "approval_required", "13641db79dd2206a5632ef502c1024cf2159b2ca45ef02c7c392d26e731ec76a", "897c2895d26cccb21736450d4e2380f0d1465a50673c626979b3536ff8b34aa7"],
  ["mp-data-migration-handoff", "handoff_resume", "handoff", "rollback_required", "74e2875dd5a4f57cf8f78737381ae0b7e485a7149443f221db05375aab21f7c0", "18600d5eee1cbc860d8c7c2b5e5acdf7159b314f88fd1f91aee8398c0dbb4802"],
  ["mn-focused-regression-test", "verification_only", "implementation", "none", "4faa5657b89aaa0ad8eb22e573570ec8dc904cc989baa4a6a4bd973bbc7488fb", "a2c7ea0f521af4bb609d8ffa5aaeab4b5e04a1523ee499d4c1c69ca4c0fb5129"],
  ["mn-build-option-update", "configuration", "implementation", "none", "58eae6ff164e72913e5bbf16234c5a530773612e63c967b16c08262661d824a9", "e2458956484d10c0d430703c6e4061c3d5943dcab2c8101d8907a255a55aaa6e"],
  ["mn-doc-config-correction", "documentation", "trivial", "none", "49dcb3c95ed0bca2c1339c24bb415a536f0fe9e6be69e31bc3929d17b36e4b68", "5679bcf32b3b63e1df285cfae5326bbb92e3c906079e235b8f0293d09fc19bd8"],
].map(([id, declared, selected, risk, taskDigest, metadataDigest]) => [id, { declared, selected, risk, taskDigest, metadataDigest }]));

function fixtureRefs(id, fixture) {
  const root = `benchmarks/fixtures/checkpoint-b2/${id}`;
  return [
    `${root}/task.md#sha256:${fixture.taskDigest}`,
    `${root}/metadata.json#sha256:${fixture.metadataDigest}`,
    `kernel_principles_v2.task_signal@1:${JSON.stringify({ fixture_id: id, declared_task_class: fixture.declared,
      selected_task_class: fixture.selected, risk_boundary: fixture.risk })}`,
  ];
}

/** No I/O or arbitrary-task classification. Known-source drift requires review. */
export function kernelPrinciplesV2FixtureDescriptor(fixtureId, taskBytes, metadataBytes) {
  const fixture = fixtures.get(fixtureId);
  if (!fixture) return null;
  assert.equal(hash(taskBytes), `sha256:${fixture.taskDigest}`, "public task drift requires descriptor review");
  assert.equal(hash(metadataBytes), `sha256:${fixture.metadataDigest}`, "public metadata drift requires descriptor review");
  const metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes));
  assert.equal(metadata.fixture_id, fixtureId, "public fixture identity changed");
  assert.equal(metadata.fixture_role, "primary", "public fixture role changed");
  assert.equal(metadata.task_class, fixture.declared, "public declared task class changed");
  assert.equal(metadata.risk_boundary, fixture.risk, "public risk boundary changed");
  return { task_class: fixture.selected,
    requirement_scan: { status: "complete", evidence_refs: fixtureRefs(fixtureId, fixture) }, required_procedures: [] };
}

function closed(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, `${label} must be a plain object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields must be closed`);
}
function evidence(refs, label) {
  assert.ok(Array.isArray(refs) && refs.length > 0 && refs.every(ref => typeof ref === "string" && ref.trim() === ref && ref.length > 0), `${label} requires non-empty evidence refs`);
  assert.equal(new Set(refs).size, refs.length, `${label} evidence refs must be unique`);
}

/** Explicit requirement assessment only, never approval, Skill availability or quality. */
export function principlesV2Capability(descriptor) {
  closed(descriptor, ["task_class", "requirement_scan", "required_procedures"], "task signal descriptor");
  assert.ok(classes.includes(descriptor.task_class), "unknown task class");
  closed(descriptor.requirement_scan, ["status", "evidence_refs"], "requirement scan");
  assert.ok(["complete", "unknown"].includes(descriptor.requirement_scan.status), "unknown requirement scan status");
  evidence(descriptor.requirement_scan.evidence_refs, "requirement scan");
  const supplied = descriptor.requirement_scan.evidence_refs;
  const recordPrefix = "kernel_principles_v2.task_signal@1:";
  for (const ref of supplied.filter(ref => ref.startsWith(recordPrefix))) {
    const record = JSON.parse(ref.slice(recordPrefix.length));
    closed(record, ["fixture_id", "declared_task_class", "selected_task_class", "risk_boundary"], "fixture task signal record");
    const fixture = fixtures.get(record.fixture_id);
    assert.ok(fixture, "unknown fixture task signal record");
    assert.equal(ref, fixtureRefs(record.fixture_id, fixture)[2], "fixture task signal record changed");
  }
  // Retain authentic classes when a descriptor cites the sealed fixture sources.
  for (const [id, fixture] of fixtures) {
    const refs = fixtureRefs(id, fixture);
    const root = `benchmarks/fixtures/checkpoint-b2/${id}/`;
    if (supplied.some(ref => ref.startsWith(root) || ref === refs[2])) {
      assert.equal(descriptor.task_class, fixture.selected, "fixture task class changed");
      assert.ok(refs.every(ref => supplied.includes(ref)), "fixture evidence refs incomplete or changed");
    }
  }
  assert.ok(Array.isArray(descriptor.required_procedures), "required procedures must be explicit");
  const names = new Set();
  for (const procedure of descriptor.required_procedures) {
    closed(procedure, ["kind", "name", "evidence_refs"], "required procedure");
    assert.ok(["formal", "specialized"].includes(procedure.kind), "unknown required procedure kind");
    assert.ok(typeof procedure.name === "string" && procedure.name.trim() === procedure.name && procedure.name.length > 0, "required procedure name missing");
    evidence(procedure.evidence_refs, "required procedure");
    const key = `${procedure.kind}:${procedure.name}`;
    assert.ok(!names.has(key), "duplicate required procedure"); names.add(key);
  }
  const missing = [];
  if (!supported.includes(descriptor.task_class)) missing.push(`principles unsupported task class: ${descriptor.task_class}`);
  if (descriptor.requirement_scan.status !== "complete") missing.push("required procedure assessment incomplete");
  for (const procedure of descriptor.required_procedures) missing.push(`required ${procedure.kind} procedure unavailable: ${procedure.name}`);
  return { status: missing.length ? "capability_missing" : "available", condition_id: KERNEL_PRINCIPLES_V2_ID,
    admission_scope: "structural_principles_entry_only",
    available: [{ name: KERNEL_PRINCIPLES_V2_ID, origin: "verified_canonical_principles_projection" }],
    missing, assessment: structuredClone(descriptor) };
}
