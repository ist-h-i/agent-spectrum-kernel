#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const ENVELOPE_SCHEMA_PATH = existsSync(resolve(RUNTIME_ROOT, "execution-envelope.schema.json"))
  ? resolve(RUNTIME_ROOT, "execution-envelope.schema.json")
  : resolve(RUNTIME_ROOT, "../schemas/execution-envelope.schema.json");
const METRICS_SCHEMA_PATH = existsSync(resolve(RUNTIME_ROOT, "metrics-event.schema.json"))
  ? resolve(RUNTIME_ROOT, "metrics-event.schema.json")
  : resolve(RUNTIME_ROOT, "../schemas/metrics-event.schema.json");
const ENVELOPE_RECORD_SCHEMA_PATH = existsSync(resolve(RUNTIME_ROOT, "execution-envelope-record.schema.json"))
  ? resolve(RUNTIME_ROOT, "execution-envelope-record.schema.json")
  : resolve(RUNTIME_ROOT, "../schemas/execution-envelope-record.schema.json");

const INLINE_REQUIRED_STOP_STATUSES = new Set(["human_decision", "insufficient_evidence", "capability_missing", "risk_gate", "blocked"]);
const ENTRY_MODE_BY_ID = Object.freeze({
  "skill-implement.md": "implementation",
  "skill-investigate.md": "investigation",
  "skill-review.md": "review",
  "skill-verify.md": "verification",
  "skill-handoff.md": "handoff",
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizedResponseMarkdown(value) {
  return `${String(value ?? "").trimEnd()}\n`;
}

function recordIdentityInput(record) {
  const copy = structuredClone(record);
  delete copy.record_id;
  return copy;
}

function typeMatches(value, type) {
  if (Array.isArray(type)) return type.some((candidate) => typeMatches(value, candidate));
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
  if (ref.startsWith("#")) {
    return { schema: resolveJsonPointer(rootSchema, ref), baseDir, rootSchema };
  }
  const hashIndex = ref.indexOf("#");
  const fileRef = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : ref.slice(hashIndex);
  const path = resolve(baseDir, fileRef);
  if (!existsSync(path)) return { schema: null, baseDir: dirname(path), rootSchema: null };
  const referencedRoot = readJson(path);
  return {
    schema: fragment ? resolveJsonPointer(referencedRoot, fragment) : referencedRoot,
    baseDir: dirname(path),
    rootSchema: referencedRoot,
  };
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
  if (format === "uuid") {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
  }
  return true;
}

function validateSchemaValue(value, schema, context, path = "$") {
  const errors = [];
  if (!schema || typeof schema !== "object") return [`${path}: schema is unavailable`];

  if (schema.$ref) {
    const referenced = loadReferencedSchema(schema.$ref, context.baseDir, context.rootSchema);
    return validateSchemaValue(value, referenced.schema, {
      baseDir: referenced.baseDir,
      rootSchema: referenced.rootSchema,
    }, path);
  }
  for (const subschema of schema.allOf ?? []) {
    errors.push(...validateSchemaValue(value, subschema, context, path));
  }
  if (schema.if) {
    const conditionMatches = validateSchemaValue(value, schema.if, context, path).length === 0;
    const conditionalSchema = conditionMatches ? schema.then : schema.else;
    if (conditionalSchema) errors.push(...validateSchemaValue(value, conditionalSchema, context, path));
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => validateSchemaValue(value, candidate, context, path).length === 0).length;
    if (matches !== 1) errors.push(`${path}: must match exactly one oneOf branch`);
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

export function validateJsonSchema(value, { schemaPath } = {}) {
  if (!schemaPath || !existsSync(schemaPath)) return ["JSON Schema is unavailable"];
  let schema;
  try {
    schema = readJson(schemaPath);
  } catch (error) {
    return [`JSON Schema is invalid: ${error.message}`];
  }
  return validateSchemaValue(value, schema, { baseDir: dirname(schemaPath), rootSchema: schema });
}

const EXECUTION_ENVELOPE_MARKER_LINE = /^ {0,3}Execution Envelope:[ \t]*$/u;
const MARKDOWN_FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const MARKDOWN_FENCE_CLOSE_LINE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/u;
const EXECUTION_ENVELOPE_JSON_FENCE_LINE = /^ {0,3}(`{3,})json[ \t]*$/iu;

function markdownLines(text) {
  const source = String(text ?? "");
  const lines = [];
  let start = 0;
  while (start <= source.length) {
    const newline = source.indexOf("\n", start);
    const contentEnd = newline === -1 ? source.length : newline;
    let content = source.slice(start, contentEnd);
    if (content.endsWith("\r")) content = content.slice(0, -1);
    lines.push({ start, end: newline === -1 ? source.length : newline + 1, content });
    if (newline === -1) break;
    start = newline + 1;
    if (start === source.length) break;
  }
  return { source, lines };
}

export function markdownFenceOpening(line) {
  const match = line.match(MARKDOWN_FENCE_LINE);
  if (!match) return null;
  const fence = match[1];
  if (fence[0] === "`" && match[2].includes("`")) return null;
  return { character: fence[0], length: fence.length };
}

export function isMarkdownFenceClosing(line, opening) {
  const match = line.match(MARKDOWN_FENCE_CLOSE_LINE);
  return Boolean(match && match[1][0] === opening.character && match[1].length >= opening.length);
}

function scanExecutionEnvelopeMarkdown(text) {
  const markdown = markdownLines(text);
  const markers = [];
  let activeFence = null;
  for (let index = 0; index < markdown.lines.length; index += 1) {
    const line = markdown.lines[index];
    if (activeFence) {
      if (isMarkdownFenceClosing(line.content, activeFence)) activeFence = null;
      continue;
    }
    const opening = markdownFenceOpening(line.content);
    if (opening) {
      activeFence = opening;
      continue;
    }
    if (EXECUTION_ENVELOPE_MARKER_LINE.test(line.content)) markers.push({ lineIndex: index, start: line.start });
  }
  return { ...markdown, markers };
}

export function hasExecutionEnvelopeMarker(text) {
  return scanExecutionEnvelopeMarkdown(text).markers.length > 0;
}

export function extractExecutionEnvelope(text) {
  const scan = scanExecutionEnvelopeMarkdown(text);
  if (scan.markers.length === 0) return { status: "missing", value: null, errors: ["Execution Envelope: is missing"] };
  if (scan.markers.length > 1) return { status: "malformed", value: null, errors: ["only one Execution Envelope is allowed"] };

  const marker = scan.markers[0];
  const openingLineIndex = marker.lineIndex + 1;
  const openingLine = scan.lines[openingLineIndex];
  const openingMatch = openingLine?.content.match(EXECUTION_ENVELOPE_JSON_FENCE_LINE);
  if (!openingMatch) return { status: "malformed", value: null, errors: ["Execution Envelope must contain a fenced JSON object"] };
  const opening = { character: "`", length: openingMatch[1].length };
  let closingLineIndex = null;
  for (let index = openingLineIndex + 1; index < scan.lines.length; index += 1) {
    if (isMarkdownFenceClosing(scan.lines[index].content, opening)) {
      closingLineIndex = index;
      break;
    }
  }
  if (closingLineIndex === null) return { status: "malformed", value: null, errors: ["Execution Envelope must contain a fenced JSON object"] };
  const payload = scan.source.slice(openingLine.end, scan.lines[closingLineIndex].start);
  try {
    const value = JSON.parse(payload);
    return {
      status: "parsed",
      value,
      errors: [],
      markerStart: marker.start,
      serializationEnd: scan.lines[closingLineIndex].end,
    };
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
  if (["none", "completed"].includes(status) && (details.length > 0 || humanDecision.length > 0)) errors.push(`$.stop_reason: status ${status} cannot include blocking details`);
  if (["human_decision", "insufficient_evidence", "capability_missing", "risk_gate", "blocked"].includes(status) && stopIf.length === 0) errors.push("$.stop_reason.stop_if: required for a stopping status");
  if (status === "human_decision" && humanDecision.length === 0) errors.push("$.stop_reason.human_decision_required: required for human_decision status");
  if (["insufficient_evidence", "capability_missing", "risk_gate", "blocked"].includes(status) && details.length === 0) errors.push("$.stop_reason.details: required for the stopping status");
  return errors;
}

export function selectExecutionEnvelopeEmission({ mode, stopStatus, diagnostic = false } = {}) {
  if (mode === "handoff" || INLINE_REQUIRED_STOP_STATUSES.has(stopStatus)) return "inline_required";
  if (diagnostic) return "diagnostic";
  if (["none", "completed"].includes(stopStatus)) return "sidecar";
  throw new Error(`unsupported Execution Envelope stop status: ${stopStatus ?? "missing"}`);
}

export function buildExecutionEnvelopeRecord({ emissionClass, authority, binding, envelope, responseMarkdown, controlInputSha256 = null } = {}) {
  const record = {
    schema_version: "1.0.0",
    emission_class: emissionClass,
    authority,
    binding,
    envelope,
    envelope_sha256: sha256(stableCanonicalJson(envelope)),
    response_sha256: sha256(normalizedResponseMarkdown(responseMarkdown)),
    control_input_sha256: controlInputSha256,
  };
  return {
    ...record,
    record_id: `execution-envelope-record-${sha256(stableCanonicalJson(record)).slice("sha256:".length)}`,
  };
}

export function validateExecutionEnvelopeRecord(value, { schemaPath = ENVELOPE_RECORD_SCHEMA_PATH, responseMarkdown = null } = {}) {
  const errors = validateJsonSchema(value, { schemaPath });
  errors.push(...validateExecutionEnvelope(value?.envelope).map((error) => `$.envelope${error.slice(1)}`));
  if (value?.envelope_sha256 !== sha256(stableCanonicalJson(value?.envelope))) errors.push("$.envelope_sha256: does not bind the canonical Envelope payload");
  const expectedRecordId = `execution-envelope-record-${sha256(stableCanonicalJson(recordIdentityInput(value ?? {}))).slice("sha256:".length)}`;
  if (value?.record_id !== expectedRecordId) errors.push("$.record_id: does not bind the immutable record content");
  if (responseMarkdown !== null && value?.response_sha256 !== sha256(normalizedResponseMarkdown(responseMarkdown))) errors.push("$.response_sha256: does not bind the response Markdown");
  let expectedEmission = null;
  try {
    expectedEmission = selectExecutionEnvelopeEmission({
      mode: value?.binding?.mode,
      stopStatus: value?.envelope?.stop_reason?.status,
      diagnostic: value?.emission_class === "diagnostic",
    });
  } catch (error) {
    errors.push(`$.emission_class: ${error.message}`);
  }
  if (expectedEmission && value?.emission_class !== expectedEmission) errors.push(`$.emission_class: ${value?.emission_class ?? "missing"} disagrees with mode and stop state`);
  const expectedMode = ENTRY_MODE_BY_ID[value?.binding?.entry_id];
  if (expectedMode && value?.binding?.mode !== expectedMode) errors.push(`$.binding.mode: ${value?.binding?.mode ?? "missing"} disagrees with ${value.binding.entry_id}`);
  if (value?.emission_class === "sidecar" && value?.authority?.dynamic_fields_source !== "structured_runtime_result") errors.push("$.authority.dynamic_fields_source: sidecar requires a structured runtime result");
  if (value?.authority?.dynamic_fields_source === "structured_runtime_result" && value?.control_input_sha256 === null) errors.push("$.control_input_sha256: structured runtime result requires the exact input digest");
  if (value?.authority?.dynamic_fields_source === "runner_observation" && value?.control_input_sha256 !== null) errors.push("$.control_input_sha256: runner observation must not claim a structured input digest");
  return [...new Set(errors)];
}

export function renderExecutionEnvelopeBlock(envelope) {
  return `Execution Envelope:\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;
}

export function renderExecutionEnvelopeProjection(responseMarkdown, record) {
  const errors = validateExecutionEnvelopeRecord(record, { responseMarkdown });
  if (errors.length > 0) throw new Error(`Execution Envelope record is invalid: ${errors.join("; ")}`);
  const response = normalizedResponseMarkdown(responseMarkdown);
  if (record.emission_class === "sidecar") return response;
  return `${response.trimEnd()}\n\n${renderExecutionEnvelopeBlock(record.envelope)}`;
}

export function inspectExecutionEnvelopeRecordEmission(text, record, { schemaPath = ENVELOPE_RECORD_SCHEMA_PATH } = {}) {
  const errors = validateExecutionEnvelopeRecord(record, { schemaPath });
  const extracted = extractExecutionEnvelope(text);
  let responseMarkdown = text;
  if (record?.emission_class === "sidecar") {
    if (extracted.status !== "missing") errors.push("sidecar output must not serialize an Execution Envelope");
  } else {
    if (extracted.status !== "parsed") {
      errors.push(...extracted.errors);
    } else if (stableCanonicalJson(extracted.value) !== stableCanonicalJson(record?.envelope)) {
      errors.push("inline Execution Envelope and runner record disagree");
    }
    if (Number.isInteger(extracted.serializationEnd) && text.slice(extracted.serializationEnd).trim().length > 0) {
      errors.push("output must not contain non-whitespace after the inline Execution Envelope");
    }
    if (Number.isInteger(extracted.markerStart)) responseMarkdown = text.slice(0, extracted.markerStart);
  }
  if (record?.response_sha256 !== sha256(normalizedResponseMarkdown(responseMarkdown))) errors.push("response Markdown disagrees with the runner record");
  return { status: errors.length === 0 ? "valid" : "invalid", errors: [...new Set(errors)], value: record };
}

export function validateMetricsEvent(value, { schemaPath = METRICS_SCHEMA_PATH } = {}) {
  if (!existsSync(schemaPath)) return ["metrics-event.schema.json is unavailable"];
  let schema;
  try {
    schema = readJson(schemaPath);
  } catch (error) {
    return [`metrics-event.schema.json is invalid: ${error.message}`];
  }
  return validateSchemaValue(value, schema, { baseDir: dirname(schemaPath), rootSchema: schema });
}

export function inspectExecutionEnvelope(text, options = {}) {
  const extracted = extractExecutionEnvelope(text);
  if (extracted.status !== "parsed") return extracted;
  const errors = validateExecutionEnvelope(extracted.value, options);
  return errors.length > 0 ? { status: "invalid", value: extracted.value, errors } : extracted;
}
