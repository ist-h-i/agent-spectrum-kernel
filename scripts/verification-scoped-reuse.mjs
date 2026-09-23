#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest,
  parseJsonRejectDuplicateKeys,
  stableCanonicalJson,
  writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";
import { readVerificationEvidence } from "./verification-evidence.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VERIFICATION_SCOPED_REUSE_SCHEMA_PATH = resolve(ROOT, "schemas/verification-scoped-reuse.schema.json");
export const VERIFICATION_SCOPED_REUSE_SCHEMA_REVISION = "1.0.0";
export const VERIFICATION_SCOPED_PLANNER_REVISION = "1.0.0";
export const VERIFICATION_SCOPED_REQUIREMENTS_PATH = ".ask/verification-scoped-requirements.json";
export const VERIFICATION_SCOPED_RUNTIME_CONTEXT = "ask.verification-scoped-reuse.runtime.v1";
export const VERIFICATION_SCOPED_GIT_TREE_CONTEXT = "ask.verification-scoped-reuse.git-tree.v1";
export const VERIFICATION_SCOPED_INVENTORY_CONTEXT = "ask.verification-scoped-reuse.inventory.v1";

const FULL_COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const EVIDENCE_ID = /^verification-evidence-[a-f0-9]{64}$/u;
const MAX_GATES = 256;
const MAX_SELECTED_INPUTS = 512;
const MAX_DIFF_RECORDS = 1024;
const MAX_DELTA_PATHS = 256;

function clone(value) {
  return structuredClone(value);
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function failSchema(value, label) {
  const errors = validateJsonSchema(value, { schemaPath: VERIFICATION_SCOPED_REUSE_SCHEMA_PATH });
  if (errors.length > 0) throw new Error(`${label} failed JSON Schema validation:\n${errors.join("\n")}`);
}

function assertDigest(value, label) {
  if (!DIGEST.test(value ?? "")) throw new Error(`${label} must be a sha256 digest`);
  return value;
}

function assertFullCommit(value, label) {
  if (!FULL_COMMIT.test(value ?? "")) throw new Error(`${label} must be a full lowercase commit SHA`);
  return value;
}

function portablePath(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 512
    || isAbsolute(value)
    || win32.isAbsolute(value)
    || value.includes("\\")
    || value.startsWith("./")
    || (value !== "." && (posix.normalize(value) !== value || value.split("/").some((part) => !part || part === "." || part === "..")))
  ) throw new Error(`${label} must be a portable repository-relative path`);
  return value;
}

function uniqueSorted(values, label, key) {
  const copy = clone(values);
  const seen = new Set();
  for (const entry of copy) {
    const identity = key(entry);
    if (seen.has(identity)) throw new Error(`${label} contains duplicate identity: ${identity}`);
    seen.add(identity);
  }
  copy.sort((left, right) => key(left).localeCompare(key(right)));
  return copy;
}

function assertCanonicalArray(values, label, key) {
  const expected = uniqueSorted(values, label, key);
  if (stableCanonicalJson(values) !== stableCanonicalJson(expected)) throw new Error(`${label} must use canonical sorted order`);
}

function selfDigest(value, idField, digestField) {
  const content = clone(value);
  delete content[idField];
  delete content[digestField];
  return canonicalDigest(content);
}

function sealSelfIdentified(content, { idField, digestField, idPrefix }) {
  const digest = canonicalDigest(content);
  return {
    ...content,
    [idField]: `${idPrefix}${digest.slice("sha256:".length)}`,
    [digestField]: digest,
  };
}

function assertSelfIdentified(value, { idField, digestField, idPrefix, label }) {
  const digest = selfDigest(value, idField, digestField);
  if (value[digestField] !== digest || value[idField] !== `${idPrefix}${digest.slice("sha256:".length)}`) {
    throw new Error(`${label} digest or ID mismatch`);
  }
}

function runGit(repositoryRoot, args, { encoding = "utf8", allowFailure = false } = {}) {
  const result = spawnSync("git", ["--no-replace-objects", "-C", repositoryRoot, ...args], {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`git ${args[0]} failed: ${String(stderr ?? "").trim() || `exit ${result.status}`}`);
  }
  return result;
}

export function resolveGitCommit({ repositoryRoot, revision }) {
  assertFullCommit(revision, "Git revision");
  const result = runGit(repositoryRoot, ["rev-parse", "--verify", `${revision}^{commit}`]);
  const resolvedRevision = result.stdout.trim();
  if (resolvedRevision !== revision) throw new Error(`Git revision did not resolve exactly: ${revision}`);
  return revision;
}

function assertAncestor({ repositoryRoot, baseRevision, targetRevision }) {
  const result = runGit(repositoryRoot, ["merge-base", "--is-ancestor", baseRevision, targetRevision], { allowFailure: true });
  if (result.status !== 0) throw new Error(`scoped reuse base revision is not an ancestor of target: ${baseRevision} -> ${targetRevision}`);
}

function normalizeRepositoryRemote(remote) {
  const value = String(remote ?? "").trim();
  const https = value.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u);
  if (https) return `github.com/${https[1]}/${https[2]}`;
  const ssh = value.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u);
  if (ssh) return `github.com/${ssh[1]}/${ssh[2]}`;
  const sshUrl = value.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u);
  if (sshUrl) return `github.com/${sshUrl[1]}/${sshUrl[2]}`;
  throw new Error("scoped reuse requires a canonical GitHub origin remote");
}

