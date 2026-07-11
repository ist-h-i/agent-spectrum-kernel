import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ASK_SHARED_MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));

export const TASK_CLASSES = [
  "trivial",
  "implementation",
  "design",
  "investigation",
  "review",
  "handoff",
  "risk-gated",
];

export const OPERATING_MODES = [
  "delivery_quality",
  "adoption_bootstrap",
  "observability_metrics",
  "operation_automation",
];

export const APPROVAL_REQUIRED_SURFACES = [
  {
    id: "data_or_file_deletion",
    label: "data or file deletion outside requested scope",
    patterns: [/\b(rm\s+-rf|git\s+clean\s+-fd|delete|unlink|rmdir)\b/i],
    pathPatterns: [],
  },
  {
    id: "migration_or_destructive_script",
    label: "database migration or destructive script",
    patterns: [/\b(migration|migrate|destructive script|drop table|truncate table)\b/i],
    pathPatterns: [/(^|\/)(migrations?|db\/migrate|schema)\//i],
  },
  {
    id: "deploy_publish_release_or_external_notification",
    label: "deploy, publish, release, or external notification",
    patterns: [/\b(deploy|publish|release|external notification|send notification)\b/i],
    pathPatterns: [/(^|\/)(deploy|release|notifications?)\b/i],
  },
  {
    id: "git_history_or_remote_ref_mutation",
    label: "force push, history rewrite, or remote ref deletion",
    patterns: [/\b(git\s+reset\s+--hard|git\s+push\s+--force|force[- ]push|history rewrite|delete remote ref|git\s+clean\s+-fd)\b/i],
    pathPatterns: [],
  },
  {
    id: "auth_permission_billing_payment_email_or_telemetry",
    label: "auth, authorization, billing, payment, email, telemetry, or permission behavior",
    patterns: [/\b(auth|authorization|permission|billing|payment|email|telemetry)\b/i],
    pathPatterns: [/(^|\/)(auth|permissions?|billing|payments?|email|telemetry)\b/i],
  },
  {
    id: "secrets_credentials_tokens_keys_or_env",
    label: "secrets, credentials, tokens, keys, or environment variables",
    patterns: [/\b(secret|credential|token|api[_-]?key|env var|environment variable|\.env)\b/i],
    pathPatterns: [/(^|\/)\.env(\.|$)|(^|\/)(secrets?|credentials?)\b/i],
  },
  {
    id: "broad_dependency_install",
    label: "new dependency with broad transitive impact",
    patterns: [/\b(npm\s+install|pnpm\s+add|yarn\s+add|bun\s+add|new dependency|dependency change)\b/i],
    pathPatterns: [/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i],
  },
  {
    id: "global_machine_state",
    label: "global machine state mutation",
    patterns: [/\b(sudo|brew\s+install|npm\s+install\s+-g|launchctl|global machine state)\b/i],
    pathPatterns: [],
  },
  {
    id: "production_config_or_infrastructure",
    label: "production configuration or infrastructure",
    patterns: [/\b(production config|production configuration|infrastructure|infra|terraform|kubernetes|cloud config)\b/i],
    pathPatterns: [/(^|\/)(infra|infrastructure|terraform|k8s|kubernetes)\b/i],
  },
];

export const APPROVAL_REQUIRED_SURFACE_IDS = new Set(APPROVAL_REQUIRED_SURFACES.map((surface) => surface.id));
export const ADAPTER_EVIDENCE_LEVELS = [
  "projected",
  "runtime_detected",
  "executed",
  "behavior_verified",
  "unsupported",
  "unknown",
];
export const ADAPTER_LEVELS_THAT_SUPPORT_CAPABILITY_CLAIMS = new Set(["behavior_verified"]);

// This is the single execution contract for projected Codex prompts. The
// installer, runner, and sensors must not derive mode or output requirements
// independently.
export const CODEX_PROMPT_CONTRACTS = {
  "skill-implement.md": {
    mode: "implementation",
    sandbox: "workspace-write",
    requiredSections: ["Changed:", "Verified:", "Not verified:", "Risks / assumptions:", "Next:", "Execution Envelope:"],
  },
  "skill-investigate.md": {
    mode: "investigation",
    sandbox: "workspace-write",
    requiredSections: ["Findings:", "Cause:", "Changed:", "Verified:", "Unknown / not verified:", "Next:", "Execution Envelope:"],
  },
  "skill-review.md": {
    mode: "review",
    sandbox: "read-only",
    requiredSections: ["Decision:", "Blocking evidence:", "Passed required gates:", "Insufficient evidence:", "Non-blocking follow-ups:", "Residual risk:", "Execution Envelope:"],
  },
  "skill-verify.md": {
    mode: "verification",
    sandbox: "workspace-write",
    requiredSections: ["Verification Contract:", "Evidence:", "Not verified:", "Next verification:", "Execution Envelope:"],
  },
  "skill-handoff.md": {
    mode: "handoff",
    sandbox: "read-only",
    requiredSections: ["Task:", "Context:", "Allowed scope:", "Forbidden scope:", "Expected output:", "Verification:", "Stop condition:", "Execution Envelope:"],
  },
};

export const CODEX_PROMPT_MODES = new Set(Object.values(CODEX_PROMPT_CONTRACTS).map((contract) => contract.mode));

export function codexPromptContractForMode(mode) {
  return Object.values(CODEX_PROMPT_CONTRACTS).find((contract) => contract.mode === mode) ?? null;
}

export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function hashFile(path) {
  return hashText(readFileSync(path, "utf8"));
}

export function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return { ok: false, value: null, error: "missing" };
  }
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")), error: null };
  } catch (error) {
    return { ok: false, value: null, error: error.message };
  }
}

