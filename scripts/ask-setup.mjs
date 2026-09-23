#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CORE_OWNED_IMMUTABLE_ASSETS, readGitRevision } from "./installer-lifecycle.mjs";
import { readSetupRepositoryId, validateSetupGitMetadata } from "./ask-setup-git.mjs";
import { readSetupJson, sanitizeSetupDoctorReport, summarizeSetupProcessFailure } from "./ask-setup-diagnostics.mjs";
import { validateSetupDoctorInputs } from "./ask-setup-doctor-inputs.mjs";
import {
  KERNEL_SETUP_INPUTS,
  buildSetupSourceIdentity,
  canonicalJson,
  collectPathEntries,
  copyTargetForSimulation,
  jsonDigest,
  pathInside,
  safeLstat,
  sha256,
  validateSetupPaths,
} from "./ask-setup-inputs.mjs";
export { canonicalize, canonicalJson } from "./ask-setup-inputs.mjs";
import {
  applyAssert,
  assertNoSetupInProgress,
  assertSetupWritePaths,
  captureApplyTarget,
  captureApplyTree,
  managedSetupIdentities,
  overlayStagingResult,
  readApplyJson,
  resultBinding,
  setupChildEnvironment,
  setupInstallerInvocations,
} from "./ask-setup-apply-state.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_SCHEMA_VERSION = "1.1.0";
const PLAN_KIND = "ask.adoption-plan";
const ADAPTERS = ["codex", "claude-code", "kernel-only"];
const PROFILE_CANDIDATES = ["daily", "organizational", "minimal", "implementation", "investigation", "review", "adoption", "observability", "full"];
const PURPOSE_TO_PROFILE = {
  daily: "daily",
  organizational: "organizational",
  implementation: "implementation",
  investigation: "investigation",
  review: "review",
  adoption: "adoption",
  observability: "observability",
};
const MANAGED_STATE_PATHS = [
  ".agent-spectrum-kernel/install-state.json",
  ".agent-spectrum-kernel/install-state.json.in-progress.json",
  ".agent-spectrum-kernel/codex-install-state.json",
  ".agent-spectrum-kernel/codex-install-state.json.in-progress.json",
  ".agent-spectrum-kernel/claude-install-state.json",
  ".agent-spectrum-kernel/claude-install-state.json.in-progress.json",
];
const BASE_SETUP_RELEVANT_PATHS = [
  "AGENTS.md",
  "CUSTOM_INSTRUCTIONS.md",
  "CLAUDE.md",
  "README.md",
  "package.json",
  ...MANAGED_STATE_PATHS,
  ".github/workflows",
  ".github/copilot-instructions.md",
];
function readJson(path) {
  return readSetupJson(path);
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch {
    return { __invalid_json: "Setup JSON input is unreadable or invalid; contents are not included." };
  }
}

function managedPathsFromState(target) {
  validateSetupPaths(target, MANAGED_STATE_PATHS);
  const paths = [];
  for (const statePath of MANAGED_STATE_PATHS.filter((path) => !path.endsWith(".in-progress.json"))) {
    const state = readJsonIfExists(resolve(target, statePath));
    if (!state || state.__invalid_json) continue;
    paths.push(...Object.keys(state.managed_files ?? {}));
    paths.push(...Object.values(state.managed_blocks ?? {}).map((record) => record?.path).filter(Boolean));
    paths.push(...Object.keys(state.managed_partial_files ?? {}));
  }
  return paths;
}

export function snapshotTarget(target, { extraPaths = [] } = {}) {
  const root = realpathSync(target);
  const roots = [...new Set([...BASE_SETUP_RELEVANT_PATHS, ...managedPathsFromState(root), ...extraPaths])].sort();
  const entries = [];
  for (const item of roots) entries.push(...collectPathEntries(root, item));
  const deduped = [...new Map(entries.map((entry) => [entry.path, entry])).values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema_version: "1.0.0",
    roots,
    entries: deduped,
    digest: jsonDigest(deduped),
  };
}

export async function planningSource(adapter, profile) {
  if (!ADAPTERS.includes(adapter)) throw new Error(`Unknown adapter: ${adapter}`);
  let projection = null;
  let selectedSkills;
  if (adapter === "kernel-only") {
    if (profile !== "kernel-only") throw new Error(`Unknown kernel-only profile: ${profile}`);
    selectedSkills = [...readJson(resolve(REPO_ROOT, "manifest.json")).skills].sort();
  } else {
    const build = await projectionBuilder(adapter);
    projection = build(profile);
    if (!projection.renderer_inputs?.canonical || !projection.renderer_inputs?.adapter_owned) {
      throw new Error("Adapter projection is missing its authoritative renderer inputs.");
    }
    selectedSkills = projection.skills ?? projection.selectedSkills;
  }
  if (!Array.isArray(selectedSkills) || selectedSkills.length === 0) throw new Error("Setup requires a non-empty resolved Skill selection.");
  validateSetupGitMetadata(REPO_ROOT);
  const source = buildSetupSourceIdentity(REPO_ROOT, {
    selectedSkills,
    coreAssets: CORE_OWNED_IMMUTABLE_ASSETS,
    rendererInputs: projection?.renderer_inputs ?? {},
    projection,
    revision: readGitRevision(REPO_ROOT),
  });
  return { source, selectedSkills, projection };
}