export function gitRepositoryId({ repositoryRoot }) {
  const remote = runGit(repositoryRoot, ["config", "--get", "remote.origin.url"]);
  return normalizeRepositoryRemote(remote.stdout);
}

function gitTreeOid({ repositoryRoot, revision }) {
  resolveGitCommit({ repositoryRoot, revision });
  const result = runGit(repositoryRoot, ["rev-parse", `${revision}^{tree}`]);
  const oid = result.stdout.trim();
  if (!/^[a-f0-9]{40,64}$/u.test(oid)) throw new Error("Git tree object ID is invalid");
  return oid;
}

export function gitTreeDigest({ repositoryRoot, revision }) {
  return canonicalDigest({
    context: VERIFICATION_SCOPED_GIT_TREE_CONTEXT,
    tree_oid: gitTreeOid({ repositoryRoot, revision }),
  });
}

function gitObjectBytes({ repositoryRoot, revision, path, maximumBytes = 1024 * 1024 }) {
  portablePath(path, "Git object path");
  resolveGitCommit({ repositoryRoot, revision });
  const result = runGit(repositoryRoot, ["show", `${revision}:${path}`], { encoding: null, allowFailure: true });
  if (result.status !== 0) throw new Error(`Git object is unavailable at ${revision}: ${path}`);
  if (!Buffer.isBuffer(result.stdout) || result.stdout.length === 0 || result.stdout.length > maximumBytes) {
    throw new Error(`Git object is empty or exceeds the byte limit: ${path}`);
  }
  return result.stdout;
}

function readGitJson({ repositoryRoot, revision, path, label }) {
  return parseJsonRejectDuplicateKeys(gitObjectBytes({ repositoryRoot, revision, path }), label);
}

function selectorKey(selector) {
  return `${selector.kind}\0${selector.pattern}\0${selector.evidence_kind}`;
}

function normalizeSelector(selector) {
  const normalized = clone(selector);
  if (!["file", "directory", "glob"].includes(normalized.kind)) throw new Error(`unsupported dependency selector kind: ${normalized.kind}`);
  portablePath(normalized.pattern, "dependency selector pattern");
  if (normalized.kind === "glob" && !/[?*]/u.test(normalized.pattern)) throw new Error("glob dependency selector must contain * or ?");
  if (normalized.kind !== "glob" && /[?*]/u.test(normalized.pattern)) throw new Error("file/directory dependency selectors cannot contain wildcard characters");
  return normalized;
}

function globRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else source += ".*";
      } else source += "[^/]*";
    } else if (character === "?") source += "[^/]";
    else source += character.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
  }
  return new RegExp(`${source}$`, "u");
}

function selectorMatches(selector, path) {
  if (selector.kind === "file") return path === selector.pattern;
  if (selector.kind === "directory") return path.startsWith(`${selector.pattern}/`);
  return globRegex(selector.pattern).test(path);
}

function matchingSelector(selectors, path) {
  const matches = selectors.filter((selector) => selectorMatches(selector, path));
  if (matches.length > 1) {
    const kinds = new Set(matches.map((entry) => entry.evidence_kind));
    if (kinds.size > 1) throw new Error(`dependency selectors assign conflicting evidence kinds to ${path}`);
  }
  return matches[0] ?? null;
}

function listGitTree({ repositoryRoot, revision }) {
  resolveGitCommit({ repositoryRoot, revision });
  const result = runGit(repositoryRoot, ["ls-tree", "-rz", "--full-tree", revision], { encoding: null });
  const records = [];
  for (const chunk of result.stdout.toString("utf8").split("\0")) {
    if (!chunk) continue;
    const tab = chunk.indexOf("\t");
    if (tab < 0) throw new Error("Git tree entry is malformed");
    const metadata = chunk.slice(0, tab).split(" ");
    if (metadata.length !== 3) throw new Error("Git tree metadata is malformed");
    const path = chunk.slice(tab + 1);
    portablePath(path, "Git tree path");
    records.push({ mode: metadata[0], type: metadata[1], oid: metadata[2], path });
  }
  return records;
}

function objectRawDigest({ repositoryRoot, oid, type }) {
  if (type !== "blob") return null;
  const result = runGit(repositoryRoot, ["cat-file", "blob", oid], { encoding: null });
  return rawDigest(result.stdout);
}

