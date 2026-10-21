// Shared trust/byte checks; target ownership and all writes stay with each adapter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { verifyEvolutionApplicationReceipt } from "./evolution-loop.mjs";
import { verifyPortfolioSelection } from "./portfolio-manager.mjs";
import { buildPersonalPromptMaterialization } from "./ask-personal-prompt-materialization.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { rollbackLifecycleState } from "./installer-lifecycle.mjs";
export const PROMPT_NAMES = Object.freeze(["skill-handoff.md", "skill-implement.md", "skill-investigate.md", "skill-review.md", "skill-verify.md"]);
export const PROMPT_PATHS = Object.freeze(PROMPT_NAMES.map(name => `.agents/prompts/${name}`));
const NAMES = PROMPT_NAMES, PATHS = PROMPT_PATHS;
const same = (a,b) => canonicalDigest(a) === canonicalDigest(b);
const read = (root,digest) => readContentAddressedJson({storeRoot:root,digest}).value;
const closureKeys = ["storeRoot", "receiptObjectDigest", "decisionObjectDigest", "proposalObjectDigest", "candidateObjectDigest",
  "experimentObjectDigest", "recommendationObjectDigest", "trustedHumanDecisionAuthorities", "trustedExperimentAuthorities",
  "trustedEvaluationAuthorities", "trustedAssetAuthorityContexts", "trustedPortfolioAuthorityContexts", "trustedHighImpactApprovalGrants"];
