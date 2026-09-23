#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSetupSourceIdentity,
  canonicalJson,
  collectPathEntries,
  copyTargetForSimulation,
  jsonDigest,
  validateSetupPaths,
} from "./ask-setup-inputs.mjs";

function write(root, path, text = "fixture\n") {
  const destination = resolve(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, text);
}

// Independent oracle: all fixture bytes, not setup's filtered snapshot.
export function auditFixtureTree(root) {
  const entries = [];
  const visit = (path) => {
    const stat = lstatSync(path);
    const name = relative(root, path);
    if (stat.isSymbolicLink()) entries.push([name, "symlink", readlinkSync(path)]);
    else if (stat.isDirectory()) {
      entries.push([name, "directory"]);
      for (const child of readdirSync(path).sort()) visit(resolve(path, child));
    } else entries.push([name, "file", readFileSync(path).toString("base64")]);
  };
  visit(root);
  return entries;
}

export function runSetupInputTests() {
  let count = 0;
  const test = (name, check) => {
    const root = mkdtempSync(resolve(tmpdir(), "ask-setup-input-test-"));
    try {
      check(root);
      count += 1;
      console.log(`PASS setup-inputs: ${name}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  test("ordinary copies are isolated and target bytes are unchanged", (root) => {
    const target = resolve(root, "target");
    const staging = resolve(root, "staging");
    write(target, "AGENTS.md", "project rules\n");
    write(target, "docs/local.md", "local content\n");
    write(target, "unselected.txt", "not part of setup\n");
    const before = auditFixtureTree(target);
    copyTargetForSimulation(target, staging, ["AGENTS.md", "docs", "docs/local.md", "missing.txt"]);
    assert.equal(readFileSync(resolve(staging, "docs/local.md"), "utf8"), "local content\n");
    write(staging, "AGENTS.md", "simulated installer write\n");
    assert.deepEqual(auditFixtureTree(target), before);
    assert.equal(existsSync(resolve(staging, "unselected.txt")), false);
  });

  const links = [
    ["absolute internal file", (target) => { write(target, "rules.md"); symlinkSync(resolve(target, "rules.md"), resolve(target, "AGENTS.md")); }, ["AGENTS.md"]],
    ["relative internal file", (target) => { write(target, "rules.md"); symlinkSync("rules.md", resolve(target, "AGENTS.md")); }, ["AGENTS.md"]],
    ["link chain", (target) => { write(target, "rules.md"); symlinkSync("rules.md", resolve(target, "middle")); symlinkSync("middle", resolve(target, "AGENTS.md")); }, ["AGENTS.md"]],
    ["dangling link", (target) => symlinkSync("missing.md", resolve(target, "AGENTS.md")), ["AGENTS.md"]],
    ["link cycle", (target) => { symlinkSync("second", resolve(target, "AGENTS.md")); symlinkSync("AGENTS.md", resolve(target, "second")); }, ["AGENTS.md"]],
    ["internal directory ancestor", (target) => { mkdirSync(resolve(target, "local")); symlinkSync("local", resolve(target, "skills")); }, ["skills/new/SKILL.md"]],
    ["dangling directory ancestor", (target) => symlinkSync("missing", resolve(target, "skills")), ["skills/new/SKILL.md"]],
    ["nested directory entry", (target) => { write(target, "docs/local.md"); symlinkSync("local.md", resolve(target, "docs/link.md")); }, ["docs"]],
    ["external file", (target, root) => { write(root, "external.md"); symlinkSync(resolve(root, "external.md"), resolve(target, "AGENTS.md")); }, ["AGENTS.md"]],
    ["external directory ancestor", (target, root) => { mkdirSync(resolve(root, "external")); symlinkSync(resolve(root, "external"), resolve(target, "skills")); }, ["skills/new/SKILL.md"]],
  ];
  for (const [name, setup, paths] of links) test(`reject ${name} before copying`, (root) => {
    const target = resolve(root, "target");
    const staging = resolve(root, "staging");
    mkdirSync(target);
    setup(target, root);
    const before = auditFixtureTree(root);
    assert.throws(() => copyTargetForSimulation(target, staging, paths), /Symlink is not supported/);
    assert.equal(existsSync(staging), false);
    assert.deepEqual(auditFixtureTree(root), before);
  });

  for (const path of ["../outside", "/absolute", "nested/../../outside", "nested\\file", ".", ""]) {
    test(`reject invalid relative path ${JSON.stringify(path)}`, (root) => {
      const before = auditFixtureTree(root);
      assert.throws(() => validateSetupPaths(root, [path]), /repository-relative|escapes repository/);
      assert.deepEqual(auditFixtureTree(root), before);
    });
  }

  test("reject staging under a symlink to the real target before mkdir", (root) => {
    const target = resolve(root, "target");
    write(target, "AGENTS.md");
    symlinkSync(target, resolve(root, "alias"));
    const before = auditFixtureTree(root);
    assert.throws(() => copyTargetForSimulation(target, resolve(root, "alias/new"), ["AGENTS.md"]), /Staging must be outside/);
    assert.deepEqual(auditFixtureTree(root), before);
  });

  test("reject a pre-existing staging link before an installer can use it", (root) => {
    const target = resolve(root, "target");
    const staging = resolve(root, "staging");
    write(target, "AGENTS.md");
    mkdirSync(staging);
    symlinkSync(resolve(target, "AGENTS.md"), resolve(staging, "AGENTS.md"));
    const before = auditFixtureTree(root);
    assert.throws(() => copyTargetForSimulation(target, staging, ["AGENTS.md"]), /Symlink is not supported/);
    assert.deepEqual(auditFixtureTree(root), before);
  });

  test("recursive snapshot paths and digest do not depend on cwd", (root) => {
    const target = resolve(root, "target");
    write(target, ".github/workflows/nested/ci.yml", "name: test\n");
    const cwdA = resolve(root, "a");
    const cwdB = resolve(root, "b");
    mkdirSync(cwdA);
    mkdirSync(cwdB);
    const initialCwd = process.cwd();
    try {
      process.chdir(cwdA);
      const first = collectPathEntries(target, ".github/workflows");
      process.chdir(cwdB);
      const second = collectPathEntries(target, ".github/workflows");
      assert.deepEqual(first, second);
      assert.equal(jsonDigest(first), jsonDigest(second));
      assert.ok(first.every((entry) => !isAbsolute(entry.path)));
      assert.ok(first.some((entry) => entry.path === ".github/workflows/nested/ci.yml"));
    } finally {
      process.chdir(initialCwd);
    }
  });

  test("secret omission is checked on a directory actually in the snapshot", (root) => {
    write(root, "scripts/.env", "SECRET=first\n");
    write(root, "scripts/regular.mjs", "ordinary content\n");
    const first = collectPathEntries(root, "scripts");
    write(root, "scripts/.env", "SECRET=second\n");
    assert.deepEqual(collectPathEntries(root, "scripts"), first);
    assert.deepEqual(first.find((entry) => entry.path === "scripts/.env"), { path: "scripts/.env", type: "file", content: "omitted" });
    write(root, "scripts/regular.mjs", "changed\n");
    assert.notEqual(jsonDigest(collectPathEntries(root, "scripts")), jsonDigest(first));
  });

  const sourceFiles = [
    "manifest.json", "scripts/install-kernel.mjs", "scripts/install-codex-adapter.mjs",
    "scripts/install-claude-adapter.mjs", "scripts/installer-lifecycle.mjs", "scripts/ask-doctor.mjs",
    "scripts/ask-setup.mjs", "scripts/ask-setup-inputs.mjs", "schemas/adoption-plan.schema.json",
    "schemas/adoption-apply-result.schema.json",
    "docs/fixtures/adapter-runtime-profiles.json", "AGENTS.md", "CUSTOM_INSTRUCTIONS.md",
    "schemas/review-signal-gate-map.json", "docs/immutable.md", "skills/example/SKILL.md",
    "scripts/indirect-renderer.mjs", "adapters/example/prompt.md", "schemas/renderer.json",
  ];
  const options = {
    selectedSkills: ["example"],
    coreAssets: ["docs/immutable.md"],
    rendererInputs: {
      canonical: [{ path: "schemas/renderer.json" }],
      adapter_owned: [{ path: "scripts/indirect-renderer.mjs" }, { path: "adapters/example/prompt.md" }],
    },
    revision: "a".repeat(40),
  };
  const sourceFixture = (root) => {
    for (const file of sourceFiles) write(root, file, file.endsWith(".json") ? "{}\n" : "source\n");
  };
  for (const path of sourceFiles) test(`source drift changes identity: ${path}`, (root) => {
    sourceFixture(root);
    const first = buildSetupSourceIdentity(root, options);
    write(root, path, `${readFileSync(resolve(root, path), "utf8")}\n`);
    assert.notEqual(buildSetupSourceIdentity(root, options).identity_digest, first.identity_digest);
  });
  test("source revision and newly declared renderer inputs are bound", (root) => {
    sourceFixture(root);
    const first = buildSetupSourceIdentity(root, options);
    assert.notEqual(buildSetupSourceIdentity(root, { ...options, revision: "b".repeat(40) }).identity_digest, first.identity_digest);
    write(root, "adapters/example/extra.md");
    const rendererInputs = { ...options.rendererInputs, extra: [{ path: "adapters/example/extra.md" }] };
    assert.notEqual(buildSetupSourceIdentity(root, { ...options, rendererInputs }).identity_digest, first.identity_digest);
    assert.equal(canonicalJson(first), canonicalJson(buildSetupSourceIdentity(root, { ...options, coreAssets: ["docs/immutable.md", "docs/immutable.md"] })));
  });
  test("transitive local modules and rendered projection changes are bound", (root) => {
    sourceFixture(root);
    write(root, "scripts/transitive.mjs", "export const version = 1;\n");
    const first = buildSetupSourceIdentity(root, options);
    write(root, "scripts/transitive.mjs", "export const version = 2;\n");
    assert.notEqual(buildSetupSourceIdentity(root, options).identity_digest, first.identity_digest);
    const projection = { compactProfiles: [{ canonical_asset_refs: [{ content_digest: "first" }] }] };
    const projected = buildSetupSourceIdentity(root, { ...options, projection });
    projection.compactProfiles[0].canonical_asset_refs[0].content_digest = "second";
    assert.notEqual(buildSetupSourceIdentity(root, { ...options, projection }).identity_digest, projected.identity_digest);
  });
  test("missing or linked source input fails closed", (root) => {
    sourceFixture(root);
    rmSync(resolve(root, "AGENTS.md"));
    assert.throws(() => buildSetupSourceIdentity(root, options), /Required setup source file/);
    symlinkSync("CUSTOM_INSTRUCTIONS.md", resolve(root, "AGENTS.md"));
    assert.throws(() => buildSetupSourceIdentity(root, options), /Symlink is not supported/);
  });
  console.log(`ASK setup input boundary tests passed: ${count} cases (${process.version})`);
  return count;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runSetupInputTests();
