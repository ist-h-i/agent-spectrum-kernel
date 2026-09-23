import { readFileSync } from "node:fs";

// JSON.parse errors can contain excerpts of project-owned input. Do not reuse
// their message or cause in setup's JSON or human-facing diagnostics.
export function parseSetupJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON in setup input; file contents are not included.");
  }
}

export function readSetupJson(path) {
  return parseSetupJson(readFileSync(path, "utf8"));
}

const JSON_DIAGNOSTIC = /invalid json|unexpected (?:token|end)|JSON at position|JSON at line|JSON\.parse/i;

// ask-doctor can embed parser errors in an otherwise valid JSON report. Retain
// health statuses and non-parser findings, but never forward input excerpts.
export function sanitizeSetupDoctorReport(value) {
  if (typeof value === "string") {
    return JSON_DIAGNOSTIC.test(value)
      ? "Invalid JSON in doctor input; file contents are not included." : value;
  }
  if (Array.isArray(value)) return value.map(sanitizeSetupDoctorReport);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeSetupDoctorReport(entry)]));
  }
  return value;
}

export function summarizeSetupProcessFailure(result) {
  // Classify internally, then emit only fixed messages. Neither matched text,
  // full stdout/stderr nor parser excerpts may cross this boundary.
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/managed file conflict|modified locally/i.test(output)) {
    return "Managed file conflict or file modified locally; inspect the managed state before retrying.";
  }
  if (JSON_DIAGNOSTIC.test(output)) {
    return "Invalid JSON in installer input; file contents are not included.";
  }
  if (result.error?.code === "ETIMEDOUT") return "Setup subprocess timed out.";
  return "Setup subprocess failed; output is not included to protect project data.";
}
