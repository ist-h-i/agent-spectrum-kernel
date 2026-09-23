#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CORE_OWNED_IMMUTABLE_ASSETS } from "./installer-lifecycle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_SCHEMA_VERSION = "1.0.0";
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
const SENSITIVE_BASENAMES = new Set([".env", ".npmrc", ".netrc", "credentials", "credentials.json"]);
const SENSITIVE_SUFFIXES = [".pem", ".key", ".p12", ".pfx", ".jks"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function jsonDigest(value) {
  return `sha256:${sha256(canonicalJson(value))}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch (error) {
    return { __invalid_json: error.message };
  }
}

function pathInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function isSensitivePath(relativePath) {
  const normalized = relativePath.split(sep).join("/");
  const base = basename(normalized);
  if (SENSITIVE_BASENAMES.has(base) || base.startsWith(".env.")) return true;
  if (SENSITIVE_SUFFIXES.some((suffix) => base.endsWith(suffix))) return true;
  return normalized.startsWith(".git/") || normalized.startsWith(".ssh/") || normalized.startsWith(".aws/");
}

function safeLstat(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function collectPathEntries(root, relativeRoot, { includeContentHash = true } = {}) {
  const absolute = resolve(root, relativeRoot);
  const stat = safeLstat(absolute);
  if (!stat) return [];
  const entries = [];
  const visit = (path, rel) => {
    const current = lstatSync(path);
    const posixRel = rel.split(sep).join("/");
    if (current.isSymbolicLink()) {
      const link = readlinkSync(path);
      const resolved = resolve(dirname(path), link);
      entries.push({ path: posixRel, type: "symlink", link, escapes_target: !pathInside(root, resolved) });
      return;
    }
    if (current.isDirectory()) {
      entries.push({ path: `${posixRel}/`, type: "directory" });
      for (const name of readdirSync(path).sort()) visit(resolve(path, name), resolve(rel, name));
      return;
    }
    if (!current.isFile()) {
      entries.push({ path: posixRel, type: "other" });
      return;
    }
    if (!includeContentHash || isSensitivePath(posixRel)) {
      entries.push({ path: posixRel, type: "file", content: "omitted" });
      return;
    }
    entries.push({ path: posixRel, type: "file", sha256: sha256(readFileSync(path)) });
  };
  visit(absolute, relativeRoot);
  return entries;
}

function managedPathsFromState(target) {
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

function sourceIdentity() {
  const manifestPath = resolve(REPO_ROOT, "manifest.json");
  const runtimeProfilePath = resolve(REPO_ROOT, "docs/fixtures/adapter-runtime-profiles.json");
  const files = [
    "manifest.json",
    "scripts/install-kernel.mjs",
    "scripts/install-codex-adapter.mjs",
    "scripts/install-claude-adapter.mjs",
    "scripts/installer-lifecycle.mjs",
    "scripts/ask-doctor.mjs",
    "scripts/ask-setup.mjs",
    "schemas/adoption-plan.schema.json",
    "docs/fixtures/adapter-runtime-profiles.json",
  ].map((path) => ({ path, sha256: existsSync(resolve(REPO_ROOT, path)) ? sha256(readFileSync(resolve(REPO_ROOT, path))) : null }));
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  const runtimeProfiles = existsSync(runtimeProfilePath) ? readJson(runtimeProfilePath) : null;
  return {
    name: manifest?.name ?? "agent-spectrum-kernel",
    version: manifest?.version ?? null,
    files,
    identity_digest: jsonDigest(files),
    runtime_profile_fixture_digest: runtimeProfiles ? jsonDigest(runtimeProfiles) : null,
  };
}

function gitFacts(target) {
  const gitDir = resolve(target, ".git");
  if (!existsSync(gitDir)) return { detected: false, repository_id: null, revision: null };
  const run = (args) => {
    const result = spawnSync("git", args, { cwd: target, encoding: "utf8", timeout: 5000 });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const origin = run(["config", "--get", "remote.origin.url"]);
  const revision = run(["rev-parse", "HEAD"]);
  return {
    detected: true,
    repository_id: origin ? `git:${origin}` : null,
    revision,
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
  if (value.__invalid_json) return { path: relativePath, present: true, valid: false, error: value.__invalid_json };
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
  const core = stateSummary(root, ".agent-spectrum-kernel/install-state.json", "agent-spectrum-kernel");
  const codex = stateSummary(root, ".agent-spectrum-kernel/codex-install-state.json", "agent-spectrum-codex-adapter");
  const claude = stateSummary(root, ".agent-spectrum-kernel/claude-install-state.json", "agent-spectrum-claude-adapter");
  const presentAdapters = [codex.present && codex.install_status !== "detached" ? "codex" : null, claude.present && claude.install_status !== "detached" ? "claude-code" : null].filter(Boolean);
  const profiles = {};
  for (const adapter of ADAPTERS) profiles[adapter] = await availableProfiles(adapter);
  return {
    schema_version: "1.0.0",
    target: { realpath: root, ...gitFacts(root) },
    snapshot: snapshotTarget(root),
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
  if (selectedAdapter === "kernel-only") selectedProfile = "kernel-only";
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

function copyEntryPreservingSymlink(sourceRoot, destinationRoot, relativePath) {
  const source = resolve(sourceRoot, relativePath);
  if (!existsSync(source)) return;
  const stat = lstatSync(source);
  const destination = resolve(destinationRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), destination);
    return;
  }
  cpSync(source, destination, { recursive: true, dereference: false, preserveTimestamps: false });
}

function validateNoEscapingSymlink(target, paths) {
  const root = realpathSync(target);
  const escapes = [];
  for (const relativePath of [...new Set(paths)]) {
    const candidate = resolve(root, relativePath);
    if (existsSync(candidate)) {
      const resolved = realpathSync(candidate);
      if (!pathInside(root, resolved)) escapes.push(relativePath);
      for (const entry of collectPathEntries(root, relativePath, { includeContentHash: false })) {
        if (entry.type === "symlink" && entry.escapes_target) escapes.push(entry.path);
      }
      continue;
    }
    let parent = dirname(candidate);
    while (!existsSync(parent) && parent !== root && pathInside(root, parent)) parent = dirname(parent);
    if (existsSync(parent) && !pathInside(root, realpathSync(parent))) escapes.push(relativePath);
  }
  const unique = [...new Set(escapes)].sort();
  if (unique.length > 0) throw new Error(`Symlink escapes target repository: ${unique.join(", ")}`);
}

function copyTargetForSimulation(target, destination, paths) {
  validateNoEscapingSymlink(target, paths);
  mkdirSync(destination, { recursive: true });
  for (const item of [...new Set(paths)].sort()) copyEntryPreservingSymlink(target, destination, item);
}

function normalizedOutputDigest(output, staging) {
  const normalized = String(output ?? "").split(staging).join("<staging>").replaceAll("\\", "/");
  return `sha256:${sha256(normalized)}`;
}

function runNode(script, args, { cwd = REPO_ROOT, expected = [0] } = {}) {
  const result = spawnSync(process.execPath, [resolve(REPO_ROOT, script), ...args], { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  if (!expected.includes(result.status)) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    throw new Error(`${script} failed (${result.status}): ${stderr || stdout || "no output"}`);
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

function planDigestPayload(plan) {
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
  const recommendation = recommendFromFacts({ inspection: beforeInspection, adapter, purpose, profile, risk, requiredCapabilities });
  if (!recommendation.profile) throw new Error(`Plan requires resolved profile. Outstanding decisions: ${recommendation.human_decisions.map((entry) => entry.id).join(", ")}`);
  if (recommendation.human_decisions.some((entry) => entry.id.startsWith("capability:"))) throw new Error(`Required capability is unsupported or unknown: ${recommendation.human_decisions.filter((entry) => entry.id.startsWith("capability:")).map((entry) => entry.id.slice("capability:".length)).join(", ")}`);

  const source = sourceIdentity();
  let selectedSkills = null;
  let projection = null;
  if (adapter === "kernel-only") {
    const manifest = readJson(resolve(REPO_ROOT, "manifest.json"));
    selectedSkills = [...(manifest.skills ?? [])].sort();
  } else {
    const build = await projectionBuilder(adapter);
    projection = build(recommendation.profile);
    selectedSkills = projection.skills ?? projection.selectedSkills ?? [];
  }
  const projectedTargetPaths = (projection?.projectedManagedAssets ?? [])
    .filter((asset) => asset.ownership_mode !== "runtime_directory")
    .map((asset) => asset.path);
  const planningPaths = [...new Set([
    "AGENTS.md",
    "CUSTOM_INSTRUCTIONS.md",
    ...MANAGED_STATE_PATHS,
    ...managedPathsFromState(root),
    ...CORE_OWNED_IMMUTABLE_ASSETS,
    ...(selectedSkills ?? []).map((skill) => `skills/${skill}/SKILL.md`),
    ...projectedTargetPaths,
  ])].sort();
  const planTargetSnapshot = snapshotTarget(root, { extraPaths: planningPaths });

  const stagingRoot = mkdtempSync(resolve(tmpdir(), "ask-setup-plan-"));
  const staging = resolve(stagingRoot, "target");
  try {
    copyTargetForSimulation(root, staging, planningPaths);
    const beforeInstall = installerNamespaceSnapshot(staging, planningPaths);
    const phaseEvidence = [];

    const kernelArgs = ["--target", staging, "--merge-agents"];
    if (selectedSkills && selectedSkills.length > 0) kernelArgs.push("--skills", selectedSkills.join(","));
    const kernelCommand = ["node", "scripts/install-kernel.mjs", "--target", "<staging>", "--merge-agents", ...(selectedSkills && selectedSkills.length ? ["--skills", selectedSkills.join(",")] : [])];
    const kernelDryRun = runNode("scripts/install-kernel.mjs", [...kernelArgs, "--dry-run"]);
    const kernel = runNode("scripts/install-kernel.mjs", kernelArgs);
    phaseEvidence.push({
      phase: "kernel",
      command: kernelCommand,
      exit_status: kernel.status,
      dry_run_exit_status: kernelDryRun.status,
      dry_run_output_digest: normalizedOutputDigest(kernelDryRun.stdout, staging),
    });

    if (adapter === "codex") {
      const adapterArgs = ["--target", staging, "--profile", recommendation.profile];
      const dryRun = runNode("scripts/install-codex-adapter.mjs", [...adapterArgs, "--dry-run"]);
      const result = runNode("scripts/install-codex-adapter.mjs", adapterArgs);
      phaseEvidence.push({
        phase: "adapter",
        command: ["node", "scripts/install-codex-adapter.mjs", "--target", "<staging>", "--profile", recommendation.profile],
        exit_status: result.status,
        dry_run_exit_status: dryRun.status,
        dry_run_output_digest: normalizedOutputDigest(dryRun.stdout, staging),
      });
    } else if (adapter === "claude-code") {
      const adapterArgs = ["--target", staging, "--profile", recommendation.profile];
      const dryRun = runNode("scripts/install-claude-adapter.mjs", [...adapterArgs, "--dry-run"]);
      const result = runNode("scripts/install-claude-adapter.mjs", adapterArgs);
      phaseEvidence.push({
        phase: "adapter",
        command: ["node", "scripts/install-claude-adapter.mjs", "--target", "<staging>", "--profile", recommendation.profile],
        exit_status: result.status,
        dry_run_exit_status: dryRun.status,
        dry_run_output_digest: normalizedOutputDigest(dryRun.stdout, staging),
      });
    }

    const afterPaths = [...new Set([...planningPaths, ...managedPathsFromState(staging)])].sort();
    const afterInstall = installerNamespaceSnapshot(staging, afterPaths);
    const operations = diffSnapshots(beforeInstall, afterInstall, ownershipMap(staging));
    const afterTargetSnapshot = snapshotTarget(root, { extraPaths: planningPaths });
    if (planTargetSnapshot.digest !== afterTargetSnapshot.digest) throw new Error("Target changed while setup inspection/plan was running; retry from a fresh inspection.");

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
        note: "Apply is not implemented by ask-setup in this slice. Existing installers retain rollback/detach ownership semantics.",
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

export function verifySavedPlan(plan, { target, adapter = null } = {}) {
  if (!plan || plan.schema_version !== PLAN_SCHEMA_VERSION || plan.kind !== PLAN_KIND) throw new Error("Unsupported or invalid adoption plan.");
  const expectedDigest = jsonDigest(planDigestPayload(plan));
  if (plan.plan_digest !== expectedDigest) throw new Error("Plan digest mismatch.");
  const root = realpathSync(target);
  if (plan.environment?.target_realpath !== root) throw new Error("Plan target repository path does not match the requested repository.");
  if (adapter && plan.selection?.adapter !== adapter) throw new Error(`Plan adapter mismatch: planned=${plan.selection?.adapter} requested=${adapter}`);
  const currentSource = sourceIdentity();
  if (plan.source?.identity_digest !== currentSource.identity_digest) throw new Error("ASK setup source changed after the plan was generated.");
  const current = snapshotTarget(root, { extraPaths: Array.isArray(plan.target?.snapshot_paths) ? plan.target.snapshot_paths : [] });
  if (plan.target?.snapshot_digest !== current.digest) throw new Error("Target repository changed after the plan was generated.");
  const git = gitFacts(root);
  if (plan.target?.repository_id !== git.repository_id || plan.target?.revision !== git.revision) throw new Error("Target repository identity or revision changed after the plan was generated.");
  return { valid: true, plan_digest: plan.plan_digest, target_snapshot_digest: current.digest };
}

function doctor(target) {
  const result = runNode("scripts/ask-doctor.mjs", ["--target", target, "--json"], { expected: [0, 1] });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`ask-doctor did not return JSON: ${(result.stdout || result.stderr).slice(0, 500)}`);
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
  const args = { command, target: process.cwd(), adapter: null, profile: null, purpose: null, risk: "normal", requiredCapabilities: [], json: false, output: null, plan: null, portfolio: null };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--target") args.target = resolve(rest[++i]);
    else if (token === "--adapter") args.adapter = rest[++i];
    else if (token === "--profile") args.profile = rest[++i];
    else if (token === "--purpose") args.purpose = rest[++i];
    else if (token === "--risk") args.risk = rest[++i];
    else if (token === "--require-capability") args.requiredCapabilities.push(rest[++i]);
    else if (token === "--portfolio-reference") args.portfolio = resolve(rest[++i]);
    else if (token === "--output") args.output = resolve(rest[++i]);
    else if (token === "--plan") args.plan = resolve(rest[++i]);
    else if (token === "--json") args.json = true;
    else if (token === "--help" || token === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-setup.mjs <inspect|recommend|plan|check|doctor|apply> [options]\n\nOptions:\n  --target <path>                 Target repository (default: cwd)\n  --adapter <codex|claude-code|kernel-only>\n  --profile <name>                Exact existing installer profile\n  --purpose <name>                daily|organizational|implementation|investigation|review|adoption|observability\n  --risk <normal|high>            Recommendation guard only; does not invent project policy\n  --require-capability <id>       Repeatable adapter capability requirement\n  --portfolio-reference <path>    Exact exported Portfolio reference JSON\n  --output <path>                 Save a plan outside the target repository\n  --plan <path>                   Saved plan for check\n  --json                          Machine-readable output\n\nCommands are read-only for the target repository. 'apply' is intentionally unavailable in this slice.`);
}

function writePlan(path, target, plan) {
  const root = realpathSync(target);
  const requested = resolve(path);
  if (pathInside(root, requested)) throw new Error("Plan output must be outside the target repository.");
  const parent = dirname(requested);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  const resolvedParent = realpathSync(parent);
  const candidate = resolve(resolvedParent, basename(requested));
  if (pathInside(root, candidate)) throw new Error("Plan output must be outside the target repository.");
  if (existsSync(candidate)) throw new Error(`Plan output already exists: ${candidate}`);
  writeFileSync(candidate, `${JSON.stringify(plan, null, 2)}\n`);
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
    console.log("対象repositoryへの書き込みは行っていません。applyと実workflow確認は未対応です。");
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
  if (args.command === "apply") throw new Error("apply is not implemented in this slice; refusing before any target mutation.");
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
    value = verifySavedPlan(readJson(args.plan), { target: args.target, adapter: args.adapter });
  } else if (args.command === "doctor") {
    value = doctor(realpathSync(args.target));
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
