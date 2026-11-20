import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("usage: validate-investigation.mjs <investigation.json>");

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const value = JSON.parse(readFileSync(outputPath, "utf8"));
const exactKeys = (candidate, keys) => candidate && typeof candidate === "object" && !Array.isArray(candidate)
  && Object.keys(candidate).sort().join("\0") === [...keys].sort().join("\0");
const slug = (candidate) => typeof candidate === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(candidate);
const oneOf = (candidate, values) => new Set(values).has(candidate);
const nonEmpty = (candidate) => typeof candidate === "string" && candidate.trim().length > 0;
const evidencePaths = new Set([
  "docs/investigation-contract.md",
  "observability/cache-samples.csv",
  "observability/release-events.json",
  "observability/request-windows.csv",
  "observability/runtime-profile.json",
  "package.json",
  "scripts/replay-summary.mjs",
  "src/cache-key.mjs",
  "src/summary-replay.mjs",
  "src/summary-service.mjs",
  "test/integration/summary-replay.test.mjs",
  "test/unit/cache-key.test.mjs",
]);
const states = ["supported", "weakened", "falsified", "unresolved"];
const confidenceLevels = ["high", "medium", "low"];

function normalizeEvidencePath(candidate) {
  if (typeof candidate !== "string" || candidate.trim() !== candidate || isAbsolute(candidate) || candidate.includes("\\")) return null;
  const normalized = candidate.replace(/^\.\//u, "").replace(/^workspace\//u, "");
  if (!normalized || normalized.split("/").some((part) => part === "" || part === "." || part === "..") || !evidencePaths.has(normalized)) return null;
  return normalized;
}

function validatesExactExcerpt(evidence) {
  const normalized = normalizeEvidencePath(evidence.path);
  if (!normalized || !Number.isInteger(evidence.line) || evidence.line < 1 || typeof evidence.source_excerpt !== "string") return false;
  const absolute = resolve(workspace, normalized);
  if (!existsSync(absolute) || realpathSync(absolute) !== absolute) return false;
  const status = lstatSync(absolute);
  if (!status.isFile() || status.isSymbolicLink()) return false;
  const lines = readFileSync(absolute, "utf8").split(/\r?\n/u);
  return evidence.line <= lines.length && evidence.source_excerpt === lines[evidence.line - 1].trim() && evidence.source_excerpt.length > 0;
}

if (!exactKeys(value, ["overall_assessment", "hypotheses", "next_check", "scope"])) throw new Error("investigation fields are not closed");
if (!exactKeys(value.overall_assessment, ["status", "leading_hypothesis_id", "causal_basis"])) throw new Error("overall assessment fields are not closed");
if (!oneOf(value.overall_assessment.status, ["supported_not_proven", "insufficient_evidence", "no_regression"])
  || !slug(value.overall_assessment.leading_hypothesis_id)
  || !oneOf(value.overall_assessment.causal_basis, ["association_only", "controlled_intervention"])) throw new Error("overall assessment is invalid");
if (!Array.isArray(value.hypotheses) || value.hypotheses.length < 2) throw new Error("at least two hypotheses are required");

const hypothesisIds = new Set();
for (const hypothesis of value.hypotheses) {
  if (!exactKeys(hypothesis, ["id", "mechanism", "state", "confidence", "evidence"])) throw new Error("hypothesis fields are not closed");
  if (!slug(hypothesis.id) || hypothesisIds.has(hypothesis.id)) throw new Error("hypothesis id is invalid or duplicated");
  if (!nonEmpty(hypothesis.mechanism)) throw new Error("hypothesis mechanism is invalid");
  hypothesisIds.add(hypothesis.id);
  if (!oneOf(hypothesis.state, states) || !oneOf(hypothesis.confidence, confidenceLevels)) throw new Error("hypothesis state is invalid");
  if (!Array.isArray(hypothesis.evidence) || hypothesis.evidence.length === 0) throw new Error("hypothesis evidence is required");
  for (const evidence of hypothesis.evidence) {
    if (!exactKeys(evidence, ["path", "line", "source_excerpt"]) || !validatesExactExcerpt(evidence)) throw new Error("hypothesis evidence is not an exact supplied source line");
  }
}

if (!hypothesisIds.has(value.overall_assessment.leading_hypothesis_id)) throw new Error("leading hypothesis target is invalid");
if (!exactKeys(value.next_check, ["hypothesis_id", "environment", "action_type", "candidate_identity", "expected_signals", "stop_condition", "read_only", "customer_traffic_change", "runtime_configuration_change", "live_cache_mutation"])) throw new Error("next check fields are not closed");
if (!hypothesisIds.has(value.next_check.hypothesis_id)
  || !oneOf(value.next_check.environment, ["local_replay", "staging_read_only"])
  || !nonEmpty(value.next_check.action_type)
  || !nonEmpty(value.next_check.candidate_identity)
  || !Array.isArray(value.next_check.expected_signals)
  || value.next_check.expected_signals.length === 0
  || new Set(value.next_check.expected_signals).size !== value.next_check.expected_signals.length
  || !value.next_check.expected_signals.every(nonEmpty)
  || !nonEmpty(value.next_check.stop_condition)
  || !["read_only", "customer_traffic_change", "runtime_configuration_change", "live_cache_mutation"].every((field) => typeof value.next_check[field] === "boolean")) throw new Error("next check is invalid");
if (!exactKeys(value.scope, ["changes_made", "production_action_authorized"]) || value.scope.changes_made !== false || value.scope.production_action_authorized !== false) throw new Error("investigation scope is invalid");

console.log(JSON.stringify({ validation: "pass", hypotheses: value.hypotheses.length }));
