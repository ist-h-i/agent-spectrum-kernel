import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { skillAssets } from "./skill-assets.mjs";

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), "ask-skill-assets-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content = "reference\n") => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), content);
  };
  write("skills/example/SKILL.md", "# Example\n");
  return { root, write };
}

test("entry and nested references share a sorted, deduplicated inventory", (t) => {
  const { root, write } = fixture(t);
  write("skills/example/references/z.md");
  write("skills/example/references/nested/a.md");
  write("skills/example/private-notes.md");
  assert.deepEqual(skillAssets(root, ["example", "example"]), [
    { skill: "example", relativePath: "SKILL.md", sourcePath: "skills/example/SKILL.md" },
    { skill: "example", relativePath: "references/nested/a.md", sourcePath: "skills/example/references/nested/a.md" },
    { skill: "example", relativePath: "references/z.md", sourcePath: "skills/example/references/z.md" },
  ]);
});

test("skills without references retain their single-entry projection", (t) => {
  const { root } = fixture(t);
  assert.equal(skillAssets(root, ["example"]).length, 1);
  assert.deepEqual(skillAssets(root, []), []);
});

test("resource additions and removals are reflected without an inventory cache", (t) => {
  const { root, write } = fixture(t);
  write("skills/example/references/one.md", "first\n");
  const first = skillAssets(root, ["example"]);
  write("skills/example/references/one.md", "updated\n");
  assert.equal(readFileSync(resolve(root, first[1].sourcePath), "utf8"), "updated\n");
  rmSync(resolve(root, first[1].sourcePath));
  assert.equal(skillAssets(root, ["example"]).length, 1);
});

for (const invalid of ["../example", "example/../../outside", "example\\outside", "Example", ""]) {
  test(`rejects invalid skill name ${JSON.stringify(invalid)}`, (t) => {
    const { root } = fixture(t);
    assert.throws(() => skillAssets(root, [invalid]), /Invalid skill name/);
  });
}

test("missing entries fail rather than silently omitting a selected skill", (t) => {
  const { root } = fixture(t);
  rmSync(resolve(root, "skills/example/SKILL.md"));
  assert.throws(() => skillAssets(root, ["example"]), /ENOENT/);
});

for (const target of ["SKILL.md", "references", "references/nested", "references/link.md"]) {
  test(`rejects source symlink at ${target}`, (t) => {
    const { root, write } = fixture(t);
    write("outside.md", "not a skill asset\n");
    const path = resolve(root, "skills/example", target);
    rmSync(path, { force: true, recursive: true });
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(resolve(root, "outside.md"), path);
    assert.throws(() => skillAssets(root, ["example"]), /regular file|real directory|symlinks/);
  });
}

test("rejects invalid UTF-8 before the installer can write replacement characters", (t) => {
  const { root, write } = fixture(t);
  write("skills/example/references/bad.md", Buffer.from([0xc3, 0x28]));
  assert.throws(() => skillAssets(root, ["example"]), /encoded data/);
});

