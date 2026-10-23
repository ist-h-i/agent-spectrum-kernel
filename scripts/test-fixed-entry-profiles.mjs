#!/usr/bin/env node
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { renderClaudePluginFixedEntryProfiles } from "./claude-fixed-entry-profile.mjs";
import { fixedEntryCanonicalPaths, validateFixedEntryControlMap, validateRenderedFixedEntryControls } from "./fixed-entry-profile.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const entryNames = ["skill-implement.md", "skill-investigate.md", "skill-review.md", "skill-verify.md", "skill-handoff.md"];
const expectedPrimary = new Map([
  ["implementation", "controlled-implementation"],
  ["investigation", "doubt-driven-development"],
  ["review", "review-router"],
  ["verification", "test-first-verification"],
  ["handoff", "handoff-generation"],
]);
const controlIds = ["scope", "verification", "risk_approval", "evidence", "missing_evidence", "output"];
const exactRefFields = ["asset_type", "stable_id", "version", "record_digest", "content_digest"];

function assertSufficientScope(content, label) {
  const scope = content.match(/^- \[scope\] (.+)$/mu)?.[1];
  assert.ok(scope, `${label} must expose its generated scope control`);
  for (const [meaning, clause] of [
    ["contract-grounded sufficient scope for the authorized outcome", /derive sufficient scope for the authorized outcome from current requirements\/contracts\/invariants/u],
    ["observed affected responsibility and usage", /evidenced affected owners\/providers\/consumers/u],
    ["maintenance before diff among sufficient options", /among sufficient options minimize maintenance burden, then diff/u],
    ["task-required cleanup and retirement", /include cleanup and retirement required by this change/u],
    ["consumer checks before retiring paths, state or configuration", /check consumers before retiring obsolete paths\/state\/config/u],
    ["justified temporary retention with a retirement condition", /retain only with a current compatibility\/rollout reason and retirement condition/u],
    ["unrelated cleanup stays separate", /unrelated cleanup separate/u],
    ["missing-input stop is retained", /missing=>stop\|insufficient/u],
  ]) assert.match(scope, clause, `${label} lost ${meaning}`);
  assert.doesNotMatch(scope, /minimal diff; cleanup separate/u, `${label} must not restore diff-first scope`);
}

const claude = buildClaudeProjectionPlan({ profileName: "daily" });
const codex = buildCodexProjectionPlan({ profileName: "full" });
if (!Array.isArray(claude.compactProfiles) || claude.compactProfiles.length !== 5) {
  throw new Error("Claude must expose five generated fixed-entry compact profiles");
}
if (!Array.isArray(claude.compactProfileArtifacts) || claude.compactProfileArtifacts.length !== 5) {
  throw new Error("Claude must expose five generated fixed-entry command artifacts");
}

// Inspect the actual projected prompts, independently of the renderer's own
// expected-string validation. A shared renderer regression must fail both adapters.
for (const [adapter, plan] of [["Claude", claude], ["Codex", codex]]) {
  for (const artifact of plan.compactProfileArtifacts) {
    const label = `${adapter} ${artifact.metadata.prompt_name}`;
    assertSufficientScope(artifact.content, label);
    const scopeLine = artifact.content.match(/^- \[scope\] .+$/mu)?.[0];
    const oldScope = artifact.content.replace(scopeLine, "- [scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate");
    assert.notEqual(oldScope, artifact.content, `${label} regression fixture must change the prompt`);
    assert.throws(() => validateRenderedFixedEntryControls(oldScope), /canonical scope semantics/u,
      `${label} must reject the previous minimal-diff-only control`);
    for (const [before, after] of [
      ["for the authorized outcome", "beyond the authorized outcome"],
      ["among sufficient options minimize maintenance burden, then diff", "minimize diff before maintenance burden"],
      ["include cleanup and retirement required by this change", "defer all cleanup and retain old paths"],
      ["check consumers before retiring obsolete paths/state/config", "retire old paths/state/config without checking consumers"],
      ["retain only with a current compatibility/rollout reason and retirement condition", "retain for possible future use without a retirement condition"],
      ["missing=>stop|insufficient", "missing=>guess"],
    ]) {
      const weakened = artifact.content.replace(before, after);
      assert.notEqual(weakened, artifact.content, `${label} semantic mutation must change the prompt`);
      assert.throws(() => validateRenderedFixedEntryControls(weakened), /canonical scope semantics/u,
        `${label} must reject scope, retirement or evidence regressions`);
    }
  }
}

