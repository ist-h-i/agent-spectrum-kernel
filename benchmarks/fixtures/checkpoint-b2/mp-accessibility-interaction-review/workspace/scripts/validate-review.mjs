import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("usage: validate-review.mjs <review.json>");

const review = JSON.parse(readFileSync(path, "utf8"));
const topLevel = ["decision", "verification", "findings"];
if (Object.keys(review).sort().join("\0") !== [...topLevel].sort().join("\0")) throw new Error("review fields are not closed");
if (!new Set(["approve", "request_changes", "insufficient_evidence"]).has(review.decision)) throw new Error("review decision is invalid");
if (!review.verification || Object.keys(review.verification).sort().join("\0") !== ["evidence", "state"].sort().join("\0")) throw new Error("verification fields are not closed");
if (!new Set(["passed", "failed", "incomplete"]).has(review.verification.state)) throw new Error("verification state is invalid");
if (!Array.isArray(review.verification.evidence) || !Array.isArray(review.findings)) throw new Error("review collections are invalid");
for (const evidence of review.verification.evidence) {
  if (!evidence || Object.keys(evidence).sort().join("\0") !== ["conclusion", "path"].sort().join("\0") || typeof evidence.path !== "string" || typeof evidence.conclusion !== "string") throw new Error("verification evidence is invalid");
}
for (const finding of review.findings) {
  if (!finding || Object.keys(finding).sort().join("\0") !== ["evidence", "impact", "required_action", "severity", "title"].sort().join("\0")) throw new Error("finding fields are not closed");
  if (!new Set(["high", "medium", "low"]).has(finding.severity) || !Array.isArray(finding.evidence)) throw new Error("finding is invalid");
  for (const evidence of finding.evidence) {
    if (!evidence || Object.keys(evidence).sort().join("\0") !== ["line", "path"].sort().join("\0") || typeof evidence.path !== "string" || !Number.isInteger(evidence.line) || evidence.line < 1) throw new Error("finding evidence is invalid");
  }
  for (const field of ["title", "impact", "required_action"]) if (typeof finding[field] !== "string" || finding[field].trim().length === 0) throw new Error(`finding ${field} is invalid`);
}

console.log(JSON.stringify({ validation: "pass", findings: review.findings.length }));
