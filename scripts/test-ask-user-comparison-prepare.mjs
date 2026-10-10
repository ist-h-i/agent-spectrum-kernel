import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { comparisonHash, inventoryComparisonGitMetadata, inventoryUserTree, isComparisonInstructionPath, prepareUserComparison, validateUserRelativePath } from "./ask-user-comparison-prepare.mjs";
import { MANAGED_START, MANAGED_END } from "./installer-lifecycle.mjs";

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_STATE = ".agent-spectrum-kernel/install-state.json";
const CODEX_STATE = ".agent-spectrum-kernel/codex-install-state.json";
const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
function child(bin, args, cwd) {
  const result = spawnSync(bin, args, { cwd, env, encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${basenameCommand(bin)}: ${result.stderr}`);
  return result.stdout.trim();
}
const basenameCommand = bin => bin === process.execPath ? "test-owned Node installer" : bin;
const git = (repo, args) => child("git", ["-c", `core.hooksPath=${devNull}`, ...args], repo);
function write(root, path, bytes) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
function commit(repo) {
  git(repo, ["add", "--force", "--all"]);
  git(repo, ["-c", "user.name=ASK preparation test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "test source"]);
  return git(repo, ["rev-parse", "HEAD"]);
}
function fixture(t, agents = "User instructions  \n\n") {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "ask-user-prepare-test-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const repo = join(parent, "repo");
  mkdirSync(repo);
  git(repo, ["init", "--quiet", "--template="]);
  write(repo, "src/value.mjs", "export const value = 1;\n");
  write(repo, "test/value.test.mjs", "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { value } from '../src/value.mjs';\ntest('value', () => assert.equal(value, 2));\n");
  write(repo, "AGENTS.md", agents);
  write(repo, ".agents/skills/my-project/SKILL.md", "---\nname: my-project\n---\nKeep this custom Skill.\n");
  write(repo, "notes/custom.txt", "User-owned notes\n");
  const taskFile = join(parent, "task.md");
  writeFileSync(taskFile, "Change the exported value to 2.\n");
  const verificationFile = join(parent, "verification.json");
  writeFileSync(verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
    requirements: [{ id: "value-is-two", description: "CONTROLLER_PRIVATE_DESCRIPTION", command: ["node", "--test", "test/value.test.mjs"] },
      { id: "manual-review", description: "Require a human assessment of clarity." }] }));
  const fakeCli = join(parent, "fake-codex.mjs"), fakeLaunch = join(parent, "unexpected-codex-launch");
  writeFileSync(fakeCli, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(fakeLaunch)}, 'called');\n`, { mode: 0o700 });
  const globalFile = join(parent, "global-config");
  writeFileSync(globalFile, "User global instructions/settings sentinel\n");
  return { parent, repo, taskFile, verificationFile, fakeCli, fakeLaunch, globalFile,
    options: extra => ({ repo, commit: git(repo, ["rev-parse", "HEAD"]), taskFile, verificationFile,
      output: join(parent, "run"), mutablePaths: ["src/"], cliBin: fakeCli, evidenceKind: "synthetic", ...extra }) };
}
function install(repo, profile = "implementation") {
  child(process.execPath, [join(SOURCE, "scripts/install-kernel.mjs"), "--target", repo, "--merge-agents"], SOURCE);
  child(process.execPath, [join(SOURCE, "scripts/install-codex-adapter.mjs"), "--target", repo, "--profile", profile], SOURCE);
}
function outsideManagedBlock(bytes) {
  const start = bytes.indexOf(Buffer.from(MANAGED_START)), end = bytes.indexOf(Buffer.from(MANAGED_END)) + Buffer.byteLength(MANAGED_END);
  assert.ok(start >= 0 && end > start);
  return Buffer.concat([bytes.subarray(0, start), bytes.subarray(end)]);
}

test("regular uninstalled source prepares exact independent P/K/F baselines with zero CLI launches", t => {
  const f = fixture(t);
  commit(f.repo);
  // Uncommitted and untracked user work remains outside the committed source.
  write(f.repo, "src/value.mjs", "export const value = 99;\n");
  write(f.repo, "notes/untracked.txt", "Uncommitted work\n");
  const before = inventoryUserTree(f.repo), status = git(f.repo, ["status", "--porcelain"]), global = readFileSync(f.globalFile);
  const result = prepareUserComparison(f.options());
  assert.equal(result.plan.kind, "ask_user_comparison_plan_v1");
  assert.equal(result.plan_digest, comparisonHash(readFileSync(join(result.root, "control/plan.json"))));
  assert.equal(existsSync(f.fakeLaunch), false, "prepare must never invoke the configured CLI");
  assert.deepEqual(inventoryUserTree(f.repo), before);
  assert.equal(git(f.repo, ["status", "--porcelain"]), status);
  assert.ok(readFileSync(f.globalFile).equals(global));
  assert.equal(result.plan.config.evidence_kind, "synthetic");
  assert.equal(result.plan.config.cli_version, null);
  assert.equal(result.plan.config.platform, `${process.platform}/${process.arch}`);
  assert.equal(result.plan.config.node_version, process.version);
  const reporter = result.plan.verification.reporter;
  assert.deepEqual(reporter, { path: "control/node-test-reporter.mjs",
    digest: comparisonHash(readFileSync(join(SOURCE, "scripts/ask-user-comparison-test-reporter.mjs"))), format: "ask_node_summary_jsonl_v1" });
  assert.ok(readFileSync(join(result.root, reporter.path)).equals(readFileSync(join(SOURCE, "scripts/ask-user-comparison-test-reporter.mjs"))));
  assert.deepEqual(result.plan.policy, { attempts: 1, retries: 0, concurrency: 1 });
  const plain = result.plan.arms.plain, kernel = result.plan.arms.kernel_only, full = result.plan.arms.full_ask;
  for (const arm of [plain, kernel, full]) {
    const root = join(result.root, arm.path);
    assert.deepEqual(inventoryUserTree(root), arm.baseline_inventory);
    assert.equal(arm.baseline_path, `control/baselines/${arm.id}`);
    assert.deepEqual(inventoryUserTree(join(result.root, arm.baseline_path)), arm.baseline_inventory);
    assert.equal(existsSync(join(result.root, arm.baseline_path, ".git")), false);
    assert.equal(git(root, ["rev-parse", "HEAD"]), arm.baseline_commit);
    assert.equal(git(root, ["status", "--porcelain"]), "");
    assert.deepEqual(inventoryComparisonGitMetadata(root), arm.git_metadata);
    assert.equal(readFileSync(join(root, "src/value.mjs"), "utf8"), "export const value = 1;\n");
    assert.equal(readFileSync(join(root, ".agents/skills/my-project/SKILL.md"), "utf8"), readFileSync(join(f.repo, ".agents/skills/my-project/SKILL.md"), "utf8"));
    assert.equal(existsSync(join(root, "task.md")), false);
    assert.equal(existsSync(join(root, "notes/untracked.txt")), false);
    assert.equal(existsSync(join(root, "control/node-test-reporter.mjs")), false);
    assert.equal(existsSync(join(root, "scripts/ask-user-comparison-test-reporter.mjs")), false);
    assert.equal(Object.values(arm.baseline_inventory).some(item => item.digest === reporter.digest), false, "controller reporter must stay outside model copies");
  }
  assert.deepEqual(plain.assets, []);
  assert.equal(readFileSync(join(result.root, plain.path, "AGENTS.md"), "utf8"), "User instructions  \n\n");
  assert.equal(kernel.capability.status, "capability_missing");
  assert.deepEqual(kernel.capability.missing, ["operating-mode-router", "skill-router", "controlled-implementation", "test-first-verification"]);
  assert.equal(existsSync(join(result.root, kernel.path, ".agents/skills/controlled-implementation")), false);
  const canonical = readFileSync(join(SOURCE, "AGENTS.md"));
  assert.ok(readFileSync(join(result.root, kernel.path, "AGENTS.md")).includes(canonical));
  assert.ok(readFileSync(join(result.root, full.path, "AGENTS.md")).includes(canonical));
  assert.ok(readFileSync(join(result.root, full.path, "AGENTS.md")).subarray(0, Buffer.byteLength("User instructions  \n\n")).equals(Buffer.from("User instructions  \n\n")));
  assert.equal(result.plan.full_definition.profile, "full");
  assert.ok(result.plan.full_definition.counts.skills > 30);
  assert.equal(result.plan.full_definition.counts.reference_supplement, 40);
  const supplementPath = "docs/ai/engineering-pattern-ledger.md";
  assert.equal(full.baseline_inventory[supplementPath].digest, comparisonHash(readFileSync(join(SOURCE, supplementPath))));
  assert.ok(result.plan.full_definition.renderer.fingerprint.startsWith("sha256:"));
  assert.ok(result.plan.full_definition.renderer_inputs.canonical.every(item => item.path && item.digest));
  assert.equal(typeof result.plan.full_definition.source_worktree_clean, "boolean");
  assert.equal(result.plan.prompt.includes("CONTROLLER_PRIVATE_DESCRIPTION"), false);
  assert.equal(result.plan.prompt.includes(JSON.stringify(["node", "--test", "test/value.test.mjs"])), true);
  assert.equal(result.plan.unknowns.includes("global_instruction_and_skill_inventory"), true);
  write(join(result.root, plain.path), "src/value.mjs", "export const value = 3;\n");
  assert.equal(readFileSync(join(result.root, plain.baseline_path, "src/value.mjs"), "utf8"), "export const value = 1;\n");
  assert.equal(readFileSync(join(result.root, kernel.path, "src/value.mjs"), "utf8"), "export const value = 1;\n");
  assert.equal(readFileSync(join(result.root, full.path, "src/value.mjs"), "utf8"), "export const value = 1;\n");
  // Metadata guarding itself runs without Git and cannot affect the source.
  for (const path of [".git/config", ".git/HEAD", ".git/refs/heads/ask-comparison"]) {
    const root = join(result.root, plain.path), beforeMetadata = inventoryComparisonGitMetadata(root);
    writeFileSync(join(root, path), Buffer.concat([readFileSync(join(root, path)), Buffer.from("\nchanged\n")]));
    const afterMetadata = inventoryComparisonGitMetadata(root);
    assert.deepEqual(Object.keys(afterMetadata).filter(key => afterMetadata[key].digest !== beforeMetadata[key].digest), [path]);
  }
  assert.deepEqual(inventoryUserTree(f.repo), before);
});

test("installed core/Codex source separates only proven managed bytes and preserves custom prefixes/suffixes", t => {
  const f = fixture(t, "Custom prefix  \n\n");
  install(f.repo);
  writeFileSync(join(f.repo, "AGENTS.md"), Buffer.concat([readFileSync(join(f.repo, "AGENTS.md")), Buffer.from("\n\tCustom suffix  \n\n")]));
  commit(f.repo);
  const before = inventoryUserTree(f.repo), preserved = outsideManagedBlock(readFileSync(join(f.repo, "AGENTS.md")));
  const result = prepareUserComparison(f.options());
  assert.deepEqual(inventoryUserTree(f.repo), before);
  assert.ok(readFileSync(join(result.root, result.plan.arms.plain.path, "AGENTS.md")).equals(preserved));
  for (const arm of Object.values(result.plan.arms)) {
    const agents = readFileSync(join(result.root, arm.path, "AGENTS.md"));
    assert.ok(agents.subarray(0, preserved.length).equals(preserved));
    assert.equal(readFileSync(join(result.root, arm.path, "notes/custom.txt"), "utf8"), "User-owned notes\n");
  }
  const p = join(result.root, result.plan.arms.plain.path), k = join(result.root, result.plan.arms.kernel_only.path);
  for (const root of [p, k]) {
    assert.equal(existsSync(join(root, CORE_STATE)), false);
    assert.equal(existsSync(join(root, CODEX_STATE)), false);
    assert.equal(existsSync(join(root, "CUSTOM_INSTRUCTIONS.md")), false);
    assert.equal(existsSync(join(root, "skills/skill-router/SKILL.md")), false);
    assert.equal(existsSync(join(root, ".agents/skills/controlled-implementation/SKILL.md")), false);
  }
  assert.equal(result.plan.source_installation.identities.length, 2);
  assert.ok(result.plan.source_installation.removed_managed_assets.length > 100);
  assert.equal(JSON.stringify(result.plan).includes("previous_successful_state"), false);
  assert.equal(JSON.stringify(result.plan).includes('"rollback"'), false);
});

test("declared global routes and trivial Kernel capability are explicit; repeated preparations have new IDs", t => {
  const f = fixture(t);
  commit(f.repo);
  const first = prepareUserComparison(f.options({ globalCapabilities: ["operating-mode-router", "skill-router", "controlled-implementation", "test-first-verification"] }));
  assert.equal(first.plan.arms.kernel_only.capability.status, "available");
  assert.ok(first.plan.arms.kernel_only.capability.available.every(item => item.origin.includes("custom") || item.origin.includes("unverified")));
  assert.throws(() => prepareUserComparison(f.options()), /output_exists_use_new_run_directory/u);
  const second = prepareUserComparison(f.options({ output: join(f.parent, "rerun"), taskClass: "trivial", rerunOf: first.plan.run_id }));
  assert.notEqual(second.plan.run_id, first.plan.run_id);
  assert.equal(second.plan.rerun_of, first.plan.run_id);
  assert.deepEqual(second.plan.arms.kernel_only.capability.required, []);
  assert.equal(second.plan.arms.kernel_only.capability.status, "available");
});

test("ambiguous install ownership, local edits, partial states and unmanaged Full collisions stop before output", async t => {
  const cases = [
    ["modified managed file", f => write(f.repo, "skills/skill-router/SKILL.md", "User edit inside managed asset\n"), /modified_or_ambiguous_managed_file/u],
    ["modified managed block", f => writeFileSync(join(f.repo, "AGENTS.md"), readFileSync(join(f.repo, "AGENTS.md"), "utf8").replace("Operating intent", "Edited intent")), /modified_or_missing_managed_agents_block/u],
    ["state path smuggling", f => { const path = join(f.repo, CORE_STATE), state = JSON.parse(readFileSync(path)); state.managed_files["notes/custom.txt"] = { kind: "skill", skill: "skill-router", sha256: comparisonHash(readFileSync(join(f.repo, "notes/custom.txt"))).slice(7), canonical_sha256: comparisonHash(readFileSync(join(f.repo, "notes/custom.txt"))).slice(7) }; writeFileSync(path, JSON.stringify(state)); }, /modified_or_ambiguous_managed_file/u],
    ["unknown state", f => { const path = join(f.repo, CORE_STATE), state = JSON.parse(readFileSync(path)); state.install_status = "detached"; writeFileSync(path, JSON.stringify(state)); }, /unsupported_install_ownership/u],
    ["partial state", f => write(f.repo, `${CORE_STATE}.in-progress.json`, "{}\n"), /unsupported_or_partial_install_state/u],
    ["hook ownership", f => { const path = join(f.repo, CODEX_STATE), state = JSON.parse(readFileSync(path)); state.managed_hooks = [{ event: "PreToolUse" }]; writeFileSync(path, JSON.stringify(state)); }, /unsupported_install_ownership/u],
  ];
  for (const [name, mutation, expected] of cases) await t.test(name, st => {
    const f = fixture(st);
    install(f.repo);
    mutation(f);
    commit(f.repo);
    const before = inventoryUserTree(f.repo);
    assert.throws(() => prepareUserComparison(f.options()), expected);
    assert.equal(existsSync(join(f.parent, "run")), false);
    assert.deepEqual(inventoryUserTree(f.repo), before);
    assert.equal(existsSync(f.fakeLaunch), false);
  });
  await t.test("unmanaged collision is not adopted even when source bytes match", st => {
    const f = fixture(st);
    write(f.repo, "CUSTOM_INSTRUCTIONS.md", readFileSync(join(SOURCE, "CUSTOM_INSTRUCTIONS.md")));
    commit(f.repo);
    assert.throws(() => prepareUserComparison(f.options()), /unmanaged_full_asset_collision:CUSTOM_INSTRUCTIONS.md/u);
    assert.equal(existsSync(join(f.parent, "run")), false);
  });
  await t.test("unmanaged marker is not deleted", st => {
    const f = fixture(st, `${MANAGED_START}\nUser instructions\n${MANAGED_END}\n`);
    commit(f.repo);
    assert.throws(() => prepareUserComparison(f.options()), /unmanaged_ask_agents_block/u);
  });
  for (const [name, agents] of [
    ["bare canonical body is ambiguous", readFileSync(join(SOURCE, "AGENTS.md"))],
    ["embedded canonical body is ambiguous", Buffer.concat([Buffer.from("User prefix  \n"), readFileSync(join(SOURCE, "AGENTS.md")), Buffer.from("\nUser suffix  \n")])],
  ]) await t.test(name, st => {
    const f = fixture(st, agents);
    commit(f.repo);
    const before = inventoryUserTree(f.repo);
    assert.throws(() => prepareUserComparison(f.options()), /unmanaged_canonical_agents_body_cannot_separate_safely/u);
    assert.equal(existsSync(join(f.parent, "run")), false);
    assert.deepEqual(inventoryUserTree(f.repo), before);
  });
  await t.test("ordinary custom ASK mentions are preserved", st => {
    const agents = "Project instructions mention Agent Spectrum Kernel (ASK). The document refers to skills/skill-router/SKILL.md for discussion only.  \n";
    const f = fixture(st, agents);
    commit(f.repo);
    const prepared = prepareUserComparison(f.options());
    assert.equal(readFileSync(join(prepared.root, prepared.plan.arms.plain.path, "AGENTS.md"), "utf8"), agents);
    assert.equal(existsSync(f.fakeLaunch), false);
  });
});

test("committed symlinks, submodules and recognizable credential files are refused", async t => {
  for (const [name, mutation, expected] of [
    ["symlink", f => symlinkSync("../notes/custom.txt", join(f.repo, "src/linked")), /unsupported_git_entry:src\/linked/u],
    ["credential file", f => write(f.repo, "auth.json", "SYNTHETIC_SECRET_SENTINEL\n"), /recognizable_secret_file:auth.json/u],
    ["environment file", f => write(f.repo, ".env", "SYNTHETIC_SETTING=1\n"), /recognizable_secret_file:\.env/u],
    ["old runtime records", f => write(f.repo, ".agents/runs/previous/result.json", "{\"synthetic_session_record\":true}\n"), /existing_runtime_records_not_supported/u],
  ]) await t.test(name, st => {
    const f = fixture(st); mutation(f); commit(f.repo);
    assert.throws(() => prepareUserComparison(f.options()), expected);
    assert.equal(existsSync(join(f.parent, "run")), false);
  });
  await t.test("submodule", st => {
    const f = fixture(st); const base = commit(f.repo);
    git(f.repo, ["update-index", "--add", "--cacheinfo", `160000,${base},vendor`]);
    git(f.repo, ["-c", "user.name=ASK preparation test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "submodule tree"]);
    assert.throws(() => prepareUserComparison(f.options()), /unsupported_git_entry:vendor/u);
  });
});

test("closed dependency-free verification recipe and immutable tests are checked before writing", async t => {
  const cases = [
    [{ command: ["sh", "-c", "node --test"], requirements: [] }, /unsupported_verification_command/u],
    [{ command: ["node", "--test"], requirements: [] }, /unsupported_verification_command/u],
    [{ command: ["node", "--test", "test/*.mjs"], requirements: [] }, /explicit_existing_mjs_tests_required/u],
    [{ command: ["node", "--test", "--eval=anything"], requirements: [] }, /invalid_relative_path/u],
    [{ command: ["node", "--test", "missing.test.mjs"], requirements: [] }, /explicit_existing_mjs_tests_required/u],
    [{ command: ["node", "--test", "test/value.test.mjs"], requirements: [], env: { TOKEN: "synthetic" } }, /invalid_verification_recipe/u],
  ];
  for (const [recipe, expected] of cases) await t.test(JSON.stringify(recipe.command), st => {
    const f = fixture(st); commit(f.repo); writeFileSync(f.verificationFile, JSON.stringify(recipe));
    assert.throws(() => prepareUserComparison(f.options()), expected);
    assert.equal(existsSync(join(f.parent, "run")), false);
  });
  await t.test("mutable scope cannot include public grading tests", st => {
    const f = fixture(st); commit(f.repo);
    assert.throws(() => prepareUserComparison(f.options({ mutablePaths: ["test/"] })), /mutable_scope_overlaps_verification_test/u);
  });
  await t.test("duplicate recipe keys are refused", st => {
    const f = fixture(st); commit(f.repo);
    writeFileSync(f.verificationFile, '{"command":["node","--test","test/value.test.mjs"],"command":["node","--test","test/value.test.mjs"],"requirements":[]}');
    assert.throws(() => prepareUserComparison(f.options()), /invalid_verification_json/u);
  });
  await t.test("committed private controller recipe cannot enter model copies", st => {
    const f = fixture(st);
    write(f.repo, "config/verification.json", readFileSync(f.verificationFile));
    commit(f.repo);
    assert.throws(() => prepareUserComparison(f.options({ verificationFile: join(f.repo, "config/verification.json") })), /verification_recipe_is_committed_model_input_keep_it_external/u);
    assert.equal(existsSync(join(f.parent, "run")), false);
  });
  for (const command of [undefined, ["node", "--test", "test/value.test.mjs"]]) await t.test(`reserved task-tests id with command ${command !== undefined}`, st => {
    const f = fixture(st);
    commit(f.repo);
    writeFileSync(f.verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
      requirements: [{ id: "task-tests", description: "Must stay independent of the automatic task check.", ...(command ? { command } : {}) }] }));
    assert.throws(() => prepareUserComparison(f.options()), /reserved_verification_requirement_id:task-tests/u);
    assert.equal(existsSync(join(f.parent, "run")), false);
    assert.equal(existsSync(f.fakeLaunch), false);
  });
});

test("output/source relations and portable paths are closed", t => {
  const f = fixture(t); commit(f.repo);
  assert.throws(() => prepareUserComparison(f.options({ output: join(f.repo, "run") })), /output_overlaps_source_repository/u);
  assert.throws(() => prepareUserComparison(f.options({ output: dirname(f.parent) })), /output_exists_use_new_run_directory/u);
  assert.throws(() => prepareUserComparison(f.options({ commit: "HEAD" })), /exact_commit_required/u);
  assert.throws(() => prepareUserComparison(f.options({ mutablePaths: ["AGENTS.md"] })), /instruction_assets_are_immutable/u);
  for (const path of ["", "../escape", "nested/../../escape", "/absolute", "a\\b", ".git/config", "a/.GIT/config", "a\nname", "-argument", "a//b"]) {
    assert.throws(() => validateUserRelativePath(path), /invalid_relative_path/u, path);
  }
  assert.equal(validateUserRelativePath("src/value.mjs"), "src/value.mjs");
});

test("post-model inventory refuses credential filenames and hard links before capturing content", async t => {
  await t.test("recognizable secret output", st => {
    const f = fixture(st);
    write(f.repo, "auth.json", "SYNTHETIC_SECRET_SENTINEL\n");
    assert.throws(() => inventoryUserTree(f.repo), /recognizable_secret_file:auth.json/u);
  });
  await t.test("hard link outside tree", st => {
    const f = fixture(st);
    linkSync(f.globalFile, join(f.repo, "linked-global.txt"));
    assert.throws(() => inventoryUserTree(f.repo), /unsupported_hard_link:linked-global.txt/u);
  });
  await t.test("Git metadata link outside tree", st => {
    const f = fixture(st); commit(f.repo);
    mkdirSync(join(f.repo, ".git/info"), { recursive: true });
    writeFileSync(join(f.repo, ".git/info/attributes"), "* -text\n");
    rmSync(join(f.repo, ".git/config"));
    symlinkSync(f.globalFile, join(f.repo, ".git/config"));
    assert.throws(() => inventoryComparisonGitMetadata(f.repo), /unsafe_git_metadata_file:\.git\/config/u);
  });
});

test("standalone Git metadata refuses added redirect and alternate controls without running Git", async t => {
  for (const path of [".git/commondir", ".git/gitdir", ".git/config.worktree", ".git/config.worktree.lock", ".git/common",
    ".git/worktrees", ".git/modules", ".git/reftable", ".git/shallow", ".git/shallow.lock", ".git/objects/info/alternates",
    ".git/objects/info/http-alternates", ".git/info/grafts", ".git/info/sparse-checkout"]) await t.test(path, st => {
    const f = fixture(st); commit(f.repo);
    write(f.repo, ".git/info/attributes", "* -filter -text -ident -working-tree-encoding\n");
    inventoryComparisonGitMetadata(f.repo);
    const beforeSource = inventoryUserTree(f.repo), beforeGlobal = readFileSync(f.globalFile);
    write(f.repo, path, `${f.parent}/shadow-common\n`);
    assert.throws(() => inventoryComparisonGitMetadata(f.repo), /unsupported_git_metadata_control:/u, path);
    assert.deepEqual(inventoryUserTree(f.repo), beforeSource);
    assert.ok(readFileSync(f.globalFile).equals(beforeGlobal));
    assert.equal(existsSync(f.fakeLaunch), false);
  });
  await t.test("dangling commondir link cannot disappear from the guard", st => {
    const f = fixture(st); commit(f.repo);
    write(f.repo, ".git/info/attributes", "* -text\n");
    symlinkSync(join(f.parent, "nonexistent"), join(f.repo, ".git/commondir"));
    assert.throws(() => inventoryComparisonGitMetadata(f.repo), /unsupported_git_metadata_control:\.git\/commondir/u);
  });
});

test("Git control parent directories and index cannot link outside an independent copy", async t => {
  for (const path of [".git/info", ".git/refs", ".git/objects", ".git/objects/info", ".git/objects/pack", ".git/objects/aa", ".git/logs"]) await t.test(path, st => {
    const f = fixture(st); commit(f.repo);
    write(f.repo, ".git/info/attributes", "* -text\n");
    const beforeSource = inventoryUserTree(f.repo), beforeGlobal = readFileSync(f.globalFile);
    rmSync(join(f.repo, path), { force: true, recursive: true });
    symlinkSync(f.parent, join(f.repo, path));
    assert.throws(() => inventoryComparisonGitMetadata(f.repo), /unsafe_git_metadata_directory:/u, path);
    assert.deepEqual(inventoryUserTree(f.repo), beforeSource);
    assert.ok(readFileSync(f.globalFile).equals(beforeGlobal));
  });
  await t.test("index hard link", st => {
    const f = fixture(st); commit(f.repo);
    write(f.repo, ".git/info/attributes", "* -text\n");
    unlinkSync(join(f.repo, ".git/index"));
    linkSync(f.globalFile, join(f.repo, ".git/index"));
    assert.throws(() => inventoryComparisonGitMetadata(f.repo), /unsafe_git_metadata_file:\.git\/index/u);
  });
});

test("mutable Git storage rejects loose, pack, info, index and log leaf links without reading their targets", async t => {
  const examples = [
    ["loose object", f => { const id = git(f.repo, ["rev-parse", "HEAD:src/value.mjs"]); return `.git/objects/${id.slice(0, 2)}/${id.slice(2)}`; }],
    ["pack", () => ".git/objects/pack/pack-test.pack"],
    ["pack index", () => ".git/objects/pack/pack-test.idx"],
    ["info child", () => ".git/objects/info/packs"],
    ["nested info child", () => ".git/objects/info/commit-graphs/test.graph"],
    ["log child", () => ".git/logs/refs/heads/test-storage"],
    ["index", () => ".git/index"],
    ["index lock", () => ".git/index.lock"],
    ["split index", () => `.git/sharedindex.${"0".repeat(40)}`],
  ];
  for (const [label, pathFor] of examples) for (const kind of ["symlink", "dangling symlink", "hard link"]) {
    await t.test(`${label}: ${kind}`, st => {
      const f = fixture(st); commit(f.repo);
      write(f.repo, ".git/info/attributes", "* -filter -text -ident -working-tree-encoding\n");
      const before = inventoryComparisonGitMetadata(f.repo), beforeSource = inventoryUserTree(f.repo), beforeGlobal = readFileSync(f.globalFile);
      const path = pathFor(f), target = join(f.repo, path);
      mkdirSync(dirname(target), { recursive: true });
      rmSync(target, { force: true });
      if (kind === "hard link") linkSync(f.globalFile, target);
      else symlinkSync(kind === "dangling symlink" ? join(f.parent, "nonexistent") : f.globalFile, target);
      assert.throws(() => inventoryComparisonGitMetadata(f.repo), /unsafe_git_(?:storage_entry|metadata_file):/u, path);
      assert.deepEqual(inventoryUserTree(f.repo), beforeSource);
      assert.ok(readFileSync(f.globalFile).equals(beforeGlobal));
      assert.equal(existsSync(f.fakeLaunch), false);
      assert.equal(Object.keys(before).some(key => /^\.git\/(?:objects|index|sharedindex|logs)/u.test(key)), false,
        "mutable storage must not enter the frozen content identity");
    });
  }
});

test("mutable Git storage traversal has a depth limit", t => {
  const f = fixture(t); commit(f.repo);
  write(f.repo, ".git/info/attributes", "* -text\n");
  write(f.repo, `.git/objects/info/${Array(33).fill("nested").join("/")}/entry`, "test-owned storage entry\n");
  assert.throws(() => inventoryComparisonGitMetadata(f.repo), /git_storage_layout_limit/u);
  assert.equal(existsSync(f.fakeLaunch), false);
});

test("ordinary Git staging and repack change index, objects and logs without changing control identity", t => {
  const f = fixture(t); commit(f.repo);
  write(f.repo, ".git/info/attributes", "* -filter -text -ident -working-tree-encoding\n");
  const before = inventoryComparisonGitMetadata(f.repo), beforeGlobal = readFileSync(f.globalFile);
  write(f.repo, "src/value.mjs", "export const value = 2;\n");
  git(f.repo, ["add", "src/value.mjs"]);
  write(f.repo, ".git/logs/test-staging-note", "A local, test-owned staging note.\n");
  assert.deepEqual(inventoryComparisonGitMetadata(f.repo), before);
  git(f.repo, ["repack", "-ad"]);
  assert.ok(readdirSync(join(f.repo, ".git/objects/pack")).some(name => name.endsWith(".pack")));
  assert.deepEqual(inventoryComparisonGitMetadata(f.repo), before);
  git(f.repo, ["update-index", "--split-index"]);
  assert.ok(readdirSync(join(f.repo, ".git")).some(name => name.startsWith("sharedindex.")));
  assert.deepEqual(inventoryComparisonGitMetadata(f.repo), before);
  assert.ok(readFileSync(f.globalFile).equals(beforeGlobal));
  assert.equal(existsSync(f.fakeLaunch), false);
});

test("nested instruction paths are immutable while their parent source directory stays usable", t => {
  const f = fixture(t);
  write(f.repo, "src/AGENTS.md", "Nested user instructions.\n");
  write(f.repo, "src/deep/AGENTS.override.md", "Nested override instructions.\n");
  write(f.repo, "src/CUSTOM_INSTRUCTIONS.md", "Nested custom instructions.\n");
  commit(f.repo);
  for (const path of ["AGENTS.md", "AGENTS.override.md", "CUSTOM_INSTRUCTIONS.md", "src/AGENTS.md", "src/deep/AGENTS.override.md",
    "src/CUSTOM_INSTRUCTIONS.md", ".agents/custom.txt", "src/.agents/custom.txt", "src/.agent-spectrum-kernel/custom.txt", "skills/custom/SKILL.md"]) {
    assert.equal(isComparisonInstructionPath(path), true, path);
    assert.throws(() => prepareUserComparison(f.options({ mutablePaths: [path] })), /instruction_assets_are_immutable/u, path);
  }
  for (const path of ["src", "src/value.mjs", "src/skills/value.mjs", "src/agents.md", "notes/AGENTS.md.example"]) {
    assert.equal(isComparisonInstructionPath(path), false, path);
  }
  const before = inventoryUserTree(f.repo), prepared = prepareUserComparison(f.options({ mutablePaths: ["src/"] }));
  for (const arm of Object.values(prepared.plan.arms)) {
    for (const path of ["src/AGENTS.md", "src/deep/AGENTS.override.md", "src/CUSTOM_INSTRUCTIONS.md"]) {
      assert.ok(readFileSync(join(prepared.root, arm.path, path)).equals(readFileSync(join(f.repo, path))));
    }
  }
  assert.deepEqual(inventoryUserTree(f.repo), before);
});

test("a non-empty root override prevents canonical K/F instructions and is preserved on refusal", async t => {
  await t.test("ordinary override unrelated to ASK is rejected by precedence", st => {
    const f = fixture(st);
    write(f.repo, "AGENTS.override.md", "Use the repository's own root instructions.\n");
    commit(f.repo);
    const before = inventoryUserTree(f.repo);
    assert.throws(() => prepareUserComparison(f.options()), /root_agents_override_prevents_canonical_condition/u);
    assert.deepEqual(inventoryUserTree(f.repo), before);
    assert.equal(existsSync(join(f.parent, "run")), false);
    assert.equal(existsSync(f.fakeLaunch), false);
  });
  await t.test("empty override does not replace canonical instructions", st => {
    const f = fixture(st);
    write(f.repo, "AGENTS.override.md", "");
    commit(f.repo);
    const prepared = prepareUserComparison(f.options());
    for (const arm of Object.values(prepared.plan.arms)) assert.equal(readFileSync(join(prepared.root, arm.path, "AGENTS.override.md")).length, 0);
  });
});

test("promisor missing blobs fail before output creation without lazy fetch or source object writes", t => {
  const f = fixture(t), sourceCommit = commit(f.repo);
  const missingBlob = git(f.repo, ["rev-parse", `${sourceCommit}:src/value.mjs`]);
  const bare = join(f.parent, "local-origin.git");
  git(f.parent, ["clone", "--bare", "--no-hardlinks", "--quiet", "--template=", f.repo, bare]);
  git(bare, ["config", "uploadpack.allowAnySHA1InWant", "true"]);
  const sentinel = join(f.parent, "remote-access-sentinel"), uploadPack = join(f.parent, "test-upload-pack.mjs");
  writeFileSync(uploadPack, `import { appendFileSync } from 'node:fs';\nimport { spawnSync } from 'node:child_process';\nappendFileSync(${JSON.stringify(sentinel)}, 'local upload-pack invoked\\n');\nconst result = spawnSync('git-upload-pack', [process.argv.at(-1)], {stdio:'inherit', shell:false});\nprocess.exitCode = result.status ?? 1;\n`, { mode: 0o700 });
  const shellLiteral = value => `'${value.replaceAll("'", "'\\''")}'`;
  git(f.repo, ["config", "remote.origin.url", bare]);
  git(f.repo, ["config", "remote.origin.uploadpack", `${shellLiteral(process.execPath)} ${shellLiteral(uploadPack)}`]);
  // Verify the local-only access sentinel is wired, before making the source
  // partial. This command does not contact a network/auth/provider endpoint.
  assert.ok(git(f.repo, ["ls-remote", "origin", "HEAD"]).includes(sourceCommit));
  assert.equal(readFileSync(sentinel, "utf8"), "local upload-pack invoked\n");
  git(f.repo, ["config", "extensions.partialClone", "origin"]);
  git(f.repo, ["config", "remote.origin.promisor", "true"]);
  git(f.repo, ["config", "remote.origin.partialclonefilter", "blob:none"]);
  unlinkSync(join(f.repo, ".git/objects", missingBlob.slice(0, 2), missingBlob.slice(2)));
  const objectInventory = () => {
    const entries = {};
    function walk(path = "") {
      for (const name of readdirSync(join(f.repo, ".git/objects", path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const relativePath = path ? `${path}/${name.name}` : name.name;
        if (name.isDirectory()) walk(relativePath);
        else entries[relativePath] = comparisonHash(readFileSync(join(f.repo, ".git/objects", relativePath)));
      }
    }
    walk();
    return entries;
  };
  const beforeObjects = objectInventory(), beforeSentinel = readFileSync(sentinel), beforeSource = inventoryUserTree(f.repo);
  assert.throws(() => prepareUserComparison(f.options({ commit: sourceCommit })), /local_preparation_failed:git/u);
  assert.deepEqual(objectInventory(), beforeObjects);
  assert.ok(readFileSync(sentinel).equals(beforeSentinel));
  assert.deepEqual(inventoryUserTree(f.repo), beforeSource);
  assert.equal(existsSync(join(f.parent, "run")), false);
  assert.equal(existsSync(f.fakeLaunch), false);
});
