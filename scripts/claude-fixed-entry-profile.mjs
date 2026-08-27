import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXED_ENTRY_CONTROL_IDS,
  FIXED_ENTRY_NAMES,
  fixedEntryAssetReferences,
  fixedEntryCanonicalPaths,
  fixedEntryDefinition,
  fixedEntrySha256,
  renderFixedEntryTemplate,
  validateFixedEntryControlMap,
} from "./fixed-entry-profile.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TEMPLATE_ROOT = "adapters/claude-code/project/.claude/commands";
const BASELINE_ROOT = "docs/fixtures/claude-pre-fixed-commands";
const ROUTE_BASELINE_PATH = "docs/fixtures/claude-fixed-entry-route-baseline.json";
const PLUGIN_TEMPLATE_ROOT = "adapters/claude-code/plugin/templates";

export const CLAUDE_PLUGIN_FIXED_ENTRY_MAP = Object.freeze({
  "skill-implement.md": "implement",
  "skill-investigate.md": "investigate",
  "skill-review.md": "review-pr",
  "skill-verify.md": "verify",
  "skill-handoff.md": "handoff",
});

const REQUIRED_TEMPLATE_TOKENS = Object.freeze({
  "skill-implement.md": ["Implementation Contract:", "Evidence:", "fenced JSON `Execution Envelope`", "docs/execution-envelope-contract.md"],
  "skill-investigate.md": ["Findings:", "Cause:", "Changed:", "Evidence:", "fenced JSON `Execution Envelope`"],
  "skill-review.md": ["Baseline review:", "Additional required gates:", "Missing evidence:", "Findings:", "fenced JSON `Execution Envelope`"],
  "skill-verify.md": ["Proof:", "Verification Contract:", "Evidence:", "fenced JSON `Execution Envelope`"],
  "skill-handoff.md": ["Task:", "Context:", "Allowed scope:", "Forbidden scope:", "Expected output:", "Verification:", "Stop condition:", "fenced JSON `Execution Envelope`"],
});

function validateClaudeTemplate(entryName, body) {
  for (const token of REQUIRED_TEMPLATE_TOKENS[entryName] ?? []) if (!body.includes(token)) throw new Error(`${entryName} is missing Claude fixed-entry token: ${token}`);
  if (["skill-implement.md", "skill-verify.md"].includes(entryName) && !body.includes("docs/lifecycle-artifact-contract.md")) {
    throw new Error(`${entryName} must preserve the canonical lifecycle artifact contract reference`);
  }
}

function validateClaudePluginTemplate(entryName, body) {
  for (const token of (REQUIRED_TEMPLATE_TOKENS[entryName] ?? []).filter((candidate) => candidate !== "docs/execution-envelope-contract.md")) {
    if (!body.includes(token)) throw new Error(`${entryName} is missing Claude plugin fixed-entry token: ${token}`);
  }
  if (!body.includes("${CLAUDE_PLUGIN_ROOT}/contracts/execution-envelope-contract.md")) throw new Error(`${entryName} must resolve the plugin Execution Envelope contract through CLAUDE_PLUGIN_ROOT`);
}

function renderProfileHeader(metadata) {
  return `<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE ${JSON.stringify({
    v: "1.2",
    m: metadata.task_class,
    k: metadata.profile_id.startsWith("claude-plugin-") ? "p" : "c",
    r: metadata.canonical_revision,
    p: metadata.profile_fingerprint.replace(/^sha256:/u, ""),
    a: fixedEntrySha256(JSON.stringify(metadata.canonical_asset_refs)).replace(/^sha256:/u, ""),
  })} -->`;
}

function attachProfileHeader(body, header, placement) {
  const normalized = body.trim();
  if (placement === "before") return `${header}\n${normalized}\n`;
  if (placement !== "after_frontmatter") throw new Error(`Unsupported Claude fixed-entry header placement: ${placement}`);
  const frontmatter = normalized.match(/^---\n[\s\S]*?\n---\n/u);
  if (!frontmatter) throw new Error("Claude plugin fixed entry requires YAML frontmatter before the profile header");
  return `${frontmatter[0]}${header}\n${normalized.slice(frontmatter[0].length)}\n`;
}

export function renderClaudeFixedEntryProfile(entryName, {
  sourceBody = null,
  canonicalContract,
  profileFingerprint,
  controlMap = validateFixedEntryControlMap(),
  profileId = null,
  promptName = entryName,
  headerPlacement = "before",
  templateValidator = validateClaudeTemplate,
} = {}) {
  if (!FIXED_ENTRY_NAMES.includes(entryName)) throw new Error(`Unknown Claude fixed entry: ${entryName}`);
  if (!canonicalContract?.revision || !canonicalContract?.source_digest || !Array.isArray(canonicalContract?.source_paths) || !profileFingerprint) throw new Error("Claude fixed entry requires the shared adapter profile canonical contract and profile fingerprint");
  const body = sourceBody ?? readFileSync(resolve(ROOT, TEMPLATE_ROOT, entryName), "utf8");
  const rendered = renderFixedEntryTemplate(entryName, body, {
    controlMap,
    validateAdapterTemplate: (candidate) => templateValidator(entryName, candidate),
  });
  const definition = fixedEntryDefinition(entryName);
  const canonicalAssetRefs = fixedEntryAssetReferences();
  const metadata = {
    schema_version: "1.2.0",
    profile_id: profileId ?? `claude-${definition.task_class}-fixed-entry-v1`,
    prompt_name: promptName,
    mode: definition.mode,
    task_class: definition.task_class,
    primary_contract: definition.primary_contract,
    requested_contracts: definition.requested_contracts,
    control_ids: controlMap.required_control_ids,
    direct_trigger_ids: rendered.triggers.map((trigger) => trigger.id),
    canonical_asset_refs: canonicalAssetRefs,
    canonical_revision: canonicalContract.revision,
    canonical_source_digest: canonicalContract.source_digest,
    profile_fingerprint: profileFingerprint,
  };
  const content = attachProfileHeader(rendered.content, renderProfileHeader(metadata), headerPlacement);
  return {
    content,
    metadata: {
      ...metadata,
      rendered_sha256: fixedEntrySha256(content),
      rendered_bytes: Buffer.byteLength(content),
    },
  };
}

