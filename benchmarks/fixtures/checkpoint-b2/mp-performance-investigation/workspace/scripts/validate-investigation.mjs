import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("usage: validate-investigation.mjs <investigation.json>");

const value = JSON.parse(readFileSync(path, "utf8"));
const exactKeys = (candidate, keys) => candidate && typeof candidate === "object" && !Array.isArray(candidate)
  && Object.keys(candidate).sort().join("\0") === [...keys].sort().join("\0");
const nonBlank = (candidate) => typeof candidate === "string" && candidate.trim().length > 0;

if (!exactKeys(value, ["overall_assessment", "hypotheses", "next_check", "scope"])) throw new Error("investigation fields are not closed");
if (!exactKeys(value.overall_assessment, ["status", "summary"])) throw new Error("overall assessment fields are not closed");
if (!new Set(["supported_not_proven", "insufficient_evidence", "no_regression"]).has(value.overall_assessment.status) || !nonBlank(value.overall_assessment.summary)) throw new Error("overall assessment is invalid");
if (!Array.isArray(value.hypotheses) || value.hypotheses.length < 2) throw new Error("at least two hypotheses are required");
const hypothesisIds = new Set();
for (const hypothesis of value.hypotheses) {
  if (!exactKeys(hypothesis, ["id", "state", "confidence", "rationale", "evidence"])) throw new Error("hypothesis fields are not closed");
  if (!nonBlank(hypothesis.id) || hypothesisIds.has(hypothesis.id)) throw new Error("hypothesis id is invalid or duplicated");
  hypothesisIds.add(hypothesis.id);
  if (!new Set(["supported", "weakened", "falsified", "unresolved"]).has(hypothesis.state) || !new Set(["high", "medium", "low"]).has(hypothesis.confidence) || !nonBlank(hypothesis.rationale)) throw new Error("hypothesis state is invalid");
  if (!Array.isArray(hypothesis.evidence) || hypothesis.evidence.length === 0) throw new Error("hypothesis evidence is required");
  for (const evidence of hypothesis.evidence) {
    if (!exactKeys(evidence, ["path", "line", "observation"]) || !nonBlank(evidence.path) || !Number.isInteger(evidence.line) || evidence.line < 1 || !nonBlank(evidence.observation)) throw new Error("hypothesis evidence is invalid");
  }
}
if (!exactKeys(value.next_check, ["hypothesis_id", "environment", "action", "expected_observation", "stop_condition"])) throw new Error("next check fields are not closed");
if (!hypothesisIds.has(value.next_check.hypothesis_id) || !new Set(["local_replay", "staging_read_only"]).has(value.next_check.environment)) throw new Error("next check target is invalid");
for (const field of ["action", "expected_observation", "stop_condition"]) if (!nonBlank(value.next_check[field])) throw new Error(`next check ${field} is invalid`);
if (!exactKeys(value.scope, ["changes_made", "production_action_authorized"]) || value.scope.changes_made !== false || value.scope.production_action_authorized !== false) throw new Error("investigation scope is invalid");

console.log(JSON.stringify({ validation: "pass", hypotheses: value.hypotheses.length }));