function fields(value, allowed, required = allowed) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  assert.ok(keys.every(key => typeof key === "string" && allowed.includes(key)), "unknown installation option");
  assert.ok(required.every(key => Object.hasOwn(descriptors, key)), "missing installation option");
  for (const key of keys) assert.ok(Object.hasOwn(descriptors[key], "value") && descriptors[key].enumerable, "installation accessor refused");
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key].value])));
}
function ownJson(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { assert.ok(Number.isFinite(value), "non-JSON installation number"); return value; }
  assert.ok(value && typeof value === "object" && !ancestors.has(value), "non-JSON installation input");
  assert.ok(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)), "non-JSON installation object");
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  assert.ok(keys.every(key => typeof key === "string"), "installation symbol refused");
  for (const key of keys) {
    if (Array.isArray(value) && key === "length") continue;
    assert.ok(Object.hasOwn(descriptors[key], "value") && descriptors[key].enumerable, "installation accessor refused");
  }
  const next = new Set(ancestors); next.add(value);
  if (Array.isArray(value)) {
    assert.equal(keys.length, value.length + 1, "non-JSON installation array");
    return Array.from({ length: value.length }, (_, index) => {
      assert.ok(Object.hasOwn(descriptors, String(index)), "installation array hole refused");
      return ownJson(descriptors[index].value, next);
    });
  }
  return Object.fromEntries(keys.map(key => [key, ownJson(descriptors[key].value, next)]));
}
function verifiedInputs(input) {
  input = fields(input, closureKeys, closureKeys.slice(0, 7));
  const owned = ownJson(input);
  const closure = verifyEvolutionApplicationReceipt(owned);
  assert.equal(closure.receipt.state, "completed", "completed adoption receipt required");
  assert.equal(closure.receipt.action, "adopt_candidate", "approved adoption required");
  assert.equal(closure.decision.disposition, "approved");
  return { owned, closure };
}
function projection(owned, closure, selectionObjectDigest, role) {
  const selected = verifyPortfolioSelection({ ...owned, selectionObjectDigest }).selection;
  assert.equal(selected.decision, "selected", "eligible exact selected Portfolio required");
  const expected = role === "parent" ? closure.candidate.parent_asset : closure.candidate.candidate_asset;
  const lock = role === "parent" ? closure.candidate.parent_portfolio.lock_digest : closure.receipt.result_heads.portfolio_lock_digest;
  assert.equal(selected.portfolio_lock.lock_digest, lock, "selection does not bind approved role lock");
  assert.ok(selected.selected_assets.some(item => same(item.asset, expected)), "selected Asset transplant");
  const context = read(owned.storeRoot, selected.context_object_digest);
  const registry = role === "parent" ? closure.candidate.registry.snapshot_digest : closure.receipt.result_heads.registry_snapshot_digest;
  const material = buildPersonalPromptMaterialization({ storeRoot: owned.storeRoot, registrySnapshotDigest: registry, asset: expected,
    entrypoint: read(owned.storeRoot, expected.record_digest).type_extension.entrypoints[0],
    trustedAssetAuthorityContexts: owned.trustedAssetAuthorityContexts ?? [] }, { taskClass: context.task_class, hash: comparisonHash }).materialization;
  assert.equal(material.content.files.length, NAMES.length, "only complete five-file Codex bundle supported");
  assert.deepEqual(material.content.files.map(file => basename(file.path)).sort(), NAMES);
  assert.deepEqual([...material.record.type_extension.entrypoints].sort(), material.content.files.map(file => file.path).sort(), "bundle inventory differs from entrypoints");
  return { asset: expected, files: material.content.files.map(file => {
    const bytes = Buffer.from(file.bytes_base64, "base64"), text = bytes.toString("utf8");
    assert.ok(Buffer.from(text).equals(bytes), "lossy UTF-8 projection refused");
    return { path: `.agents/prompts/${basename(file.path)}`, text, digest: comparisonHash(bytes), source_path: file.path };
  }).sort((a, b) => a.path.localeCompare(b.path)) };
}
export function verifyRestoreState({ root, statePath, state, owned, closure, rollbackSelectionObjectDigest }) {
  assert.ok(state?.previous_successful_state && state.personal_prompt.role === "candidate", "candidate rollback snapshot required");
  assert.equal(state.personal_prompt.receipt_object_digest, owned.receiptObjectDigest);
  assert.ok(same(state.personal_prompt.asset, closure.candidate.candidate_asset));
  const selected = verifyPortfolioSelection({ ...owned, selectionObjectDigest: rollbackSelectionObjectDigest }).selection;
  assert.equal(selected.decision, "selected");
  assert.ok(selected.selected_assets.some(item => same(item.asset, closure.candidate.parent_asset)));
  const lock = read(owned.storeRoot, selected.portfolio_lock.lock_digest);
  assert.equal(lock.predecessor.lock_digest, closure.receipt.result_heads.portfolio_lock_digest, "fresh explicit rollback lock required");
  assert.equal(lock.current_manifest_digest, closure.receipt.rollback_anchor.manifest_digest);
  const authority = read(owned.storeRoot, lock.authority_context_digest);
  assert.equal(authority.authority.kind, "external_portfolio_rollback_authority");
  assert.ok(same(authority.rollback_target, closure.receipt.rollback_anchor));
  assert.ok(same(state.previous_successful_state.personal_prompt.asset, closure.candidate.parent_asset));
  assert.deepEqual(Object.keys(state.managed_files).sort(), PATHS);
  assert.deepEqual(Object.keys(state.rollback.files).sort(), PATHS);
  assert.deepEqual(Object.keys(state.rollback.blocks), []);
  assert.deepEqual(Object.keys(state.managed_blocks), []);
  assert.deepEqual(Object.keys(state.managed_partial_files), []);
  assert.deepEqual(Object.keys(state.previous_successful_state.managed_files).sort(), PATHS);
  assert.deepEqual(Object.keys(state.previous_successful_state.managed_blocks), []);
  assert.deepEqual(Object.keys(state.previous_successful_state.managed_partial_files), []);
  const parent = read(owned.storeRoot, closure.candidate.parent_asset.content_digest);
  const candidate = read(owned.storeRoot, closure.candidate.candidate_asset.content_digest);
  for (const file of candidate.files) {
    const path = `.agents/prompts/${basename(file.path)}`;
    assert.equal(comparisonHash(readFileSync(join(root, path))), file.raw_digest, "installed candidate byte drift");
    assert.equal(`sha256:${state.managed_files[path].sha256}`, file.raw_digest, "installed candidate state drift");
    assert.equal(`sha256:${state.managed_files[path].canonical_sha256}`, file.raw_digest, "installed candidate canonical state drift");
  }
  for (const file of parent.files) {
    const path = `.agents/prompts/${basename(file.path)}`;
    assert.equal(comparisonHash(Buffer.from(state.rollback.files[path].content)), file.raw_digest, "rollback byte snapshot transplant");
    assert.equal(`sha256:${state.rollback.files[path].sha256}`, file.raw_digest, "rollback digest snapshot transplant");
    assert.equal(`sha256:${state.previous_successful_state.managed_files[path].sha256}`, file.raw_digest, "previous parent state transplant");
    assert.equal(`sha256:${state.previous_successful_state.managed_files[path].canonical_sha256}`, file.raw_digest, "previous parent canonical state transplant");
  }
  const operations = rollbackLifecycleState({ target: root, statePath, dryRun: true });
  return { selection: selected, lock, operations };
}
export { fields, ownJson, verifiedInputs, projection };
