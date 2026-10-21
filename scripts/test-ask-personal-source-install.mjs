import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson, putContentAddressedJson } from "./content-addressed-store.mjs";
import { mintArtificialPersonalPromptTarget, planArtificialPersonalPromptApply, applyArtificialPersonalPromptPlan,
  planArtificialPersonalPromptRestore, restoreArtificialPersonalPromptPlan } from "./ask-personal-prompt-artificial-install.mjs";
import { inspectPersonalPublicPromptSource } from "./ask-personal-public-source-facts.mjs";
import { captureApplyTarget } from "./ask-setup-apply-state.mjs";
import { syntheticClosure } from "./test-helpers-personal-prompt-adoption.mjs";
const repo = resolve(import.meta.dirname, ".."), fixture = join(repo, "docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(join(fixture, "reference.json"))), adapter = reference.adapters[0];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;

// Entirely synthetic contract closure. No primary capture, real grading, old
// observed outcome or human adoption approval is imported or claimed.

function target(t) {
  const created = mintArtificialPersonalPromptTarget(); t.after(() => rmSync(created.root, { recursive: true, force: true }));
  writeFileSync(join(created.root, "README.md"), "Project-owned artificial notes.\n");
  return created;
}
function plan(f, x, role) { return planArtificialPersonalPromptApply({ target: x.handle, closure: f.closure,
  selectionObjectDigest: role === "parent" ? f.parentSelection : f.candidateSelection, role }); }

test("public ASK source facts inspect ten real Git/CAS files and leave Unknown provenance and scope intact", () => {
  for (const key of ["baseline_asset", "candidate_asset"]) {
    const facts = inspectPersonalPublicPromptSource({ repositoryRoot: repo, taskClass: "verification", materializationOptions: {
      storeRoot: join(fixture, "store"), registrySnapshotDigest: reference.registry.snapshot_digest, asset: adapter[key],
      entrypoint: read(join(fixture, "store"), adapter[key].record_digest).type_extension.entrypoints[0], trustedAssetAuthorityContexts: [] } });
    assert.equal(facts.files.length, 5); assert.equal(facts.provenance.owner.status, "unknown"); assert.equal(facts.provenance.license.status, "unknown");
    assert.ok(facts.existing_applicability.excluded_scopes.includes("measured_prompt_v2_execution"));
    assert.equal(facts.safety_promotion, false); assert.equal(facts.model_effectiveness, "Unknown"); assert.equal(facts.models_started, false);
  }
});
test("installation option descriptors refuse non-enumerable fields and accessors without evaluating them", t => {
  const x = target(t); let reads = 0;
  const options = { closure: {}, selectionObjectDigest: canonicalDigest("not a selection"), role: "parent" };
  Object.defineProperty(options, "target", { value: x.handle });
  assert.throws(() => planArtificialPersonalPromptApply(options), /accessor refused/);
  Object.defineProperty(options, "unapproved", { get() { reads++; throw new Error("getter ran"); } });
  assert.throws(() => planArtificialPersonalPromptApply(options), /unknown installation option/);
  assert.equal(reads, 0);
});
test("synthetic approved closure applies exact public bundle and restores actual bytes on one artificial target", t => {
  const f = syntheticClosure(t), x = target(t);
  const base = plan(f, x, "parent"); assert.equal(applyArtificialPersonalPromptPlan(base.handle, base.digest).status, "applied_artificial");
  const before = Object.fromEntries(read(f.closure.storeRoot, f.candidate.parent_asset.content_digest).files.map(file =>
    [basename(file.path), readFileSync(join(x.root, ".agents/prompts", basename(file.path)))]));
  const candidate = plan(f, x, "candidate"); candidate.plan.asset.version = "caller mutation ignored";
  const trust = [...f.closure.trustedHumanDecisionAuthorities]; f.closure.trustedHumanDecisionAuthorities.length = 0;
  assert.equal(applyArtificialPersonalPromptPlan(candidate.handle, candidate.digest).status, "applied_artificial");
  f.closure.trustedHumanDecisionAuthorities.push(...trust);
  assert.throws(() => applyArtificialPersonalPromptPlan(candidate.handle, candidate.digest), /owned apply plan/);
  assert.notDeepEqual(readFileSync(join(x.root, ".agents/prompts/skill-verify.md")), before["skill-verify.md"]);
  writeFileSync(join(x.root, "README.md"), "New unowned notes are preserved.\n");
  const restore = planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection });
  assert.equal(restoreArtificialPersonalPromptPlan(restore.handle, restore.digest).status, "restored_artificial");
  for (const [name, bytes] of Object.entries(before)) assert.deepEqual(readFileSync(join(x.root, ".agents/prompts", name)), bytes);
  assert.equal(readFileSync(join(x.root, "README.md"), "utf8"), "New unowned notes are preserved.\n");
});
test("fake target, missing adoption trust, foreign selection and changed target refuse before writes", t => {
  const f = syntheticClosure(t), x = target(t), before = captureApplyTarget(x.root).binding;
  assert.throws(() => plan(f, { handle: { ...x.handle } }, "parent"), /opaque/);
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: { ...f.closure, trustedHumanDecisionAuthorities: [] },
    selectionObjectDigest: f.parentSelection, role: "parent" }), /trusted/);
  assert.deepEqual(captureApplyTarget(x.root).binding, before);
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: f.closure,
    selectionObjectDigest: f.parentSelection, role: "candidate" }), /approved role lock/);
  let reads = 0;
  const hostile = { ...f.closure, trustedHumanDecisionAuthorities: [{ get authority() { reads++; throw new Error("getter ran"); } }] };
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: hostile,
    selectionObjectDigest: f.parentSelection, role: "parent" }), /accessor refused/);
  assert.equal(reads, 0);
  const other = target(t);
  const options = { target: x.handle, closure: f.closure, selectionObjectDigest: f.parentSelection, role: "parent" };
  const originalTrust = f.closure.trustedHumanDecisionAuthorities[0];
  options.closure = { ...f.closure, trustedHumanDecisionAuthorities: [new Proxy(originalTrust, {
    ownKeys(value) { options.target = other.handle; return Reflect.ownKeys(value); }
  })] };
  const ownedPlan = planArtificialPersonalPromptApply(options);
  assert.equal(ownedPlan.plan.target_root, x.root);
  assert.equal(options.target, other.handle);
  // Target binding still belongs to the initially captured x capability.
  writeFileSync(join(x.root, "README.md"), "captured target drift");
  assert.throws(() => applyArtificialPersonalPromptPlan(ownedPlan.handle, ownedPlan.digest), /changed after plan/);
  writeFileSync(join(x.root, "README.md"), "Project-owned artificial notes.\n");
  assert.equal(existsSync(join(other.root, ".agents/prompts/skill-verify.md")), false);
  const partial = { ...read(f.closure.storeRoot, f.closure.receiptObjectDigest), state: "partial" };
  const partialDigest = putContentAddressedJson({ storeRoot: f.closure.storeRoot, artifact: partial }).digest;
  assert.throws(() => planArtificialPersonalPromptApply({ target: x.handle, closure: { ...f.closure, receiptObjectDigest: partialDigest },
    selectionObjectDigest: f.parentSelection, role: "parent" }));
  const p = plan(f, x, "parent");
  assert.throws(() => applyArtificialPersonalPromptPlan(p.handle, canonicalDigest("wrong pin")), /confirmation required/);
  assert.deepEqual(captureApplyTarget(x.root).binding, before);
  writeFileSync(join(x.root, "README.md"), "post-plan drift");
  assert.throws(() => applyArtificialPersonalPromptPlan(p.handle, p.digest), /changed after plan/);
  assert.equal(existsSync(join(x.root, ".agents/prompts/skill-verify.md")), false);
});
test("links and normal installer states cannot extend artificial capability to a real target", t => {
  const f = syntheticClosure(t);
  for (const kind of ["symlink", "hardlink", "legacy", "git"]) {
    const x = target(t); mkdirSync(join(x.root, ".agents/prompts"), { recursive: true });
    if (kind === "symlink") symlinkSync(join(x.root, "README.md"), join(x.root, ".agents/prompts/skill-verify.md"));
    if (kind === "hardlink") linkSync(join(x.root, "README.md"), join(x.root, ".agents/prompts/skill-verify.md"));
    if (kind === "legacy") { mkdirSync(join(x.root, ".agent-spectrum-kernel")); writeFileSync(join(x.root, ".agent-spectrum-kernel/codex-install-state.json"), "{}"); }
    if (kind === "git") mkdirSync(join(x.root, ".git"));
    assert.throws(() => plan(f, x, "parent"));
  }
});
test("stale rollback selection and local candidate drift cannot be restored", t => {
  const f = syntheticClosure(t), x = target(t);
  for (const role of ["parent", "candidate"]) { const p = plan(f, x, role); applyArtificialPersonalPromptPlan(p.handle, p.digest); }
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.parentSelection }), /fresh explicit rollback/);
  const statePath = join(x.root, ".agent-spectrum-kernel/personal-prompt-artificial-state.json");
  const originalState = readFileSync(statePath), forged = JSON.parse(originalState);
  forged.rollback.files[".agents/prompts/skill-verify.md"].content = "foreign rollback snapshot";
  writeFileSync(statePath, JSON.stringify(forged));
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection }), /snapshot transplant/);
  writeFileSync(statePath, originalState);
  const wrongDigest = JSON.parse(originalState), verifyPath = ".agents/prompts/skill-verify.md";
  wrongDigest.rollback.files[verifyPath].sha256 = wrongDigest.managed_files[verifyPath].sha256;
  wrongDigest.previous_successful_state.managed_files[verifyPath].sha256 = wrongDigest.managed_files[verifyPath].sha256;
  writeFileSync(statePath, JSON.stringify(wrongDigest));
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection }), /digest snapshot transplant/);
  writeFileSync(statePath, originalState);
  writeFileSync(join(x.root, ".agents/prompts/skill-verify.md"), "local drift");
  assert.throws(() => planArtificialPersonalPromptRestore({ target: x.handle, closure: f.closure, rollbackSelectionObjectDigest: f.rollbackSelection }), /candidate byte drift/);
  assert.equal(readFileSync(join(x.root, ".agents/prompts/skill-verify.md"), "utf8"), "local drift");
});