export function parseClaudeFixedEntryHeader(content) {
  const match = String(content).match(/(?:^|\n)<!-- ASK_CLAUDE_FIXED_ENTRY_PROFILE (\{[^\n]+\}) -->/u);
  if (!match) return null;
  const value = JSON.parse(match[1]);
  const canonicalAssetRefs = Array.isArray(value.ar)
    ? value.ar.map((reference) => ({ asset_type: reference.t, stable_id: reference.id, version: reference.v, record_digest: `sha256:${reference.r}`, content_digest: `sha256:${reference.c}` }))
    : fixedEntryAssetReferences();
  if (value.a && fixedEntrySha256(JSON.stringify(canonicalAssetRefs)) !== `sha256:${value.a}`) throw new Error("Claude fixed-entry header Asset reference digest does not match the verified registry");
  const taskClass = value.m ?? ["implementation", "investigation", "review", "verification", "handoff"].find((candidate) => String(value.id).includes(`-${candidate}-`));
  const entryName = FIXED_ENTRY_NAMES.find((candidate) => fixedEntryDefinition(candidate).task_class === taskClass);
  const definition = entryName ? fixedEntryDefinition(entryName) : null;
  return {
    version: value.v === "1.2" ? "1.2.0" : value.v,
    id: value.id ?? `${value.k === "p" ? "claude-plugin" : "claude"}-${taskClass}-fixed-entry-v1`,
    canonical_revision: value.r,
    canonical_source_digest: value.s ? `sha256:${value.s}` : null,
    profile_fingerprint: `sha256:${value.p}`,
    task_class: definition?.task_class ?? null,
    primary_contract: definition?.primary_contract ?? null,
    requested_contracts: value.rc ? value.rc.split(",") : definition?.requested_contracts ?? [],
    control_ids: value.ci ? value.ci.split(",") : [...FIXED_ENTRY_CONTROL_IDS],
    canonical_asset_ref_digest: value.a ? `sha256:${value.a}` : null,
    canonical_asset_refs: canonicalAssetRefs,
  };
}

export function renderClaudePluginFixedEntryProfiles() {
  const canonicalAssetRefs = fixedEntryAssetReferences();
  const canonicalContract = {
    revision: "ask-fixed-entry-assets-v1",
    source_digest: fixedEntrySha256(JSON.stringify(canonicalAssetRefs)),
    source_paths: [...new Set(FIXED_ENTRY_NAMES.flatMap((entryName) => fixedEntryCanonicalPaths(entryName)))].sort(),
  };
  const templates = FIXED_ENTRY_NAMES.map((entryName) => {
    const pluginName = CLAUDE_PLUGIN_FIXED_ENTRY_MAP[entryName];
    const path = `${PLUGIN_TEMPLATE_ROOT}/${pluginName}.md`;
    const sourceBody = readFileSync(resolve(ROOT, path), "utf8");
    return { entryName, pluginName, path, sourceBody };
  });
  const profileFingerprint = fixedEntrySha256(JSON.stringify({
    canonical_asset_refs: canonicalAssetRefs,
    templates: templates.map(({ path, sourceBody }) => ({ path, sha256: fixedEntrySha256(sourceBody) })),
  }));
  return templates.map(({ entryName, pluginName, sourceBody }) => renderClaudeFixedEntryProfile(entryName, {
    sourceBody,
    canonicalContract,
    profileFingerprint,
    profileId: `claude-plugin-${fixedEntryDefinition(entryName).task_class}-fixed-entry-v1`,
    promptName: pluginName,
    headerPlacement: "after_frontmatter",
    templateValidator: validateClaudePluginTemplate,
  }));
}

export function measureClaudeFixedEntryProfiles(profiles) {
  const fixture = JSON.parse(readFileSync(resolve(ROOT, ROUTE_BASELINE_PATH), "utf8"));
  const routeByEntry = new Map(fixture.profiles.map((profile) => [profile.prompt_name, profile]));
  const measured = profiles.map((profile) => {
    const route = routeByEntry.get(profile.prompt_name);
    if (!route) throw new Error(`Claude route baseline is missing ${profile.prompt_name}`);
    const baselineFixture = `${BASELINE_ROOT}/${profile.prompt_name}`;
    const baselineBytes = readFileSync(resolve(ROOT, baselineFixture));
    if (fixedEntrySha256(baselineBytes) !== route.pre_fixed_sha256) throw new Error(`immutable pre-fixed Claude command drifted: ${profile.prompt_name}`);
    return {
      ...profile,
      baseline_fixture: baselineFixture,
      baseline_bytes: baselineBytes.length,
      baseline_route_depth: route.pre_fixed_stages.length,
      route_depth: route.fixed_stages.length,
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