const controlMap = JSON.parse(readFileSync(resolve(root, "schemas/compact-profile-control-map.json"), "utf8"));
for (const [field, value] of [
  ["change_boundary", "smallest_task_required"],
  ["cleanup_boundary", "separate"],
  ["missing_input_behavior", "infer_and_proceed"],
]) {
  const weakened = structuredClone(controlMap);
  weakened.controls.scope[field] = value;
  assert.throws(() => validateFixedEntryControlMap(weakened), /scope control/u,
    `scope map must reject ${field}=${value}`);
}

for (const [taskClass, primary] of expectedPrimary) {
  const claudeProfile = claude.compactProfiles.find((profile) => profile.task_class === taskClass);
  const codexProfile = codex.compactProfiles.find((profile) => profile.task_class === taskClass);
  if (!claudeProfile || !codexProfile || claudeProfile.primary_contract !== primary || codexProfile.primary_contract !== primary) {
    throw new Error(`${taskClass} must resolve to the same primary canonical contract across adapters`);
  }
  if (JSON.stringify(claudeProfile.control_ids) !== JSON.stringify(controlIds) || JSON.stringify(codexProfile.control_ids) !== JSON.stringify(controlIds)) {
    throw new Error(`${taskClass} must project the same six canonical controls across adapters`);
  }
  if (JSON.stringify(claudeProfile.direct_trigger_ids) !== JSON.stringify(codexProfile.direct_trigger_ids)) {
    throw new Error(`${taskClass} must project direct triggers from one canonical registry`);
  }
  if (!Array.isArray(claudeProfile.canonical_asset_refs) || claudeProfile.canonical_asset_refs.length === 0) {
    throw new Error(`${taskClass} must bind exact registered canonical Prompt/policy assets`);
  }
  if (JSON.stringify(claudeProfile.canonical_asset_refs) !== JSON.stringify(codexProfile.canonical_asset_refs)) {
    throw new Error(`${taskClass} must consume the same exact registered assets across adapters`);
  }
  for (const reference of claudeProfile.canonical_asset_refs) {
    if (JSON.stringify(Object.keys(reference).sort()) !== JSON.stringify([...exactRefFields].sort())) throw new Error("canonical Asset references must be exact tuples");
  }
}

for (const entryName of entryNames) {
  const sourcePath = resolve(root, "adapters/claude-code/project/.claude/commands", entryName);
  const source = readFileSync(sourcePath, "utf8");
  if (source.includes("operating-mode-router") || source.includes("skill-router")) throw new Error(`${entryName} must skip upper routers`);
  if (!source.includes("{{ASK_COMPACT_CONTROLS}}") || !source.includes("{{ASK_COMPACT_DIRECT_TRIGGERS}}")) throw new Error(`${entryName} must be a generated fixed-entry template`);
  const artifact = claude.compactProfileArtifacts.find((candidate) => candidate.metadata.prompt_name === entryName);
  if (!artifact || artifact.content.includes("{{ASK_COMPACT_")) throw new Error(`${entryName} generated command bytes are unavailable`);
  for (const controlId of controlIds) if (!artifact.content.includes(`[${controlId}]`)) throw new Error(`${entryName} is missing generated ${controlId} control`);
  for (const triggerId of artifact.metadata.direct_trigger_ids) {
    if (!artifact.content.includes(`\`${triggerId}\``) || !artifact.content.includes("missing=>`capability_missing`")) throw new Error(`${entryName} must fail closed for missing triggered capabilities`);
  }
}

const boundedSkills = ["controlled-implementation", "test-first-verification", "risk-gate", "handoff-generation"];
for (const [adapter, plan] of [
  ["Claude", buildClaudeProjectionPlan({ profileName: "implementation", skills: boundedSkills })],
  ["Codex", buildCodexProjectionPlan({ profileName: "implementation", skills: boundedSkills })],
]) {
  const formalTrigger = plan.routingFixtures.find((fixture) => fixture.id === "formal_claim_audit_required");
  const selectedRoute = formalTrigger?.selectedRoute ?? formalTrigger?.selected_route;
  const selectedSkills = plan.selectedSkills ?? plan.skills;
  if (formalTrigger?.outcome !== "capability_missing" || selectedRoute !== "evidence-ledger" || selectedSkills.includes("evidence-ledger")) {
    throw new Error(`${adapter} custom selection must record a missing formal Evidence Ledger capability`);
  }
  for (const artifact of plan.compactProfileArtifacts) {
    if (!artifact.content.includes("`formal_claim_audit_required`=>`evidence-ledger`") || !artifact.content.includes("missing=>`capability_missing`")) {
      throw new Error(`${adapter} custom selection must render the formal Evidence Ledger capability_missing stop`);
    }
  }
}

