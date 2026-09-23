import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { assertSuccessorNativeExecutable } from "./ask-benchmark-prompt-successor-native.mjs";

const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
// These are synthetic header fixtures, never executed and never described as
// genuine signed/loadable Codex images. The real Node image control is separate.
function macho(arch = "arm64") {
  const b = Buffer.alloc(128);
  b.writeUInt32LE(0xfeedfacf, 0); b.writeUInt32LE(arch === "arm64" ? 0x0100000c : 0x01000007, 4);
  b.writeUInt32LE(2, 12); b.writeUInt32LE(1, 16); b.writeUInt32LE(8, 20);
  return b;
}
function elf(arch = "x64") {
  const b = Buffer.alloc(128);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]).copy(b);
  b.writeUInt16LE(3, 16); b.writeUInt16LE(arch === "arm64" ? 183 : 62, 18); b.writeUInt32LE(1, 20);
  b.writeBigUInt64LE(64n, 32); b.writeUInt16LE(64, 52); b.writeUInt16LE(56, 54); b.writeUInt16LE(1, 56);
  return b;
}
function pe(arch = "x64") {
  const b = Buffer.alloc(512);
  b.writeUInt16LE(0x5a4d, 0); b.writeUInt32LE(64, 60); b.writeUInt32LE(0x00004550, 64);
  b.writeUInt16LE(arch === "arm64" ? 0xaa64 : 0x8664, 68); b.writeUInt16LE(1, 70);
  b.writeUInt16LE(112, 84); b.writeUInt16LE(2, 86); b.writeUInt16LE(0x20b, 88);
  return b;
}
function withImage(bytes, callback, { os = "darwin", arch = "arm64" } = {}) {
  const dir = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-native-header-")));
  const path = resolve(dir, os === "win32" ? "codex.exe" : "codex");
  writeFileSync(path, bytes, { flag: "wx", mode: 0o700 });
  try { callback({ path, os, arch, expectedDigest: digest(bytes) }, dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
for (const [os, arch, bytes, format] of [
  ["darwin", "arm64", macho(), "mach_o_64"], ["darwin", "x64", macho("x64"), "mach_o_64"],
  ["linux", "x64", elf(), "elf_64"], ["linux", "arm64", elf("arm64"), "elf_64"],
  ["win32", "x64", pe(), "pe_64"], ["win32", "arm64", pe("arm64"), "pe_64"],
]) test(`synthetic ${os}/${arch} header has explicit format and byte identity only`, () => {
  withImage(bytes, (options) => {
    assert.deepEqual(assertSuccessorNativeExecutable(options), { format, os, arch, bytes: bytes.length, executable_digest: digest(bytes) });
  }, { os, arch });
});
test("a script renamed codex is rejected even with its exact matching hash", () => {
  const script = Buffer.from("#!/usr/bin/env node\n" + "// not a native Codex image\n".repeat(5));
  withImage(script, (options) => assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_FORMAT" }));
});
test("independent native binary replacement fails against the preselected digest", () => {
  withImage(macho(), (options) => {
    const changed = macho(); changed[127] = 1; writeFileSync(options.path, changed);
    assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_DIGEST" });
  });
});
test("native headers for the wrong architecture are not accepted", () => {
  withImage(macho("x64"), (options) => assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_PLATFORM" }));
});
test("a Mach-O library does not satisfy the executable header contract", () => {
  const bytes = macho(); bytes.writeUInt32LE(6, 12);
  withImage(bytes, (options) => assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_FORMAT" }));
});
test("a truncated image is rejected without executing it", () => {
  withImage(Buffer.alloc(8), (options) => assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_FORMAT" }));
});
test("load-command and program-table bounds are checked", () => {
  const m = macho(); m.writeUInt32LE(0xffffffff, 20);
  withImage(m, (options) => assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_FORMAT" }));
  const e = elf(); e.writeBigUInt64LE(0xffffffffffffffffn, 32);
  withImage(e, (options) => assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_FORMAT" }), { os: "linux", arch: "x64" });
});
test("a symbolic-link executable is not a direct file authority", () => {
  withImage(macho(), (options, dir) => {
    const link = resolve(dir, "alias"); symlinkSync(options.path, link);
    assert.throws(() => assertSuccessorNativeExecutable({ ...options, path: link }), { code: "SUCCESSOR_NATIVE_PATH" });
  });
});
test("missing execute permission is refused", () => {
  withImage(macho(), (options) => {
    chmodSync(options.path, 0o600);
    assert.throws(() => assertSuccessorNativeExecutable(options), { code: "SUCCESSOR_NATIVE_PATH" });
  });
});
test("a real local native Node executable is inspected without launching a child", () => {
  const path = realpathSync(process.execPath);
  const bytes = readFileSync(path);
  const result = assertSuccessorNativeExecutable({ path, expectedDigest: digest(bytes), os: process.platform, arch: process.arch });
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.executable_digest, digest(bytes));
});