test("documented executable-spec Python command preserves managed reference assets", (t) => {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const root = mkdtempSync(resolve(tmpdir(), "ask-spec-example-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const skillPath = "skills/spec-driven-development";
  const destination = resolve(root, skillPath);
  cpSync(resolve(repoRoot, skillPath), destination, { recursive: true });
  const assets = skillAssets(root, ["spec-driven-development"]);
  const before = assets.map(({ sourcePath }) => [sourcePath, readFileSync(resolve(root, sourcePath))]);
  const instructions = readFileSync(resolve(destination, "references/project-templates.md"), "utf8");
  const command = instructions.match(/^python .+$/m)?.[0];
  assert.ok(command, "Python example must have a documented command");
  const [executable, ...args] = command.match(/'[^']*'|\S+/g).map((arg) => arg.replace(/^'|'$/g, ""));
  const env = { ...process.env };
  delete env.PYTHONDONTWRITEBYTECODE;
  delete env.PYTHONPYCACHEPREFIX;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync(executable, args, { cwd: destination, env, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Ran 3 tests/);
    assert.deepEqual(skillAssets(root, ["spec-driven-development"]), assets);
    for (const [path, bytes] of before) assert.deepEqual(readFileSync(resolve(root, path)), bytes, path);
  }
});

test("executable-spec setup has selected capability and references in delivery and adoption profiles", async () => {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "manifest.json"), "utf8"));
  const route = manifest.routing.default_routes.find(({ id }) => id === "executable_spec_setup");
  const strategy = manifest.routing.default_routes.find(({ id }) => id === "decision_led_test_strategy");
  assert.equal(strategy?.primary, "spec-driven-development");
  assert.equal(strategy.task_class, "design");
  assert.equal(route?.primary, "spec-driven-development");
  const { buildCodexProjectionPlan } = await import("./install-codex-adapter.mjs");
  const { buildClaudeProjectionPlan } = await import("./install-claude-adapter.mjs");
  for (const [builder, profileName, surface] of [
    [buildCodexProjectionPlan, "daily", ".agents"],
    [buildCodexProjectionPlan, "adoption", ".agents"],
    [buildClaudeProjectionPlan, "daily", ".claude"],
  ]) {
    const plan = builder({ profileName });
    const fixture = plan.routingFixtures.find(({ id }) => id === "executable_spec_setup");
    assert.equal(fixture?.outcome, "available", `${surface} ${profileName}: setup route`);
    assert.equal(fixture.selected_route ?? fixture.selectedRoute, route.primary);
    const decision = plan.routingFixtures.find(({ id }) => id === strategy.id);
    assert.equal(decision?.outcome, "available", `${surface} ${profileName}: decision-led strategy`);
    assert.equal(decision.selected_route ?? decision.selectedRoute, strategy.primary);
    const selected = plan.skills ?? plan.selectedSkills;
    for (const skill of ["operating-mode-router", "skill-router", route.primary, "work-package-compiler", "test-first-verification"]) {
      assert.ok(selected.includes(skill), `${surface} ${profileName}: ${skill}`);
    }
    for (const reference of ["spec-writing-conventions", "spec-index", "context-retrieval", "verification-selection", "scenario-visual-review", "decision-led-test-strategy", "quote-reissue-decision"]) {
      assert.ok(plan.projectedManagedAssets.some(({ path }) => path === `${surface}/skills/${route.primary}/references/${reference}.md`));
    }
    for (const file of ["reservation.cases.mjs", "scenario-observer.mjs", "scenario-review.mjs", "scenario-player.html"]) {
      assert.ok(plan.projectedManagedAssets.some(({ path }) => path === `${surface}/skills/${route.primary}/references/examples/javascript/${file}`));
    }
    for (const file of ["quote-reissue.mjs", "quote-reissue.test.mjs"]) {
      assert.ok(plan.projectedManagedAssets.some(({ path }) => path === `${surface}/skills/${strategy.primary}/references/examples/quote-reissue/${file}`));
    }
    if (profileName === "daily") {
      assert.equal(plan.routingFixtures.find(({ id }) => id === "daily_adoption_capability_missing")?.outcome, "capability_missing");
      assert.ok(!selected.includes("project-adoption-pack-generation"));
    }
  }
  const minimal = buildCodexProjectionPlan({ profileName: "minimal" });
  assert.ok(!minimal.skills.includes(route.primary), "method setup must not expand unrelated minimal profiles");
});

test("installed Codex decision strategy resolves its walkthrough and executes the documented comparison", (t) => {
  const source = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const target = mkdtempSync(resolve(tmpdir(), "ask-decision-strategy-"));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  const run = (cwd, args) => {
    const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
    return result;
  };
  run(source, ["scripts/install-kernel.mjs", "--target", target]);
  run(source, ["scripts/install-codex-adapter.mjs", "--target", target, "--profile", "daily"]);
  const skill = resolve(target, ".agents/skills/spec-driven-development");
  function follow(from, suffix) {
    const refs = [...readFileSync(from, "utf8").matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/gu)];
    const link = refs.find(([, destination]) => destination.endsWith(suffix));
    assert.ok(link, `Missing ${suffix} from ${from}`);
    return resolve(dirname(from), link[1]);
  }
  const strategy = follow(resolve(skill, "SKILL.md"), "decision-led-test-strategy.md");
  const walkthrough = follow(strategy, "quote-reissue-decision.md");
  const testFile = follow(walkthrough, "quote-reissue.test.mjs");
  const sample = follow(walkthrough, "quote-reissue.mjs");
  assert.ok(readFileSync(sample).length > 0);
  const command = readFileSync(walkthrough, "utf8").match(/^node --test (\S+\.mjs)$/mu);
  assert.ok(command, "Walkthrough must give an executable skill-relative command");
  assert.equal(resolve(skill, command[1]), testFile);
  const output = run(skill, ["--test", command[1]]).stdout;
  assert.match(output, /(?:^|\s)pass [1-9]\d*\s/u); // An empty discovery is not a worked example.
  run(source, ["scripts/install-codex-adapter.mjs", "--target", target, "--profile", "daily", "--check"]);
});