function gitFacts(target) {
  const gitDir = validateSetupGitMetadata(target);
  if (!gitDir) return { detected: false, repository_id: null, revision: null };
  // The existing ref reader does not load Git configuration or auth settings.
  const revision = readGitRevision(target);
  return {
    detected: true,
    repository_id: readSetupRepositoryId(gitDir),
    revision: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(revision ?? "") ? revision : null,
  };
}

function listNames(path, predicate = () => true) {
  if (!existsSync(path) || !statSync(path).isDirectory()) return [];
  return readdirSync(path).filter(predicate).sort();
}

function inspectInstructions(target) {
  const candidates = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
  return candidates.filter((path) => existsSync(resolve(target, path))).map((path) => ({ path, sha256: sha256(readFileSync(resolve(target, path))) }));
}

function stateSummary(target, relativePath, expectedInstaller) {
  const path = resolve(target, relativePath);
  const value = readJsonIfExists(path);
  if (!value) return { path: relativePath, present: false };
  if (value.__invalid_json) return { path: relativePath, present: true, valid: false, error: "Setup JSON input is unreadable or invalid; contents are not included." };
  return {
    path: relativePath,
    present: true,
    valid: value?.installer === expectedInstaller && value?.schema_version === 3,
    install_status: value?.install_status ?? null,
    selected_profile: value?.selected_profile ?? null,
    selected_skills: Array.isArray(value?.selected_skills) ? value.selected_skills : [],
    managed_file_count: Object.keys(value?.managed_files ?? {}).length,
    managed_block_count: Object.keys(value?.managed_blocks ?? {}).length,
    managed_partial_file_count: Object.keys(value?.managed_partial_files ?? {}).length,
  };
}

function runtimeProfiles() {
  const path = resolve(REPO_ROOT, "docs/fixtures/adapter-runtime-profiles.json");
  if (!existsSync(path)) return [];
  const value = readJson(path);
  return Array.isArray(value?.profiles) ? value.profiles : [];
}

async function projectionBuilder(adapter) {
  validateSetupGitMetadata(REPO_ROOT);
  if (adapter === "codex") {
    const module = await import("./install-codex-adapter.mjs");
    return (profileName) => module.buildCodexProjectionPlan({ profileName });
  }
  if (adapter === "claude-code") {
    const module = await import("./install-claude-adapter.mjs");
    return (profileName) => module.buildClaudeProjectionPlan({ profileName });
  }
  return null;
}

async function availableProfiles(adapter) {
  if (adapter === "kernel-only") return [{ profile: "kernel-only", projection: null }];
  const build = await projectionBuilder(adapter);
  const found = [];
  for (const profile of PROFILE_CANDIDATES) {
    try {
      const projection = build(profile);
      found.push({
        profile,
        selected_skills: projection.skills ?? projection.selectedSkills ?? [],
        projected_asset_count: projection.projectedManagedAssets?.length ?? 0,
        canonical_source_digest: projection.canonical_source_digest ?? null,
        compact_asset_refs: [...new Map((projection.compactProfiles ?? []).flatMap((entry) => entry.canonical_asset_refs ?? []).map((entry) => [canonicalJson(entry), entry])).values()],
      });
    } catch {
      // The adapter itself is the authority for supported profile names.
    }
  }
  return found;
}

export async function inspectRepository(target) {
  const root = realpathSync(target);
  const snapshot = snapshotTarget(root);
  const core = stateSummary(root, ".agent-spectrum-kernel/install-state.json", "agent-spectrum-kernel");
  const codex = stateSummary(root, ".agent-spectrum-kernel/codex-install-state.json", "agent-spectrum-codex-adapter");
  const claude = stateSummary(root, ".agent-spectrum-kernel/claude-install-state.json", "agent-spectrum-claude-adapter");
  const presentAdapters = [codex.present && codex.install_status !== "detached" ? "codex" : null, claude.present && claude.install_status !== "detached" ? "claude-code" : null].filter(Boolean);
  const profiles = {};
  for (const adapter of ADAPTERS) profiles[adapter] = await availableProfiles(adapter);
  return {
    schema_version: "1.0.0",
    target: { realpath: root, ...gitFacts(root) },
    snapshot,
    ask: { core, codex, claude, active_adapters: presentAdapters },
    instructions: inspectInstructions(root),
    ci: listNames(resolve(root, ".github/workflows"), (name) => /\.ya?ml$/i.test(name)),
    project_commands: (() => {
      const pkg = readJsonIfExists(resolve(root, "package.json"));
      if (!pkg || pkg.__invalid_json || !pkg.scripts || typeof pkg.scripts !== "object") return [];
      return Object.keys(pkg.scripts).sort();
    })(),
    profiles,
  };
}