export function collectTextFiles(root, paths, extensions = [".md", ".txt", ".json", ".yml", ".yaml"]) {
  const files = [];

  function walk(path) {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) {
      return;
    }
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolutePath).sort()) {
        walk(`${path}/${entry}`);
      }
      return;
    }
    if (stat.isFile() && extensions.some((extension) => path.endsWith(extension))) {
      files.push(path);
    }
  }

  for (const path of paths) {
    walk(path);
  }
  return files;
}

export function detectApprovalRequiredSurfaces({ text = "", paths = [] } = {}) {
  const findings = [];
  const units = splitDetectionUnits(text);
  for (const surface of APPROVAL_REQUIRED_SURFACES) {
    const textMatched = units.some(
      (unit) => surface.patterns.some((pattern) => pattern.test(unit)) && !isNonActionRiskReference(unit),
    );
    const pathMatched = paths.some((path) => surface.pathPatterns.some((pattern) => pattern.test(path)));
    if (textMatched || pathMatched) {
      findings.push({
        id: surface.id,
        label: surface.label,
        evidence: textMatched ? "text" : "path",
      });
    }
  }
  return findings;
}

function splitDetectionUnits(text) {
  return text
    .split(/\r?\n|(?<=[.!?])\s+/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function isNonActionRiskReference(unit) {
  const normalized = unit.toLowerCase();
  if (hasUnnegatedRiskAction(normalized)) {
    return false;
  }
  if (/\b(out of scope|outside scope|not in scope|scope excludes)\b/.test(normalized)) {
    return true;
  }
  if (/\b(was|were|is|are|has|have|had)?\s*not\s+(?:been\s+)?(?:touched|modified|changed|executed|performed|sent|deployed|released|published|enabled|configured|rotated|installed)\b/.test(normalized)) {
    return true;
  }
  if (/\bno\b.{0,80}\b(?:deployment|release|publish|external notification|notification|auth|authorization|permission|billing|payment|email|telemetry)\b.{0,80}\b(?:performed|executed|sent|changed|modified|touched)\b/.test(normalized)) {
    return true;
  }
  if (/\b(?:reviewed|read|inspected|mentioned|referenced)\b.{0,80}\b(?:auth|authorization|permission|billing|payment|email|telemetry|deploy|release|docs?|documentation)\b/.test(normalized)) {
    return true;
  }
  return false;
}

function hasUnnegatedRiskAction(normalized) {
  if (!/\b(?:changed|modified|updated|implemented|enabled|disabled|deployed|published|released|sent|rotated|installed|deleted|migrated)\b/.test(normalized)) {
    return false;
  }
  return !/\b(?:not|no|never|without)\b.{0,80}\b(?:changed|modified|updated|implemented|enabled|disabled|deployed|published|released|sent|rotated|installed|deleted|migrated)\b/.test(normalized);
}

export function parseAdapterCapabilityMatrix(root = REPO_ROOT) {
  const path = resolve(root, "docs/adapter-capability-matrix.md");
  if (!existsSync(path)) {
    return [];
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\|\s*Capability\s*\|/.test(line));
  if (headerIndex === -1 || headerIndex + 2 >= lines.length) {
    return [];
  }
  const headers = splitMarkdownTableRow(lines[headerIndex]);
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) {
      break;
    }
    const cells = splitMarkdownTableRow(line);
    if (cells.length < headers.length) {
      continue;
    }
    const statuses = {};
    for (let index = 1; index < headers.length; index += 1) {
      statuses[normalizeKey(headers[index])] = cells[index].trim().toLowerCase();
    }
    rows.push({
      capability: cells[0].trim(),
      statuses,
    });
  }
  return rows;
}

