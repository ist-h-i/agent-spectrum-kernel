import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonSchema } from "./execution-envelope.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADAPTIVE_SELECTION_SCHEMA_PATH = resolve(ROOT, "benchmarks/schemas/adaptive-selection.schema.json");

export function validateBenchmarkSchemaInstance(value, { schemaPath } = {}) {
  return validateJsonSchema(value, { schemaPath });
}

export function assertBenchmarkSchemaInstance(value, { schemaPath, label = "benchmark artifact" } = {}) {
  const errors = validateBenchmarkSchemaInstance(value, { schemaPath });
  if (errors.length > 0) throw new Error(`${label} failed JSON Schema validation:\n${errors.join("\n")}`);
  return value;
}

export function validateAdaptiveSelectionRecord(value, { schemaPath = ADAPTIVE_SELECTION_SCHEMA_PATH } = {}) {
  return validateBenchmarkSchemaInstance(value, { schemaPath });
}

export function computePortfolioPlanId({ configSha256, protocolSha256, repositoryRevision, seed }) {
  const inputs = [configSha256, protocolSha256, repositoryRevision, seed];
  if (inputs.some((value) => typeof value !== "string" || value.length === 0)) throw new Error("portfolio plan identity inputs must be non-empty strings");
  return `plan-${createHash("sha256").update(JSON.stringify(inputs)).digest("hex")}`;
}