const pluginEntries = ["implement", "investigate", "review-pr", "verify", "handoff"];
const generatedPluginEntries = renderClaudePluginFixedEntryProfiles();
for (const entry of pluginEntries) {
  const path = resolve(root, "adapters/claude-code/plugin/skills", entry, "SKILL.md");
  if (!existsSync(path)) throw new Error(`Claude plugin fixed entry is missing: ${entry}`);
  const content = readFileSync(path, "utf8");
  assert.equal(content, generatedPluginEntries.find((candidate) => candidate.metadata.prompt_name === entry)?.content,
    `Claude plugin ${entry} must match the current canonical sources and renderer`);
  assertSufficientScope(content, `Claude plugin ${entry}`);
  if (content.includes("operating-mode-router") || content.includes("skill-router")) throw new Error(`Claude plugin fixed entry ${entry} must skip upper routers`);
  for (const controlId of controlIds) if (!content.includes(`[${controlId}]`)) throw new Error(`Claude plugin fixed entry ${entry} is missing generated ${controlId} control`);
}

// Mutate only an isolated copy and run the real generator from that copy.
// Frozen Asset references must not hide drift in current controls or renderer bytes.
const pluginFixtureRoot = mkdtempSync(resolve(tmpdir(), "claude-plugin-fingerprint-"));
try {
  for (const path of ["schemas", "docs/fixtures/asset-registry", "adapters/claude-code/plugin/templates"]) {
    cpSync(resolve(root, path), resolve(pluginFixtureRoot, path), { recursive: true });
  }
  const moduleNames = ["claude-fixed-entry-profile", "fixed-entry-profile", "installer-lifecycle", "claim-evidence-status", "verification-proof-policy", "asset-registry", "content-addressed-store", "execution-envelope", "json-schema-validation"];
  const paths = [...new Set([...moduleNames.map((name) => `scripts/${name}.mjs`), ...entryNames.flatMap((entryName) => fixedEntryCanonicalPaths(entryName))])];
  for (const path of paths) {
    mkdirSync(dirname(resolve(pluginFixtureRoot, path)), { recursive: true });
    cpSync(resolve(root, path), resolve(pluginFixtureRoot, path));
  }
  const identityFields = ["profile_fingerprint", "canonical_source_digest"];
  const generatorUrl = pathToFileURL(resolve(pluginFixtureRoot, "scripts/claude-fixed-entry-profile.mjs")).href;
  const { renderClaudePluginFixedEntryProfiles: renderFixture } = await import(generatorUrl);
  const readFixtureIdentity = () => renderFixture().map(({ metadata }) => Object.fromEntries(identityFields.map((field) => [field, metadata[field]])));
  const baseline = readFixtureIdentity();
  assert.deepEqual(baseline, generatedPluginEntries.map(({ metadata }) => Object.fromEntries(identityFields.map((field) => [field, metadata[field]]))),
    "the isolated fixture must reproduce the current plugin identity");
  for (const [path, canonicalChange] of [["schemas/compact-profile-control-map.json", true], ["scripts/fixed-entry-profile.mjs", false]]) {
    const target = resolve(pluginFixtureRoot, path);
    const original = readFileSync(target, "utf8");
    writeFileSync(target, `${original}\n`);
    const changed = readFixtureIdentity();
    for (const [index, identity] of changed.entries()) {
      assert.notEqual(identity.profile_fingerprint, baseline[index].profile_fingerprint,
        `${path} byte changes must change the generated plugin fingerprint`);
      if (canonicalChange) assert.notEqual(identity.canonical_source_digest, baseline[index].canonical_source_digest);
      else assert.equal(identity.canonical_source_digest, baseline[index].canonical_source_digest);
    }
    writeFileSync(target, original);
  }
} finally {
  rmSync(pluginFixtureRoot, { recursive: true, force: true });
}

const measurement = claude.compactProfileMeasurements;
if (!measurement || measurement.profiles.length !== 5 || measurement.route_depth >= measurement.baseline_route_depth) {
  throw new Error("Claude fixed-entry profiles must preserve five entries and reduce aggregate route depth against the route fixture");
}
assert.equal(measurement.rendered_bytes, claude.compactProfileArtifacts.reduce((total, artifact) => total + Buffer.byteLength(artifact.content), 0),
  "Claude rendered-byte measurements must match the generated prompt bytes");
console.log(`Claude fixed-entry bytes: ${measurement.rendered_bytes}; historical baseline: ${measurement.baseline_bytes}; delta: ${measurement.rendered_bytes - measurement.baseline_bytes}`);

console.log("Shared Claude/Codex fixed-entry profile tests passed");
