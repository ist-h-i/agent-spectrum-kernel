#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const ENVELOPE_SCHEMA_PATH = existsSync(resolve(RUNTIME_ROOT, "execution-envelope.schema.json"))
  ? resolve(RUNTIME_ROOT, "execution-envelope.schema.json")
  : resolve(RUNTIME_ROOT, "../schemas/execution-envelope.schema.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function typeMatches(value, type) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "null") return value === null;
  return true;
}

function resolveJsonPointer(root, pointer) {
  if (pointer === "#") return root;
  if (!pointer.startsWith("#/")) return null;
  return pointer.slice(2).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~")).reduce((current, key) => current?.[key], root);
}

function loadReferencedSchema(ref, baseDir, rootSchema) {
  if (ref.startsWith("#")) return resolveJsonPointer(rootSchema, ref);
  const path = resolve(baseDir, ref);
  return existsSync(path) ? readJson(path) : null;
}

function validFormat(value, format) {
  if (format === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [, year, month, day] = match;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day);
  }
  if (format === "date-time") {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match || !validFormat(match[1], "date")) return false;
    const [, , hour, minute, second, , timezone] = match;
    return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 && (timezone === "Z" || (Number(timezone.slice(1, 3)) <= 23 && Number(timezone.slice(4, 6)) <= 59));
  }
  return true;
}

function validateSchemaValue(value, schema, context, path = "$") {
  const errors = [];
  if (!schema || typeof schema !== "object") return [`${path}: schema is unavailable`];

  if (schema.$ref) {
    const referenced = loadReferencedSchema(schema.$ref, context.baseDir, context.rootSchema);
    return validateSchemaValue(value, referenced, {
      baseDir: schema.$ref.startsWith("#") ? context.baseDir : dirname(resolve(context.baseDir, schema.$ref)),
      rootSchema: schema.$ref.startsWith("#") ? context.rootSchema : referenced,
    }, path);
  }
  if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) {
    errors.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  }
  if (schema.type && !typeMatches(value, schema.type)) {
    return [`${path}: must be ${schema.type}`];
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: must not be empty`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: exceeds maxLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern`);
    if (schema.format && !validFormat(value, schema.format)) errors.push(`${path}: invalid ${schema.format}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: has too many items`);
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${path}: items must be unique`);
    if (schema.items) value.forEach((entry, index) => errors.push(...validateSchemaValue(entry, schema.items, context, `${path}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${path}.${required}: is required`);
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key}: unknown property`);
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) errors.push(...validateSchemaValue(value[key], propertySchema, context, `${path}.${key}`));
    }
  }
  return errors;
}

export function extractExecutionEnvelope(text) {
  const marker = /(?:^|\n)Execution Envelope:\s*/g;
  const markers = [...text.matchAll(marker)];
  if (markers.length === 0) return { status: "missing", value: null, errors: ["Execution Envelope: is missing"] };
  if (markers.length > 1) return { status: "malformed", value: null, errors: ["only one Execution Envelope is allowed"] };

  const after = text.slice(markers[0].index + markers[0][0].length);
  const block = after.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/i);
  if (!block) return { status: "malformed", value: null, errors: ["Execution Envelope must contain a fenced JSON object"] };
  try {
    const value = JSON.parse(block[1]);
    return { status: "parsed", value, errors: [] };
  } catch (error) {
    return { status: "malformed", value: null, errors: [`Execution Envelope JSON is invalid: ${error.message}`] };
  }
}

export function validateExecutionEnvelope(value, { schemaPath = ENVELOPE_SCHEMA_PATH } = {}) {
  if (!existsSync(schemaPath)) return ["execution-envelope.schema.json is unavailable"];
  let schema;
  try {
    schema = readJson(schemaPath);
  } catch (error) {
    return [`execution-envelope.schema.json is invalid: ${error.message}`];
  }
  const errors = validateSchemaValue(value, schema, { baseDir: dirname(schemaPath), rootSchema: schema });
  const status = value?.stop_reason?.status;
  const details = value?.stop_reason?.details ?? [];
  const humanDecision = value?.stop_reason?.human_decision_required ?? [];
  const stopIf = value?.stop_reason?.stop_if ?? [];
  if (status === "none" && (details.length > 0 || humanDecision.length > 0)) errors.push("$.stop_reason: status none cannot include blocking details");
  if (["human_decision", "insufficient_evidence", "risk_gate", "blocked"].includes(status) && stopIf.length === 0) errors.push("$.stop_reason.stop_if: required for a stopping status");
  if (status === "human_decision" && humanDecision.length === 0) errors.push("$.stop_reason.human_decision_required: required for human_decision status");
  if (["insufficient_evidence", "risk_gate", "blocked"].includes(status) && details.length === 0) errors.push("$.stop_reason.details: required for the stopping status");
  return errors;
}

export function inspectExecutionEnvelope(text, options = {}) {
  const extracted = extractExecutionEnvelope(text);
  if (extracted.status !== "parsed") return extracted;
  const errors = validateExecutionEnvelope(extracted.value, options);
  return errors.length > 0 ? { status: "invalid", value: extracted.value, errors } : extracted;
}
