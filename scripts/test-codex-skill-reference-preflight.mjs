import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { hashText, inspectCodexDiscoverySkillAssets, inspectCodexProjectionCanonicalInputs } from "./ask-shared.mjs";

const skill = "ui-ux-design";
const sourceRef = `skills/${skill}/references/principles.md`;
const projectedRef = `.agents/${sourceRef}`;
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = (value) => `sha256:${hashText(stable(value))}`;
function seal(plan) {
  plan.fingerprint = digest({
    canonical_source_digest: plan.canonical_source_digest,
    renderer_id: plan.renderer_id,
    renderer_version: plan.renderer_version,
    renderer_profile: plan.renderer_profile,
    plan_shaping_options: plan.plan_shaping_options,
    renderer_inputs_digest: digest(plan.renderer_inputs),
    managed_inventory_digest: digest(plan.projected_managed_assets),
  });
}
function fixture(t, references = true) {
  const root = mkdtempSync(resolve(tmpdir(), "ask-skill-preflight-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const state = { selected_skills: [skill], managed_files: {}, projection_plan: {
    canonical_source_digest: `sha256:${"a".repeat(64)}`, renderer_id: "install-codex-adapter", renderer_version: "9",
    renderer_profile: "implementation", plan_shaping_options: {}, renderer_inputs: { canonical: [], adapter_owned: [] }, projected_managed_assets: [],
  } };
  for (const relative of ["SKILL.md", ...(references ? ["references/principles.md", "references/nested/判断.md"] : [])]) {
    const path = `skills/${skill}/${relative}`;
    const content = `Bounded source: ${relative}\n`;
    for (const prefix of ["", ".agents/"]) {
      mkdirSync(dirname(resolve(root, `${prefix}${path}`)), { recursive: true });
      writeFileSync(resolve(root, `${prefix}${path}`), content);
    }
    state.managed_files[`.agents/${path}`] = { kind: "codex_skill", skill, sha256: hashText(content) };
    state.projection_plan.renderer_inputs.canonical.push({ path, role: "skill", digest: `sha256:${hashText(content)}` });
    state.projection_plan.projected_managed_assets.push({ path: `.agents/${path}`, asset_kind: "skills", ownership_mode: "full_file", inventory_source_ref: "scripts/install-codex-adapter.mjs" });
  }
  seal(state.projection_plan);
  const canonical = () => inspectCodexProjectionCanonicalInputs(root, state.projection_plan, { selectedSkills: state.selected_skills });
  const discovery = () => inspectCodexDiscoverySkillAssets(root, state);
  return { root, state, plan: state.projection_plan, canonical, discovery };
}
function has(findings, status, path) {
  assert.ok(findings.some((finding) => finding.status === status && (!path || finding.path === path)), JSON.stringify(findings));
}

for (const references of [false, true]) test(`valid ${references ? "nested references" : "entry-only installation"} passes both inspectors`, (t) => {
  const f = fixture(t, references);
  assert.deepEqual(f.canonical(), []);
  assert.deepEqual(f.discovery(), []);
});

for (const path of [
  `.agents/skills/${skill}/references/../SKILL.md`, `.agents/skills/${skill}/references//file.md`,
  `.agents/skills/${skill}/references/./file.md`, `.agents/skills/${skill}/references/file.md/`,
  `.agents/skills/${skill}/references\\file.md`, `.agents/skills/${skill}/references/\0file.md`,
  `.agents/skills/${skill}/references`, `.agents/skills/${skill}/other/file.md`,
  `/tmp/.agents/skills/${skill}/references/file.md`, `.agents/skills/Bad/references/file.md`,
]) test(`reject noncanonical projected path ${JSON.stringify(path)}`, (t) => {
  const f = fixture(t);
  f.plan.projected_managed_assets.push({ path, asset_kind: "skills" });
  seal(f.plan);
  has(f.canonical(), "invalid_projected_skill_asset", path);
  has(f.discovery(), "invalid_projected_skill_asset", path);
});

for (const [name, mutate, status] of [
  ["duplicate reference", (f) => f.plan.projected_managed_assets.push({ ...f.plan.projected_managed_assets[1] }), "duplicate_projected_skill_asset"],
  ["duplicate entry", (f) => f.plan.projected_managed_assets.push({ ...f.plan.projected_managed_assets[0] }), "selected_skill_inventory_mismatch"],
  ["duplicate selected Skill", (f) => f.state.selected_skills.push(skill), "selected_skill_inventory_mismatch"],
  ["duplicate canonical reference", (f) => f.plan.renderer_inputs.canonical.push({ ...f.plan.renderer_inputs.canonical[1] }), "duplicate_canonical_skill_asset"],
  ["unselected reference owner", (f) => f.plan.projected_managed_assets.push({ path: ".agents/skills/other/references/a.md", asset_kind: "skills" }), "reference_skill_not_selected"],
  ["missing projected reference", (f) => f.plan.projected_managed_assets.splice(1, 1), "skill_asset_not_projected"],
  ["missing canonical reference", (f) => f.plan.renderer_inputs.canonical.splice(1, 1), "skill_asset_source_missing"],
  ["missing selected entry", (f) => f.plan.projected_managed_assets.splice(0, 1), "selected_skill_inventory_mismatch"],
]) test(`reject ${name} even after the plan fingerprint is recalculated`, (t) => {
  const f = fixture(t); mutate(f); seal(f.plan); has(f.canonical(), status);
});

test("unselected canonical Skill sources retain the existing skip boundary", (t) => {
  const f = fixture(t);
  for (const relative of ["SKILL.md", "references/a.md"]) f.plan.renderer_inputs.canonical.push({ path: `skills/other/${relative}`, role: "skill", digest: `sha256:${"b".repeat(64)}` });
  seal(f.plan);
  assert.deepEqual(f.canonical(), []);
});

test("a changed inventory still requires a matching fingerprint", (t) => {
  const f = fixture(t); f.plan.renderer_profile = "other";
  has(f.canonical(), "fingerprint_mismatch");
});

for (const [label, path, inspect, drift] of [
  ["canonical", sourceRef, "canonical", "drift"], ["discovery", projectedRef, "discovery", "hash_mismatch"],
]) {
  for (const mutation of ["changed", "missing", "directory", "symlink", "parent symlink"]) test(`${label} reference rejects ${mutation}`, (t) => {
    const f = fixture(t); const absolute = resolve(f.root, path); const original = readFileSync(absolute);
    if (mutation === "changed") writeFileSync(absolute, "changed\n");
    else if (mutation === "parent symlink") {
      const parent = dirname(absolute), outside = resolve(f.root, "external-references");
      mkdirSync(outside); writeFileSync(resolve(outside, "principles.md"), original);
      rmSync(parent, { recursive: true }); symlinkSync(outside, parent, "dir");
    } else {
      rmSync(absolute);
      if (mutation === "directory") mkdirSync(absolute);
      if (mutation === "symlink") {
        const outside = resolve(f.root, "external.md"); writeFileSync(outside, original); symlinkSync(outside, absolute);
      }
    }
    const status = mutation === "changed" ? drift : mutation === "missing" ? "missing" : mutation === "directory" ? "not_regular_file" : "symbolic_link";
    has(f[inspect](), status, path);
  });
}

for (const field of ["missing", "kind", "skill", "sha256"]) test(`discovery reference requires its exact managed record: ${field}`, (t) => {
  const f = fixture(t);
  if (field === "missing") delete f.state.managed_files[projectedRef];
  else f.state.managed_files[projectedRef][field] = "invalid";
  has(f.discovery(), "invalid_managed_record", projectedRef);
});
