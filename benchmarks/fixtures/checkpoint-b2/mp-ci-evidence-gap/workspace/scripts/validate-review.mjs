import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const path = process.argv[2];
if (!path) throw new Error("usage: validate-review.mjs <review.json>");

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const review = JSON.parse(readFileSync(path, "utf8"));
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
function sourceLines(path) {
  if (!nonEmpty(path) || path.trim() !== path || isAbsolute(path) || path.includes("\\")) return null;
  const normalized = path.replace(/^\.\//u, "").replace(/^workspace\//u, "");
  if (!normalized || normalized === "review.json" || normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
  const absolute = resolve(workspace, normalized);
  if (!existsSync(absolute) || realpathSync(absolute) !== absolute || !lstatSync(absolute).isFile()) return null;
  return readFileSync(absolute, "utf8").split(/\r?\n/u);
}

if (!exactKeys(review, ["decision", "verification", "findings"])) throw new Error("review fields are not closed");
if (!new Set(["approve", "request_changes", "insufficient_evidence"]).has(review.decision)) throw new Error("review decision is invalid");
if (!exactKeys(review.verification, ["evidence", "state"])) throw new Error("verification fields are not closed");
if (!new Set(["passed", "failed", "incomplete"]).has(review.verification.state)) throw new Error("verification state is invalid");
if (!Array.isArray(review.verification.evidence) || !Array.isArray(review.findings)) throw new Error("review collections are invalid");
for (const evidence of review.verification.evidence) {
  if (!exactKeys(evidence, ["conclusion", "path"]) || !sourceLines(evidence.path) || !nonEmpty(evidence.conclusion)) throw new Error("verification evidence is invalid");
}
for (const finding of review.findings) {
  if (!exactKeys(finding, ["evidence", "impact", "required_action", "severity", "title"])) throw new Error("finding fields are not closed");
  if (!new Set(["high", "medium", "low"]).has(finding.severity) || !Array.isArray(finding.evidence) || finding.evidence.length === 0) throw new Error("finding is invalid");
  for (const evidence of finding.evidence) {
    const lines = sourceLines(evidence?.path);
    if (!exactKeys(evidence, ["line", "path"]) || !lines || !Number.isInteger(evidence.line) || evidence.line < 1 || evidence.line > lines.length) throw new Error("finding evidence is invalid");
  }
  for (const field of ["title", "impact", "required_action"]) if (!nonEmpty(finding[field])) throw new Error(`finding ${field} is invalid`);
}

console.log(JSON.stringify({ validation: "pass", findings: review.findings.length }));
