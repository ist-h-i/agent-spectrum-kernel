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
