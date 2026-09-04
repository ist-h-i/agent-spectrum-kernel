#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES,
  canonicalDigest,
  contentAddressedObjectPath,
  listContentAddressedJson,
  putContentAddressedJson,
  readContentAddressedJson,
  readJsonFileStrict,
  stableCanonicalJson,
  writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const concurrentArtifact = {
  kind: "generic-cas-concurrency-fixture",
  schema_version: "1.0.0",
  value: ["same", "canonical", "content"],
};

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
}

function spawnWriter(storeRoot) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [scriptPath, "--put-concurrently", storeRoot], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => accept({ status, stdout, stderr }));
  });
}

async function runTests() {
  const root = mkdtempSync(resolve(tmpdir(), "ask-content-addressed-store-"));
  const passed = [];
  const test = async (name, action) => {
    await action();
    passed.push(name);
  };

  try {
    await test("canonical digest and key ordering", () => {
      const left = { z: 3, nested: { z: 2, a: 1 }, a: 1 };
      const right = { a: 1, nested: { a: 1, z: 2 }, z: 3 };
      const expectedBytes = '{"a":1,"nested":{"a":1,"z":2},"z":3}';
      const expectedDigest = `sha256:${createHash("sha256").update(expectedBytes).digest("hex")}`;
      assert.equal(stableCanonicalJson(left), expectedBytes);
      assert.equal(stableCanonicalJson(right), expectedBytes);
      assert.equal(canonicalDigest(left), expectedDigest);
      assert.equal(canonicalDigest(right), expectedDigest);
    });

    await test("idempotent put, read, and deterministic list", () => {
      const storeRoot = resolve(root, "idempotent-store");
      const artifacts = [
        { kind: "second", values: [3, 2, 1] },
        { kind: "first", enabled: true },
      ];
      const publications = artifacts.map((artifact) => putContentAddressedJson({ storeRoot, artifact }));
      for (let index = 0; index < artifacts.length; index += 1) {
        const repeated = putContentAddressedJson({ storeRoot, artifact: structuredClone(artifacts[index]) });
        assert.equal(publications[index].created, true);
        assert.equal(repeated.created, false);
        assert.equal(repeated.path, publications[index].path);
        assert.deepEqual(readContentAddressedJson({ storeRoot, digest: publications[index].digest }).value, artifacts[index]);
      }
      const expectedDigests = publications.map(({ digest }) => digest).sort();
      assert.deepEqual(listContentAddressedJson({ storeRoot }).map(({ digest }) => digest), expectedDigests);
    });

    await test("content address layout", () => {
      const storeRoot = resolve(root, "layout-store");
      const artifact = { contract: "generic-address-layout" };
      const { digest, path } = putContentAddressedJson({ storeRoot, artifact });
      const hex = digest.slice("sha256:".length);
      assert.equal(relative(realpathSync(storeRoot), path), `objects/sha256/${hex.slice(0, 2)}/${hex.slice(2)}.json`);
      assert.equal(contentAddressedObjectPath({ storeRoot, digest }), path);
      assert.equal(readFileSync(path, "utf8"), `${stableCanonicalJson(artifact)}\n`);
    });

    await test("provided digest mismatch", () => {
      expectFailure(
        "caller-provided digest must bind the artifact",
        () => putContentAddressedJson({
          storeRoot: resolve(root, "provided-digest-store"),
          artifact: { value: "actual" },
          digest: `sha256:${"0".repeat(64)}`,
        }),
        /digest does not match/iu,
      );
    });

    await test("one MiB bound on publication and read", () => {
      const storeRoot = resolve(root, "bounded-store");
      const artifact = { payload: "x".repeat(DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES) };
      const canonicalBytes = Buffer.byteLength(`${stableCanonicalJson(artifact)}\n`);
      assert.ok(canonicalBytes > DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES);
      expectFailure(
        "default publication bound",
        () => putContentAddressedJson({ storeRoot, artifact }),
        /exceeds the byte limit/iu,
      );
      const published = putContentAddressedJson({ storeRoot, artifact, maximumBytes: canonicalBytes });
      expectFailure(
        "default read bound",
        () => readContentAddressedJson({ storeRoot, digest: published.digest }),
        /bounded non-empty file/iu,
      );
      assert.deepEqual(readContentAddressedJson({ storeRoot, digest: published.digest, maximumBytes: canonicalBytes }).value, artifact);
    });

    await test("noncanonical stored bytes", () => {
      const storeRoot = resolve(root, "noncanonical-store");
      const artifact = { a: 1, b: [2, 3] };
      const { digest, path } = putContentAddressedJson({ storeRoot, artifact });
      writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
      expectFailure(
        "semantic JSON with noncanonical bytes",
        () => readContentAddressedJson({ storeRoot, digest }),
        /not in canonical byte form/iu,
      );
    });

    await test("duplicate JSON key in a stored object", () => {
      const storeRoot = resolve(root, "duplicate-key-store");
      const artifact = { value: 1 };
      const digest = canonicalDigest(artifact);
      const path = contentAddressedObjectPath({ storeRoot, digest });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, '{"value":1,"value":1}\n');
      expectFailure(
        "duplicate key object",
        () => readContentAddressedJson({ storeRoot, digest }),
        /duplicate JSON object key/iu,
      );
    });

    await test("tampered bytes at an existing address", () => {
      const storeRoot = resolve(root, "tampered-store");
      const original = { value: "original" };
      const { digest, path } = putContentAddressedJson({ storeRoot, artifact: original });
      writeFileSync(path, `${stableCanonicalJson({ value: "substituted" })}\n`);
      expectFailure(
        "canonical substitution at the old address",
        () => readContentAddressedJson({ storeRoot, digest }),
        /digest mismatch|tampered/iu,
      );
    });

    await test("invalid prefix entry", () => {
      const storeRoot = resolve(root, "invalid-prefix-store");
      putContentAddressedJson({ storeRoot, artifact: { value: "valid" } });
      mkdirSync(resolve(storeRoot, "objects/sha256/not-a-prefix"));
      expectFailure(
        "invalid prefix",
        () => listContentAddressedJson({ storeRoot }),
        /invalid prefix entry/iu,
      );
    });

    await test("invalid object entry", () => {
      const storeRoot = resolve(root, "invalid-object-store");
      const { path } = putContentAddressedJson({ storeRoot, artifact: { value: "valid" } });
      writeFileSync(resolve(dirname(path), "unexpected.json"), "{}\n");
      expectFailure(
        "invalid object",
        () => listContentAddressedJson({ storeRoot }),
        /invalid object entry/iu,
      );
    });

    await test("store root symlink refusal", () => {
      const target = resolve(root, "store-symlink-target");
      const storeRoot = resolve(root, "store-symlink");
      mkdirSync(target);
      symlinkSync(target, storeRoot);
      expectFailure(
        "symlinked store root",
        () => putContentAddressedJson({ storeRoot, artifact: { value: "blocked" } }),
        /symlink/iu,
      );
    });

    await test("object root symlink refusal", () => {
      const storeRoot = resolve(root, "object-root-symlink-store");
      const target = resolve(root, "object-root-symlink-target");
      mkdirSync(resolve(storeRoot, "objects"), { recursive: true });
      mkdirSync(target);
      symlinkSync(target, resolve(storeRoot, "objects/sha256"));
      expectFailure(
        "symlinked object root",
        () => putContentAddressedJson({ storeRoot, artifact: { value: "blocked" } }),
        /symlink/iu,
      );
    });

    await test("intermediate prefix symlink refusal", () => {
      const storeRoot = resolve(root, "prefix-symlink-store");
      const target = resolve(root, "prefix-symlink-target");
      const artifact = { value: "blocked" };
      const prefix = canonicalDigest(artifact).slice("sha256:".length, "sha256:".length + 2);
      mkdirSync(resolve(storeRoot, "objects/sha256"), { recursive: true });
      mkdirSync(target);
      symlinkSync(target, resolve(storeRoot, "objects/sha256", prefix));
      expectFailure(
        "symlinked address prefix",
        () => putContentAddressedJson({ storeRoot, artifact }),
        /symlink/iu,
      );
    });

    await test("object symlink refusal", () => {
      const storeRoot = resolve(root, "object-symlink-store");
      const artifact = { value: "blocked" };
      const digest = canonicalDigest(artifact);
      const path = contentAddressedObjectPath({ storeRoot, digest });
      const target = resolve(root, "object-symlink-target.json");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(target, `${stableCanonicalJson(artifact)}\n`);
      symlinkSync(target, path);
      expectFailure(
        "symlinked object",
        () => putContentAddressedJson({ storeRoot, artifact }),
        /symlink|not a regular file/iu,
      );
    });

    await test("atomic no-replace concurrent same-content writers", async () => {
      const storeRoot = resolve(root, "concurrent-store");
      const results = await Promise.all(Array.from({ length: 8 }, () => spawnWriter(storeRoot)));
      for (const result of results) assert.equal(result.status, 0, result.stderr || result.stdout);
      const publications = results.map(({ stdout }) => JSON.parse(stdout));
      assert.equal(publications.filter(({ created }) => created).length, 1);
      assert.equal(publications.filter(({ created }) => !created).length, 7);
      const digest = canonicalDigest(concurrentArtifact);
      assert.deepEqual(readContentAddressedJson({ storeRoot, digest }).value, concurrentArtifact);
    });

    await test("strict stable JSON input read", () => {
      const inputPath = resolve(root, "strict-input.json");
      const value = { z: 2, a: [true, null, 3] };
      writeFileSync(inputPath, `${JSON.stringify(value, null, 2)}\n`);
      assert.deepEqual(readJsonFileStrict(inputPath, "strict input"), value);

      const duplicatePath = resolve(root, "strict-input-duplicate.json");
      writeFileSync(duplicatePath, '{"value":1,"value":2}\n');
      expectFailure(
        "strict input duplicate key",
        () => readJsonFileStrict(duplicatePath, "strict input"),
        /duplicate JSON object key/iu,
      );

      const symlinkPath = resolve(root, "strict-input-symlink.json");
      symlinkSync(inputPath, symlinkPath);
      expectFailure(
        "strict input symlink",
        () => readJsonFileStrict(symlinkPath, "strict input"),
        /symlink/iu,
      );
    });

    await test("canonical no-replace output", () => {
      const outputPath = resolve(root, "canonical-output/nested/output.json");
      const artifact = { z: 2, a: 1 };
      const first = writeCanonicalJsonNoReplace({ outputPath, artifact, label: "canonical fixture output" });
      const repeated = writeCanonicalJsonNoReplace({ outputPath, artifact: structuredClone(artifact), label: "canonical fixture output" });
      assert.equal(first.created, true);
      assert.equal(repeated.created, false);
      assert.equal(readFileSync(outputPath, "utf8"), '{"a":1,"z":2}\n');
      expectFailure(
        "different bytes cannot replace output",
        () => writeCanonicalJsonNoReplace({ outputPath, artifact: { a: 1, z: 3 }, label: "canonical fixture output" }),
        /conflicts with the content address/iu,
      );

      const symlinkOutput = resolve(root, "canonical-output-symlink.json");
      symlinkSync(outputPath, symlinkOutput);
      expectFailure(
        "canonical output symlink",
        () => writeCanonicalJsonNoReplace({ outputPath: symlinkOutput, artifact, label: "canonical fixture output" }),
        /symlink/iu,
      );
    });

    console.log(`content-addressed store: ${passed.length} cases passed`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--put-concurrently") {
  try {
    const publication = putContentAddressedJson({ storeRoot: process.argv[3], artifact: concurrentArtifact });
    process.stdout.write(`${JSON.stringify({ created: publication.created, digest: publication.digest })}\n`);
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
} else {
  await runTests();
}
