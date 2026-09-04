#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";

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

const claude = buildClaudeProjectionPlan({ profileName: "daily" });
const codex = buildCodexProjectionPlan({ profileName: "full" });
if (!Array.isArray(claude.compactProfiles) || claude.compactProfiles.length !== 5) {
  throw new Error("Claude must expose five generated fixed-entry compact profiles");
}
if (!Array.isArray(claude.compactProfileArtifacts) || claude.compactProfileArtifacts.length !== 5) {
  throw new Error("Claude must expose five generated fixed-entry command artifacts");
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
for (const entry of pluginEntries) {
  const path = resolve(root, "adapters/claude-code/plugin/skills", entry, "SKILL.md");
  if (!existsSync(path)) throw new Error(`Claude plugin fixed entry is missing: ${entry}`);
  const content = readFileSync(path, "utf8");
  if (content.includes("operating-mode-router") || content.includes("skill-router")) throw new Error(`Claude plugin fixed entry ${entry} must skip upper routers`);
  for (const controlId of controlIds) if (!content.includes(`[${controlId}]`)) throw new Error(`Claude plugin fixed entry ${entry} is missing generated ${controlId} control`);
}

const measurement = claude.compactProfileMeasurements;
if (!measurement || measurement.profiles.length !== 5 || measurement.rendered_bytes >= measurement.baseline_bytes || measurement.route_depth >= measurement.baseline_route_depth) {
  throw new Error("Claude current-versus-fixed route-depth and rendered-byte measurements must be deterministic and reduced in aggregate");
}

console.log("Shared Claude/Codex fixed-entry profile tests passed");
