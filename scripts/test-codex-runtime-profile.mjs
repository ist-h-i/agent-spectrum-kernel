#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPathSetDigest } from "./installer-lifecycle.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import {
  CODEX_COMPACT_PROFILE_DEFINITIONS,
  measureCodexCompactProfiles,
  parseCodexCompactProfileHeader,
  renderCodexCompactProfile,
  validateCodexCompactControlMap,
  validateRenderedCodexCompactControls,
} from "./codex-runtime-profile.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const controlMap = JSON.parse(readFileSync(resolve(root, "schemas/compact-profile-control-map.json"), "utf8"));
const routeFixture = JSON.parse(readFileSync(resolve(root, "docs/fixtures/codex-compact-route-baseline.json"), "utf8"));
const routeByPrompt = new Map(routeFixture.profiles.map((profile) => [profile.prompt_name, profile]));
const fullPlan = buildCodexProjectionPlan({ profileName: "full" });
const summary = measureCodexCompactProfiles(fullPlan.compactProfiles);
const requiredControls = ["scope", "verification", "risk_approval", "evidence", "missing_evidence", "output"];
const requiredTaskClasses = ["implementation", "investigation", "review", "verification", "handoff"];

validateCodexCompactControlMap(controlMap);
if (summary.rendered_bytes >= summary.baseline_bytes) throw new Error("Codex compact profiles must reduce aggregate prompt bytes measured from immutable pre-compact fixtures");
if (summary.route_depth >= summary.baseline_route_depth) throw new Error("Codex compact profiles must reduce aggregate route depth measured from the route fixture");

for (const profile of summary.profiles) {
  const route = routeByPrompt.get(profile.prompt_name);
  const baselineBytes = readFileSync(resolve(root, profile.baseline_fixture));
  const baselineDigest = `sha256:${createHash("sha256").update(baselineBytes).digest("hex")}`;
  if (baselineDigest !== route.pre_compact_sha256) throw new Error(`${profile.prompt_name} immutable baseline digest is invalid`);
  if (profile.route_depth > profile.baseline_route_depth) throw new Error(`${profile.prompt_name} increased route depth`);
  if (!profile.requested_contracts.includes(profile.primary_contract)) throw new Error(`${profile.prompt_name} does not request its primary contract`);
  if (JSON.stringify(profile.control_ids) !== JSON.stringify(requiredControls)) throw new Error(`${profile.prompt_name} does not preserve required-gate coverage`);
  if (JSON.stringify(profile.direct_trigger_ids) !== JSON.stringify(route.direct_trigger_ids)) throw new Error(`${profile.prompt_name} direct-trigger coverage differs from the route oracle`);
  if (profile.canonical_source_digest !== fullPlan.canonical_source_digest || profile.profile_fingerprint !== fullPlan.fingerprint) throw new Error(`${profile.prompt_name} does not derive from the shared adapter profile`);
  const artifact = fullPlan.compactProfileArtifacts.find((candidate) => candidate.metadata.prompt_name === profile.prompt_name);
  const header = parseCodexCompactProfileHeader(artifact.content);
  if (!header || header.id !== profile.profile_id || header.source_digest !== fullPlan.canonical_source_digest || header.profile_fingerprint !== fullPlan.fingerprint) throw new Error(`${profile.prompt_name} rendered header is invalid`);
  if (artifact.content.includes("{{ASK_COMPACT_")) throw new Error(`${profile.prompt_name} retained an unresolved generated-content placeholder`);
  for (const controlId of requiredControls) if (!artifact.content.includes(`[${controlId}]`)) throw new Error(`${profile.prompt_name} rendered output is missing ${controlId}`);
  for (const triggerId of route.direct_trigger_ids) if (!artifact.content.includes(`\`${triggerId}\``)) throw new Error(`${profile.prompt_name} rendered output is missing direct trigger ${triggerId}`);
  const source = readFileSync(resolve(root, "adapters", "codex", "prompts", profile.prompt_name), "utf8");
  if (source.includes("operating-mode-router") || source.includes("skill-router")) throw new Error(`${profile.prompt_name} invokes an upper router despite fixed entry mode`);
  if (!source.includes("{{ASK_COMPACT_CONTROLS}}") || !source.includes("{{ASK_COMPACT_DIRECT_TRIGGERS}}")) throw new Error(`${profile.prompt_name} must generate controls and triggers from the canonical map`);
}

