import { createHash } from "node:crypto";
import { constants, openSync, closeSync, fstatSync, lstatSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, parse, resolve, sep } from "node:path";

const MAX_IMAGE_BYTES = 512 * 1024 * 1024;
const MAX_PE_HEADER_OFFSET = 1024 * 1024;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;

function reject(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}
function rejectLinks(path) {
  let cursor = parse(path).root;
  for (const part of path.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) reject("SUCCESSOR_NATIVE_PATH", "symbolic links are not an executable authority");
  }
}
function sameFile(a, b) {
  return ["dev", "ino", "size", "mode", "nlink", "mtimeNs", "ctimeNs"].every((key) => a[key] === b[key]);
}
function readAt(fd, size, offset, length) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > size) {
    reject("SUCCESSOR_NATIVE_FORMAT", "truncated executable header");
  }
  const bytes = Buffer.alloc(length);
  let position = 0;
  while (position < length) {
    const count = readSync(fd, bytes, position, length - position, offset + position);
    if (count === 0) reject("SUCCESSOR_NATIVE_CHANGED", "file shortened during inspection");
    position += count;
  }
  return bytes;
}

// Header classification rejects scripts/launchers. It is not code signing,
// a dependency-closure proof, or a complete OS loader implementation.
// Mach-O layout: apple-oss-distributions/xnu EXTERNAL_HEADERS/mach-o/loader.h.
// ELF layout: Linux include/uapi/linux/elf.h. PE layout: Microsoft PE format.
function classify(fd, size, os, arch) {
  if (!["arm64", "x64"].includes(arch)) reject("SUCCESSOR_NATIVE_PLATFORM", "unimplemented CPU architecture");
  const header = readAt(fd, size, 0, 64);
  if (os === "darwin") {
    // Deliberately accept thin 64-bit images only; universal images need a
    // separate reviewed slice rule, not an assumption about their first slice.
    const magic = header.readUInt32LE(0);
    if (magic !== 0xfeedfacf) reject("SUCCESSOR_NATIVE_FORMAT", "expected a thin 64-bit Mach-O executable, not a script or wrapper");
    const cpu = arch === "arm64" ? 0x0100000c : 0x01000007;
    if (header.readUInt32LE(4) !== cpu) reject("SUCCESSOR_NATIVE_PLATFORM", "Mach-O CPU does not match the declared runtime");
    const count = header.readUInt32LE(16);
    const bytes = header.readUInt32LE(20);
    if (header.readUInt32LE(12) !== 2 || count === 0 || bytes < count * 8 || 32 + bytes > size) {
      reject("SUCCESSOR_NATIVE_FORMAT", "Mach-O executable/load-command header is invalid");
    }
    return "mach_o_64";
  }
  if (os === "linux") {
    if (!header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
      || header[4] !== 2 || header[5] !== 1 || header[6] !== 1) {
      reject("SUCCESSOR_NATIVE_FORMAT", "expected a little-endian ELF64 executable, not a script or wrapper");
    }
    if (header.readUInt16LE(18) !== (arch === "arm64" ? 183 : 62)) reject("SUCCESSOR_NATIVE_PLATFORM", "ELF CPU does not match the declared runtime");
    const type = header.readUInt16LE(16);
    const offset = header.readBigUInt64LE(32);
    const entrySize = header.readUInt16LE(54);
    const count = header.readUInt16LE(56);
    if (![2, 3].includes(type) || header.readUInt32LE(20) !== 1 || header.readUInt16LE(52) !== 64
      || entrySize !== 56 || count === 0 || offset < 64n || offset + BigInt(entrySize * count) > BigInt(size)) {
      reject("SUCCESSOR_NATIVE_FORMAT", "ELF executable/program-header table is invalid");
    }
    return "elf_64";
  }
  if (os === "win32") {
    if (header.readUInt16LE(0) !== 0x5a4d) reject("SUCCESSOR_NATIVE_FORMAT", "expected a PE executable");
    const offset = header.readUInt32LE(60);
    if (offset < 64 || offset > MAX_PE_HEADER_OFFSET) reject("SUCCESSOR_NATIVE_FORMAT", "PE header offset is outside the supported bound");
    const pe = readAt(fd, size, offset, 26);
    if (pe.readUInt32LE(0) !== 0x00004550) reject("SUCCESSOR_NATIVE_FORMAT", "invalid PE signature");
    if (pe.readUInt16LE(4) !== (arch === "arm64" ? 0xaa64 : 0x8664)) reject("SUCCESSOR_NATIVE_PLATFORM", "PE CPU does not match the declared runtime");
    const count = pe.readUInt16LE(6);
    const optionalBytes = pe.readUInt16LE(20);
    const flags = pe.readUInt16LE(22);
    if (!(flags & 2) || (flags & 0x2000) || count === 0 || optionalBytes < 112 || pe.readUInt16LE(24) !== 0x20b
      || offset + 24 + optionalBytes + count * 40 > size) {
      reject("SUCCESSOR_NATIVE_FORMAT", "PE executable/section header is invalid");
    }
    return "pe_64";
  }
  reject("SUCCESSOR_NATIVE_PLATFORM", "unimplemented operating system");
}

/**
 * Observe format, architecture and SHA-256 from the same open regular file.
 * The runner already rechecks the exact executable digest before/after probes
 * and native execution. No version probe or child process is invoked here.
 * A native image is trusted only by the separately fixed expectedDigest, not
 * by its basename, its version output or its native format alone.
 */
export function assertSuccessorNativeExecutable({ path, expectedDigest, os, arch }) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) reject("SUCCESSOR_NATIVE_PATH", "expected an absolute canonical path");
  if (!DIGEST.test(expectedDigest ?? "")) reject("SUCCESSOR_NATIVE_DIGEST", "expected digest is missing or malformed");
  rejectLinks(path);
  if (realpathSync(path) !== path) reject("SUCCESSOR_NATIVE_PATH", "executable path is not canonical");
  const pathBefore = lstatSync(path, { bigint: true });
  if (!pathBefore.isFile()) reject("SUCCESSOR_NATIVE_PATH", "executable must be a regular file");
  if (pathBefore.size < 64n || pathBefore.size > BigInt(MAX_IMAGE_BYTES)) reject("SUCCESSOR_NATIVE_FORMAT", "executable size is outside the supported bound");
  if (os !== "win32" && !(pathBefore.mode & 0o111n)) reject("SUCCESSOR_NATIVE_PATH", "executable mode is missing");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || !sameFile(pathBefore, before)) reject("SUCCESSOR_NATIVE_CHANGED", "executable changed while opening");
    const size = Number(before.size);
    const format = classify(fd, size, os, arch);
    const hash = createHash("sha256");
    const chunk = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < size) {
      const count = readSync(fd, chunk, 0, Math.min(chunk.length, size - offset), offset);
      if (count === 0) reject("SUCCESSOR_NATIVE_CHANGED", "file shortened during hashing");
      hash.update(chunk.subarray(0, count));
      offset += count;
    }
    const digest = `sha256:${hash.digest("hex")}`;
    const after = fstatSync(fd, { bigint: true });
    rejectLinks(path);
    const pathAfter = lstatSync(path, { bigint: true });
    if (!sameFile(before, after) || !sameFile(after, pathAfter) || realpathSync(path) !== path) {
      reject("SUCCESSOR_NATIVE_CHANGED", "executable changed during inspection");
    }
    if (digest !== expectedDigest) reject("SUCCESSOR_NATIVE_DIGEST", "native image differs from the fixed digest");
    return Object.freeze({ format, os, arch, bytes: size, executable_digest: digest });
  } finally {
    closeSync(fd);
  }
}
