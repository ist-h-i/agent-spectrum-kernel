import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_PROMPT_CONTRACTS, parseCodexCompactProfileHeader } from "./ask-shared.mjs";
import {
  FIXED_ENTRY_CONTROL_MAP_PATH,
  FIXED_ENTRY_NAMES,
  fixedEntryAssetReferences,
  fixedEntryCanonicalPaths,
  fixedEntryDefinition,
  fixedEntryDefinitions,
  fixedEntryDirectTriggers,
  renderFixedEntryTemplate,
  validateFixedEntryControlMap,
  validateRenderedFixedEntryControls,
} from "./fixed-entry-profile.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_BASELINE_PATH = "docs/fixtures/codex-compact-route-baseline.json";
const PRE_COMPACT_PROMPT_ROOT = "docs/fixtures/codex-pre-compact-prompts";
const sharedDefinitions = fixedEntryDefinitions();
export const CODEX_COMPACT_PROFILE_DEFINITIONS = Object.freeze(Object.fromEntries(FIXED_ENTRY_NAMES.map((promptName) => {
  const definition = sharedDefinitions[promptName];
  return [promptName, Object.freeze({
    profileId: `codex-${definition.task_class}-compact-v1`,
    taskClass: definition.task_class,
    primarySkill: definition.primary_contract,
    requestedContracts: definition.requested_contracts,
    canonicalSources: definition.canonical_sources,
  })];
})));

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalRevision() {
  const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, "manifest.json"), "utf8"));
  if (typeof manifest.version !== "string" || !manifest.version) throw new Error("manifest.json version is required for Codex compact profiles");
  return `ask-${manifest.version}`;
}

export const validateCodexCompactControlMap = validateFixedEntryControlMap;
export const validateRenderedCodexCompactControls = validateRenderedFixedEntryControls;

function validatePromptTemplate(promptName, body, definition) {
  const contract = CODEX_PROMPT_CONTRACTS[promptName];
  if (!contract) throw new Error(`Codex compact profile has no prompt contract: ${promptName}`);
  for (const section of contract.requiredSections) if (!body.includes(section)) throw new Error(`${promptName} is missing required output evidence section: ${section}`);
  for (const section of contract.exactlyOneOfSections ?? []) if (!body.includes(section)) throw new Error(`${promptName} is missing selectable proof section: ${section}`);
}

export function codexDirectTriggersForPrompt(promptName, controlMap = validateFixedEntryControlMap()) {
  if (!CODEX_COMPACT_PROFILE_DEFINITIONS[promptName]) return [];
  return fixedEntryDirectTriggers(promptName, controlMap);
}

export function codexCompactProfileCanonicalPaths(promptName, controlMap = validateFixedEntryControlMap()) {
  if (!CODEX_COMPACT_PROFILE_DEFINITIONS[promptName]) return [];
  return fixedEntryCanonicalPaths(promptName, controlMap);
}

