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
    renderer_revision: 1, generated_digest: hash(body), adoption_scope: "selected_evaluation_only",
    contract_delta: { ...generation.contract_delta, admission_descriptor: "kernel_principles_v2.task_signal@1" },
  } };
}

// Only exact public task/metadata bytes establish these reviewed interpretations.
// These raw metadata hashes are distinct from its self-reported metadata_digest.
const fixtures = new Map([
  ["mp-frontend-state-review", "pr_review", "review", "none", "48998c1b9eda7a59e7034077d8e084baca41c2aab735b47b350ae00c924d3701", "d99e80a39f0aa85a5fe49361cb4382650f8777d10059d223f4d563e53de8dcc2"],
  ["mp-accessibility-interaction-review", "pr_review", "review", "none", "aa2cd52eeb1b3581fb914a6f157423e408b7bebdb73b6d19980cdf0fcc709cc8", "b8b8d8f9b51621e7d4d1a6d6312d133240f03cfa468cf5f91619539c10a53398"],
  ["mp-performance-investigation", "investigation", "investigation", "none", "7ac91dd8122102759075a20d0a583739722c7b547584e66897a40e7db9aa2733", "66c50ce462a75330c31b30d14174c7e0102f97dcc79e0d674589e24237b905a8"],
  ["mp-ci-evidence-gap", "review_verification", "review", "none", "4247670f22a882a630aadc8688e6ed9a7c7040fb31aad17bbab7a6bb831fa435", "42fe52179c50670c5cb5627d7b352c0b4e0635f36908862c8a48ef6d0559dda0"],
  ["mp-iac-rollback-design", "design_gate", "design", "approval_required", "f713dc3e6273195a6f726a9c72d55430901a706256fe8894cc4adb2b1c8c877c", "8de3dd391aacf46204f04a6ba4c70a4a55e17ed25e3d250d9fe726a48fcca7e9"],
  ["mp-data-migration-handoff", "handoff_resume", "handoff", "rollback_required", "2e210dad20cda5c2c4a0c935b96769f20a72f199bf6d64126924d80a7cdc4c8e", "5d4431e47a6ec083eebe9de9d552a61c08bbefd25a888ad938d7aa907261fb6a"],
  ["mn-focused-regression-test", "verification_only", "implementation", "none", "5aa2b6adf6b39676b6fe0e877dee32dce34ff8e40ca9fd7fe867b0f9697a3edb", "18659c7e1aebd7c9f1841cfa8df32c357659b56d9b33fa8570c58d07028e9d44"],
  ["mn-build-option-update", "configuration", "implementation", "none", "e4f7f7b74f2f10d68ffa29ba32fde96687bf7b157224cb3e86c3ebc4b966fd60", "4eec6e8c32ff9b37f830c28b59901147c9efab003d58cde020b74dd35a346402"],
  ["mn-doc-config-correction", "documentation", "trivial", "none", "f3e064f9588b58e558b8c30ce35a979021f604b34fac40c2eff60207ad0d4e3d", "8b9d913873976c1e36009591d2511bf97f5ea50c2c1a92057bd8e8eca8d62e27"],
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
