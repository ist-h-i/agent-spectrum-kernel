// Physical projection only. Caller supplies trusted adoption/rollback context;
// neither a saved plan nor local state is authority to make a Portfolio decision.
import assert from "node:assert/strict";
import { types } from "node:util";
import { lstatSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, parseJsonRejectDuplicateKeys, readStableBytes, putContentAddressedJson, listContentAddressedJson } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { assertNoSetupInProgress, assertSetupWritePaths, captureApplyTarget, resultBinding, SETUP_STATE_PATHS } from "./ask-setup-apply-state.mjs";
import { buildSetupSourceIdentity, pathInside } from "./ask-setup-inputs.mjs";
import { applyLifecyclePlan, applyOperations, buildLifecycleState, createManagedFileRecord, createRollbackSnapshot,
  planWriteManaged, readGitRevision } from "./installer-lifecycle.mjs";
import { fields, ownJson, PROMPT_PATHS, projection, verifiedInputs, verifyRestoreState, verifyRollbackSelection, verifyRestoreSnapshot } from "./ask-personal-prompt-adoption-materialization.mjs";
import { PERSONAL_PROMPT_TARGET_STATE, PERSONAL_PROMPT_TARGET_JOURNAL as JOURNAL, PERSONAL_PROMPT_TARGET_EVIDENCE as EVIDENCE,
  withPersonalPromptTargetLock } from "./ask-personal-prompt-target-lock.mjs";
import { buildCodexProjectionPlan, inspectCodexFullInstallation } from "./install-codex-adapter.mjs";
import { verifyPortfolioSelection } from "./portfolio-manager.mjs";