export function findUnsupportedCapabilityClaims(targetRoot, matrixRoot = REPO_ROOT) {
  const matrix = parseAdapterCapabilityMatrix(matrixRoot);
  const files = collectTextFiles(targetRoot, ["README.md", "AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "docs", "adapters"]);
  const findings = [];

  for (const file of files) {
    if (file === "docs/adapter-capability-matrix.md") {
      continue;
    }
    const text = readFileSync(resolve(targetRoot, file), "utf8");
    const units = text.split(/\r?\n|(?<=[.!?])\s+/).map((unit) => unit.trim()).filter(Boolean);
    for (const unit of units) {
      const normalized = normalizeText(unit);
      if (!/\b(supports|supported|ready|implemented|available|complete)\b/i.test(unit)) {
        continue;
      }
      if (/\b(partial|unsupported|unknown|insufficient evidence|downgrad|not supported|does not support|no support)\b/i.test(unit)) {
        continue;
      }
      for (const row of matrix) {
        const capabilityTokens = importantTokens(row.capability);
        if (!capabilityTokens.every((token) => normalized.includes(token))) {
          continue;
        }
        for (const [adapter, status] of Object.entries(row.statuses)) {
        if (ADAPTER_LEVELS_THAT_SUPPORT_CAPABILITY_CLAIMS.has(status)) {
          continue;
        }
          const adapterTokens = adapter.split("_");
          if (!adapterTokens.every((token) => normalized.includes(token))) {
            continue;
          }
          findings.push({
            file,
            adapter: adapter.replace(/_/g, " "),
            capability: row.capability,
            status,
            claim: unit,
          });
        }
      }
    }
  }

  return findings;
}

export function findPrivacyStorageConcerns(targetRoot) {
  const files = collectTextFiles(targetRoot, ["docs/ai", ".claude", ".agents", ".agent-spectrum-kernel"], [".json", ".yml", ".yaml", ".jsonl"]);
  const concerns = [];
  const patterns = [
    { id: "raw_prompt_storage", pattern: /\braw_prompt_storage\s*:\s*true\b|\"raw_prompts_stored\"\s*:\s*true/i },
    { id: "secrets_storage", pattern: /\bsecrets_storage\s*:\s*true\b|\"secrets_stored\"\s*:\s*true/i },
    { id: "customer_data_storage", pattern: /\bcustomer_data_storage\s*:\s*true\b|\"customer_data_stored\"\s*:\s*true/i },
    { id: "personal_data_storage", pattern: /\bpersonal_data_storage\s*:\s*true\b|\"personal_data_stored\"\s*:\s*true/i },
    { id: "full_command_output", pattern: /\"full_command_output\"\s*:/i },
    { id: "full_file_contents", pattern: /\"full_file_contents\"\s*:/i },
  ];
  for (const file of files) {
    const text = readFileSync(resolve(targetRoot, file), "utf8");
    for (const entry of patterns) {
      if (entry.pattern.test(text)) {
        concerns.push({ file, id: entry.id });
      }
    }
  }
  return concerns;
}

function splitMarkdownTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function normalizeKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function importantTokens(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 3 && !["support", "supported"].includes(token));
}
