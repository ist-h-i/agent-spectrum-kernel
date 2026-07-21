import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, parse, relative, resolve, sep } from "node:path";

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function assertNoSymlinkPathSegments(path, label) {
  const absolute = resolve(path);
  const filesystemRoot = parse(absolute).root;
  const segments = relative(filesystemRoot, absolute).split(sep).filter(Boolean);
  let current = filesystemRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    const status = lstatIfPresent(current);
    if (!status) throw new Error(`${label} does not exist`);
    if (status.isSymbolicLink()) throw new Error(`${label} traverses a symlink`);
  }
}

export function assertAtomicOutputAbsent(outputPath, label) {
  if (!outputPath) throw new Error(`${label} requires an output path`);
  const output = resolve(outputPath);
  const parent = dirname(output);
  assertNoSymlinkPathSegments(parent, `${label} parent`);
  if (!lstatSync(parent).isDirectory()) throw new Error(`${label} parent must be a directory`);
  const existing = lstatIfPresent(output);
  if (existing?.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (existing) throw new Error(`${label} must not already exist`);
  return output;
}

export function publishJsonAtomicNoReplace({ outputPath, artifact, label, forbiddenByteValues = [] }) {
  const output = assertAtomicOutputAbsent(outputPath, label);
  const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  for (const value of forbiddenByteValues.filter(Boolean).map((entry) => String(entry))) {
    if (bytes.includes(Buffer.from(value))) throw new Error(`${label} contains a forbidden private path`);
  }
  const staging = resolve(dirname(output), `.${basename(output)}.staging-${randomUUID()}`);
  let descriptor;
  try {
    descriptor = openSync(staging, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    assertNoSymlinkPathSegments(dirname(output), `${label} parent`);
    try {
      linkSync(staging, output);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error(`${label} appeared during atomic no-replace publication`);
      throw new Error(`${label} atomic no-replace publication is unavailable (${error?.code ?? "unknown_error"})`);
    }
    unlinkSync(staging);
    let directoryDescriptor;
    try {
      directoryDescriptor = openSync(dirname(output), "r");
      fsyncSync(directoryDescriptor);
    } catch (error) {
      if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(error?.code)) throw error;
    } finally {
      if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(staging)) rmSync(staging, { force: true });
  }
  return { bytes, outputPath: output };
}
