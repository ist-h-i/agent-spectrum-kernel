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