function adapterProfileEvidence(adapter) {
  const adapterId = adapter === "codex" ? "codex" : adapter === "claude-code" ? "claude_code" : null;
  if (!adapterId) return null;
  const profiles = runtimeProfiles().filter((entry) => entry.adapter_id === adapterId);
  if (profiles.length === 0) return null;
  const latest = profiles.at(-1);
  return {
    profile_id: latest.profile_id,
    profile_fingerprint: latest.profile_fingerprint ?? null,
    canonical_contract: latest.canonical_contract ?? null,
    privacy: latest.privacy ?? null,
    capabilities: latest.capabilities ?? [],
  };
}

function assessCapabilities(adapter, requiredCapabilities) {
  const evidence = adapterProfileEvidence(adapter);
  const byId = new Map((evidence?.capabilities ?? []).map((entry) => [entry.capability_id, entry]));
  return requiredCapabilities.map((capability) => {
    const entry = byId.get(capability);
    if (!entry) return { capability_id: capability, support: "unknown", evidence_level: "none", disposition: "human_decision_required", limitations: ["Capability is not present in the current adapter runtime profile."] };
    const disposition = entry.support === "unsupported" || entry.support === "unknown"
      ? "human_decision_required"
      : entry.support === "partial" || entry.evidence_level === "projected"
        ? "downgraded_claim"
        : "available_with_evidence";
    return { capability_id: capability, support: entry.support, evidence_level: entry.evidence_level, disposition, limitations: entry.limitations ?? [], downgrade_behavior: entry.downgrade_behavior ?? null };
  });
}

export function recommendFromFacts({ inspection, adapter = null, purpose = null, profile = null, risk = "normal", requiredCapabilities = [] }) {
  if (!new Set(["normal", "high"]).has(risk)) throw new Error(`Unknown risk: ${risk}`);
  if (purpose && !Object.hasOwn(PURPOSE_TO_PROFILE, purpose)) throw new Error(`Unknown purpose: ${purpose}`);
  const decisions = [];
  let selectedAdapter = adapter;
  if (!selectedAdapter) {
    const active = inspection.ask.active_adapters;
    if (active.length === 1) selectedAdapter = active[0];
    else if (active.length === 0) decisions.push({ id: "adapter", question: "利用するadapterを選択してください。", options: ["codex", "claude-code", "kernel-only"] });
    else decisions.push({ id: "adapter", question: "複数adapterが導入済みです。今回計画するadapterを選択してください。", options: [...active, "kernel-only"] });
  }
  if (selectedAdapter && !ADAPTERS.includes(selectedAdapter)) throw new Error(`Unknown adapter: ${selectedAdapter}`);

  let selectedProfile = profile;
  if (selectedAdapter === "kernel-only") {
    if (profile !== null && profile !== "kernel-only") throw new Error(`Unknown kernel-only profile: ${profile}`);
    selectedProfile = "kernel-only";
  }
  if (!selectedProfile && purpose) selectedProfile = PURPOSE_TO_PROFILE[purpose] ?? null;
  if (!selectedProfile && selectedAdapter && selectedAdapter !== "kernel-only") {
    const installed = selectedAdapter === "codex" ? inspection.ask.codex : inspection.ask.claude;
    if (installed.selected_profile) selectedProfile = installed.selected_profile;
  }
  if (!selectedProfile && selectedAdapter && selectedAdapter !== "kernel-only") {
    decisions.push({ id: "purpose", question: "導入目的を選択してください。", options: ["daily", "implementation", "investigation", "review", "adoption", "observability", "organizational"] });
  }

  const available = selectedAdapter ? (inspection.profiles[selectedAdapter] ?? []).map((entry) => entry.profile) : [];
  if (selectedProfile && selectedAdapter && !available.includes(selectedProfile)) {
    const suggested = selectedProfile === "adoption" && available.includes("organizational") ? "organizational" : null;
    decisions.push({ id: "profile_unavailable", question: `profile '${selectedProfile}' は ${selectedAdapter} で未登録です。${suggested ? ` '${suggested}' への明示的な切替` : "別profileの選択"}が必要です。`, options: suggested ? [suggested] : available });
    selectedProfile = null;
  }

  if (risk === "high" && selectedProfile === "full") {
    decisions.push({ id: "high_risk_full_profile", question: "high risk で full profile を自動選択しません。必要範囲を明示してください。", options: available.filter((name) => name !== "full") });
    selectedProfile = null;
  }

  const capabilities = selectedAdapter ? assessCapabilities(selectedAdapter, requiredCapabilities) : [];
  for (const item of capabilities) {
    if (item.disposition === "human_decision_required") decisions.push({ id: `capability:${item.capability_id}`, question: `${item.capability_id} は現在の証拠では ${item.support} です。必要性または代替を判断してください。`, options: ["require_and_stop", "accept_downgrade", "remove_requirement"] });
  }

  return {
    schema_version: "1.0.0",
    adapter: selectedAdapter,
    profile: selectedProfile,
    purpose,
    risk,
    basis: {
      source: "current_adapter_projection_and_runtime_capability_contracts",
      effectiveness_proven: false,
      note: "機能要件を満たす導入候補であり、未完了の比較実験や効果実測の勝敗を推奨根拠にしていません。",
    },
    capabilities,
    human_decisions: decisions,
  };
}

