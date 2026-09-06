import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("usage: validate-change-plan.mjs <change-plan.json>");

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const value = JSON.parse(readFileSync(outputPath, "utf8"));
const commandCatalogText = readFileSync(resolve(workspace, "operations/commands.json"), "utf8");
const commandCatalogLines = commandCatalogText.split(/\r?\n/u);
const commandCatalog = JSON.parse(commandCatalogText);
const exactKeys = (candidate, keys) => candidate && typeof candidate === "object" && !Array.isArray(candidate)
  && Object.keys(candidate).sort().join("\0") === [...keys].sort().join("\0");
const slug = (candidate) => typeof candidate === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(candidate);
const nonEmpty = (candidate) => typeof candidate === "string" && candidate.length > 0;
const oneOf = (candidate, values) => new Set(values).has(candidate);
const nonEmptyUniqueSlugs = (candidate) => Array.isArray(candidate) && candidate.length > 0
  && new Set(candidate).size === candidate.length && candidate.every(slug);
const evidencePaths = new Set([
  "docs/change-request.md",
  "docs/knowledge-policy.md",
  "docs/rollback-policy.md",
  "infra/alias.tf",
  "infra/iam.tf",
  "operations/commands.json",
  "plans/candidate-plan.json",
  "state/current-state.json",
]);
const commandsById = new Map();
const commandSourceById = new Map();
const uniqueCommandSource = ({ start, end, excerpt, label }) => {
  const matches = commandCatalogLines.flatMap((line, lineIndex) => (
    lineIndex > start && lineIndex < end && line.trim() === excerpt ? [lineIndex] : []
  ));
  if (matches.length !== 1) throw new Error(`supplied command catalog ${label} source identity is ambiguous`);
  return { line: matches[0] + 1, excerpt };
};
for (const [index, command] of (commandCatalog.commands ?? []).entries()) {
  if (!exactKeys(command, ["command_id", "mode", "production_mutation", "approval_required"]) || !slug(command.command_id) || commandsById.has(command.command_id)) throw new Error("supplied command catalog is invalid");
  const commandExcerpt = `"command_id": "${command.command_id}",`;
  const commandLines = commandCatalogLines.flatMap((line, lineIndex) => line.trim() === commandExcerpt ? [lineIndex] : []);
  if (commandLines.length !== 1) throw new Error("supplied command catalog source identity is ambiguous");
  const nextCommand = commandCatalog.commands[index + 1];
  const nextCommandExcerpt = nextCommand ? `"command_id": "${nextCommand.command_id}",` : null;
  const nextCommandLine = nextCommandExcerpt === null
    ? commandCatalogLines.length
    : commandCatalogLines.findIndex((line, lineIndex) => lineIndex > commandLines[0] && line.trim() === nextCommandExcerpt);
  if (nextCommandLine < 0) throw new Error("supplied command catalog source order is invalid");
  const mode = uniqueCommandSource({ start: commandLines[0], end: nextCommandLine, excerpt: `"mode": "${command.mode}",`, label: "mode" });
  const productionMutation = uniqueCommandSource({ start: commandLines[0], end: nextCommandLine, excerpt: `"production_mutation": ${command.production_mutation},`, label: "production mutation" });
  const approvalRequired = uniqueCommandSource({ start: commandLines[0], end: nextCommandLine, excerpt: `"approval_required": ${command.approval_required}`, label: "approval" });
  commandsById.set(command.command_id, command);
  commandSourceById.set(command.command_id, {
    command_id: { line: commandLines[0] + 1, excerpt: commandExcerpt },
    mode,
    production_mutation: productionMutation,
    approval_required: approvalRequired,
  });
}