export function dependencyInventory({ repositoryRoot, revision, selectors }) {
  const normalizedSelectors = uniqueSorted(selectors.map(normalizeSelector), "dependency selectors", selectorKey);
  const entries = [];
  for (const entry of listGitTree({ repositoryRoot, revision })) {
    const selector = matchingSelector(normalizedSelectors, entry.path);
    if (!selector) continue;
    entries.push({
      path: entry.path,
      evidence_kind: selector.evidence_kind,
      mode: entry.mode,
      type: entry.type,
      object_id: entry.oid,
      content_digest: objectRawDigest({ repositoryRoot, oid: entry.oid, type: entry.type }),
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  if (entries.length === 0) throw new Error("dependency selectors matched no Git inputs");
  if (entries.length > MAX_SELECTED_INPUTS) throw new Error(`dependency inventory exceeds ${MAX_SELECTED_INPUTS} inputs`);
  const digest = canonicalDigest({ context: VERIFICATION_SCOPED_INVENTORY_CONTEXT, entries });
  return { entries, inventory_digest: digest };
}

function inventoryChanges(baseInventory, targetInventory) {
  const base = new Map(baseInventory.entries.map((entry) => [entry.path, entry]));
  const target = new Map(targetInventory.entries.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...base.keys(), ...target.keys()])].sort();
  const changes = [];
  for (const path of paths) {
    const before = base.get(path) ?? null;
    const after = target.get(path) ?? null;
    if (stableCanonicalJson(before) === stableCanonicalJson(after)) continue;
    let kind = "content_changed";
    if (!before) kind = "added";
    else if (!after) kind = "deleted";
    else if (before.type !== after.type) kind = "type_changed";
    else if (before.mode !== after.mode) kind = "mode_changed";
    changes.push({ path, kind, before, after });
  }
  return changes;
}

function gitDiffSummary({ repositoryRoot, baseRevision, targetRevision }) {
  const result = runGit(repositoryRoot, ["diff", "--name-status", "-z", "-M", "-C", baseRevision, targetRevision, "--"], { encoding: null });
  const parts = result.stdout.toString("utf8").split("\0").filter(Boolean);
  const records = [];
  for (let index = 0; index < parts.length;) {
    const statusToken = parts[index++];
    const code = statusToken[0];
    if (["R", "C"].includes(code)) {
      const oldPath = parts[index++];
      const newPath = parts[index++];
      if (!oldPath || !newPath) throw new Error("Git rename/copy diff record is malformed");
      portablePath(oldPath, "Git diff old path");
      portablePath(newPath, "Git diff new path");
      records.push({ status: code === "R" ? "renamed" : "copied", score: Number(statusToken.slice(1)), old_path: oldPath, new_path: newPath });
    } else {
      const path = parts[index++];
      if (!path) throw new Error("Git diff record is malformed");
      portablePath(path, "Git diff path");
      const status = { A: "added", D: "deleted", M: "modified", T: "type_changed" }[code] ?? "modified";
      records.push({ status, score: null, old_path: code === "D" ? path : null, new_path: code === "D" ? null : path });
    }
    if (records.length > MAX_DIFF_RECORDS) return { records: records.slice(0, MAX_DIFF_RECORDS), truncated: true };
  }
  return { records, truncated: false };
}

function changedPaths(diffSummary) {
  return [...new Set(diffSummary.records.flatMap((entry) => [entry.old_path, entry.new_path].filter(Boolean)))].sort();
}

function validateCommandBoundary(command, label) {
  portablePath(command.working_directory, `${label} working directory`);
  assertDigest(command.arguments_digest, `${label} arguments digest`);
  if (!Number.isInteger(command.argument_count) || command.argument_count < 0 || command.argument_count > 128) throw new Error(`${label} argument_count is invalid`);
  if (!Number.isInteger(command.opaque_argument_count) || command.opaque_argument_count < 0 || command.opaque_argument_count > command.argument_count) throw new Error(`${label} opaque_argument_count is invalid`);
}

function validateDependencyManifest(manifest, { manifestPath = null } = {}) {
  failSchema(manifest, "verification dependency manifest");
  if (manifest.program !== "ask_verification_dependency_manifest") throw new Error("artifact is not a verification dependency manifest");
  assertSelfIdentified(manifest, {
    idField: "manifest_id",
    digestField: "manifest_digest",
    idPrefix: "verification-dependency-manifest-",
    label: "verification dependency manifest",
  });
  assertDigest(manifest.base_inventory_digest, "dependency manifest base_inventory_digest");
  const selectors = manifest.selectors.map(normalizeSelector);
  assertCanonicalArray(selectors, "dependency manifest selectors", selectorKey);
  if (manifest.dependency_completeness !== "complete") return manifest;
  if (manifest.invalidation.unknown_dependencies_require_rerun !== true) throw new Error("dependency manifest must rerun for unknown dependencies");
  validateCommandBoundary(manifest.execution.command, "dependency manifest command");
  if (manifest.runtime_observation.mode !== "node_process_v1") throw new Error("unsupported dependency manifest runtime observation mode");
  if (stableCanonicalJson(manifest.runtime_observation.toolchain_names) !== stableCanonicalJson(["node"])) throw new Error("node_process_v1 must observe only the node toolchain");
  if (manifestPath && selectors.some((selector) => selectorMatches(selector, manifestPath))) {
    throw new Error("dependency manifest must not include its own path in the dependency selector set");
  }
  return manifest;
}

export function sealDependencyManifest(draft) {
  const content = clone(draft);
  delete content.manifest_id;
  delete content.manifest_digest;
  content.schema_version = VERIFICATION_SCOPED_REUSE_SCHEMA_REVISION;
  content.schema_path = "schemas/verification-scoped-reuse.schema.json";
  content.program = "ask_verification_dependency_manifest";
  content.selectors = uniqueSorted(content.selectors.map(normalizeSelector), "dependency manifest selectors", selectorKey);
  const manifest = sealSelfIdentified(content, {
    idField: "manifest_id",
    digestField: "manifest_digest",
    idPrefix: "verification-dependency-manifest-",
  });
  validateDependencyManifest(manifest);
  return manifest;
}

function gateRequirementKey(gate) {
  return gate.gate_id;
}

function normalizeAuthority(authority) {
  const value = clone(authority);
  value.accepted_producers = uniqueSorted(value.accepted_producers, "scoped accepted producers", (entry) => `${entry.kind}\0${entry.identity_digest}`);
  value.accepted_evidence_levels = [...new Set(value.accepted_evidence_levels)].sort();
  return value;
}

function normalizeReviewRequirement(review) {
  if (!review) return null;
  const value = clone(review);
  value.surface_selectors = uniqueSorted(value.surface_selectors.map((selector) => {
    const normalized = clone(selector);
    portablePath(normalized.pattern, "delta review surface selector pattern");
    if (normalized.kind === "glob" && !/[?*]/u.test(normalized.pattern)) throw new Error("delta review glob selector must contain * or ?");
    if (normalized.kind !== "glob" && /[?*]/u.test(normalized.pattern)) throw new Error("delta review file/directory selector cannot contain wildcard characters");
    return normalized;
  }), "delta review surface selectors", (entry) => `${entry.kind}\0${entry.pattern}`);
  value.obligation_refs = [...new Set(value.obligation_refs)].sort();
  value.prior_finding_refs = [...new Set(value.prior_finding_refs)].sort();
  return value;
}

export function sealScopedRequirements(draft) {
  const content = clone(draft);
  delete content.requirements_id;
  delete content.requirements_digest;
  content.schema_version = VERIFICATION_SCOPED_REUSE_SCHEMA_REVISION;
  content.schema_path = "schemas/verification-scoped-reuse.schema.json";
  content.program = "ask_verification_scoped_requirements";
  content.required_gates = uniqueSorted(content.required_gates.map((gate) => ({
    ...clone(gate),
    required_obligation_refs: [...new Set(gate.required_obligation_refs)].sort(),
    authority: normalizeAuthority(gate.authority),
    delta_review: normalizeReviewRequirement(gate.delta_review),
  })), "scoped required gates", gateRequirementKey);
  content.current_obligations = uniqueSorted(content.current_obligations ?? [], "current obligations", (entry) => entry.obligation_id);
  const requirements = sealSelfIdentified(content, {
    idField: "requirements_id",
    digestField: "requirements_digest",
    idPrefix: "verification-scoped-requirements-",
  });
  validateScopedRequirements(requirements);
  return requirements;
}

function validateScopedRequirements(requirements) {
  failSchema(requirements, "verification scoped requirements");
  if (requirements.program !== "ask_verification_scoped_requirements") throw new Error("artifact is not scoped verification requirements");
  assertFullCommit(requirements.base_revision, "scoped requirements base_revision");
  assertSelfIdentified(requirements, {
    idField: "requirements_id",
    digestField: "requirements_digest",
    idPrefix: "verification-scoped-requirements-",
    label: "verification scoped requirements",
  });
  assertCanonicalArray(requirements.required_gates, "scoped required gates", gateRequirementKey);
  if (requirements.required_gates.length > MAX_GATES) throw new Error(`scoped requirements exceed ${MAX_GATES} gates`);
  for (const gate of requirements.required_gates) {
    portablePath(gate.dependency_manifest_path, `${gate.gate_id} dependency_manifest_path`);
    if (!EVIDENCE_ID.test(gate.source_evidence_id)) throw new Error(`${gate.gate_id} source evidence ID is invalid`);
    assertCanonicalArray(gate.required_obligation_refs, `${gate.gate_id} required obligations`, (entry) => entry);
    assertCanonicalArray(gate.authority.accepted_producers, `${gate.gate_id} accepted producers`, (entry) => `${entry.kind}\0${entry.identity_digest}`);
    assertCanonicalArray(gate.authority.accepted_evidence_levels, `${gate.gate_id} accepted evidence levels`, (entry) => entry);
    if (gate.delta_review) {
      assertCanonicalArray(gate.delta_review.surface_selectors, `${gate.gate_id} delta review selectors`, (entry) => `${entry.kind}\0${entry.pattern}`);
      assertCanonicalArray(gate.delta_review.obligation_refs, `${gate.gate_id} delta review obligations`, (entry) => entry);
      assertCanonicalArray(gate.delta_review.prior_finding_refs, `${gate.gate_id} prior finding refs`, (entry) => entry);
    }
  }
  assertCanonicalArray(requirements.current_obligations, "current obligations", (entry) => entry.obligation_id);
  return requirements;
}

export function currentRuntimeIdentity() {
  const toolchain = {
    name: "node",
    version: process.version,
    identity_digest: canonicalDigest({
      context: `${VERIFICATION_SCOPED_RUNTIME_CONTEXT}:toolchain`,
      name: "node",
      version: process.version,
      architecture: process.arch,
    }),
  };
  const environment = {
    os: process.platform,
    architecture: process.arch,
    identity_digest: canonicalDigest({
      context: `${VERIFICATION_SCOPED_RUNTIME_CONTEXT}:environment`,
      os: process.platform,
      architecture: process.arch,
    }),
  };
  return { toolchain: [toolchain], environment };
}

function evidenceAuthorityAccepted(evidence, requirement) {
  return requirement.authority.accepted_producers.some((producer) => (
    producer.kind === evidence.producer.kind && producer.identity_digest === evidence.producer.identity_digest
  )) && requirement.authority.accepted_evidence_levels.includes(evidence.execution.runner.evidence_level);
}

function evidenceCovers(evidence, requirement) {
  const covered = new Set(evidence.coverage.obligation_refs);
  const denied = new Set(evidence.coverage.explicit_non_coverage);
  return requirement.required_obligation_refs.every((obligation) => covered.has(obligation) && !denied.has(obligation));
}

function evidenceInputBinding(evidence, inventory, manifestPath, manifestDigest) {
  const expected = inventory.entries.map((entry) => ({
    kind: entry.evidence_kind,
    path: entry.path,
    digest: entry.content_digest,
  }));
  expected.push({ kind: "manifest", path: manifestPath, digest: manifestDigest });
  expected.sort((left, right) => `${left.path}\0${left.kind}\0${left.digest}`.localeCompare(`${right.path}\0${right.kind}\0${right.digest}`));
  const actual = clone(evidence.consumed_inputs).sort((left, right) => `${left.path}\0${left.kind}\0${left.digest}`.localeCompare(`${right.path}\0${right.kind}\0${right.digest}`));
  return stableCanonicalJson(expected) === stableCanonicalJson(actual);
}

function runtimeBinding(evidence, manifest) {
  if (manifest.runtime_observation.mode !== "node_process_v1") return { ok: false, reason: "runtime_observation_unknown" };
  const current = currentRuntimeIdentity();
  if (stableCanonicalJson(evidence.execution.toolchain) !== stableCanonicalJson(current.toolchain)) return { ok: false, reason: "toolchain_changed" };
  if (stableCanonicalJson(evidence.execution.environment) !== stableCanonicalJson(current.environment)) return { ok: false, reason: "environment_changed" };
  return { ok: true, reason: null };
}

function blockingDisposition(requirement, reasonCode, detail = null) {
  const blocked = requirement.execution_availability === "unavailable";
  return {
    gate_id: requirement.gate_id,
    disposition: blocked ? "blocked_uncovered" : "rerun_required",
    reason_code: reasonCode,
    source_evidence_id: requirement.source_evidence_id,
    source_evidence_digest: null,
    dependency_manifest_id: null,
    dependency_manifest_digest: null,
    base_inventory_digest: null,
    target_inventory_digest: null,
    required_obligation_refs: clone(requirement.required_obligation_refs),
    covered_obligation_refs: [],
    uncovered_obligation_refs: clone(requirement.required_obligation_refs),
    execution_evidence_reusable: false,
    reuse_basis: null,
    detail,
  };
}

function successfulDisposition({ requirement, evidence, manifest, baseInventory, targetInventory, exact }) {
  const independent = requirement.authority.independent_judgment_required;
  const disposition = independent ? "independent_judgment_required" : (exact ? "reuse_exact" : "reuse_scoped");
  return {
    gate_id: requirement.gate_id,
    disposition,
    reason_code: independent ? "independent_judgment_required" : (exact ? "exact_source_binding_verified" : "scoped_dependencies_unchanged"),
    source_evidence_id: evidence.evidence_id,
    source_evidence_digest: evidence.evidence_digest,
    dependency_manifest_id: manifest.manifest_id,
    dependency_manifest_digest: manifest.manifest_digest,
    base_inventory_digest: baseInventory.inventory_digest,
    target_inventory_digest: targetInventory.inventory_digest,
    required_obligation_refs: clone(requirement.required_obligation_refs),
    covered_obligation_refs: clone(requirement.required_obligation_refs),
    uncovered_obligation_refs: [],
    execution_evidence_reusable: true,
    reuse_basis: exact ? "exact_target" : "declared_dependency_manifest",
    detail: null,
  };
}

function evaluateGate({ repositoryRoot, storeRoot, repositoryId, baseRevision, targetRevision, requirement }) {
  let manifest;
  let manifestBytes;
  try {
    manifestBytes = gitObjectBytes({ repositoryRoot, revision: baseRevision, path: requirement.dependency_manifest_path });
    manifest = parseJsonRejectDuplicateKeys(manifestBytes, `${requirement.gate_id} dependency manifest`);
    validateDependencyManifest(manifest, { manifestPath: requirement.dependency_manifest_path });
  } catch (error) {
    return blockingDisposition(requirement, "dependency_manifest_invalid", error.message);
  }
  if (manifest.gate_id !== requirement.gate_id) return blockingDisposition(requirement, "dependency_manifest_gate_mismatch");
  if (manifest.dependency_completeness !== "complete") return blockingDisposition(requirement, "dependency_information_incomplete");

  let targetManifestBytes;
  try {
    targetManifestBytes = gitObjectBytes({ repositoryRoot, revision: targetRevision, path: requirement.dependency_manifest_path });
  } catch {
    return blockingDisposition(requirement, "dependency_manifest_changed", "manifest is missing at target revision");
  }
  if (rawDigest(targetManifestBytes) !== rawDigest(manifestBytes)) return blockingDisposition(requirement, "dependency_manifest_changed");

  let baseInventory;
  let targetInventory;
  try {
    baseInventory = dependencyInventory({ repositoryRoot, revision: baseRevision, selectors: manifest.selectors });
    targetInventory = dependencyInventory({ repositoryRoot, revision: targetRevision, selectors: manifest.selectors });
  } catch (error) {
    return blockingDisposition(requirement, "dependency_inventory_unavailable", error.message);
  }
  if (baseInventory.inventory_digest !== manifest.base_inventory_digest) {
    return blockingDisposition(requirement, "dependency_manifest_base_inventory_mismatch");
  }
  if (baseInventory.entries.some((entry) => entry.type !== "blob" || entry.content_digest === null)) {
    return blockingDisposition(requirement, "dependency_input_type_unsupported");
  }

  let evidence;
  try {
    evidence = readVerificationEvidence({ storeRoot, evidenceId: requirement.source_evidence_id });
  } catch (error) {
    return blockingDisposition(requirement, "source_evidence_invalid", error.message);
  }
  const manifestContentDigest = rawDigest(manifestBytes);
  const expectedTreeDigest = gitTreeDigest({ repositoryRoot, revision: baseRevision });
  if (
    evidence.target.repository_id !== repositoryId
    || evidence.target.target_revision !== baseRevision
    || evidence.target.tree_digest !== expectedTreeDigest
  ) return blockingDisposition(requirement, "source_evidence_target_mismatch");
  if (evidence.gate.gate_id !== requirement.gate_id || evidence.gate.contract_digest !== manifest.gate_contract_digest) {
    return blockingDisposition(requirement, "gate_contract_changed");
  }
  if (stableCanonicalJson(evidence.execution.command) !== stableCanonicalJson(manifest.execution.command)
    || stableCanonicalJson(evidence.execution.runner) !== stableCanonicalJson(manifest.execution.runner)) {
    return blockingDisposition(requirement, "execution_contract_changed");
  }
  if (!evidenceInputBinding(evidence, baseInventory, requirement.dependency_manifest_path, manifestContentDigest)) {
    return blockingDisposition(requirement, "source_evidence_input_mismatch");
  }
  if (!evidenceAuthorityAccepted(evidence, requirement)) return blockingDisposition(requirement, "source_evidence_authority_mismatch");
  if (evidence.execution.terminal.status !== "succeeded") return blockingDisposition(requirement, "source_evidence_not_passing");
  if (!evidenceCovers(evidence, requirement)) return blockingDisposition(requirement, "source_evidence_coverage_mismatch");
  const runtime = runtimeBinding(evidence, manifest);
  if (!runtime.ok) return blockingDisposition(requirement, runtime.reason);

  const changes = inventoryChanges(baseInventory, targetInventory);
  if (changes.length > 0) return blockingDisposition(requirement, "declared_dependency_changed", changes.slice(0, 64));
  return successfulDisposition({
    requirement,
    evidence,
    manifest,
    baseInventory,
    targetInventory,
    exact: baseRevision === targetRevision,
  });
}

function coverageSummary(dispositions) {
  const count = (name) => dispositions.filter((entry) => entry.disposition === name).length;
  const covered = dispositions.filter((entry) => ["reuse_exact", "reuse_scoped"].includes(entry.disposition)).map((entry) => entry.gate_id).sort();
  const blocking = dispositions.filter((entry) => !["reuse_exact", "reuse_scoped"].includes(entry.disposition)).map((entry) => entry.gate_id).sort();
  return {
    status: blocking.length === 0 ? "covered" : "blocked",
    required_gate_count: dispositions.length,
    reuse_exact_count: count("reuse_exact"),
    reuse_scoped_count: count("reuse_scoped"),
    rerun_required_count: count("rerun_required"),
    independent_judgment_required_count: count("independent_judgment_required"),
    blocked_uncovered_count: count("blocked_uncovered"),
    covered_gate_ids: covered,
    blocking_gate_ids: blocking,
  };
}

function executionSummary(dispositions) {
  const rerun = dispositions.filter((entry) => ["rerun_required", "blocked_uncovered"].includes(entry.disposition)).length;
  const reused = dispositions.filter((entry) => entry.execution_evidence_reusable).length;
  return {
    required_gate_count: dispositions.length,
    full_rerun_gate_count: dispositions.length,
    reused_execution_gate_count: reused,
    rerun_gate_count: rerun,
    saved_execution_gate_count: Math.max(0, dispositions.length - rerun),
  };
}

function validatePlan(plan, requirements) {
  failSchema(plan, "verification scoped reuse plan");
  if (plan.program !== "ask_verification_scoped_reuse_plan") throw new Error("artifact is not a scoped reuse plan");
  assertSelfIdentified(plan, {
    idField: "plan_id",
    digestField: "plan_digest",
    idPrefix: "verification-scoped-reuse-plan-",
    label: "verification scoped reuse plan",
  });
  if (plan.requirements_id !== requirements.requirements_id || plan.requirements_digest !== requirements.requirements_digest) throw new Error("scoped reuse plan requirements binding mismatch");
  assertCanonicalArray(plan.dispositions, "scoped reuse dispositions", (entry) => entry.gate_id);
  const expected = coverageSummary(plan.dispositions);
  if (stableCanonicalJson(plan.coverage) !== stableCanonicalJson(expected)) throw new Error("scoped reuse coverage summary mismatch");
  if (stableCanonicalJson(plan.execution_summary) !== stableCanonicalJson(executionSummary(plan.dispositions))) throw new Error("scoped reuse execution summary mismatch");
  return plan;
}

function loadTargetRequirements({ repositoryRoot, targetRevision }) {
  const requirements = readGitJson({
    repositoryRoot,
    revision: targetRevision,
    path: VERIFICATION_SCOPED_REQUIREMENTS_PATH,
    label: "target scoped verification requirements",
  });
  return validateScopedRequirements(requirements);
}

export function planScopedReuse({ repositoryRoot, storeRoot, targetRevision }) {
  resolveGitCommit({ repositoryRoot, revision: targetRevision });
  const repositoryId = gitRepositoryId({ repositoryRoot });
  const requirements = loadTargetRequirements({ repositoryRoot, targetRevision });
  const baseRevision = resolveGitCommit({ repositoryRoot, revision: requirements.base_revision });
  assertAncestor({ repositoryRoot, baseRevision, targetRevision });
  const diff = gitDiffSummary({ repositoryRoot, baseRevision, targetRevision });
  const dispositions = requirements.required_gates.map((requirement) => evaluateGate({
    repositoryRoot,
    storeRoot,
    repositoryId,
    baseRevision,
    targetRevision,
    requirement,
  }));
  const content = {
    schema_version: VERIFICATION_SCOPED_REUSE_SCHEMA_REVISION,
    schema_path: "schemas/verification-scoped-reuse.schema.json",
    program: "ask_verification_scoped_reuse_plan",
    planner_revision: VERIFICATION_SCOPED_PLANNER_REVISION,
    repository_id: repositoryId,
    base_revision: baseRevision,
    target_revision: targetRevision,
    target_tree_digest: gitTreeDigest({ repositoryRoot, revision: targetRevision }),
    requirements_id: requirements.requirements_id,
    requirements_digest: requirements.requirements_digest,
    requirements_path: VERIFICATION_SCOPED_REQUIREMENTS_PATH,
    actual_diff: {
      digest: canonicalDigest({ base_revision: baseRevision, target_revision: targetRevision, records: diff.records, truncated: diff.truncated }),
      changed_paths: changedPaths(diff),
      change_records: clone(diff.records),
      record_count: diff.records.length,
      truncated: diff.truncated,
    },
    dispositions,
    coverage: coverageSummary(dispositions),
    execution_summary: executionSummary(dispositions),
  };
  const plan = sealSelfIdentified(content, {
    idField: "plan_id",
    digestField: "plan_digest",
    idPrefix: "verification-scoped-reuse-plan-",
  });
  validatePlan(plan, requirements);
  return plan;
}

function pathMatchesReviewSelector(selector, path) {
  return selectorMatches({ ...selector, evidence_kind: "file" }, path);
}

export function buildDeltaReviewRequest({ repositoryRoot, targetRevision, plan = null }) {
  const requirements = loadTargetRequirements({ repositoryRoot, targetRevision });
  if (!plan) throw new Error("delta review request requires the resolved scoped reuse plan");
  const resolvedPlan = plan;
  validatePlan(resolvedPlan, requirements);
  if (resolvedPlan.target_revision !== targetRevision) throw new Error("delta review target revision does not match the scoped reuse plan");
  const affected = [];
  const obligations = new Set();
  const priorReviews = new Set();
  const priorFindings = new Set();
  for (const gate of requirements.required_gates) {
    if (!gate.delta_review) continue;
    const paths = resolvedPlan.actual_diff.changed_paths.filter((path) => gate.delta_review.surface_selectors.some((selector) => pathMatchesReviewSelector(selector, path)));
    if (paths.length === 0) continue;
    affected.push(...paths);
    for (const obligation of gate.delta_review.obligation_refs) obligations.add(obligation);
    if (gate.delta_review.prior_review_ref) priorReviews.add(gate.delta_review.prior_review_ref);
    for (const finding of gate.delta_review.prior_finding_refs) priorFindings.add(finding);
  }
  const affectedPaths = [...new Set(affected)].sort();
  const bounded = !resolvedPlan.actual_diff.truncated && affectedPaths.length <= MAX_DELTA_PATHS;
  const reusableEvidence = resolvedPlan.dispositions
    .filter((entry) => entry.execution_evidence_reusable && entry.source_evidence_digest)
    .map((entry) => ({ gate_id: entry.gate_id, evidence_id: entry.source_evidence_id, evidence_digest: entry.source_evidence_digest }))
    .sort((left, right) => left.gate_id.localeCompare(right.gate_id));
  const content = {
    schema_version: VERIFICATION_SCOPED_REUSE_SCHEMA_REVISION,
    schema_path: "schemas/verification-scoped-reuse.schema.json",
    program: "ask_verification_delta_review_request",
    repository_id: resolvedPlan.repository_id,
    base_revision: resolvedPlan.base_revision,
    target_revision: resolvedPlan.target_revision,
    plan_id: resolvedPlan.plan_id,
    plan_digest: resolvedPlan.plan_digest,
    diff_ref: {
      digest: resolvedPlan.actual_diff.digest,
      changed_path_count: resolvedPlan.actual_diff.changed_paths.length,
    },
    status: !bounded ? "blocked_unbounded" : (affectedPaths.length === 0 ? "not_required" : "current_judgment_required"),
    affected_paths: bounded ? affectedPaths : [],
    obligation_refs: [...obligations].sort(),
    prior_review_refs: [...priorReviews].sort(),
    prior_finding_refs: [...priorFindings].sort(),
    reusable_evidence_refs: reusableEvidence,
    privacy: {
      bounded_references_only: true,
      raw_diff_stored: false,
      raw_prompts_stored: false,
      transcripts_stored: false,
      raw_output_stored: false,
      secrets_stored: false,
      private_evaluators_stored: false,
    },
  };
  const request = sealSelfIdentified(content, {
    idField: "request_id",
    digestField: "request_digest",
    idPrefix: "verification-delta-review-request-",
  });
  failSchema(request, "verification delta review request");
  return request;
}

export function buildCurrentCoverage({ repositoryRoot, storeRoot, targetRevision }) {
  const requirements = loadTargetRequirements({ repositoryRoot, targetRevision });
  const plan = planScopedReuse({ repositoryRoot, storeRoot, targetRevision });
  const delta = buildDeltaReviewRequest({ repositoryRoot, targetRevision, plan });
  const blockers = [];
  for (const disposition of plan.dispositions) {
    if (!["reuse_exact", "reuse_scoped"].includes(disposition.disposition)) {
      blockers.push({ kind: "gate", ref: disposition.gate_id, reason_code: disposition.reason_code });
    }
  }
  if (delta.status === "current_judgment_required") blockers.push({ kind: "independent_judgment", ref: delta.request_id, reason_code: "current_delta_judgment_unperformed" });
  if (delta.status === "blocked_unbounded") blockers.push({ kind: "independent_judgment", ref: delta.request_id, reason_code: "delta_review_input_unbounded" });
  for (const obligation of requirements.current_obligations) {
    blockers.push({ kind: "current_observation", ref: obligation.obligation_id, reason_code: "current_observation_required" });
  }
  blockers.sort((left, right) => `${left.kind}\0${left.ref}`.localeCompare(`${right.kind}\0${right.ref}`));
  const content = {
    schema_version: VERIFICATION_SCOPED_REUSE_SCHEMA_REVISION,
    schema_path: "schemas/verification-scoped-reuse.schema.json",
    program: "ask_verification_current_coverage",
    repository_id: plan.repository_id,
    target_revision: plan.target_revision,
    target_tree_digest: plan.target_tree_digest,
    requirements_id: requirements.requirements_id,
    requirements_digest: requirements.requirements_digest,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    delta_review_request_id: delta.request_id,
    delta_review_request_digest: delta.request_digest,
    status: blockers.length === 0 ? "covered" : "blocked",
    blockers,
    external_state_policy: {
      historical_state_is_current: false,
      self_reported_freshness_accepted: false,
    },
  };
  const coverage = sealSelfIdentified(content, {
    idField: "coverage_id",
    digestField: "coverage_digest",
    idPrefix: "verification-current-coverage-",
  });
  failSchema(coverage, "verification current coverage");
  return { plan, delta_review_request: delta, coverage };
}

function parseCliArgs(argv) {
  const [command, ...tokens] = argv;
  if (!command) throw new Error("verification scoped reuse command is required");
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(`invalid scoped reuse option: ${flag ?? "missing"}`);
    const key = flag.slice(2).replaceAll("-", "_");
    if (Object.hasOwn(options, key)) throw new Error(`duplicate scoped reuse option: ${flag}`);
    options[key] = value;
  }
  return { command, options };
}

