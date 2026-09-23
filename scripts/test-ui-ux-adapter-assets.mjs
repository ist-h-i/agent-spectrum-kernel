import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { inspectCodexDiscoverySkillAssets, inspectCodexProjectionCanonicalInputs } from "./ask-shared.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const refs = ["principles.md", "decision-patterns.md", "anti-patterns.md"];
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const definitions = [
  { adapter: "claude", surface: ".claude", plan: buildClaudeProjectionPlan },
  { adapter: "codex", surface: ".agents", plan: buildCodexProjectionPlan },
];

for (const { adapter, surface, plan } of definitions) {
  test(`${adapter}: UI skill and references are available without broadening non-UI profiles`, () => {
    for (const profileName of ["daily", "implementation", "investigation", "review", "organizational", "full"]) {
      const result = plan({ profileName });
      for (const name of ["SKILL.md", ...refs.map((ref) => `references/${ref}`)]) {
        assert.ok(result.projectedManagedAssets.some((asset) => asset.path === `${surface}/skills/ui-ux-design/${name}`), `${profileName}: ${name}`);
        assert.ok(result.renderer_inputs.canonical.some((input) => input.path === `skills/ui-ux-design/${name}`));
      }
      assert.ok(result.renderer_inputs.adapter_owned.some((input) => input.path === "scripts/skill-assets.mjs"));
    }
    assert.ok(!plan({ profileName: "observability" }).projectedManagedAssets.some((asset) => asset.path.includes("/ui-ux-design/")));
  });

  test(`${adapter}: reference install, update, conflict, retain, prune and rollback`, async (t) => {
    const workspace = mkdtempSync(resolve(tmpdir(), `ask-${adapter}-references-`));
    t.after(() => rmSync(workspace, { recursive: true, force: true }));
    const source = resolve(workspace, "source");
    const target = resolve(workspace, "target");
    cpSync(root, source, { recursive: true, filter: (path) => ![".git", "node_modules"].some((name) => path === resolve(root, name) || path.startsWith(`${resolve(root, name)}/`)) });
    const run = (script, args, success = true) => {
      const result = spawnSync(process.execPath, [resolve(source, "scripts", script), ...args], { encoding: "utf8", timeout: 120000 });
      if (success) assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
      else assert.notEqual(result.status, 0);
      return result;
    };
    run("install-kernel.mjs", ["--target", target, "--merge-agents"]);
    const install = (extra = [], success = true) => run(`install-${adapter}-adapter.mjs`, ["--target", target, "--profile", "implementation", ...extra], success);
    install();
    const relative = `${surface}/skills/ui-ux-design/references/principles.md`;
    const destination = resolve(target, relative);
    const sourceRef = resolve(source, "skills/ui-ux-design/references/principles.md");
    const before = readFileSync(sourceRef, "utf8");
    const statePath = resolve(target, `.agent-spectrum-kernel/${adapter}-install-state.json`);
    const state = () => readJson(statePath);
    for (const ref of refs) assert.equal(readFileSync(resolve(target, `${surface}/skills/ui-ux-design/references/${ref}`), "utf8"), readFileSync(resolve(source, `skills/ui-ux-design/references/${ref}`), "utf8"));
    if (adapter === "codex") {
      const installed = state();
      assert.deepEqual(inspectCodexProjectionCanonicalInputs(target, installed.projection_plan, { selectedSkills: installed.selected_skills }), []);
      assert.deepEqual(inspectCodexDiscoverySkillAssets(target, installed), []);
    }
    const originalDigest = state().projection_plan.canonical_source_digest;
    writeFileSync(sourceRef, `${before}\nReference lifecycle regression.\n`);
    install();
    assert.notEqual(state().projection_plan.canonical_source_digest, originalDigest);
    assert.equal(readFileSync(destination, "utf8"), readFileSync(sourceRef, "utf8"));
    writeFileSync(destination, "Local user edit\n");
    if (adapter === "codex") {
      assert.ok(inspectCodexDiscoverySkillAssets(target, state()).some((finding) => finding.path === relative && finding.status === "hash_mismatch"));
    }
    install([], false);
    assert.equal(readFileSync(destination, "utf8"), "Local user edit\n");
    writeFileSync(destination, readFileSync(sourceRef, "utf8"));
    const restoreBytes = readFileSync(destination, "utf8");
    rmSync(sourceRef);
    install();
    assert.ok(state().managed_files[relative].kind.startsWith("stale_"));
    assert.ok(state().actual_installed_inventory.some((item) => item.path === relative && item.retained_stale));
    assert.ok(existsSync(destination));
    install(["--prune"]);
    assert.equal(existsSync(destination), false);
    assert.equal(Object.hasOwn(state().managed_files, relative), false);
    install(["--rollback"]);
    assert.equal(readFileSync(destination, "utf8"), restoreBytes);
    // The surviving entry still resolves all remaining relative references.
    assert.ok(existsSync(resolve(target, `${surface}/skills/ui-ux-design/SKILL.md`)));
  });
}


test("core: UI skill references are installed, retained safely, pruned and rollback-restored", async (t) => {
  const workspace = mkdtempSync(resolve(tmpdir(), "ask-core-references-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const source = resolve(workspace, "source");
  const target = resolve(workspace, "target");
  cpSync(root, source, { recursive: true, filter: (path) => ![".git", "node_modules"].some((name) => path === resolve(root, name) || path.startsWith(`${resolve(root, name)}/`)) });

  const run = (args, success = true) => {
    const result = spawnSync(process.execPath, [resolve(source, "scripts/install-kernel.mjs"), "--target", target, "--merge-agents", ...args], {
      encoding: "utf8",
      timeout: 120000,
    });
    if (success) assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
    else assert.notEqual(result.status, 0);
    return result;
  };

  run(["--skills", "ui-ux-design"]);
  const relative = "skills/ui-ux-design/references/principles.md";
  const destination = resolve(target, relative);
  const sourceRef = resolve(source, relative);
  const statePath = resolve(target, ".agent-spectrum-kernel/install-state.json");
  const state = () => readJson(statePath);
  for (const ref of refs) {
    assert.equal(
      readFileSync(resolve(target, `skills/ui-ux-design/references/${ref}`), "utf8"),
      readFileSync(resolve(source, `skills/ui-ux-design/references/${ref}`), "utf8"),
    );
    assert.equal(state().managed_files[`skills/ui-ux-design/references/${ref}`].skill, "ui-ux-design");
  }

  const before = readFileSync(sourceRef, "utf8");
  writeFileSync(sourceRef, `${before}\nCore reference lifecycle regression.\n`);
  run(["--skills", "ui-ux-design"]);
  assert.equal(readFileSync(destination, "utf8"), readFileSync(sourceRef, "utf8"));

  writeFileSync(destination, "Local user edit\n");
  run(["--skills", "ui-ux-design"], false);
  assert.equal(readFileSync(destination, "utf8"), "Local user edit\n");
  writeFileSync(destination, readFileSync(sourceRef, "utf8"));

  const restoreBytes = readFileSync(destination, "utf8");
  rmSync(sourceRef);
  run(["--skills", "ui-ux-design"]);
  assert.equal(state().managed_files[relative].kind, "stale_skill");
  assert.ok(existsSync(destination));

  run(["--skills", "ui-ux-design", "--prune"]);
  assert.equal(existsSync(destination), false);
  assert.equal(Object.hasOwn(state().managed_files, relative), false);

  run(["--rollback"]);
  assert.equal(readFileSync(destination, "utf8"), restoreBytes);
});