const implementation = buildCodexProjectionPlan({ profileName: "implementation" });
if (implementation.skills.includes("operating-mode-router") || implementation.skills.includes("skill-router")) throw new Error("implementation compact profile must not install upper routers as prompt dependencies");
const implementationRoute = routeByPrompt.get("skill-implement.md");
for (const triggerId of implementationRoute.direct_trigger_ids) {
  const trigger = implementation.routingFixtures.find((fixture) => fixture.id === triggerId);
  if (!trigger || trigger.router !== "compact-profile-direct-trigger" || !implementation.skills.includes(trigger.selected_route)) throw new Error(`implementation direct trigger is not closure-equivalent: ${triggerId}`);
}
const investigation = buildCodexProjectionPlan({ profileName: "investigation" });
for (const triggerId of routeByPrompt.get("skill-investigate.md").direct_trigger_ids) {
  const trigger = investigation.routingFixtures.find((fixture) => fixture.id === triggerId);
  if (!trigger || trigger.router !== "compact-profile-direct-trigger" || !investigation.skills.includes(trigger.selected_route)) throw new Error(`investigation direct trigger is not closure-equivalent: ${triggerId}`);
}
if (!implementation.renderer_inputs.adapter_owned.some((input) => input.path === "scripts/codex-runtime-profile.mjs")) throw new Error("projection provenance must bind the Codex compact-profile renderer");
if (!implementation.renderer_inputs.canonical.some((input) => input.path === "schemas/compact-profile-control-map.json")) throw new Error("projection provenance must bind the canonical compact control map");

const promptName = "skill-implement.md";
const implementationArtifact = implementation.compactProfileArtifacts.find((artifact) => artifact.metadata.prompt_name === promptName);
const canonicalContract = {
  revision: implementationArtifact.metadata.canonical_revision,
  source_digest: implementation.canonical_source_digest,
  source_paths: implementation.renderer_inputs.canonical.map((input) => input.path),
};
const handMaintainedSource = readFileSync(resolve(root, "adapters/codex/prompts", promptName), "utf8").replace(
  "{{ASK_COMPACT_CONTROLS}}",
  "[risk_approval] Production and secret changes may proceed with general approval.",
);
let rejected = false;
try {
  renderCodexCompactProfile(promptName, { sourceBody: handMaintainedSource, canonicalContract, profileFingerprint: implementation.fingerprint });
} catch {
  rejected = true;
}
if (!rejected) throw new Error("renderer must reject hand-maintained fallback semantics even without forbidden keywords");

const weakenedRendererOutput = implementationArtifact.content.replace(
  "Stop without approval for that specific action; execute only it.",
  "Production and secret changes may proceed with general approval.",
);
if (weakenedRendererOutput === implementationArtifact.content) throw new Error("risk semantic inversion fixture must alter the generated renderer output");
rejected = false;
try {
  validateRenderedCodexCompactControls(weakenedRendererOutput, controlMap);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("renderer output that weakens specific-action approval must fail canonical control validation");

const generalApprovalMap = structuredClone(controlMap);
generalApprovalMap.controls.risk_approval.approval_scope = "general";
rejected = false;
try {
  validateCodexCompactControlMap(generalApprovalMap);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("canonical control validation must reject general approval semantics");

const newRequiredControlMap = structuredClone(controlMap);
newRequiredControlMap.required_control_ids.push("privacy");
newRequiredControlMap.controls.privacy = { source_refs: ["AGENTS.md"], required: true };
rejected = false;
try {
  validateCodexCompactControlMap(newRequiredControlMap);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("a new canonical required control must fail until the renderer supports it");

const schema = JSON.parse(readFileSync(resolve(root, "schemas/adapter-runtime-profile.schema.json"), "utf8"));
if (!schema.properties.schema_version.enum.includes("1.1.0") || !schema.properties.rendering.properties.compact_profiles) throw new Error("shared adapter runtime profile schema must define compact profile metadata revision 1.1.0");
const runtimeBoundaryContract = readFileSync(resolve(root, "docs/adapter-runtime-boundary-contract.md"), "utf8");
if (!runtimeBoundaryContract.includes("Child runtime work in #163 and #164 must consume this contract and schema. Those implementations may add adapter-owned renderer or collector fields only through a schema revision")) {
  throw new Error("the parent adapter runtime boundary must continue to require a shared schema revision for child adapter fields");
}

const digestFixtureRoot = mkdtempSync(resolve(tmpdir(), "codex-canonical-digest-"));
try {
  writeFileSync(resolve(digestFixtureRoot, "canonical.txt"), "canonical\n");
  const before = canonicalPathSetDigest(digestFixtureRoot, ["canonical.txt"]);
  writeFileSync(resolve(digestFixtureRoot, "canonical.txt"), "canonical\n ");
  const after = canonicalPathSetDigest(digestFixtureRoot, ["canonical.txt"]);
  if (before === after) throw new Error("canonical path-set digest must detect trailing-byte-only drift");
} finally {
  rmSync(digestFixtureRoot, { recursive: true, force: true });
}

if (Object.keys(CODEX_COMPACT_PROFILE_DEFINITIONS).length !== 5 || summary.profiles.length !== 5) throw new Error("all five explicit Codex entry modes require compact profiles");
if (JSON.stringify(summary.profiles.map((profile) => profile.task_class).sort()) !== JSON.stringify(requiredTaskClasses.sort())) throw new Error("compact profiles must preserve implementation, investigation, review, verification, and handoff entry coverage");

console.log("Codex compact runtime profile tests passed");