export function renderCodexCompactProfile(promptName, {
  sourceBody = null,
  canonicalContract,
  profileFingerprint,
  controlMap = validateFixedEntryControlMap(),
  additionalRequestedContracts = [],
  knowledgePromotion = false,
} = {}) {
  const definition = CODEX_COMPACT_PROFILE_DEFINITIONS[promptName];
  if (!definition) throw new Error(`Unknown Codex compact profile prompt: ${promptName}`);
  if (!canonicalContract?.revision || !canonicalContract?.source_digest || !Array.isArray(canonicalContract?.source_paths) || !profileFingerprint) throw new Error("Codex compact profile requires the shared adapter profile canonical contract and profile fingerprint");
  const validatedControlMap = validateFixedEntryControlMap(controlMap);
  const body = sourceBody ?? readFileSync(resolve(REPO_ROOT, "adapters", "codex", "prompts", promptName), "utf8");
  if (knowledgePromotion) throw new Error("fixed entries must route controlled secondary contracts directly instead of re-entering an upper router");
  const rendered = renderFixedEntryTemplate(promptName, body, {
    controlMap: validatedControlMap,
    validateAdapterTemplate: (candidate) => validatePromptTemplate(promptName, candidate, definition),
  });
  const triggers = rendered.triggers;
  const renderedBody = rendered.content;
  const sharedDefinition = fixedEntryDefinition(promptName);
  const metadata = {
    schema_version: "1.2.0",
    profile_id: definition.profileId,
    prompt_name: promptName,
    mode: sharedDefinition.mode,
    task_class: sharedDefinition.task_class,
    primary_contract: sharedDefinition.primary_contract,
    requested_contracts: [...new Set([...sharedDefinition.requested_contracts, ...additionalRequestedContracts])],
    control_ids: validatedControlMap.required_control_ids,
    direct_trigger_ids: triggers.map((trigger) => trigger.id),
    canonical_asset_refs: fixedEntryAssetReferences(),
    canonical_revision: canonicalContract.revision,
    canonical_source_digest: canonicalContract.source_digest,
    profile_fingerprint: profileFingerprint,
  };
  const header = `<!-- ASK_CODEX_COMPACT_PROFILE ${JSON.stringify({
    v: metadata.schema_version,
    id: metadata.profile_id,
    r: metadata.canonical_revision,
    s: metadata.canonical_source_digest.replace(/^sha256:/u, ""),
    p: metadata.profile_fingerprint.replace(/^sha256:/u, ""),
    rc: metadata.requested_contracts.join(","),
    ci: metadata.control_ids.join(","),
    a: sha256(JSON.stringify(metadata.canonical_asset_refs)).replace(/^sha256:/u, ""),
  })} -->`;
  const content = `${header}\n${renderedBody.trim()}\n`;
  return {
    content,
    metadata: {
      ...metadata,
      rendered_sha256: sha256(content),
      rendered_bytes: Buffer.byteLength(content),
    },
  };
}

export function measureCodexCompactProfiles(profiles) {
  const routeFixture = JSON.parse(readFileSync(resolve(REPO_ROOT, ROUTE_BASELINE_PATH), "utf8"));
  const routeByPrompt = new Map(routeFixture.profiles.map((profile) => [profile.prompt_name, profile]));
  const measured = profiles.map((profile) => {
    const route = routeByPrompt.get(profile.prompt_name);
    if (!route) throw new Error(`Codex route baseline is missing ${profile.prompt_name}`);
    const baselinePath = resolve(REPO_ROOT, PRE_COMPACT_PROMPT_ROOT, profile.prompt_name);
    const baselineBytes = readFileSync(baselinePath);
    if (sha256(baselineBytes) !== route.pre_compact_sha256) throw new Error(`immutable pre-compact prompt fixture drifted: ${profile.prompt_name}`);
    return {
      ...profile,
      baseline_fixture: `${PRE_COMPACT_PROMPT_ROOT}/${profile.prompt_name}`,
      baseline_bytes: baselineBytes.length,
      baseline_route_depth: route.pre_compact_stages.length,
      route_depth: route.compact_stages.length,
      route_fixture: ROUTE_BASELINE_PATH,
    };
  });
  return {
    profiles: measured,
    baseline_bytes: measured.reduce((total, profile) => total + profile.baseline_bytes, 0),
    rendered_bytes: measured.reduce((total, profile) => total + profile.rendered_bytes, 0),
    baseline_route_depth: measured.reduce((total, profile) => total + profile.baseline_route_depth, 0),
    route_depth: measured.reduce((total, profile) => total + profile.route_depth, 0),
  };
}

export function codexCompactCanonicalContractForPaths(paths) {
  return { revision: canonicalRevision(), source_paths: [...new Set(paths)].sort() };
}

export { parseCodexCompactProfileHeader };
export { FIXED_ENTRY_CONTROL_MAP_PATH };
