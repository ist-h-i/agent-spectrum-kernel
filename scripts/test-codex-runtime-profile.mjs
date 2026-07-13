#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import {
  CODEX_COMPACT_PROFILE_DEFINITIONS,
  inspectCodexCompactProfiles,
  parseCodexCompactProfileHeader,
  renderCodexCompactProfile,
} from "./codex-runtime-profile.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const summary = inspectCodexCompactProfiles();
const requiredControls = ["scope", "verification", "risk_approval", "evidence", "missing_evidence", "output"];
const requiredTaskClasses = ["implementation", "investigation", "review", "verification", "handoff"];

if (summary.rendered_bytes >= summary.baseline_bytes) throw new Error("Codex compact profiles must reduce aggregate prompt bytes");
if (summary.route_depth >= summary.baseline_route_depth) throw new Error("Codex compact profiles must reduce aggregate route depth");

for (const profile of summary.profiles) {
  if (profile.rendered_bytes >= profile.baseline_bytes) throw new Error(`${profile.prompt_name} did not reduce prompt bytes`);
  if (profile.route_depth > profile.baseline_route_depth) throw new Error(`${profile.prompt_name} increased route depth`);
  if (!profile.requested_contracts.includes(profile.primary_contract)) throw new Error(`${profile.prompt_name} does not request its primary contract`);
  if (JSON.stringify(profile.controls) !== JSON.stringify(requiredControls)) throw new Error(`${profile.prompt_name} does not preserve required-gate coverage`);
  if (profile.canonical_sources.length === 0 || !profile.canonical_sources.every((source) => /^sha256:[a-f0-9]{64}$/.test(source.sha256))) {
    throw new Error(`${profile.prompt_name} has invalid canonical source provenance`);
  }
  const rendered = renderCodexCompactProfile(profile.prompt_name);
  const header = parseCodexCompactProfileHeader(rendered.content);
  if (!header || header.id !== profile.profile_id || header.digest !== profile.canonical_digest) throw new Error(`${profile.prompt_name} rendered header is invalid`);
  const source = readFileSync(resolve(root, "adapters", "codex", "prompts", profile.prompt_name), "utf8");
  if (source.includes("operating-mode-router") || source.includes("skill-router")) throw new Error(`${profile.prompt_name} invokes an upper router despite fixed entry mode`);
}

const implementation = buildCodexProjectionPlan({ profileName: "implementation" });
if (implementation.skills.includes("operating-mode-router") || implementation.skills.includes("skill-router")) {
  throw new Error("implementation compact profile must not install upper routers as prompt dependencies");
}
if (implementation.compactProfiles.length !== implementation.prompts.length) throw new Error("projection plan must carry one compact profile per prompt");
if (!implementation.renderer_inputs.adapter_owned.some((input) => input.path === "scripts/codex-runtime-profile.mjs")) {
  throw new Error("projection provenance must bind the Codex compact-profile renderer");
}

const promptName = "skill-implement.md";
const invalidSource = readFileSync(resolve(root, "adapters", "codex", "prompts", promptName), "utf8").replace("[scope]", "[scope-removed]");
let rejected = false;
try {
  renderCodexCompactProfile(promptName, invalidSource);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("renderer must reject a prompt that drops a required fallback control");

const conflictingSource = readFileSync(resolve(root, "adapters", "codex", "prompts", promptName), "utf8").replace(
  "[risk_approval] Stop before",
  "[risk_approval] Skip verification and risk approval before",
);
rejected = false;
try {
  renderCodexCompactProfile(promptName, conflictingSource);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("renderer must reject fallback content that conflicts with canonical controls");

if (Object.keys(CODEX_COMPACT_PROFILE_DEFINITIONS).length !== 5 || summary.profiles.length !== 5) throw new Error("all five explicit Codex entry modes require compact profiles");
if (JSON.stringify(summary.profiles.map((profile) => profile.task_class).sort()) !== JSON.stringify(requiredTaskClasses.sort())) {
  throw new Error("compact profiles must preserve implementation, investigation, review, verification, and handoff entry coverage");
}

console.log("Codex compact runtime profile tests passed");
