import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_PROMPT_CONTRACTS, parseCodexCompactProfileHeader } from "./ask-shared.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTROL_IDS = ["scope", "verification", "risk_approval", "evidence", "missing_evidence", "output"];
const COMMON_CANONICAL_SOURCES = [
  "AGENTS.md",
  "docs/execution-envelope-contract.md",
  "skills/evidence-ledger/SKILL.md",
  "skills/risk-gate/SKILL.md",
];

export const CODEX_COMPACT_PROFILE_DEFINITIONS = Object.freeze({
  "skill-implement.md": Object.freeze({
    profileId: "codex-implementation-compact-v1",
    taskClass: "implementation",
    primarySkill: "controlled-implementation",
    requestedContracts: ["controlled-implementation", "test-first-verification", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/lifecycle-artifact-contract.md", "skills/controlled-implementation/SKILL.md", "skills/test-first-verification/SKILL.md"],
    baselineBytes: 2662,
    baselineRouteDepth: 5,
    routeDepth: 2,
  }),
  "skill-investigate.md": Object.freeze({
    profileId: "codex-investigation-compact-v1",
    taskClass: "investigation",
    primarySkill: "doubt-driven-development",
    requestedContracts: ["doubt-driven-development", "test-first-verification", "controlled-implementation", "evidence-ledger", "risk-gate"],
    canonicalSources: ["skills/doubt-driven-development/SKILL.md", "skills/test-first-verification/SKILL.md", "skills/controlled-implementation/SKILL.md"],
    baselineBytes: 1902,
    baselineRouteDepth: 4,
    routeDepth: 2,
  }),
  "skill-review.md": Object.freeze({
    profileId: "codex-review-compact-v1",
    taskClass: "review",
    primarySkill: "review-router",
    requestedContracts: ["review-router", "review-final-merge-gate", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/lifecycle-traceability-contract.md", "schemas/review-signal-gate-map.json", "skills/review-router/SKILL.md", "skills/review-final-merge-gate/SKILL.md"],
    baselineBytes: 2772,
    baselineRouteDepth: 2,
    routeDepth: 2,
  }),
  "skill-verify.md": Object.freeze({
    profileId: "codex-verification-compact-v1",
    taskClass: "verification",
    primarySkill: "test-first-verification",
    requestedContracts: ["test-first-verification", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/lifecycle-artifact-contract.md", "skills/test-first-verification/SKILL.md"],
    baselineBytes: 2291,
    baselineRouteDepth: 2,
    routeDepth: 2,
  }),
  "skill-handoff.md": Object.freeze({
    profileId: "codex-handoff-compact-v1",
    taskClass: "handoff",
    primarySkill: "handoff-generation",
    requestedContracts: ["handoff-generation", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/agent-session-state-contract.md", "skills/handoff-generation/SKILL.md"],
    baselineBytes: 1744,
    baselineRouteDepth: 1,
    routeDepth: 1,
  }),
});

const CANONICAL_MARKERS = Object.freeze({
  "AGENTS.md": ["## 4. Safety and external effects", "## 7. Verification first"],
  "docs/execution-envelope-contract.md": ["Execution Envelope", "insufficient_evidence"],
  "skills/evidence-ledger/SKILL.md": ["Downgrade language", "Missing evidence"],
  "skills/risk-gate/SKILL.md": ["approval is explicit", "destructive"],
});

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalRevision() {
  const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, "manifest.json"), "utf8"));
  if (typeof manifest.version !== "string" || !manifest.version) throw new Error("manifest.json version is required for Codex compact profiles");
  return `ask-${manifest.version}`;
}

function canonicalEntries(definition) {
  const paths = [...new Set([...COMMON_CANONICAL_SOURCES, ...definition.canonicalSources])].sort();
  return paths.map((path) => {
    const content = readFileSync(resolve(REPO_ROOT, path), "utf8");
    for (const marker of CANONICAL_MARKERS[path] ?? []) {
      if (!content.includes(marker)) throw new Error(`canonical Codex compact-profile control marker is missing: ${path}: ${marker}`);
    }
    return { path, sha256: sha256(content.trimEnd()) };
  });
}

function validatePromptBody(promptName, body, definition) {
  const contract = CODEX_PROMPT_CONTRACTS[promptName];
  if (!contract) throw new Error(`Codex compact profile has no prompt contract: ${promptName}`);
  if (!body.includes(`Primary contract: \`${definition.primarySkill}\``)) throw new Error(`${promptName} must name its primary canonical contract`);
  if (body.includes("operating-mode-router") || body.includes("skill-router")) throw new Error(`${promptName} must not route through upper routers after entry mode is fixed`);
  for (const controlId of CONTROL_IDS) {
    if (!body.includes(`[${controlId}]`)) throw new Error(`${promptName} is missing compact fallback control: ${controlId}`);
  }
  for (const section of contract.requiredSections) {
    if (!body.includes(section)) throw new Error(`${promptName} is missing required output evidence section: ${section}`);
  }
  const conflictingControl = body.match(/\b(?:skip|bypass|ignore|disable)\b.{0,100}\b(?:risk|approval|verification|evidence)\b/iu);
  if (conflictingControl && !/\b(?:do not|never|must not)\b.{0,40}\b(?:skip|bypass|ignore|disable)\b/iu.test(conflictingControl[0])) {
    throw new Error(`${promptName} conflicts with a canonical risk, approval, verification, or evidence control`);
  }
  if (!body.includes("$ARGUMENTS")) throw new Error(`${promptName} must retain the Codex argument placeholder`);
}

export function renderCodexCompactProfile(promptName, sourceBody = null) {
  const definition = CODEX_COMPACT_PROFILE_DEFINITIONS[promptName];
  if (!definition) throw new Error(`Unknown Codex compact profile prompt: ${promptName}`);
  const body = sourceBody ?? readFileSync(resolve(REPO_ROOT, "adapters", "codex", "prompts", promptName), "utf8");
  validatePromptBody(promptName, body, definition);
  const sources = canonicalEntries(definition);
  const canonicalDigest = sha256(stableJson(sources));
  const metadata = {
    schema_version: "1.0.0",
    profile_id: definition.profileId,
    mode: CODEX_PROMPT_CONTRACTS[promptName].mode,
    task_class: definition.taskClass,
    primary_contract: definition.primarySkill,
    requested_contracts: definition.requestedContracts,
    skipped_routers: ["operating-mode-router", "skill-router"],
    controls: CONTROL_IDS,
    canonical_revision: canonicalRevision(),
    canonical_digest: canonicalDigest,
    canonical_sources: sources,
    baseline_bytes: definition.baselineBytes,
    baseline_route_depth: definition.baselineRouteDepth,
    route_depth: definition.routeDepth,
  };
  const header = `<!-- ASK_CODEX_COMPACT_PROFILE ${JSON.stringify({
    v: metadata.schema_version,
    id: metadata.profile_id,
    revision: metadata.canonical_revision,
    digest: metadata.canonical_digest,
    contracts: metadata.requested_contracts,
    controls: metadata.controls,
    route_depth: metadata.route_depth,
  })} -->`;
  const content = `${header}\n${body.trim()}\n`;
  return {
    content,
    metadata: {
      ...metadata,
      rendered_sha256: sha256(content),
      rendered_bytes: Buffer.byteLength(content),
    },
  };
}

export function codexCompactProfileCanonicalPaths(promptName) {
  const definition = CODEX_COMPACT_PROFILE_DEFINITIONS[promptName];
  if (!definition) return [];
  return [...new Set([...COMMON_CANONICAL_SOURCES, ...definition.canonicalSources])].sort();
}

export { parseCodexCompactProfileHeader };

export function inspectCodexCompactProfiles(promptNames = Object.keys(CODEX_COMPACT_PROFILE_DEFINITIONS)) {
  const profiles = promptNames.map((promptName) => ({ prompt_name: promptName, ...renderCodexCompactProfile(promptName).metadata }));
  return {
    profiles,
    baseline_bytes: profiles.reduce((total, profile) => total + profile.baseline_bytes, 0),
    rendered_bytes: profiles.reduce((total, profile) => total + profile.rendered_bytes, 0),
    baseline_route_depth: profiles.reduce((total, profile) => total + profile.baseline_route_depth, 0),
    route_depth: profiles.reduce((total, profile) => total + profile.route_depth, 0),
  };
}