function normalizedOutputDigest(output, staging) {
  const normalized = String(output ?? "").split(staging).join("<staging>").replaceAll("\\", "/");
  return `sha256:${sha256(normalized)}`;
}

function runNode(script, args, { cwd = REPO_ROOT, expected = [0] } = {}) {
  const result = spawnSync(process.execPath, [resolve(REPO_ROOT, script), ...args], { cwd, env: setupChildEnvironment(), encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  if (!expected.includes(result.status)) {
    throw new Error(`${script} failed (${result.status}): ${summarizeSetupProcessFailure(result)}`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function installerNamespaceSnapshot(root, paths) {
  const entries = [];
  for (const item of [...new Set(paths)].sort()) entries.push(...collectPathEntries(root, item));
  return [...new Map(entries.filter((entry) => entry.type !== "directory").map((entry) => [entry.path, entry])).values()].sort((a, b) => a.path.localeCompare(b.path));
}

function ownershipMap(staging) {
  const states = [
    readJsonIfExists(resolve(staging, ".agent-spectrum-kernel/install-state.json")),
    readJsonIfExists(resolve(staging, ".agent-spectrum-kernel/codex-install-state.json")),
    readJsonIfExists(resolve(staging, ".agent-spectrum-kernel/claude-install-state.json")),
  ].filter((state) => state && !state.__invalid_json);
  const map = new Map();
  for (const state of states) {
    for (const path of Object.keys(state.managed_files ?? {})) map.set(path, { ownership: "managed_file", installer: state.installer });
    for (const record of Object.values(state.managed_blocks ?? {})) if (record?.path) map.set(record.path, { ownership: "managed_block", installer: state.installer });
    for (const path of Object.keys(state.managed_partial_files ?? {})) map.set(path, { ownership: "managed_partial_file", installer: state.installer });
  }
  for (const path of [".agent-spectrum-kernel/install-state.json", ".agent-spectrum-kernel/codex-install-state.json", ".agent-spectrum-kernel/claude-install-state.json"]) {
    if (existsSync(resolve(staging, path))) map.set(path, { ownership: "managed_state", installer: "setup_dependency" });
  }
  return map;
}

function diffSnapshots(before, after, ownership) {
  const a = new Map(before.map((entry) => [entry.path, entry]));
  const b = new Map(after.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  return paths.flatMap((path) => {
    const left = a.get(path) ?? null;
    const right = b.get(path) ?? null;
    const owner = ownership.get(path) ?? { ownership: "project_owned", installer: null };
    if (!left && right) return [{ action: "create", path, ...owner, after_sha256: right.sha256 ?? null }];
    if (left && !right) return [{ action: "remove", path, ...owner, before_sha256: left.sha256 ?? null }];
    if (canonicalJson(left) !== canonicalJson(right)) return [{ action: "update", path, ...owner, before_sha256: left.sha256 ?? null, after_sha256: right.sha256 ?? null }];
    return [];
  });
}

function projectionSelection(adapter, profile) {
  return { adapter, profile };
}

function portfolioReference(path) {
  if (!path) return { status: "unselected", identity: null };
  const value = readJson(resolve(path));
  const identity = {
    portfolio_id: value.portfolio_id ?? null,
    repository_id: value.repository_id ?? null,
    scope_id: value.scope_id ?? null,
    lock_digest: value.lock_digest ?? null,
    current_manifest: value.current_manifest ?? null,
    selection_digest: value.selection_digest ?? value.selections?.[0]?.selection_digest ?? null,
  };
  if (!identity.portfolio_id || !identity.lock_digest) throw new Error("Portfolio reference must contain portfolio_id and lock_digest.");
  if (!/^sha256:[a-f0-9]{64}$/.test(identity.lock_digest)) throw new Error("Portfolio lock_digest must be a sha256 digest.");
  return { status: "provided_reference_unverified", identity };
}

export function planDigestPayload(plan) {
  const { environment, target, plan_digest, ...semantic } = plan;
  const targetSemantic = target ? {
    repository_id: target.repository_id,
    revision: target.revision,
    snapshot_digest: target.snapshot_digest,
    snapshot_paths: target.snapshot_paths,
  } : null;
  return { ...semantic, target: targetSemantic };
}

export async function createAdoptionPlan({ target, adapter, profile, purpose = null, risk = "normal", requiredCapabilities = [], portfolioPath = null }) {
  const root = realpathSync(target);
  if (!ADAPTERS.includes(adapter)) throw new Error(`Unknown adapter: ${adapter}`);
  const beforeInspection = await inspectRepository(root);
  const applyBefore = captureApplyTarget(root);
  assertNoSetupInProgress(root);
  const recommendation = recommendFromFacts({ inspection: beforeInspection, adapter, purpose, profile, risk, requiredCapabilities });
  if (!recommendation.profile) throw new Error(`Plan requires resolved profile. Outstanding decisions: ${recommendation.human_decisions.map((entry) => entry.id).join(", ")}`);
  if (recommendation.human_decisions.some((entry) => entry.id.startsWith("capability:"))) throw new Error(`Required capability is unsupported or unknown: ${recommendation.human_decisions.filter((entry) => entry.id.startsWith("capability:")).map((entry) => entry.id.slice("capability:".length)).join(", ")}`);

  const { source, selectedSkills, projection } = await planningSource(adapter, recommendation.profile);
  const projectedTargetPaths = (projection?.projectedManagedAssets ?? [])
    .map((asset) => asset.path);
  const planningPaths = [...new Set([
    ...KERNEL_SETUP_INPUTS,
    ...MANAGED_STATE_PATHS,
    ...managedPathsFromState(root),
    ...CORE_OWNED_IMMUTABLE_ASSETS,
    ...(selectedSkills ?? []).map((skill) => `skills/${skill}/SKILL.md`),
    ...projectedTargetPaths,
  ])].sort();
  assertSetupWritePaths(root, planningPaths);
  const planTargetSnapshot = snapshotTarget(root, { extraPaths: planningPaths });

  const stagingParent = realpathSync(tmpdir());
  if (pathInside(root, stagingParent)) throw new Error("Staging must be outside the target repository.");
  const stagingRoot = mkdtempSync(resolve(stagingParent, "ask-setup-plan-"));
  const staging = resolve(stagingRoot, "target");
  try {
    copyTargetForSimulation(root, staging, planningPaths);
    validateSetupPaths(staging, planningPaths);
    const beforeInstall = installerNamespaceSnapshot(staging, planningPaths);
    const phaseEvidence = [];
    const applyPhases = [];
    const beforeStaging = captureApplyTree(staging);
    for (const invocation of setupInstallerInvocations(adapter, recommendation.profile, selectedSkills, staging)) {
      assertSetupWritePaths(staging, planningPaths);
      const dryRun = runNode(invocation.script, [...invocation.args, "--dry-run"]);
      const result = runNode(invocation.script, invocation.args);
      phaseEvidence.push({
        phase: invocation.phase,
        command: ["node", invocation.script, ...invocation.args.map((value) => value === staging ? "<staging>" : value)],
        exit_status: result.status,
        dry_run_exit_status: dryRun.status,
        dry_run_output_digest: normalizedOutputDigest(dryRun.stdout, staging),
      });
      const expectedEntries = overlayStagingResult(applyBefore.entries, beforeStaging, captureApplyTree(staging));
      applyPhases.push({
        phase: invocation.phase,
        expected_target: resultBinding(applyBefore.binding.git, expectedEntries),
        managed_identities: managedSetupIdentities(staging),
      });
    }

    const afterPaths = [...new Set([...planningPaths, ...managedPathsFromState(staging)])].sort();
    const afterInstall = installerNamespaceSnapshot(staging, afterPaths);
    const operations = diffSnapshots(beforeInstall, afterInstall, ownershipMap(staging));
    const afterTargetSnapshot = snapshotTarget(root, { extraPaths: planningPaths });
    if (planTargetSnapshot.digest !== afterTargetSnapshot.digest) throw new Error("Target changed while setup inspection/plan was running; retry from a fresh inspection.");
    applyAssert(captureApplyTarget(root).binding.digest === applyBefore.binding.digest, "target_changed_during_planning");
    const afterSource = await planningSource(adapter, recommendation.profile);
    if (source.identity_digest !== afterSource.source.identity_digest) throw new Error("ASK setup source changed while planning; generate a fresh plan.");

    const assetRefs = projection
      ? [...new Map((projection.compactProfiles ?? []).flatMap((entry) => entry.canonical_asset_refs ?? []).map((entry) => [canonicalJson(entry), entry])).values()]
      : [];
    const plan = {
      schema_version: PLAN_SCHEMA_VERSION,
      kind: PLAN_KIND,
      source,
      target: {
        repository_id: beforeInspection.target.repository_id,
        revision: beforeInspection.target.revision,
        snapshot_digest: planTargetSnapshot.digest,
        snapshot_paths: planTargetSnapshot.roots,
      },
      selection: projectionSelection(adapter, recommendation.profile),
      recommendation,
      assets: { status: assetRefs.length > 0 ? "confirmed_from_projection" : "none_confirmed", exact_refs: assetRefs },
      portfolio: portfolioReference(portfolioPath),
      operations,
      application: {
        contract: "exact-installer-apply-v1",
        repository_locator_digest: jsonDigest({ target_realpath: root }),
        execution_environment: { node: process.version, platform: process.platform, arch: process.arch, umask: process.umask() },
        target_before: applyBefore.binding,
        selected_skills: selectedSkills,
        write_paths: planningPaths,
        phases: applyPhases,
      },
      preservation: {
        project_owned_state: operations.filter((entry) => entry.ownership === "managed_block" || entry.ownership === "managed_partial_file").map((entry) => ({ path: entry.path, preserved_boundary: entry.ownership === "managed_block" ? "content outside ASK managed block" : "non-ASK keys/fields" })),
        privacy: {
          raw_prompt_storage: "not_enabled",
          secret_values: "not_emitted",
          global_auth_reading: "not_performed",
          external_publication: "not_enabled",
        },
      },
      conflicts: [],
      human_decisions: recommendation.human_decisions,
      rollback: {
        supported_by_installers: true,
        note: "Explicit apply reuses installer rollback/detach snapshots. Apply is not transactional; recovery requires a separate reviewed installer action.",
      },
      readiness: {
        installed: "planned_not_applied",
        activated: "insufficient_evidence",
        operational: "insufficient_evidence",
      },
      verification: {
        planning_phases: phaseEvidence,
        target_unchanged: true,
        first_run: "deferred; bounded real workflow evidence is required before operational can pass",
      },
      environment: {
        target_realpath: root,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };
    plan.plan_digest = jsonDigest(planDigestPayload(plan));
    return plan;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

export async function verifyPlanIdentity(plan, { target, adapter = null } = {}) {
  if (!plan || plan.schema_version !== PLAN_SCHEMA_VERSION || plan.kind !== PLAN_KIND) throw new Error("Unsupported or invalid adoption plan.");
  const expectedDigest = jsonDigest(planDigestPayload(plan));
  if (plan.plan_digest !== expectedDigest) throw new Error("Plan digest mismatch.");
  const root = realpathSync(target);
  if (plan.environment?.target_realpath !== root
    || plan.application?.repository_locator_digest !== jsonDigest({ target_realpath: root })) throw new Error("Plan target repository path does not match the requested repository.");
  if (adapter && plan.selection?.adapter !== adapter) throw new Error(`Plan adapter mismatch: planned=${plan.selection?.adapter} requested=${adapter}`);
  const { source: currentSource } = await planningSource(plan.selection?.adapter, plan.selection?.profile);
  if (canonicalJson(plan.source) !== canonicalJson(currentSource)) throw new Error("ASK setup source changed after the plan was generated.");
  return { root, currentSource };
}

export async function verifySavedPlan(plan, { target, adapter = null } = {}) {
  const { root } = await verifyPlanIdentity(plan, { target, adapter });
  if (plan.application?.contract !== "exact-installer-apply-v1"
    || captureApplyTarget(root).binding.digest !== plan.application.target_before?.digest) throw new Error("Target repository changed after the plan was generated.");
  const current = snapshotTarget(root, { extraPaths: Array.isArray(plan.target?.snapshot_paths) ? plan.target.snapshot_paths : [] });
  if (plan.target?.snapshot_digest !== current.digest) throw new Error("Target repository changed after the plan was generated.");
  const git = gitFacts(root);
  if (plan.target?.repository_id !== git.repository_id || plan.target?.revision !== git.revision) throw new Error("Target repository identity or revision changed after the plan was generated.");
  return { valid: true, plan_digest: plan.plan_digest, target_snapshot_digest: current.digest };
}

function doctor(target) {
  snapshotTarget(target);
  validateSetupDoctorInputs(target, REPO_ROOT);
  const result = runNode("scripts/ask-doctor.mjs", ["--target", target, "--json"], { expected: [0, 1] });
  let report;
  try {
    report = sanitizeSetupDoctorReport(JSON.parse(result.stdout));
  } catch {
    throw new Error("ask-doctor did not return JSON; subprocess output is not included to protect project data.");
  }
  return {
    ...report,
    setup_interpretation: {
      installed: report.deploymentStatus?.Installed ?? { status: "insufficient_evidence" },
      activated: report.deploymentStatus?.Activated ?? { status: "insufficient_evidence" },
      operational: report.deploymentStatus?.Operational ?? { status: "insufficient_evidence" },
      note: "Operational requires bounded execution evidence; static projection and caller assertions are insufficient.",
    },
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, target: process.cwd(), adapter: null, profile: null, purpose: null, risk: "normal", requiredCapabilities: [], json: false, output: null, plan: null, portfolio: null, dryRun: false };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--target") args.target = resolve(rest[++i]);
    else if (token === "--adapter") args.adapter = rest[++i];
    else if (token === "--profile") {
      const value = rest[++i];
      if (!value?.trim() || value.startsWith("--")) throw new Error("--profile requires an explicit profile name.");
      args.profile = value;
    }
    else if (token === "--purpose") args.purpose = rest[++i];
    else if (token === "--risk") args.risk = rest[++i];
    else if (token === "--require-capability") args.requiredCapabilities.push(rest[++i]);
    else if (token === "--portfolio-reference") args.portfolio = resolve(rest[++i]);
    else if (token === "--output") args.output = resolve(rest[++i]);
    else if (token === "--plan") args.plan = resolve(rest[++i]);
    else if (token === "--json") args.json = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--help" || token === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-setup.mjs <inspect|recommend|plan|check|doctor|apply> [options]\n\nOptions:\n  --target <path>                 Target repository (default: cwd)\n  --adapter <codex|claude-code|kernel-only>\n  --profile <name>                Exact existing installer profile\n  --purpose <name>                daily|organizational|implementation|investigation|review|adoption|observability\n  --risk <normal|high>            Recommendation guard only; does not invent project policy\n  --require-capability <id>       Repeatable adapter capability requirement\n  --portfolio-reference <path>    Exact exported Portfolio reference JSON\n  --output <path>                 Save a plan outside the target repository\n  --plan <path>                   Exact saved plan for check/apply\n  --dry-run                       Validate apply without writing the target\n  --json                          Machine-readable output\n\ninspect/recommend/plan/check/doctor never write the target. Explicit 'apply --plan' authorizes the exact plan; 'apply --plan ... --dry-run' only validates. Apply results are printed (use --json); --output remains plan-only. No first workflow is executed.`);
}

function writePlan(path, target, plan) {
  const root = realpathSync(target);
  const requested = resolve(path);
  if (pathInside(root, requested)) throw new Error("Plan output must be outside the target repository.");
  if (safeLstat(requested)) throw new Error(`Plan output already exists: ${requested}`);

  const parent = dirname(requested);
  let existingAncestor = parent;
  while (!existsSync(existingAncestor)) {
    const next = dirname(existingAncestor);
    if (next === existingAncestor) break;
    existingAncestor = next;
  }
  if (!existsSync(existingAncestor)) throw new Error(`Plan output parent cannot be resolved: ${parent}`);
  const ancestorRealpath = realpathSync(existingAncestor);
  const unresolvedTail = relative(existingAncestor, parent);
  const prospectiveParent = resolve(ancestorRealpath, unresolvedTail);
  const prospectiveCandidate = resolve(prospectiveParent, basename(requested));
  if (pathInside(root, prospectiveCandidate)) throw new Error("Plan output must be outside the target repository.");

  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  const resolvedParent = realpathSync(parent);
  const candidate = resolve(resolvedParent, basename(requested));
  if (pathInside(root, candidate)) throw new Error("Plan output must be outside the target repository.");
  if (safeLstat(candidate)) throw new Error(`Plan output already exists: ${candidate}`);
  writeFileSync(candidate, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
  return candidate;
}

function printHuman(command, value) {
  if (command === "inspect") {
    console.log(`ASK導入状態: core=${value.ask.core.install_status ?? "未導入"}, adapters=${value.ask.active_adapters.join(", ") || "なし"}`);
    console.log(`利用可能profile: Codex=${value.profiles.codex.map((entry) => entry.profile).join(", ") || "なし"} / Claude=${value.profiles["claude-code"].map((entry) => entry.profile).join(", ") || "なし"}`);
    return;
  }
  if (command === "recommend") {
    console.log(`提案: adapter=${value.adapter ?? "未決"}, profile=${value.profile ?? "未決"}`);
    for (const decision of value.human_decisions) console.log(`- 要判断: ${decision.question}`);
    for (const capability of value.capabilities) console.log(`- capability ${capability.capability_id}: ${capability.support} / ${capability.evidence_level}`);
    return;
  }
  if (command === "plan") {
    console.log(`導入計画: ${value.selection.adapter}/${value.selection.profile}`);
    console.log(`変更予定: ${value.operations.filter((entry) => entry.action !== "preserve").length}件 / plan=${value.plan_digest}`);
    console.log("対象repositoryへの書き込みは行っていません。適用には apply --plan が必要です。実workflow確認は別途必要です。");
    return;
  }
  if (command === "apply") {
    console.log(`Apply=${value.status}, Installed=${value.readiness.installed}, Operational=${value.readiness.operational}`);
    console.log(`適用済み=${value.applied_operations.length}, 未適用=${value.not_applied_operations.length}, 要復旧=${value.recovery_required}`);
    if (value.reason) console.log(`理由: ${value.reason}`);
    return;
  }
  if (command === "check") {
    console.log(`計画は現在のtarget/sourceに対して有効です: ${value.plan_digest}`);
    return;
  }
  if (command === "doctor") {
    console.log(`Installed=${value.setup_interpretation.installed.status}, Activated=${value.setup_interpretation.activated.status}, Operational=${value.setup_interpretation.operational.status}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.command || args.command === "help") {
    help();
    return;
  }
  if (args.command === "apply") {
    const { applyAdoptionPlan, blockedApplyResult } = await import("./ask-setup-apply.mjs");
    let value;
    let savedPlan;
    if (!args.plan) {
      // No exact Plan means no authorization, even when the command is named apply.
      throw new Error("apply requires --plan <path>; no target mutation was attempted.");
    }
    try {
      applyAssert(!args.output && !args.profile && !args.purpose && !args.portfolio
        && args.requiredCapabilities.length === 0 && args.risk === "normal", "apply_uses_exact_plan_options_only");
      savedPlan = readApplyJson(args.plan);
    } catch {
      value = blockedApplyResult("invalid_apply_input", { authorized: true, dryRun: args.dryRun });
    }
    // Do not turn an unexpected post-mutation exception into a no-write result.
    if (!value) value = await applyAdoptionPlan(savedPlan, {
      target: args.target, adapter: args.adapter, authorized: true, dryRun: args.dryRun,
    });
    if (args.json) console.log(JSON.stringify(value, null, 2));
    else printHuman("apply", value);
    if (!["applied", "already_applied", "validated"].includes(value.status)) process.exitCode = 1;
    return;
  }
  if (args.dryRun) throw new Error("--dry-run is only valid with apply; other setup commands are already read-only.");
  if (!existsSync(args.target) || !statSync(args.target).isDirectory()) throw new Error(`Target is not a directory: ${args.target}`);

  let value;
  if (args.command === "inspect") {
    value = await inspectRepository(args.target);
  } else if (args.command === "recommend") {
    const inspection = await inspectRepository(args.target);
    value = recommendFromFacts({ inspection, adapter: args.adapter, purpose: args.purpose, profile: args.profile, risk: args.risk, requiredCapabilities: args.requiredCapabilities });
  } else if (args.command === "plan") {
    if (!args.adapter) throw new Error("plan requires --adapter after recommendation/human decision.");
    value = await createAdoptionPlan({ target: args.target, adapter: args.adapter, profile: args.profile, purpose: args.purpose, risk: args.risk, requiredCapabilities: args.requiredCapabilities, portfolioPath: args.portfolio });
    if (args.output) writePlan(args.output, args.target, value);
  } else if (args.command === "check") {
    if (!args.plan) throw new Error("check requires --plan <path>.");
    value = await verifySavedPlan(readJson(args.plan), { target: args.target, adapter: args.adapter });
  } else if (args.command === "doctor") {
    value = doctor(realpathSync(args.target));
    if (value.status === "fail") process.exitCode = 1;
  } else {
    throw new Error(`Unknown command: ${args.command}`);
  }
  if (args.json) console.log(JSON.stringify(value, null, 2));
  else printHuman(args.command, value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (process.argv.includes("--json")) {
      console.error(JSON.stringify({ schema_version: "1.0.0", status: "error", message: error.message }));
    } else {
      console.error(`ask-setup failed: ${error.message}`);
    }
    process.exitCode = 1;
  });
}