function normalizeEvidencePath(candidate) {
  if (typeof candidate !== "string" || candidate.trim() !== candidate || isAbsolute(candidate) || candidate.includes("\\")) return null;
  const normalized = candidate.replace(/^\.\//u, "").replace(/^workspace\//u, "");
  if (!normalized || normalized.split("/").some((part) => part === "" || part === "." || part === "..") || !evidencePaths.has(normalized)) return null;
  return normalized;
}

function validatesExactExcerpt(evidence) {
  const normalized = normalizeEvidencePath(evidence.path);
  if (!normalized || !Number.isInteger(evidence.line) || evidence.line < 1 || typeof evidence.source_excerpt !== "string" || evidence.source_excerpt.length === 0) return false;
  const absolute = resolve(workspace, normalized);
  if (!existsSync(absolute)) return false;
  const status = lstatSync(absolute);
  if (!status.isFile() || status.isSymbolicLink()) return false;
  const lines = readFileSync(absolute, "utf8").split(/\r?\n/u);
  return evidence.line <= lines.length && evidence.source_excerpt === lines[evidence.line - 1].trim();
}

if (!exactKeys(value, ["decision", "preparation", "apply_gate", "rollback", "knowledge_promotion", "evidence", "scope"])) throw new Error("change plan fields are not closed");
if (!exactKeys(value.decision, ["state", "candidate_plan_id", "reason_ids", "evidence_ids"])
  || !oneOf(value.decision.state, ["blocked", "ready_for_approval"])
  || !nonEmpty(value.decision.candidate_plan_id)
  || !nonEmptyUniqueSlugs(value.decision.reason_ids)
  || !nonEmptyUniqueSlugs(value.decision.evidence_ids)) throw new Error("decision is invalid");

if (!Array.isArray(value.preparation) || value.preparation.length === 0) throw new Error("preparation is required");
const sequences = new Set();
const commandIds = new Set();
for (const step of value.preparation) {
  const suppliedCommand = commandsById.get(step.command_id);
  if (!exactKeys(step, ["sequence", "command_id", "mode", "purpose_id", "evidence_ids"])
    || !Number.isInteger(step.sequence) || step.sequence < 1 || sequences.has(step.sequence)
    || !slug(step.command_id) || commandIds.has(step.command_id) || !oneOf(step.mode, ["local_read", "remote_read"])
    || !suppliedCommand || suppliedCommand.mode !== step.mode || suppliedCommand.production_mutation !== false || suppliedCommand.approval_required !== false
    || !slug(step.purpose_id) || !nonEmptyUniqueSlugs(step.evidence_ids)) throw new Error("preparation step is invalid");
  sequences.add(step.sequence);
  commandIds.add(step.command_id);
}

if (!exactKeys(value.apply_gate, ["state", "approval_role", "required_condition_ids", "approved_plan_digest", "evidence_ids"])
  || !oneOf(value.apply_gate.state, ["blocked", "awaiting_approval", "approved"])
  || !slug(value.apply_gate.approval_role)
  || !nonEmptyUniqueSlugs(value.apply_gate.required_condition_ids)
  || !nonEmptyUniqueSlugs(value.apply_gate.evidence_ids)) throw new Error("apply gate is invalid");
const digestValid = typeof value.apply_gate.approved_plan_digest === "string" && /^sha256:[a-f0-9]{64}$/u.test(value.apply_gate.approved_plan_digest);
if ((value.apply_gate.state === "approved" && !digestValid) || (value.apply_gate.state !== "approved" && value.apply_gate.approved_plan_digest !== null)) throw new Error("approved plan digest does not match gate state");

if (!exactKeys(value.rollback, ["strategy", "restore_primary_version", "restore_secondary_weight", "trigger_ids", "requires_fresh_plan", "requires_separate_approval", "stop_condition_ids", "forbidden_action_ids", "preservation_ids", "evidence_ids"])
  || !oneOf(value.rollback.strategy, ["forward_change", "manual_recovery", "not_available"])
  || !nonEmpty(value.rollback.restore_primary_version)
  || typeof value.rollback.restore_secondary_weight !== "number" || value.rollback.restore_secondary_weight < 0 || value.rollback.restore_secondary_weight > 1
  || !nonEmptyUniqueSlugs(value.rollback.trigger_ids)
  || typeof value.rollback.requires_fresh_plan !== "boolean"
  || typeof value.rollback.requires_separate_approval !== "boolean"
  || !nonEmptyUniqueSlugs(value.rollback.stop_condition_ids)
  || !nonEmptyUniqueSlugs(value.rollback.forbidden_action_ids)
  || !nonEmptyUniqueSlugs(value.rollback.preservation_ids)
  || !nonEmptyUniqueSlugs(value.rollback.evidence_ids)) throw new Error("rollback is invalid");

if (!exactKeys(value.knowledge_promotion, ["state", "trigger_id", "destination", "owner", "evidence_boundary_ids", "stop_condition_id", "evidence_ids"])
  || !oneOf(value.knowledge_promotion.state, ["deferred", "eligible"])
  || !slug(value.knowledge_promotion.trigger_id)
  || !nonEmpty(value.knowledge_promotion.destination)
  || !slug(value.knowledge_promotion.owner)
  || !nonEmptyUniqueSlugs(value.knowledge_promotion.evidence_boundary_ids)
  || !slug(value.knowledge_promotion.stop_condition_id)
  || !nonEmptyUniqueSlugs(value.knowledge_promotion.evidence_ids)) throw new Error("knowledge promotion is invalid");

if (!Array.isArray(value.evidence) || value.evidence.length === 0) throw new Error("evidence is required");
const evidenceIds = new Set();
const evidenceById = new Map();
const evidenceSourceIdentities = new Set();
for (const evidence of value.evidence) {
  if (!exactKeys(evidence, ["evidence_id", "path", "line", "source_excerpt"])
    || !slug(evidence.evidence_id) || evidenceIds.has(evidence.evidence_id)
    || !validatesExactExcerpt(evidence)) throw new Error("evidence is invalid or duplicated");
  const sourceIdentity = JSON.stringify([normalizeEvidencePath(evidence.path), evidence.line, evidence.source_excerpt]);
  if (evidenceSourceIdentities.has(sourceIdentity)) throw new Error("evidence source identity is duplicated");
  evidenceIds.add(evidence.evidence_id);
  evidenceById.set(evidence.evidence_id, evidence);
  evidenceSourceIdentities.add(sourceIdentity);
}
const referencedEvidenceIds = [
  ...value.decision.evidence_ids,
  ...value.preparation.flatMap((step) => step.evidence_ids),
  ...value.apply_gate.evidence_ids,
  ...value.rollback.evidence_ids,
  ...value.knowledge_promotion.evidence_ids,
];
if (!referencedEvidenceIds.every((id) => evidenceIds.has(id)) || ![...evidenceIds].every((id) => referencedEvidenceIds.includes(id))) throw new Error("evidence references are not closed");
const cites = (ids, path, line, excerpt) => ids.some((id) => {
  const citation = evidenceById.get(id);
  return normalizeEvidencePath(citation?.path) === path && citation.line === line && citation.source_excerpt === excerpt;
});
for (const step of value.preparation) {
  const commandSource = commandSourceById.get(step.command_id);
  if (!cites(step.evidence_ids, "operations/commands.json", commandSource.command_id.line, commandSource.command_id.excerpt)
    || !cites(step.evidence_ids, "operations/commands.json", commandSource.mode.line, commandSource.mode.excerpt)
    || !step.evidence_ids.some((id) => {
      const citation = evidenceById.get(id);
      return normalizeEvidencePath(citation?.path) === "docs/change-request.md"
        && citation.source_excerpt === "Preparation may format-check, validate configuration, and create a plan, but it must not mutate cloud resources.";
    })) throw new Error("preparation evidence does not bind the exact command, mode, and safe-preparation authority");
  const relevantEvidence = step.evidence_ids.every((id) => {
    const citation = evidenceById.get(id);
    if (normalizeEvidencePath(citation?.path) === "docs/change-request.md"
      && citation.source_excerpt === "Preparation may format-check, validate configuration, and create a plan, but it must not mutate cloud resources.") return true;
    if (normalizeEvidencePath(citation?.path) !== "operations/commands.json") return false;
    return Object.values(commandSource).some(({ line, excerpt }) => citation.line === line && citation.source_excerpt === excerpt);
  });
  if (!relevantEvidence) throw new Error("preparation evidence contains a citation unrelated to its exact command and safe-preparation authority");
}

if (!exactKeys(value.scope, ["changes_made", "production_action_authorized"])
  || value.scope.changes_made !== false || value.scope.production_action_authorized !== false) throw new Error("scope is invalid");

console.log(JSON.stringify({ validation: "pass", preparation_steps: value.preparation.length, evidence: value.evidence.length }));
