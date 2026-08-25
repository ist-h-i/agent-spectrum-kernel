#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyAssetRegistry,
  exportAssetRegistryReference,
  listAssets,
  registerAsset,
  resolveAsset,
  verifyAssetRegistry,
} from "./asset-registry.mjs";
import {
  listContentAddressedJson,
  readJsonFileStrict,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";

const REPOSITORY_ID = "github.com/ist-h-i/agent-spectrum-kernel";
const SOURCE_REVISION = "656edf1ac611890a3ae5a93a90e9076f50ee2488";
const REGISTRY_ID = "ask-local-assets";
const SCOPE_ID = "agent-spectrum-kernel";
const repositoryRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(repositoryRoot, "docs/fixtures/asset-registry");
const fixtureStoreRoot = resolve(fixtureRoot, "store");
const fixtureReferencePath = resolve(fixtureRoot, "reference.json");

const samples = [
  {
    assetType: "skill",
    stableId: "ask.skill.test-first-verification",
    version: `git:${SOURCE_REVISION}`,
    path: "skills/test-first-verification/SKILL.md",
    mediaType: "text/markdown; charset=utf-8",
    rawDigest: "sha256:6ab90c0cc61752132f25bb579a35b98e0e9b2ed1a8b36dc2a82db715b9e44684",
  },
  {
    assetType: "prompt",
    stableId: "ask.prompt-template.codex.skill-verify",
    version: `git:${SOURCE_REVISION}`,
    path: "adapters/codex/prompts/skill-verify.md",
    mediaType: "text/markdown; charset=utf-8",
    rawDigest: "sha256:0fb394cd590cfd00215e581d3d159a31967437f039156f5e5e3d6b4f1b157b82",
  },
  {
    assetType: "evaluator_reference",
    stableId: "ask.evaluator-reference.mn-build-option-update",
    version: `git:${SOURCE_REVISION}`,
    path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-reference.json",
    mediaType: "application/json",
    rawDigest: "sha256:bc701eb717206d68fed24c037106ae72d3f7d52b63dfcf71a8d767d599f35874",
  },
];

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exactAssetRef(resolved) {
  return {
    asset_type: resolved.asset_type,
    stable_id: resolved.stable_id,
    version: resolved.version,
    record_digest: resolved.record_digest,
    content_digest: resolved.content_digest,
  };
}

function descriptorFor(sample, dependencies = []) {
  const typeExtension = sample.assetType === "skill"
    ? { kind: "skill", entrypoint: sample.path }
    : sample.assetType === "prompt"
      ? {
          kind: "prompt_template",
          adapter: "codex",
          entrypoint: sample.path,
          rendered_runtime_content: false,
        }
      : {
          kind: "public_evaluator_reference",
          fixture_id: "mn-build-option-update",
          entrypoint: sample.path,
          private_evaluator_content_included: false,
        };

  return {
    schema_version: "1.0.0",
    asset_type: sample.assetType,
    stable_id: sample.stableId,
    version: sample.version,
    version_scheme: "git_revision",
    type_extension: typeExtension,
    content: {
      package_format: "canonical_json_base64_files",
      files: [{
        path: sample.path,
        media_type: sample.mediaType,
        raw_digest: sample.rawDigest,
      }],
    },
    source: {
      kind: "git_repository",
      repository_id: REPOSITORY_ID,
      revision: SOURCE_REVISION,
    },
    provenance: {
      origin: "repository_file",
      license: {
        status: "unknown",
        spdx_id: null,
        evidence_ref: null,
      },
      owner: {
        status: "unknown",
        owner_id: null,
        evidence_ref: null,
      },
    },
    derivation: { kind: "root", parent: null, delta: null },
    dependencies,
    compatibility: {
      asset_contract_versions: ["1.0.0"],
      runtime_profiles: [],
    },
    applicability: {
      included_scopes: ["local_repository"],
      excluded_scopes: ["automatic_portfolio_activation"],
      required_capabilities: [],
      notes: [],
    },
    permissions_and_effects: {
      status: "declared_by_consumer",
      permission_refs: [],
      effect_refs: [],
    },
    safety: {
      status: "not_evaluated",
      constraint_refs: [],
    },
    mechanism_and_evidence: {
      status: "not_evaluated",
      mechanism_refs: [],
      evidence_refs: [],
    },
    evaluation_history: {
      status: "not_evaluated",
      evidence_refs: [],
      cost: null,
    },
    maintenance: {
      stale_status: "not_assessed",
      regression_refs: [],
      retirement: null,
      rollback: {
        status: "requires_explicit_authority",
        authority_ref: null,
      },
    },
  };
}

function verifySourceRevision() {
  for (const sample of samples) {
    const workingBytes = readFileSync(resolve(repositoryRoot, sample.path));
    assert.equal(rawDigest(workingBytes), sample.rawDigest, `${sample.path} working bytes drifted`);

    const revision = spawnSync("git", ["show", `${SOURCE_REVISION}:${sample.path}`], {
      cwd: repositoryRoot,
      encoding: null,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(revision.status, 0, `cannot read ${sample.path} at ${SOURCE_REVISION}: ${revision.stderr.toString("utf8")}`);
    assert.equal(rawDigest(revision.stdout), sample.rawDigest, `${sample.path} does not match its declared source revision`);
    assert.deepEqual(workingBytes, revision.stdout, `${sample.path} working bytes differ from the declared source revision`);
  }
}

function generateFixture() {
  verifySourceRevision();
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ask-asset-registry-samples-"));
  const storeRoot = resolve(temporaryRoot, "store");
  mkdirSync(storeRoot, { recursive: true });

  const empty = createEmptyAssetRegistry({
    storeRoot,
    registryId: REGISTRY_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const skillRegistration = registerAsset({
    storeRoot,
    sourceRoot: repositoryRoot,
    predecessorSnapshotDigest: empty.snapshot_digest,
    descriptor: descriptorFor(samples[0]),
  });
  const skill = resolveAsset({
    storeRoot,
    snapshotDigest: skillRegistration.snapshot_digest,
    stableId: samples[0].stableId,
    version: samples[0].version,
    state: "candidate",
  });
  const promptRegistration = registerAsset({
    storeRoot,
    sourceRoot: repositoryRoot,
    predecessorSnapshotDigest: skillRegistration.snapshot_digest,
    descriptor: descriptorFor(samples[1], [exactAssetRef(skill)]),
  });
  const evaluatorRegistration = registerAsset({
    storeRoot,
    sourceRoot: repositoryRoot,
    predecessorSnapshotDigest: promptRegistration.snapshot_digest,
    descriptor: descriptorFor(samples[2]),
  });

  const snapshotDigest = evaluatorRegistration.snapshot_digest;
  const verified = verifyAssetRegistry({ storeRoot, snapshotDigest });
  const listed = listAssets({ storeRoot, snapshotDigest });
  const reference = exportAssetRegistryReference({ storeRoot, snapshotDigest });
  verifyGeneratedView({ storeRoot, snapshotDigest, verified, listed, reference });
  return { temporaryRoot, storeRoot, snapshotDigest, reference };
}

function verifyGeneratedView({ storeRoot, snapshotDigest, verified, listed, reference }) {
  assert.equal(verified.snapshot_digest, snapshotDigest);
  assert.equal(verified.assets.length, samples.length);
  assert.equal(listed.length, samples.length);
  assert.deepEqual(
    listed.map((entry) => entry.stable_id),
    [...samples.map((sample) => sample.stableId)].sort(),
    "registry list must contain the three samples in deterministic order",
  );
  assert.deepEqual(new Set(listed.map((entry) => entry.state)), new Set(["candidate"]));

  for (const sample of samples) {
    const resolved = resolveAsset({
      storeRoot,
      snapshotDigest,
      stableId: sample.stableId,
      version: sample.version,
      state: "candidate",
    });
    assert.equal(resolved.asset_type, sample.assetType);
    assert.equal(resolved.content.files.length, 1);
    const [file] = resolved.content.files;
    assert.equal(file.path, sample.path);
    assert.equal(file.raw_digest, sample.rawDigest);
    const decoded = Buffer.from(file.bytes_base64, "base64");
    assert.equal(decoded.length, file.byte_length);
    assert.equal(rawDigest(decoded), sample.rawDigest);
  }

  const prompt = resolveAsset({
    storeRoot,
    snapshotDigest,
    stableId: samples[1].stableId,
    version: samples[1].version,
    state: "candidate",
  });
  assert.deepEqual(prompt.dependency_closure.map(exactAssetRef), [exactAssetRef(resolveAsset({
    storeRoot,
    snapshotDigest,
    stableId: samples[0].stableId,
    version: samples[0].version,
    state: "candidate",
  }))]);

  assert.equal(reference.snapshot_digest, snapshotDigest);
  const serializedReference = stableCanonicalJson(reference);
  assert.equal(serializedReference.includes(repositoryRoot), false, "reference must not contain an absolute repository path");
  assert.equal(serializedReference.includes(storeRoot), false, "reference must not contain an absolute store path");
  assert.equal(serializedReference.includes('"latest"'), false, "reference must not contain a mutable latest selector");
  assert.equal(serializedReference.includes("authority_context"), false, "candidate reference must not contain lifecycle authority context");
  assertPortableReference(reference);
}

function assertPortableReference(value, location = "reference") {
  if (typeof value === "string") {
    assert.equal(isAbsolute(value), false, `${location} contains an absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPortableReference(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assert.doesNotMatch(key, /(?:^|_)latest(?:_|$)/iu, `${location}.${key} is a mutable latest selector`);
      assert.doesNotMatch(key, /(?:authority_context|context_authority)/iu, `${location}.${key} carries lifecycle context authority`);
      assertPortableReference(entry, `${location}.${key}`);
    }
  }
}

function listTree(root) {
  const result = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(current, entry.name);
      const relativePath = relative(root, path).split(sep).join("/");
      assert.equal(entry.isSymbolicLink(), false, `fixture symlink is prohibited: ${relativePath}`);
      if (entry.isDirectory()) visit(path);
      else {
        assert.equal(entry.isFile(), true, `unsupported fixture entry: ${relativePath}`);
        result.push(relativePath);
      }
    }
  }
  visit(root);
  return result;
}

function expectedTree(generated) {
  const files = listTree(generated.storeRoot);
  const objectFiles = listContentAddressedJson({ storeRoot: generated.storeRoot })
    .map(({ digest }) => {
      const hex = digest.slice("sha256:".length);
      return `objects/sha256/${hex.slice(0, 2)}/${hex.slice(2)}.json`;
    })
    .sort();
  assert.deepEqual(
    files,
    objectFiles,
    "temporary store contains files outside the shared CAS object set",
  );
  return [...files.map((path) => `store/${path}`), "reference.json"].sort();
}

function referenceBytes(reference) {
  return Buffer.from(`${JSON.stringify(reference, null, 2)}\n`, "utf8");
}

function writeFixture(generated) {
  const expectedFiles = expectedTree(generated);
  rmSync(fixtureRoot, { recursive: true, force: true });
  for (const relativePath of expectedFiles) {
    const target = resolve(fixtureRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    if (relativePath === "reference.json") writeFileSync(target, referenceBytes(generated.reference));
    else copyFileSync(resolve(generated.storeRoot, relativePath.slice("store/".length)), target);
  }
  verifyCheckedInFixture(generated);
}

function verifyCheckedInFixture(generated) {
  assert.equal(existsSync(fixtureRoot), true, `missing checked-in fixture: ${fixtureRoot}`);
  assert.equal(lstatSync(fixtureRoot).isDirectory(), true, `fixture root is not a directory: ${fixtureRoot}`);
  const expectedFiles = expectedTree(generated);
  const actualFiles = listTree(fixtureRoot);
  assert.deepEqual(actualFiles, expectedFiles, "checked-in fixture has missing or extra paths");

  for (const relativePath of expectedFiles) {
    const expectedBytes = relativePath === "reference.json"
      ? referenceBytes(generated.reference)
      : readFileSync(resolve(generated.storeRoot, relativePath.slice("store/".length)));
    assert.deepEqual(readFileSync(resolve(fixtureRoot, relativePath)), expectedBytes, `${relativePath} bytes are stale`);
  }

  const checkedReference = readJsonFileStrict(fixtureReferencePath, "Asset registry fixture reference");
  assert.deepEqual(checkedReference, generated.reference, "checked-in reference differs from fresh export");
  const checkedVerified = verifyAssetRegistry({
    storeRoot: fixtureStoreRoot,
    snapshotDigest: checkedReference.snapshot_digest,
  });
  const checkedList = listAssets({
    storeRoot: fixtureStoreRoot,
    snapshotDigest: checkedReference.snapshot_digest,
  });
  verifyGeneratedView({
    storeRoot: fixtureStoreRoot,
    snapshotDigest: checkedReference.snapshot_digest,
    verified: checkedVerified,
    listed: checkedList,
    reference: exportAssetRegistryReference({
      storeRoot: fixtureStoreRoot,
      snapshotDigest: checkedReference.snapshot_digest,
    }),
  });
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--write") return "write";
  if (argv.length === 1 && argv[0] === "--check") return "check";
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return "help";
  throw new Error("Usage: node scripts/asset-registry-samples.mjs --write | --check");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let generated;
  try {
    const mode = parseArgs(process.argv.slice(2));
    if (mode === "help") {
      console.log("Usage: node scripts/asset-registry-samples.mjs --write | --check");
    } else {
      generated = generateFixture();
      if (mode === "write") writeFixture(generated);
      else verifyCheckedInFixture(generated);
      const objectCount = listContentAddressedJson({ storeRoot: generated.storeRoot }).length;
      console.log(`Asset registry sample fixture ${mode === "write" ? "written" : "is current"}: ${objectCount} objects, snapshot ${generated.snapshotDigest}`);
    }
  } catch (error) {
    console.error(`asset-registry-samples failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (generated?.temporaryRoot) rmSync(generated.temporaryRoot, { recursive: true, force: true });
  }
}
