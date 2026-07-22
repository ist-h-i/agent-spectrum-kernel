import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { assertNoSymlinkPathSegments } from "./ask-benchmark-atomic-publication.mjs";

const READ_CHUNK_BYTES = 64 * 1024;

function statusEvidence(status) {
  return {
    dev: status.dev,
    ino: status.ino,
    size: status.size,
    mtimeMs: status.mtimeMs,
    ctimeMs: status.ctimeMs,
  };
}

function sameStatus(left, right) {
  return ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((field) => left[field] === right[field]);
}

export function assertStableRegularFile(path, label) {
  if (!path) throw new Error(`${label} is missing`);
  assertNoSymlinkPathSegments(path, label);
  const status = lstatSync(path);
  if (status.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!status.isFile()) throw new Error(`${label} must be a regular file`);
  return status;
}

export function readStableFile(path, label, maximumBytes, { allowEmpty = true } = {}) {
  const resolvedPath = resolve(path);
  const initialPathStatus = assertStableRegularFile(resolvedPath, label);
  if ((!allowEmpty && initialPathStatus.size === 0) || initialPathStatus.size > maximumBytes) throw new Error(`${label} must be a bounded${allowEmpty ? "" : " non-empty"} regular file`);
  const initialCanonicalPath = realpathSync(resolvedPath);
  const chunks = [];
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let descriptor;
  let openedDescriptorStatus;
  let finalDescriptorStatus;
  let bytesRead = 0;
  try {
    descriptor = openSync(resolvedPath, "r");
    openedDescriptorStatus = fstatSync(descriptor);
    if (!openedDescriptorStatus.isFile() || !sameStatus(statusEvidence(initialPathStatus), statusEvidence(openedDescriptorStatus))) throw new Error(`${label} changed between path inspection and descriptor open`);
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      bytesRead += count;
      if (bytesRead > maximumBytes) throw new Error(`${label} exceeds the byte limit`);
      chunks.push(Buffer.from(chunk.subarray(0, count)));
    }
    finalDescriptorStatus = fstatSync(descriptor);
    if (!sameStatus(statusEvidence(openedDescriptorStatus), statusEvidence(finalDescriptorStatus))) throw new Error(`${label} changed during descriptor read`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const finalPathStatus = lstatSync(resolvedPath);
  if (finalPathStatus.isSymbolicLink() || !finalPathStatus.isFile() || !sameStatus(statusEvidence(finalDescriptorStatus), statusEvidence(finalPathStatus))) throw new Error(`${label} path was replaced during inspection`);
  const finalCanonicalPath = realpathSync(resolvedPath);
  if (initialCanonicalPath !== finalCanonicalPath) throw new Error(`${label} canonical path changed during inspection`);
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== finalDescriptorStatus.size) throw new Error(`${label} changed during descriptor read`);
  return {
    path: resolvedPath,
    canonicalPath: finalCanonicalPath,
    bytes,
    rawByteDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    evidence: {
      initialPath: statusEvidence(initialPathStatus),
      openedDescriptor: statusEvidence(openedDescriptorStatus),
      finalDescriptor: statusEvidence(finalDescriptorStatus),
      finalPath: statusEvidence(finalPathStatus),
    },
  };
}

export function assertStableFileEvidence(before, after, label) {
  if (
    before.path !== after.path
    || before.canonicalPath !== after.canonicalPath
    || JSON.stringify(before.evidence) !== JSON.stringify(after.evidence)
    || before.rawByteDigest !== after.rawByteDigest
    || Buffer.compare(before.bytes, after.bytes) !== 0
  ) throw new Error(`${label} changed or was replaced during verification`);
}
