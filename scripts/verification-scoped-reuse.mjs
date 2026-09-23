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
