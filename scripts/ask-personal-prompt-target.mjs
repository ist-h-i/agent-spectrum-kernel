// Physical projection only. Caller supplies trusted adoption/rollback context;
// neither a saved plan nor local state is authority to make a Portfolio decision.
import assert from "node:assert/strict";
import { types } from "node:util";
import { lstatSync, mkdirSync, readdirSync, realpathSync, rmdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, parseJsonRejectDuplicateKeys, readStableBytes } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { assertNoSetupInProgress, assertSetupWritePaths, captureApplyTarget, resultBinding, SETUP_STATE_PATHS } from "./ask-setup-apply-state.mjs";
import { buildSetupSourceIdentity, pathInside } from "./ask-setup-inputs.mjs";
import { applyLifecyclePlan, buildLifecycleState, createManagedFileRecord, createRollbackSnapshot,
  planWriteManaged, readGitRevision } from "./installer-lifecycle.mjs";
import { fields, ownJson, PROMPT_PATHS, projection, verifiedInputs, verifyRestoreState } from "./ask-personal-prompt-adoption-materialization.mjs";

export const PERSONAL_PROMPT_TARGET_STATE = ".agent-spectrum-kernel/personal-prompt-target-state.json";
const STATE = PERSONAL_PROMPT_TARGET_STATE, META = dirname(STATE), LOCK = `${STATE}.lock`, MARKER = `${STATE}.in-progress.json`;
const SOURCE = realpathSync(resolve(import.meta.dirname, "..")), INSTALLER = "personal-prompt-target";
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const present = path => { try { return lstatSync(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const identity = path => { const s = lstatSync(path); return { dev: s.dev, ino: s.ino }; };
export class PersonalPromptTargetError extends Error {
  constructor(code = "personal_target_refused") { super(code); this.name = "PersonalPromptTargetError"; this.code = code; }
}
function boundary(run) {
  try { return run(); } catch (error) {
    if (error instanceof PersonalPromptTargetError) throw error;
    throw new PersonalPromptTargetError(); // Raw filesystem/trust/Prompt errors stay private.
  }
}
function jsonInput(value) {
  // Refuse proxies before any trap, including nested context objects. Copy only
  // enumerable JSON data, rejecting accessors without evaluating them.
  function inspect(item, seen = new Set()) {
    if (!item || typeof item !== "object") return;
    assert.ok(!types.isProxy(item) && !seen.has(item));
    const next = new Set(seen); next.add(item);
    for (const d of Object.values(Object.getOwnPropertyDescriptors(item))) {
      assert.ok(Object.hasOwn(d, "value")); inspect(d.value, next);
    }
  }
  inspect(value); return ownJson(value);
}
function options(value, names) { return fields(jsonInput(value), names); }
function jsonFile(path) { return parseJsonRejectDuplicateKeys(readStableBytes(path, "physical target state", 32 * 1024 * 1024)); }
function canonicalDirectory(path) {
  assert.equal(typeof path, "string"); const root = resolve(path); assert.equal(path, root);
  for (let cursor = root; ; cursor = dirname(cursor)) {
    const s = lstatSync(cursor); assert.ok(s.isDirectory() && !s.isSymbolicLink());
    if (dirname(cursor) === cursor) break;
  }
  assert.equal(realpathSync(root), root); return root;
}
function independent(a, b) { assert.ok(!pathInside(a, b) && !pathInside(b, a)); }
function current(root) {
  if (present(join(root, MARKER))) throw new PersonalPromptTargetError("personal_target_recovery_required");
  return present(join(root, STATE)) ? jsonFile(join(root, STATE)) : null;
}
function checkStateStructure(state, root) {
  fields(state, ["personal_prompt", "schema_version", "installer", "adapter", "source", "selected_profile", "installed_skills", "selected_skills",
    "install_status", "previous_successful_state", "target", "managed_files", "managed_partial_files", "managed_blocks", "managed_hooks", "rollback"],
  ["personal_prompt", "schema_version", "installer", "adapter", "source", "selected_profile", "installed_skills", "selected_skills",
    "install_status", "target", "managed_files", "managed_partial_files", "managed_blocks", "managed_hooks"]);
  assert.equal(state.schema_version, 3); assert.equal(state.installer, INSTALLER); assert.equal(state.install_status, "installed");
  assert.ok(same(state.target, { scope: "explicit_normal_git_target", root, identity: identity(root) }));
  assert.deepEqual(Object.keys(state.managed_files).sort(), [...PROMPT_PATHS]);
  assert.deepEqual(state.managed_blocks, {}); assert.deepEqual(state.managed_partial_files, {}); assert.deepEqual(state.managed_hooks, []);
  assert.deepEqual(state.installed_skills, []); assert.deepEqual(state.selected_skills, []);
  assert.ok(["parent", "candidate"].includes(state.personal_prompt.role));
  fields(state.personal_prompt, ["role", "asset", "receipt_object_digest", "selection_object_digest", "installed_lock_digest", "rollback_anchor",
    "source_identity_digest", "restored_by_selection_object_digest"], ["role", "asset", "receipt_object_digest", "selection_object_digest", "installed_lock_digest", "rollback_anchor", "source_identity_digest"]);
}
function checkState(state, root) {
  checkStateStructure(state, root);
  for (const [path, record] of Object.entries(state.managed_files)) {
    const hash = comparisonHash(readStableBytes(join(root, path), "managed Prompt"));
    assert.equal(`sha256:${record.sha256}`, hash); assert.equal(`sha256:${record.canonical_sha256}`, hash);
  }
}
function checkedTarget(path, ownedLock = null) {
  const root = canonicalDirectory(path); independent(root, SOURCE);
  assertSetupWritePaths(root, [...PROMPT_PATHS, STATE, MARKER, LOCK, ...SETUP_STATE_PATHS,
    ".agent-spectrum-kernel/personal-prompt-artificial-state.json"]);
  assertNoSetupInProgress(root);
  assert.ok(!present(join(root, ".agent-spectrum-kernel/personal-prompt-artificial-state.json")));
  if (ownedLock) {
    assert.ok(same(identity(join(root, LOCK)), ownedLock.identity));
    assert.deepEqual(readdirSync(join(root, LOCK)), []);
  } else assert.ok(!present(join(root, LOCK)));
  for (const path of SETUP_STATE_PATHS) {
    if (!present(join(root, path))) continue;
    const state = jsonFile(join(root, path)); assert.equal(state.schema_version, 3);
    const claimed = [...Object.keys(state.managed_files ?? {}), ...Object.keys(state.managed_partial_files ?? {}),
      ...Object.values(state.managed_blocks ?? {}).map(block => block.path)];
    for (const entry of claimed) {
      assert.equal(typeof entry, "string");
      assert.ok(!PROMPT_PATHS.some(prompt => entry === prompt || prompt.startsWith(`${entry}/`) || entry.startsWith(`${prompt}/`)));
    }
  }
  const state = current(root); if (state) checkState(state, root);
  const snapshot = captureApplyTarget(root);
  assert.ok(snapshot.binding.git.head_digest && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(readGitRevision(root) ?? ""), "committed normal Git target required");
  let binding = snapshot.binding;
  if (ownedLock) {
    const entries = snapshot.entries.filter(entry => entry.path !== LOCK && !(ownedLock.createdMeta && entry.path === META));
    // Exclude only the empty directory we created, never descendants or caller files.
    binding = resultBinding(snapshot.binding.git, entries);
  }
  return { root, state, binding, targetIdentity: identity(root), metadataExisted: ownedLock ? !ownedLock.createdMeta : Boolean(present(join(root, META))) };
}
function sourceIdentity() {
  return buildSetupSourceIdentity(SOURCE, { selectedSkills: [], coreAssets: [], revision: readGitRevision(SOURCE) }).identity_digest;
}
function prepare(input, kind, ownedLock = null) {
  const t = checkedTarget(input.targetRoot, ownedLock), { owned, closure } = verifiedInputs(input.closure);
  const storeRoot = canonicalDirectory(realpathSync(owned.storeRoot)); independent(t.root, storeRoot);
  const source = sourceIdentity(); let operations, state, asset, selection, role, inventory;
  if (kind === "apply") {
    role = input.role; assert.ok(["parent", "candidate"].includes(role));
    const material = projection(owned, closure, input.selectionObjectDigest, role); asset = material.asset;
    selection = input.selectionObjectDigest; inventory = material.files.map(({ text, ...file }) => file);
    const lock = role === "parent" ? closure.candidate.parent_portfolio.lock_digest : closure.receipt.result_heads.portfolio_lock_digest;
    if (t.state) {
      assert.equal(role, "candidate"); assert.equal(t.state.personal_prompt.role, "parent");
      assert.ok(same(t.state.personal_prompt.asset, closure.candidate.parent_asset));
      assert.equal(t.state.personal_prompt.installed_lock_digest, closure.candidate.parent_portfolio.lock_digest);
      const parent = projection(owned, closure, t.state.personal_prompt.selection_object_digest, "parent");
      for (const file of parent.files) assert.equal(comparisonHash(readStableBytes(join(t.root, file.path), "installed parent")), file.digest);
    } else assert.equal(role, "parent");
    const rollback = createRollbackSnapshot(), managedFiles = {}; operations = [];
    for (const file of material.files) {
      planWriteManaged(operations, { target: t.root, relativePath: file.path, content: file.text,
        reason: "personal:exact-registered-prompt", previousState: t.state, rollback });
      managedFiles[file.path] = createManagedFileRecord({ kind: "personal_registered_prompt", content: file.text });
    }
    state = buildLifecycleState({ manifest: null, repoRoot: SOURCE, adapterName: INSTALLER,
      target: { scope: "explicit_normal_git_target", root: t.root, identity: t.targetIdentity }, installedSkills: [], selectedSkills: [],
      managedFiles, rollback, previousState: t.state, hasMutations: true,
      extra: { personal_prompt: { role, asset, receipt_object_digest: owned.receiptObjectDigest, selection_object_digest: selection,
        installed_lock_digest: lock, rollback_anchor: closure.receipt.rollback_anchor, source_identity_digest: source } } });
  } else {
    assert.ok(t.state); assert.equal(t.state.personal_prompt.installed_lock_digest, closure.receipt.result_heads.portfolio_lock_digest);
    const previous = t.state.previous_successful_state; assert.ok(previous); checkStateStructure(previous, t.root);
    assert.equal(previous.personal_prompt.role, "parent");
    assert.equal(previous.personal_prompt.installed_lock_digest, closure.candidate.parent_portfolio.lock_digest);
    // A parent may predate this adoption receipt. Its recorded receipt is
    // historical metadata; the current candidate receipt is verified below.
    projection(owned, closure, previous.personal_prompt.selection_object_digest, "parent");
    projection(owned, closure, t.state.personal_prompt.selection_object_digest, "candidate");
    const verified = verifyRestoreState({ root: t.root, statePath: STATE, state: t.state, owned, closure,
      rollbackSelectionObjectDigest: input.rollbackSelectionObjectDigest });
    assert.equal(t.state.previous_successful_state.installer, INSTALLER);
    operations = verified.operations; role = "parent"; asset = closure.candidate.parent_asset;
    selection = input.rollbackSelectionObjectDigest;
    state = { ...t.state.previous_successful_state, install_status: "installed", previous_successful_state: null,
      rollback: t.state.rollback, personal_prompt: { ...t.state.previous_successful_state.personal_prompt,
        installed_lock_digest: verified.selection.portfolio_lock.lock_digest, selection_object_digest: selection, restored_by_selection_object_digest: selection,
        source_identity_digest: source } };
    checkStateStructure(state, t.root);
    inventory = Object.entries(state.managed_files).map(([path, record]) => ({ path, digest: `sha256:${record.sha256}` }));
  }
  assert.ok(operations.every(op => op.kind === "write" && PROMPT_PATHS.includes(op.relativePath) && op.destination === join(t.root, op.relativePath)));
  assert.ok(same(captureBinding(t.root, ownedLock), t.binding), "target changed while planning");
  assert.equal(sourceIdentity(), source, "source changed while planning");
  const plan = { schema: "ask.personal-prompt-target-plan@1", operation: kind, role, target_root: t.root,
    target_identity: t.targetIdentity, target_before: t.binding, metadata_existed: t.metadataExisted,
    source_identity_digest: source, closure_digest: canonicalDigest(owned), receipt_object_digest: owned.receiptObjectDigest,
    selection_object_digest: selection, asset, inventory_digest: canonicalDigest(inventory), state_digest: canonicalDigest(state), models_started: false };
  return { prepared: { plan, digest: canonicalDigest(plan) }, operations, state };
}
function captureBinding(root, ownedLock) {
  const captured = captureApplyTarget(root);
  if (!ownedLock) return captured.binding;
  assert.ok(same(identity(join(root, LOCK)), ownedLock.identity)); assert.deepEqual(readdirSync(join(root, LOCK)), []);
  return resultBinding(captured.binding.git, captured.entries.filter(entry => entry.path !== LOCK && !(ownedLock.createdMeta && entry.path === META)));
}
export function planPersonalPromptTargetApply(input) {
  return boundary(() => prepare(options(input, ["targetRoot", "closure", "selectionObjectDigest", "role"]), "apply").prepared);
}
export function planPersonalPromptTargetRestore(input) {
  return boundary(() => prepare(options(input, ["targetRoot", "closure", "rollbackSelectionObjectDigest"]), "restore").prepared);
}
function execute(value, kind) {
  return boundary(() => {
    const input = options(value, ["prepared", "closure", "confirmedDigest", "authorized"]);
    assert.equal(input.authorized, true); const p = fields(input.prepared, ["plan", "digest"]);
    assert.equal(p.digest, canonicalDigest(p.plan)); assert.equal(input.confirmedDigest, p.digest); assert.equal(p.plan.operation, kind);
    const request = kind === "apply" ? { targetRoot: p.plan.target_root, closure: input.closure, role: p.plan.role, selectionObjectDigest: p.plan.selection_object_digest }
      : { targetRoot: p.plan.target_root, closure: input.closure, rollbackSelectionObjectDigest: p.plan.selection_object_digest };
    assert.ok(same(prepare(request, kind).prepared, p));
    const root = p.plan.target_root, createdMeta = !present(join(root, META));
    if (createdMeta) mkdirSync(join(root, META));
    let lock = null;
    try {
      mkdirSync(join(root, LOCK)); lock = { identity: identity(join(root, LOCK)), createdMeta };
      const live = prepare(request, kind, lock); assert.ok(same(live.prepared, p));
      try {
        applyLifecyclePlan({ target: root, statePath: STATE, operations: live.operations, state: live.state, dryRun: false });
        assert.ok(same(current(root), live.state)); checkState(live.state, root);
      } catch {
        throw new PersonalPromptTargetError("personal_target_recovery_required");
      }
      return { status: kind === "apply" ? "applied" : "restored", plan_digest: p.digest,
        installed_lock_digest: live.state.personal_prompt.installed_lock_digest, models_started: false, runtime_loading: "Unknown" };
    } finally {
      // Never remove a foreign/replaced/nonempty lock, pending marker or file.
      try {
        if (lock) {
          const stat = present(join(root, LOCK));
          assert.ok(stat?.isDirectory() && !stat.isSymbolicLink() && same(identity(join(root, LOCK)), lock.identity));
          assert.deepEqual(readdirSync(join(root, LOCK)), []); rmdirSync(join(root, LOCK));
        }
        if (createdMeta && readdirSync(join(root, META)).length === 0) rmdirSync(join(root, META));
      } catch { throw new PersonalPromptTargetError("personal_target_recovery_required"); }
    }
  });
}
export function applyPersonalPromptTargetPlan(input) { return execute(input, "apply"); }
export function restorePersonalPromptTargetPlan(input) { return execute(input, "restore"); }
export function inspectPersonalPromptTarget(input) {
  return boundary(() => {
    const { targetRoot } = options(input, ["targetRoot"]), t = checkedTarget(targetRoot);
    return { status: t.state ? "installed" : "not_installed", role: t.state?.personal_prompt.role ?? null,
      installed_lock_digest: t.state?.personal_prompt.installed_lock_digest ?? null, target_digest: t.binding.digest,
      models_started: false, adoption_authority: "not_inferred", runtime_loading: "Unknown" };
  });
}