function requiredOption(options, key) {
  if (!options[key]) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  return options[key];
}

function runCli(argv) {
  const { command, options } = parseCliArgs(argv);
  const allowed = new Set(["repository", "store", "target", "output"]);
  const unknown = Object.keys(options).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`unknown scoped reuse option: --${unknown.replaceAll("_", "-")}`);
  if (!["plan", "delta-review", "coverage"].includes(command)) throw new Error(`unknown scoped reuse command: ${command}`);
  const repositoryRoot = requiredOption(options, "repository");
  const targetRevision = requiredOption(options, "target");
  let artifact;
  if (command === "plan") artifact = planScopedReuse({ repositoryRoot, storeRoot: requiredOption(options, "store"), targetRevision });
  else if (command === "delta-review") {
    const plan = planScopedReuse({ repositoryRoot, storeRoot: requiredOption(options, "store"), targetRevision });
    artifact = buildDeltaReviewRequest({ repositoryRoot, targetRevision, plan });
  } else artifact = buildCurrentCoverage({ repositoryRoot, storeRoot: requiredOption(options, "store"), targetRevision });
  if (options.output) writeCanonicalJsonNoReplace({ outputPath: options.output, artifact, label: "verification scoped reuse CLI output" });
  else process.stdout.write(`${stableCanonicalJson(artifact)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Verification scoped reuse failed: ${error.message}`);
    process.exit(1);
  }
}
