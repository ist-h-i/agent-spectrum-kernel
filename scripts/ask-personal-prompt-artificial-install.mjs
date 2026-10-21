// Physical mechanics on newly minted artificial targets only. No operational
// installer, Portfolio mutation, model launch, or new lifecycle authority.
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalDigest, parseJsonRejectDuplicateKeys, readContentAddressedJson } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { assertSetupWritePaths, captureApplyTarget } from "./ask-setup-apply-state.mjs";
import { buildLifecycleState, createManagedFileRecord, createRollbackSnapshot, planWriteManaged,
  applyLifecyclePlan, rollbackLifecycleState } from "./installer-lifecycle.mjs";

import { fields, verifiedInputs, projection, verifyRestoreState } from "./ask-personal-prompt-adoption-materialization.mjs";

const STATE = ".agent-spectrum-kernel/personal-prompt-artificial-state.json";
const NAMES = ["skill-handoff.md", "skill-implement.md", "skill-investigate.md", "skill-review.md", "skill-verify.md"];
const PATHS = NAMES.map(name => `.agents/prompts/${name}`);
const ROOT = resolve(import.meta.dirname, "..");
const TEMP = realpathSync("/tmp"); // Caller TMPDIR cannot redirect minting into a normal repository.
const targets = new WeakMap(), plans = new WeakMap();
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const read = (root, digest) => readContentAddressedJson({ storeRoot: root, digest }).value;
const json = path => parseJsonRejectDuplicateKeys(readFileSync(path).toString("utf8"));
function target(handle) {
  const owned = targets.get(handle); assert.ok(owned, "opaque artificial target required");
  const stat = lstatSync(owned.root);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === owned.dev && stat.ino === owned.ino, "artificial root replaced");
  assert.equal(realpathSync(owned.root), owned.root);
  for (let path = owned.root; ; path = dirname(path)) {
    const item = lstatSync(path); assert.ok(item.isDirectory() && !item.isSymbolicLink(), "artificial ancestor link");
    if (dirname(path) === path) break;
  }
  for (const name of [".git", ".agent-spectrum-kernel/install-state.json", ".agent-spectrum-kernel/codex-install-state.json",
    ".agent-spectrum-kernel/claude-install-state.json"]) assert.ok(!existsSync(join(owned.root, name)), "normal repository or installer state refused");
  assertSetupWritePaths(owned.root, [...PATHS, STATE, `${STATE}.in-progress.json`]);
  captureApplyTarget(owned.root); // Whole tree rejects links, special files and unsafe Git metadata.
  return owned;
}
export function mintArtificialPersonalPromptTarget() {
  const root = realpathSync(mkdtempSync(join(TEMP, "ask-personal-artificial-")));
  const stat = lstatSync(root), handle = Object.freeze({ kind: "artificial_personal_prompt_target" });
  targets.set(handle, { root, dev: stat.dev, ino: stat.ino });
  return Object.freeze({ handle, root, environment: "artificial_only", models_started: false });
}
function currentState(root) {
  assert.ok(!existsSync(join(root, `${STATE}.in-progress.json`)), "partial installation requires separate recovery");
  return existsSync(join(root, STATE)) ? json(join(root, STATE)) : null;
}
export function planArtificialPersonalPromptApply(options) {
  options = fields(options, ["target", "closure", "selectionObjectDigest", "role"]);
  const t = target(options.target), { owned, closure } = verifiedInputs(options.closure);
  assert.ok(["parent", "candidate"].includes(options.role));
  const projected = projection(owned, closure, options.selectionObjectDigest, options.role), previous = currentState(t.root);
  if (previous) {
    assert.equal(previous.installer, "personal-prompt-artificial");
    assert.equal(options.role, "candidate", "parent can only initialize an empty artificial installation");
    assert.ok(same(previous.personal_prompt.asset, closure.candidate.parent_asset), "installed parent is not approved rollback Asset");
    assert.equal(previous.personal_prompt.receipt_object_digest, owned.receiptObjectDigest);
    assert.deepEqual(Object.keys(previous.managed_files).sort(), PATHS);
    assert.deepEqual(Object.keys(previous.managed_blocks), []);
    assert.deepEqual(Object.keys(previous.managed_partial_files), []);
    for (const file of read(owned.storeRoot, closure.candidate.parent_asset.content_digest).files) {
      const path = `.agents/prompts/${basename(file.path)}`;
      assert.equal(comparisonHash(readFileSync(join(t.root, path))), file.raw_digest, "installed parent byte drift");
      assert.equal(`sha256:${previous.managed_files[path].sha256}`, file.raw_digest, "installed parent state drift");
      assert.equal(`sha256:${previous.managed_files[path].canonical_sha256}`, file.raw_digest, "installed parent canonical state drift");
    }
  } else assert.equal(options.role, "parent", "initialize approved parent before candidate");
  const rollback = createRollbackSnapshot(), operations = [], managedFiles = {};
  for (const file of projected.files) {
    planWriteManaged(operations, { target: t.root, relativePath: file.path, content: file.text,
      reason: "artificial:exact-registered-prompt", previousState: previous, rollback });
    managedFiles[file.path] = createManagedFileRecord({ kind: "personal_registered_prompt", content: file.text });
  }
  const state = buildLifecycleState({ manifest: null, repoRoot: ROOT, adapterName: "personal-prompt-artificial", target: { scope: "artificial_only" },
    installedSkills: [], selectedSkills: [], managedFiles, rollback, previousState: previous, hasMutations: true,
    extra: { personal_prompt: { asset: projected.asset, receipt_object_digest: owned.receiptObjectDigest,
      rollback_anchor: closure.receipt.rollback_anchor, role: options.role, model_read: "Unknown", operational: "Unknown" } } });
  const before = captureApplyTarget(t.root).binding;
  const body = { kind: "artificial_personal_prompt_apply_plan_v1", role: options.role, target_root: t.root,
    target_identity: { dev: t.dev, ino: t.ino }, target_before: before, asset: projected.asset,
    receipt_object_digest: owned.receiptObjectDigest, inventory: projected.files.map(({ text, ...file }) => file), models_started: false };
  const handle = Object.freeze({ digest: canonicalDigest(body) });
  plans.set(handle, { kind: "apply", targetHandle: options.target, owned, selectionObjectDigest: options.selectionObjectDigest,
    role: options.role, body, operations, state });
  return Object.freeze({ handle, digest: handle.digest, plan: structuredClone(body), environment: "artificial_only" });
}
export function applyArtificialPersonalPromptPlan(handle, confirmedDigest) {
  const p = plans.get(handle); assert.ok(p && p.kind === "apply", "owned apply plan required");
  assert.equal(confirmedDigest, handle.digest, "exact artificial plan confirmation required");
  const t = target(p.targetHandle), { closure } = verifiedInputs(p.owned);
  const again = projection(p.owned, closure, p.selectionObjectDigest, p.role);
  assert.ok(same(again.asset, p.body.asset)); assert.ok(same(captureApplyTarget(t.root).binding, p.body.target_before), "target changed after plan");
  applyLifecyclePlan({ target: t.root, statePath: STATE, operations: p.operations, state: p.state, dryRun: false });
  for (const file of again.files) assert.equal(comparisonHash(readFileSync(join(t.root, file.path))), file.digest);
  plans.delete(handle);
  return Object.freeze({ status: "applied_artificial", asset: p.body.asset, plan_digest: handle.digest,
    models_started: false, actual_mac_adoption: false, operational: "Unknown", mutation_scope: "minted_artificial_target_only" });
}
export function planArtificialPersonalPromptRestore(options) {
  options = fields(options, ["target", "closure", "rollbackSelectionObjectDigest"]);
  const t = target(options.target), { owned, closure } = verifiedInputs(options.closure), state = currentState(t.root);
  verifyRestoreState({ root: t.root, statePath: STATE, state, owned, closure, rollbackSelectionObjectDigest: options.rollbackSelectionObjectDigest });
  const body = { kind: "artificial_personal_prompt_restore_plan_v1", target_root: t.root, target_before: captureApplyTarget(t.root).binding,
    receipt_object_digest: owned.receiptObjectDigest, rollback_selection_object_digest: options.rollbackSelectionObjectDigest,
    rollback_anchor: closure.receipt.rollback_anchor, asset: closure.candidate.parent_asset, models_started: false };
  const handle = Object.freeze({ digest: canonicalDigest(body) });
  plans.set(handle, { kind: "restore", targetHandle: options.target, owned, body, rollbackSelectionObjectDigest: options.rollbackSelectionObjectDigest });
  return Object.freeze({ handle, digest: handle.digest, plan: structuredClone(body), environment: "artificial_only" });
}
export function restoreArtificialPersonalPromptPlan(handle, confirmedDigest) {
  const p = plans.get(handle); assert.ok(p && p.kind === "restore", "owned restore plan required");
  assert.equal(confirmedDigest, handle.digest);
  const t = target(p.targetHandle); assert.ok(same(captureApplyTarget(t.root).binding, p.body.target_before), "target changed after restore plan");
  planArtificialPersonalPromptRestore({ target: p.targetHandle, closure: p.owned, rollbackSelectionObjectDigest: p.rollbackSelectionObjectDigest });
  rollbackLifecycleState({ target: t.root, statePath: STATE, dryRun: false });
  const state = currentState(t.root); assert.ok(same(state.personal_prompt.asset, p.body.asset));
  for (const file of read(p.owned.storeRoot, p.body.asset.content_digest).files) {
    const path = `.agents/prompts/${basename(file.path)}`;
    assert.equal(comparisonHash(readFileSync(join(t.root, path))), file.raw_digest, "restored parent bytes differ");
    assert.equal(`sha256:${state.managed_files[path].sha256}`, file.raw_digest, "restored parent state differs");
  }
  plans.delete(handle);
  return Object.freeze({ status: "restored_artificial", asset: p.body.asset, plan_digest: handle.digest,
    models_started: false, actual_mac_restore: false, operational: "Unknown", mutation_scope: "minted_artificial_target_only" });
}