export { PERSONAL_PROMPT_TARGET_STATE };
const STATE = PERSONAL_PROMPT_TARGET_STATE, META = dirname(STATE), LOCK = `${STATE}.lock`, MARKER = `${STATE}.in-progress.json`;
const CODEX = ".agent-spectrum-kernel/codex-install-state.json";
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
  if (present(join(root, MARKER)) || present(join(root, JOURNAL))) throw new PersonalPromptTargetError("personal_target_recovery_required");
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
    "source_identity_digest", "restored_by_selection_object_digest", "codex_lease"], ["role", "asset", "receipt_object_digest", "selection_object_digest", "installed_lock_digest", "rollback_anchor", "source_identity_digest"]);
}
function checkState(state, root) {
  checkStateStructure(state, root);
  if (state.personal_prompt.codex_lease) verifyCodexLease(root, state.personal_prompt.codex_lease);
  for (const [path, record] of Object.entries(state.managed_files)) {
    const hash = comparisonHash(readStableBytes(join(root, path), "managed Prompt"));
    assert.equal(`sha256:${record.sha256}`, hash); assert.equal(`sha256:${record.canonical_sha256}`, hash);
  }
}
function checkedTarget(path, ownedLock = null, recovery = false, ownerPin = null) {
  const root = canonicalDirectory(path); independent(root, SOURCE);
  assertSetupWritePaths(root, [...PROMPT_PATHS, STATE, MARKER, JOURNAL, EVIDENCE, LOCK, ...SETUP_STATE_PATHS,
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
    if (ownerPin && path === CODEX) {
      assert.equal(comparisonHash(rawFile(root, CODEX)), ownerPin); continue;
    }
    const claimed = [...Object.keys(state.managed_files ?? {}), ...Object.keys(state.managed_partial_files ?? {}),
      ...Object.values(state.managed_blocks ?? {}).map(block => block.path)];
    for (const entry of claimed) {
      assert.equal(typeof entry, "string");
      assert.ok(!PROMPT_PATHS.some(prompt => entry === prompt || prompt.startsWith(`${entry}/`) || entry.startsWith(`${prompt}/`)));
    }
  }
  const state = recovery ? null : current(root); if (state) checkState(state, root);
  const snapshot = captureApplyTarget(root);
  assert.ok(snapshot.binding.git.head_digest && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(readGitRevision(root) ?? ""), "committed normal Git target required");
  let binding = snapshot.binding, entries = snapshot.entries;
  if (ownedLock) {
    entries = snapshot.entries.filter(entry => entry.path !== LOCK && !(ownedLock.createdMeta && entry.path === META));
    // Exclude only the empty directory we created, never descendants or caller files.
    binding = resultBinding(snapshot.binding.git, entries);
  }
  return { root, state, binding, entries, targetIdentity: identity(root), metadataExisted: ownedLock ? !ownedLock.createdMeta : Boolean(present(join(root, META))) };
}
function sourceIdentity() {
  return buildSetupSourceIdentity(SOURCE, { selectedSkills: [], coreAssets: [], revision: readGitRevision(SOURCE) }).identity_digest;
}
function fullCodexOwner(root, raw) {
  const state = parseJsonRejectDuplicateKeys(raw), projection = buildCodexProjectionPlan({ profileName: "full" });
  assert.equal(state.schema_version, 3); assert.equal(state.installer, "agent-spectrum-codex-adapter");
  assert.equal(state.adapter?.name, state.installer); assert.equal(state.install_status, "installed");
  assert.equal(state.source?.git_revision, readGitRevision(SOURCE)); assert.equal(state.selected_profile, "full");
  assert.ok(!state.personal_prompt_delegation); assert.deepEqual([...(state.selected_prompts ?? [])].sort(), PROMPT_PATHS.map(path => path.split("/").at(-1)));
  assert.equal(state.projection_plan?.fingerprint, projection.fingerprint);
  assert.deepEqual([...state.selected_skills].sort(), [...projection.skills].sort());
  assert.deepEqual([...state.installed_skills].sort(), [...projection.skills].sort());
  assert.deepEqual(state.actual_installed_inventory, projection.actualInstalledInventory);
  assert.deepEqual(Object.keys(state.managed_files).sort(), projection.actualInstalledInventory.map(item => item.path).sort());
  assert.deepEqual(state.selected_commands, projection.commands);
  assert.deepEqual(state.compact_runtime_profiles, projection.compactProfiles);
  const expected = inspectCodexFullInstallation(root);
  assert.ok(same(state.managed_files, expected.managed_files));
  assert.deepEqual(state.managed_partial_files, {}); assert.deepEqual(state.managed_hooks, []);
  const paths = [...Object.keys(state.managed_files), ...Object.values(state.managed_blocks).map(block => block.path)];
  assertSetupWritePaths(root, paths);
  for (const [path, record] of Object.entries(state.managed_files)) {
    assert.equal(comparisonHash(rawFile(root, path)), `sha256:${record.sha256}`);
    assert.equal(record.canonical_sha256, record.sha256);
  }
  // The initial handover supports the ordinary full installation, without a second block owner.
  assert.deepEqual(state.managed_blocks, {});
  for (const item of projection.compactProfileArtifacts) {
    const path = `.agents/prompts/${item.metadata.prompt_name}`;
    assert.equal(state.managed_files[path]?.kind, "codex_prompt");
    assert.equal(state.managed_files[path]?.compact_profile?.rendered_sha256, comparisonHash(Buffer.from(item.content)));
    assert.ok(rawFile(root, path).equals(Buffer.from(item.content)));
  }
  return state;
}
function delegatedOwner(original, leaseId, ownerDigest) {
  return { ...original, managed_files: Object.fromEntries(Object.entries(original.managed_files).filter(([path]) => !PROMPT_PATHS.includes(path))),
    personal_prompt_delegation: { schema: "ask.personal-prompt-codex-delegation@1", lease_id: leaseId, owner_state_digest: ownerDigest,
      personal_state_path: STATE, paths: [...PROMPT_PATHS] } };
}
function verifyCodexLease(root, lease) {
  fields(lease, ["schema", "lease_id", "owner_state_digest", "original_owner_state_base64", "delegated_state_digest", "protected_entries", "parent_selection_object_digest"]);
  assert.equal(lease.schema, "ask.personal-prompt-codex-lease@1");
  const raw = Buffer.from(lease.original_owner_state_base64, "base64"); assert.equal(raw.toString("base64"), lease.original_owner_state_base64);
  assert.equal(comparisonHash(raw), lease.owner_state_digest);
  const original = parseJsonRejectDuplicateKeys(raw);
  assert.equal(original.installer, "agent-spectrum-codex-adapter"); assert.ok(!original.personal_prompt_delegation);
  const delegated = stateBytes(delegatedOwner(original, lease.lease_id, lease.owner_state_digest));
  assert.equal(comparisonHash(delegated), lease.delegated_state_digest); assert.ok(equalBytes(rawFile(root, CODEX), delegated));
  const captured = captureApplyTarget(root), entries = new Map(captured.entries.map(entry => [entry.path, entry]));
  const protectedPaths = Object.keys(original.managed_files).filter(path => !PROMPT_PATHS.includes(path));
  assert.equal(lease.protected_entries.length, protectedPaths.length); assert.deepEqual(lease.protected_entries.map(e => e.path).sort(), protectedPaths.sort());
  assertSetupWritePaths(root, protectedPaths);
  for (const entry of lease.protected_entries) {
    assert.equal(entry.type, "file"); assert.equal(entry.sha256, original.managed_files[entry.path].sha256);
    assert.ok(same(entries.get(entry.path), entry), "delegated non-Prompt asset drift");
  }
  return { original, raw, delegated };
}
function prepare(input, kind, ownedLock = null, ownerPin = null) {
  const t = checkedTarget(input.targetRoot, ownedLock, false, ownerPin), { owned, closure } = verifiedInputs(input.closure);
  const storeRoot = canonicalDirectory(realpathSync(owned.storeRoot)); independent(t.root, storeRoot);
  const source = sourceIdentity(); let operations, state, asset, selection, role, inventory;
  if (kind === "apply") {
    role = input.role; assert.ok(["parent", "candidate"].includes(role));
    const material = projection(owned, closure, input.selectionObjectDigest, role); asset = material.asset;
    if (t.state?.personal_prompt.codex_lease && role === "candidate") {
      const parent = projection(owned, closure, t.state.personal_prompt.selection_object_digest, "parent");
      for (const file of material.files) assert.ok(file.text.startsWith(parent.files.find(p => p.path === file.path).text), "compact parent controls must be retained");
    }
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
        installed_lock_digest: lock, rollback_anchor: closure.receipt.rollback_anchor, source_identity_digest: source,
        ...(t.state?.personal_prompt.codex_lease ? { codex_lease: t.state.personal_prompt.codex_lease } : {}) } } });
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
  return { prepared: { plan, digest: canonicalDigest(plan) }, operations, state, before: t };
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
    const root = p.plan.target_root; let mutated = false;
    try { return withPersonalPromptTargetLock(root, lock => {
      const live = prepare(request, kind, lock); assert.ok(same(live.prepared, p));
      try {
        const journal = { schema: "ask.personal-prompt-operation@1", original: p,
          before_entries: live.before.entries, before_state_base64: rawFile(root, STATE)?.toString("base64") ?? null,
          pending_state: live.state, new_file_mode: 0o666 & ~process.umask() };
        const bytes = Buffer.from(`${JSON.stringify(journal)}\n`); assert.ok(bytes.length <= 32 * 1024 * 1024);
        writeFileSync(join(root, JOURNAL), bytes, { flag: "wx", mode: 0o600 });
        mutated = true;
        applyLifecyclePlan({ target: root, statePath: STATE, operations: live.operations, state: live.state, dryRun: false });
        assert.ok(same(jsonFile(join(root, STATE)), live.state)); checkState(live.state, root);
        assert.ok(rawFile(root, JOURNAL).equals(bytes)); unlinkSync(join(root, JOURNAL));
      } catch {
        throw new PersonalPromptTargetError("personal_target_recovery_required");
      }
      return { status: kind === "apply" ? "applied" : "restored", plan_digest: p.digest,
        installed_lock_digest: live.state.personal_prompt.installed_lock_digest, models_started: false, runtime_loading: "Unknown" };
    }); } catch (error) { if (mutated) throw new PersonalPromptTargetError("personal_target_recovery_required"); throw error; }
  });
}
export function applyPersonalPromptTargetPlan(input) { return execute(input, "apply"); }
export function restorePersonalPromptTargetPlan(input) { return execute(input, "restore"); }
function rawFile(root, path) { return present(join(root, path)) ? readStableBytes(join(root, path), "physical operation evidence", 32 * 1024 * 1024) : null; }
const stateBytes = state => state === null ? null : Buffer.from(`${JSON.stringify(state, null, 2)}\n`);
function equalBytes(a, b) { return a === null || b === null ? a === b : a.equals(b); }
function parentAfterRollback(candidate, selection, source) {
  return { ...candidate.previous_successful_state, install_status: "installed", previous_successful_state: null,
    rollback: candidate.rollback, personal_prompt: { ...candidate.previous_successful_state.personal_prompt,
      installed_lock_digest: selection.portfolio_lock.lock_digest, selection_object_digest: selection.selection_object_digest,
      restored_by_selection_object_digest: selection.selection_object_digest, source_identity_digest: source } };
}
function prepareRecovery(input, ownedLock = null) {
  const t = checkedTarget(input.targetRoot, ownedLock, true), root = t.root;
  const { owned, closure } = verifiedInputs(input.closure);
  independent(root, canonicalDirectory(realpathSync(owned.storeRoot)));
  const journalBytes = rawFile(root, JOURNAL); assert.ok(journalBytes);
  assert.equal(present(join(root, JOURNAL)).mode & 0o077, 0);
  const j = fields(parseJsonRejectDuplicateKeys(journalBytes), ["schema", "original", "before_entries", "before_state_base64", "pending_state", "new_file_mode"]);
  assert.equal(j.schema, "ask.personal-prompt-operation@1");
  const original = fields(j.original, ["plan", "digest"]), p = original.plan;
  assert.equal(original.digest, input.originalPlanDigest); assert.equal(original.digest, canonicalDigest(p));
  assert.equal(p.schema, "ask.personal-prompt-target-plan@1"); assert.ok(["apply", "restore"].includes(p.operation));
  assert.equal(p.target_root, root); assert.ok(same(p.target_identity, t.targetIdentity));
  const source = sourceIdentity(); assert.equal(p.source_identity_digest, source);
  assert.equal(p.closure_digest, canonicalDigest(owned)); assert.equal(p.receipt_object_digest, owned.receiptObjectDigest);
  assert.ok(same(p.target_before.git, t.binding.git)); assert.ok(same(resultBinding(p.target_before.git, j.before_entries), p.target_before));
  assert.equal(canonicalDigest(j.pending_state), p.state_digest); checkStateStructure(j.pending_state, root);
  assert.equal(j.pending_state.personal_prompt.role, p.role); assert.ok(same(j.pending_state.personal_prompt.asset, p.asset));
  const beforeBytes = j.before_state_base64 === null ? null : Buffer.from(j.before_state_base64, "base64");
  if (beforeBytes) assert.equal(beforeBytes.toString("base64"), j.before_state_base64);
  const beforeState = beforeBytes ? parseJsonRejectDuplicateKeys(beforeBytes) : null;
  const before = new Map(j.before_entries.map(e => [e.path, e])); assert.equal(before.size, j.before_entries.length);
  if (beforeState) {
    checkStateStructure(beforeState, root); assert.equal(before.get(STATE)?.sha256, comparisonHash(beforeBytes).slice(7));
  } else assert.ok(!before.has(STATE));
  assert.ok(Array.isArray(input.rollbackTrustedPortfolioAuthorityContexts));
  const rollbackOwned = { ...owned, trustedPortfolioAuthorityContexts: [...(owned.trustedPortfolioAuthorityContexts ?? []), ...input.rollbackTrustedPortfolioAuthorityContexts] };
  const rollback = verifyRollbackSelection({ owned: rollbackOwned, closure, rollbackSelectionObjectDigest: input.rollbackSelectionObjectDigest });
  // The selection digest is a separately supplied CAS identity, not a field inferred from a local state.
  const selected = { ...rollback.selection, selection_object_digest: input.rollbackSelectionObjectDigest };
  const parent = projection(owned, closure, p.operation === "restore" ? beforeState?.previous_successful_state?.personal_prompt.selection_object_digest
    : p.role === "parent" ? p.selection_object_digest : beforeState?.personal_prompt.selection_object_digest, "parent");
  let finalState = null, candidate = null;
  if (p.operation === "restore" || p.role === "candidate") {
    const candidateState = p.operation === "restore" ? beforeState : j.pending_state;
    checkStateStructure(candidateState, root); checkStateStructure(candidateState.previous_successful_state, root);
    verifyRestoreSnapshot({ state: candidateState, owned: rollbackOwned, closure, rollbackSelectionObjectDigest: input.rollbackSelectionObjectDigest });
    assert.equal(candidateState.personal_prompt.installed_lock_digest, closure.receipt.result_heads.portfolio_lock_digest);
    if (p.operation === "apply") assert.ok(same(candidateState.previous_successful_state, (() => {
      const v = structuredClone(beforeState); delete v.previous_successful_state; delete v.rollback; return v;
    })()));
    candidate = projection(owned, closure, candidateState.personal_prompt.selection_object_digest, "candidate");
    finalState = parentAfterRollback(candidateState, selected, source); checkStateStructure(finalState, root);
    if (p.operation === "restore") assert.ok(same(j.pending_state, finalState));
  } else {
    assert.equal(p.role, "parent"); assert.equal(beforeState, null);
  }
  // Only closed endpoint bytes and modes may have changed. All other entries remain pinned.
  const allowed = new Set([...PROMPT_PATHS, STATE, MARKER, JOURNAL, LOCK]);
  const newDirs = [META, ".agents", ".agents/prompts"].filter(path => !before.has(path));
  const evidencePath = path => path === EVIDENCE || path.startsWith(`${EVIDENCE}/`);
  const ignored = e => allowed.has(e.path) || newDirs.includes(e.path) || evidencePath(e.path);
  assert.ok(same(j.before_entries.filter(e => !ignored(e)), t.entries.filter(e => !ignored(e))));
  for (const entry of j.before_entries.filter(e => evidencePath(e.path))) assert.ok(same(entry, t.entries.find(e => e.path === entry.path)));
  if (present(join(root, EVIDENCE))) listContentAddressedJson({ storeRoot: join(root, EVIDENCE), maximumBytes: 96 * 1024 * 1024 });
  assert.ok(Number.isInteger(j.new_file_mode) && j.new_file_mode >= 0 && j.new_file_mode <= 0o777);
  const operations = [], expectedFiles = [];
  for (const file of parent.files) {
    const originalEntry = before.get(file.path), liveEntry = t.entries.find(e => e.path === file.path);
    if (originalEntry) {
      assert.equal(originalEntry.type, "file");
      assert.equal(originalEntry.sha256, (p.operation === "restore" ? candidate.files.find(f => f.path === file.path) : file).digest.slice(7));
    }
    if (liveEntry) {
      assert.equal(liveEntry.type, "file"); assert.equal(liveEntry.mode, originalEntry?.mode ?? j.new_file_mode);
      const hash = comparisonHash(rawFile(root, file.path));
      assert.ok([file.digest, candidate?.files.find(f => f.path === file.path).digest].includes(hash));
    } else assert.ok(p.operation === "apply" && p.role === "parent" && !originalEntry);
    const keep = finalState !== null || Boolean(originalEntry);
    operations.push({ kind: keep ? "write" : "delete_file", destination: join(root, file.path), relativePath: file.path,
      ...(keep ? { content: file.text } : {}), reason: "personal:explicit-recovery" });
    expectedFiles.push({ path: file.path, digest: keep ? file.digest : null });
  }
  const liveState = rawFile(root, STATE), finalBytes = stateBytes(finalState);
  assert.ok([beforeBytes, stateBytes(j.pending_state), finalBytes].some(bytes => equalBytes(bytes, liveState)));
  const markerBytes = rawFile(root, MARKER);
  if (markerBytes) {
    const m = fields(parseJsonRejectDuplicateKeys(markerBytes), ["install_status", "state_path", "started_at", "pending_state", "operations"]);
    assert.equal(m.install_status, "in_progress"); assert.equal(m.state_path, STATE); assert.equal(typeof m.started_at, "string");
    assert.ok(same(m.pending_state, j.pending_state) || same(m.pending_state, finalState));
    assert.ok(Array.isArray(m.operations) && m.operations.every(op => ["write", "delete_file"].includes(op.kind) && PROMPT_PATHS.includes(op.relative_path)));
  }
  assert.ok(same(captureBinding(root, ownedLock), t.binding)); assert.equal(sourceIdentity(), source);
  const plan = { schema: "ask.personal-prompt-target-recovery@1", operation: "recover", target_root: root, target_identity: t.targetIdentity,
    target_before: t.binding, source_identity_digest: source, closure_digest: canonicalDigest(owned), original_plan_digest: original.digest,
    journal_digest: comparisonHash(journalBytes), marker_digest: markerBytes ? comparisonHash(markerBytes) : null,
    selection_object_digest: input.rollbackSelectionObjectDigest, rollback_trust_digest: canonicalDigest(input.rollbackTrustedPortfolioAuthorityContexts), final_state_digest: canonicalDigest(finalState),
    action: p.operation === "restore" ? "complete_restore" : "abort_apply", models_started: false };
  return { prepared: { plan, digest: canonicalDigest(plan) }, finalState, finalBytes, operations, expectedFiles, newDirs,
    journalBytes, markerBytes };
}
export function planPersonalPromptTargetRecovery(input) {
  return boundary(() => prepareRecovery(options(input, ["targetRoot", "closure", "rollbackSelectionObjectDigest", "originalPlanDigest", "rollbackTrustedPortfolioAuthorityContexts"])).prepared);
}
export function recoverPersonalPromptTargetPlan(value) {
  return boundary(() => {
    const input = options(value, ["prepared", "closure", "confirmedDigest", "authorized", "originalPlanDigest", "rollbackTrustedPortfolioAuthorityContexts"]);
    assert.equal(input.authorized, true); const p = fields(input.prepared, ["plan", "digest"]);
    assert.equal(p.digest, canonicalDigest(p.plan)); assert.equal(input.confirmedDigest, p.digest); assert.equal(p.plan.operation, "recover");
    assert.equal(input.originalPlanDigest, p.plan.original_plan_digest);
    const request = { targetRoot: p.plan.target_root, closure: input.closure, rollbackSelectionObjectDigest: p.plan.selection_object_digest,
      originalPlanDigest: input.originalPlanDigest, rollbackTrustedPortfolioAuthorityContexts: input.rollbackTrustedPortfolioAuthorityContexts };
    assert.ok(same(prepareRecovery(request).prepared, p));
    let mutated = false;
    try { return withPersonalPromptTargetLock(request.targetRoot, lock => {
      const live = prepareRecovery(request, lock); assert.ok(same(live.prepared, p)); const root = request.targetRoot;
      try {
        const evidence = putContentAddressedJson({ storeRoot: join(root, EVIDENCE), maximumBytes: 96 * 1024 * 1024,
          artifact: { schema: "ask.personal-prompt-recovery-evidence@1", original_plan_digest: p.plan.original_plan_digest,
            recovery_plan_digest: p.digest, journal_base64: live.journalBytes.toString("base64"), marker_base64: live.markerBytes?.toString("base64") ?? null } });
        mutated = true;
        const recoveryMarker = Buffer.from(`${JSON.stringify({ install_status: "in_progress", state_path: STATE, started_at: new Date().toISOString(),
          pending_state: live.finalState, operations: live.operations.map(({ kind, relativePath, reason }) => ({ kind, relative_path: relativePath, reason })) }, null, 2)}\n`);
        writeFileSync(join(root, MARKER), recoveryMarker);
        applyOperations(live.operations, false);
        if (live.finalBytes) writeFileSync(join(root, STATE), live.finalBytes);
        else if (present(join(root, STATE))) unlinkSync(join(root, STATE));
        for (const file of live.expectedFiles) assert.equal(rawFile(root, file.path) ? comparisonHash(rawFile(root, file.path)) : null, file.digest);
        assert.ok(equalBytes(rawFile(root, STATE), live.finalBytes));
        if (live.finalState) checkState(live.finalState, root);
        assert.ok(rawFile(root, JOURNAL).equals(live.journalBytes));
        assert.ok(rawFile(root, MARKER).equals(recoveryMarker));
        for (const path of [...live.newDirs].reverse()) if (path !== META && present(join(root, path)) && readdirSync(join(root, path)).length === 0) rmdirSync(join(root, path));
        unlinkSync(join(root, MARKER)); unlinkSync(join(root, JOURNAL));
        return { status: p.plan.action === "complete_restore" ? "recovered_restore" : "recovered_apply_abort", plan_digest: p.digest,
          evidence_object_digest: evidence.digest, installed_lock_digest: live.finalState?.personal_prompt.installed_lock_digest ?? null,
          models_started: false, runtime_loading: "Unknown" };
      } catch { throw new PersonalPromptTargetError("personal_target_recovery_required"); }
    }); } catch (error) { if (mutated) throw new PersonalPromptTargetError("personal_target_recovery_required"); throw error; }
  });
}
function prepareOwner(input, operation, ownedLock = null) {
  const { owned, closure } = verifiedInputs(input.closure); let before, state, beforeOwner, afterOwner, lease;
  if (operation === "handover") {
    const live = prepare({ targetRoot: input.targetRoot, closure: input.closure, role: "parent", selectionObjectDigest: input.selectionObjectDigest }, "apply", ownedLock, input.ownerStateDigest);
    before = live.before; assert.equal(before.state, null); beforeOwner = rawFile(before.root, CODEX); assert.ok(beforeOwner);
    assert.equal(comparisonHash(beforeOwner), input.ownerStateDigest); const original = fullCodexOwner(before.root, beforeOwner);
    const material = projection(owned, closure, input.selectionObjectDigest, "parent");
    for (const file of material.files) assert.equal(comparisonHash(rawFile(before.root, file.path)), file.digest);
    const leaseId = canonicalDigest({ target: before.targetIdentity, owner: input.ownerStateDigest,
      source: live.prepared.plan.source_identity_digest, parent: material.asset, receipt: owned.receiptObjectDigest });
    afterOwner = stateBytes(delegatedOwner(original, leaseId, input.ownerStateDigest));
    lease = { schema: "ask.personal-prompt-codex-lease@1", lease_id: leaseId, owner_state_digest: input.ownerStateDigest,
      original_owner_state_base64: beforeOwner.toString("base64"), delegated_state_digest: comparisonHash(afterOwner),
      parent_selection_object_digest: input.selectionObjectDigest,
      protected_entries: before.entries.filter(entry => Object.hasOwn(original.managed_files, entry.path) && !PROMPT_PATHS.includes(entry.path)) };
    state = { ...live.state, personal_prompt: { ...live.state.personal_prompt, codex_lease: lease } };
  } else {
    before = checkedTarget(input.targetRoot, ownedLock); assert.ok(before.state?.personal_prompt.codex_lease);
    assert.equal(before.state.personal_prompt.role, "parent"); lease = before.state.personal_prompt.codex_lease;
    assert.equal(input.ownerStateDigest, lease.owner_state_digest);
    const verified = verifyCodexLease(before.root, lease); beforeOwner = verified.delegated; afterOwner = verified.raw;
    fullCodexOwner(before.root, afterOwner);
    const parent = projection(owned, closure, lease.parent_selection_object_digest, "parent");
    assert.ok(same(parent.asset, before.state.personal_prompt.asset));
    for (const file of parent.files) assert.equal(comparisonHash(rawFile(before.root, file.path)), file.digest);
    const selection = verifyPortfolioSelection({ ...owned, selectionObjectDigest: input.selectionObjectDigest }).selection;
    assert.equal(selection.decision, "selected"); assert.ok(selection.selected_assets.some(item => same(item.asset, parent.asset)));
    assert.equal(selection.portfolio_lock.lock_digest, before.state.personal_prompt.installed_lock_digest);
    assert.equal(input.selectionObjectDigest, before.state.personal_prompt.selection_object_digest); state = null;
  }
  const source = sourceIdentity(); assert.ok(same(captureBinding(before.root, ownedLock), before.binding));
  const plan = { schema: "ask.personal-prompt-target-owner-plan@1", operation, target_root: before.root, target_identity: before.targetIdentity,
    target_before: before.binding, source_identity_digest: source, closure_digest: canonicalDigest(owned), receipt_object_digest: owned.receiptObjectDigest,
    selection_object_digest: input.selectionObjectDigest, owner_state_digest: input.ownerStateDigest,
    before_owner_digest: comparisonHash(beforeOwner), after_owner_digest: comparisonHash(afterOwner), state_digest: canonicalDigest(state),
    lease_id: lease.lease_id, models_started: false };
  return { prepared: { plan, digest: canonicalDigest(plan) }, before, state, beforeOwner, afterOwner };
}
export function planPersonalPromptCodexHandover(value) {
  return boundary(() => prepareOwner(options(value, ["targetRoot", "closure", "selectionObjectDigest", "ownerStateDigest"]), "handover").prepared);
}
export function planPersonalPromptCodexReturn(value) {
  return boundary(() => prepareOwner(options(value, ["targetRoot", "closure", "selectionObjectDigest", "ownerStateDigest"]), "return").prepared);
}
function executeOwner(value, operation) {
  return boundary(() => {
    const input = options(value, ["prepared", "closure", "confirmedDigest", "authorized", "ownerStateDigest"]);
    assert.equal(input.authorized, true); const p = fields(input.prepared, ["plan", "digest"]);
    assert.equal(p.digest, canonicalDigest(p.plan)); assert.equal(p.digest, input.confirmedDigest); assert.equal(p.plan.operation, operation);
    assert.equal(input.ownerStateDigest, p.plan.owner_state_digest);
    const request = { targetRoot: p.plan.target_root, closure: input.closure, selectionObjectDigest: p.plan.selection_object_digest, ownerStateDigest: input.ownerStateDigest };
    assert.ok(same(prepareOwner(request, operation).prepared, p)); let mutated = false;
    try { return withPersonalPromptTargetLock(request.targetRoot, lock => {
      const live = prepareOwner(request, operation, lock); assert.ok(same(live.prepared, p)); const root = request.targetRoot;
      try {
        const rawJournal = Buffer.from(`${JSON.stringify({ schema: "ask.personal-prompt-owner-operation@1", original: p,
          before_personal_state_base64: rawFile(root, STATE)?.toString("base64") ?? null, pending_personal_state: live.state,
          before_codex_state_base64: live.beforeOwner.toString("base64"), pending_codex_state_base64: live.afterOwner.toString("base64"),
          before_entries: live.before.entries })}\n`); assert.ok(rawJournal.length <= 32 * 1024 * 1024);
        writeFileSync(join(root, JOURNAL), rawJournal, { mode: 0o600, flag: "wx" }); mutated = true;
        const marker = Buffer.from(`${JSON.stringify({ install_status: "in_progress", state_path: STATE, owner_operation: operation,
          original_plan_digest: p.digest, pending_state: live.state, pending_owner_digest: comparisonHash(live.afterOwner) })}\n`);
        writeFileSync(join(root, MARKER), marker, { mode: 0o600 });
        const evidence = putContentAddressedJson({ storeRoot: join(root, EVIDENCE), maximumBytes: 96 * 1024 * 1024,
          artifact: { schema: "ask.personal-prompt-owner-history@1", operation, plan_digest: p.digest, lease_id: p.plan.lease_id,
            owner_state_digest: input.ownerStateDigest, journal_base64: rawJournal.toString("base64") } });
        writeFileSync(join(root, CODEX), live.afterOwner);
        if (live.state) writeFileSync(join(root, STATE), stateBytes(live.state), { mode: 0o600 });
        else unlinkSync(join(root, STATE));
        assert.ok(equalBytes(rawFile(root, CODEX), live.afterOwner)); assert.ok(equalBytes(rawFile(root, STATE), stateBytes(live.state)));
        if (live.state) checkState(live.state, root); else fullCodexOwner(root, live.afterOwner);
        assert.ok(rawFile(root, JOURNAL).equals(rawJournal)); assert.ok(rawFile(root, MARKER).equals(marker));
        unlinkSync(join(root, MARKER)); unlinkSync(join(root, JOURNAL));
        return { status: operation === "handover" ? "codex_handed_over" : "codex_returned", plan_digest: p.digest,
          owner_state_digest: input.ownerStateDigest, evidence_object_digest: evidence.digest, models_started: false, runtime_loading: "Unknown" };
      } catch { throw new PersonalPromptTargetError("personal_target_recovery_required"); }
    }); } catch (error) { if (mutated) throw new PersonalPromptTargetError("personal_target_recovery_required"); throw error; }
  });
}
export function handoverPersonalPromptCodexPlan(input) { return executeOwner(input, "handover"); }
export function returnPersonalPromptCodexPlan(input) { return executeOwner(input, "return"); }
export function inspectPersonalPromptTarget(input) {
  return boundary(() => {
    const { targetRoot } = options(input, ["targetRoot"]), t = checkedTarget(targetRoot);
    return { status: t.state ? "installed" : "not_installed", role: t.state?.personal_prompt.role ?? null,
      installed_lock_digest: t.state?.personal_prompt.installed_lock_digest ?? null, target_digest: t.binding.digest,
      models_started: false, adoption_authority: "not_inferred", runtime_loading: "Unknown" };
  });
}
