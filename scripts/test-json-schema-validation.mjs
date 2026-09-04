#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as validator from "./json-schema-validation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(resolve(root, ".json-schema-validation-test-"));

function validate(value, schema) {
  return validator.validateSchemaValue(value, schema, { baseDir: work, rootSchema: schema });
}

function expectValid(value, schema, label) {
  assert.deepEqual(validate(value, schema), [], label);
}

function expectInvalid(value, schema, { keyword, path = "$", condition }, label) {
  const errors = validate(value, schema);
  assert.ok(errors.length > 0, label);
  assert.ok(errors.some((error) => error.includes(`instance ${path}`) && error.includes(`keyword ${keyword}`) && error.includes(`condition ${condition}`)), `${label}: ${errors.join("\n")}`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  // This is deliberately first: the pre-fix validator silently accepts unknown types.
  expectInvalid("value", { type: "mystery" }, { keyword: "type", condition: "unsupported type mystery" }, "unknown schema types must fail closed");

  expectValid("anything", true, "true boolean schemas must accept every instance");
  expectInvalid("anything", false, { keyword: "schema", condition: "boolean schema is false" }, "false boolean schemas must reject every instance");
  for (const [type, value] of [["object", {}], ["array", []], ["string", "x"], ["boolean", true], ["number", 1.5], ["integer", 1], ["null", null]]) {
    expectValid(value, { type }, `${type} type semantics must remain supported`);
  }
  expectValid(null, { type: ["string", "null"] }, "type unions must remain supported");

  const definitions = {
    $defs: {
      named: { type: "string", minLength: 2 },
      propertyNamesAreNotKeywords: {
        type: "object",
        properties: { mystery: { type: "string" }, not: { type: "string" }, type: { type: "string" } },
        patternProperties: { "^x-": { type: "integer" } },
        dependentSchemas: { trigger: { required: ["dependent"] } },
      },
    },
    $ref: "#/$defs/named",
    maxLength: 3,
  };
  expectValid("abc", definitions, "local refs and their applicable siblings must both validate");
  expectInvalid("a", definitions, { keyword: "minLength", condition: "length must be >= 2" }, "local ref constraints must apply");
  expectInvalid("abcd", definitions, { keyword: "maxLength", condition: "length must be <= 3" }, "$ref siblings must apply");
  const falseDefinition = { $defs: { never: false }, $ref: "#/$defs/never" };
  expectInvalid("anything", falseDefinition, { keyword: "schema", condition: "boolean schema is false" }, "local refs must preserve false boolean schemas");

  const externalPath = resolve(work, "external.schema.json");
  writeJson(externalPath, { $defs: { positive: { type: "integer", exclusiveMinimum: 0 } } });
  const external = { $ref: "external.schema.json#/$defs/positive", maximum: 2 };
  expectValid(2, external, "external refs and siblings must validate");
  expectInvalid(0, external, { keyword: "exclusiveMinimum", condition: "value must be > 0" }, "external ref constraints must apply");
  expectInvalid(3, external, { keyword: "maximum", condition: "value must be <= 2" }, "external ref siblings must apply");
  const externalFalsePath = resolve(work, "external-false.schema.json");
  writeJson(externalFalsePath, false);
  expectInvalid("anything", { $ref: "external-false.schema.json" }, { keyword: "schema", condition: "boolean schema is false" }, "external refs must preserve false boolean schemas");
  const externalUnsupportedPath = resolve(work, "external-unsupported.schema.json");
  writeJson(externalUnsupportedPath, { mysteryValidation: true });
  expectInvalid("anything", { $ref: "external-unsupported.schema.json" }, { keyword: "mysteryValidation", condition: "unsupported schema keyword" }, "external refs must fail closed on unsupported schema keywords");
  expectInvalid("anything", { anyOf: [{ $ref: "missing.schema.json" }, true] }, { keyword: "$ref", condition: "reference missing.schema.json is unavailable" }, "unresolved refs must fail closed even when another applicator branch matches");

  expectValid(4, { allOf: [{ type: "integer" }, { minimum: 1 }] }, "allOf must accept matching instances");
  expectInvalid(0, { allOf: [{ type: "integer" }, { minimum: 1 }] }, { keyword: "minimum", condition: "value must be >= 1" }, "allOf must reject a failed branch");
  expectValid("x", { anyOf: [{ type: "string" }, { type: "integer" }] }, "anyOf must accept one matching branch");
  expectValid(2, { anyOf: [{ type: "integer" }, { minimum: 1 }] }, "anyOf must accept multiple matching branches");
  expectInvalid(false, { anyOf: [{ type: "string" }, { type: "integer" }] }, { keyword: "anyOf", condition: "must match at least one branch" }, "anyOf must reject zero matches");
  expectValid(2, { oneOf: [{ type: "integer" }, { const: 3 }] }, "oneOf must accept exactly one branch");
  expectInvalid(3, { oneOf: [{ type: "integer" }, { const: 3 }] }, { keyword: "oneOf", condition: "must match exactly one branch; matched 2" }, "oneOf must reject multiple matches");
  expectValid("allowed", { not: { const: "blocked" } }, "not must accept a failed child schema");
  expectInvalid("blocked", { not: { const: "blocked" } }, { keyword: "not", condition: "subschema matched" }, "not must reject a matching child schema");

  const commandEvidenceReference = {
    type: "object",
    required: ["outcome", "exit_code"],
    properties: { outcome: { enum: ["succeeded", "failed"] }, exit_code: { type: "integer" } },
    allOf: [
      { if: { properties: { outcome: { const: "succeeded" } }, required: ["outcome"] }, then: { properties: { exit_code: { const: 0 } } } },
      { if: { properties: { outcome: { const: "failed" } }, required: ["outcome"] }, then: { properties: { exit_code: { not: { const: 0 } } } } },
    ],
  };
  expectInvalid({ outcome: "failed", exit_code: 0 }, commandEvidenceReference, { keyword: "then", condition: "if matched" }, "failed command evidence with exit code zero must be rejected");
  expectValid({ outcome: "failed", exit_code: 12 }, commandEvidenceReference, "failed command evidence with a nonzero exit code must be accepted");
  expectValid({ outcome: "succeeded", exit_code: 0 }, commandEvidenceReference, "succeeded command evidence with exit code zero must be accepted");
  expectInvalid({ outcome: "succeeded", exit_code: 12 }, commandEvidenceReference, { keyword: "then", condition: "if matched" }, "succeeded command evidence with a nonzero exit code must be rejected");

  const conditional = {
    type: "object",
    properties: { mode: { enum: ["strict", "loose"] }, detail: {} },
    required: ["mode"],
    if: { properties: { mode: { const: "strict" } }, required: ["mode"] },
    then: { required: ["detail"] },
    else: { not: { required: ["detail"] } },
  };
  expectValid({ mode: "strict", detail: true }, conditional, "then must apply after an if match");
  expectInvalid({ mode: "strict" }, conditional, { keyword: "then", condition: "if matched" }, "then failures must identify the selected condition");
  expectValid({ mode: "loose" }, conditional, "else must apply after an if miss");
  expectInvalid({ mode: "loose", detail: true }, conditional, { keyword: "else", condition: "if did not match" }, "else failures must identify the selected condition");

  const contains = { type: "array", contains: { type: "integer" }, minContains: 2, maxContains: 2 };
  expectValid([1, "x", 2], contains, "contains bounds must count matching items");
  expectInvalid(["x"], { type: "array", contains: { type: "integer" } }, { keyword: "contains", condition: "matching items must be >= 1; matched 0" }, "contains must require one match by default");
  expectInvalid([1, "x"], contains, { keyword: "minContains", condition: "matching items must be >= 2; matched 1" }, "minContains must reject too few matches");
  expectInvalid([1, 2, 3], contains, { keyword: "maxContains", condition: "matching items must be <= 2; matched 3" }, "maxContains must reject too many matches");

  expectInvalid({}, { type: "object", minProperties: 1 }, { keyword: "minProperties", condition: "property count must be >= 1" }, "minProperties must apply");
  expectValid({ valid: true }, { type: "object", propertyNames: { minLength: 1 } }, "propertyNames must accept matching property names");
  expectInvalid({ "": true }, { type: "object", propertyNames: { minLength: 1 } }, { keyword: "propertyNames", path: '$[""]', condition: "property name \"\" is invalid" }, "propertyNames must reject a non-matching property name");
  expectInvalid(1, { type: "number", exclusiveMinimum: 1 }, { keyword: "exclusiveMinimum", condition: "value must be > 1" }, "exclusiveMinimum must apply");
  const tuple = { type: "array", prefixItems: [{ type: "string" }, { type: "integer" }], items: false };
  expectValid(["x", 1], tuple, "prefixItems with items false must accept the fixed tuple");
  expectInvalid(["x", 1, true], tuple, { keyword: "items", path: "$[2]", condition: "additional items are forbidden" }, "items false must reject trailing items");
  expectInvalid([], { type: "array", minItems: 1 }, { keyword: "minItems", condition: "item count must be >= 1" }, "minItems must remain supported");
  expectInvalid([1, 2], { type: "array", maxItems: 1 }, { keyword: "maxItems", condition: "item count must be <= 1" }, "maxItems must remain supported");

  expectValid({ a: 1, b: 2 }, { const: { b: 2, a: 1 } }, "const equality must be canonical across object key order");
  expectValid({ a: 1, b: 2 }, { enum: [{ b: 2, a: 1 }] }, "enum equality must be canonical across object key order");
  expectInvalid([{ a: 1, b: 2 }, { b: 2, a: 1 }], { type: "array", uniqueItems: true }, { keyword: "uniqueItems", condition: "items must be unique" }, "uniqueItems equality must be canonical across object key order");
  expectValid("😀", { type: "string", minLength: 1, maxLength: 1 }, "string length must count Unicode code points");
  expectValid("2026-09-04", { type: "string", format: "date" }, "date format must remain supported");
  expectValid("2026-09-04T12:30:00Z", { type: "string", format: "date-time" }, "date-time format must remain supported");
  expectValid("123e4567-e89b-12d3-a456-426614174000", { type: "string", format: "uuid" }, "UUID format must remain supported");

  const mappedSchemas = {
    type: "object",
    properties: { trigger: { type: "boolean" }, dependent: { type: "string" }, mystery: { type: "string" } },
    patternProperties: { "^x-": { type: "integer" } },
    dependentSchemas: { trigger: { required: ["dependent"] } },
    additionalProperties: false,
  };
  expectValid({ mystery: "ok", "x-count": 1 }, mappedSchemas, "property and pattern names must not be classified as schema keywords");
  expectInvalid({ "x-count": "bad" }, mappedSchemas, { keyword: "type", path: "$.x-count", condition: "value must be integer" }, "patternProperties schemas must apply");
  expectInvalid({ trigger: true }, mappedSchemas, { keyword: "dependentSchemas", condition: "property trigger is present" }, "dependentSchemas must apply to the containing instance");
  expectInvalid({ other: "bad" }, { type: "object", additionalProperties: { type: "integer" } }, { keyword: "type", path: "$.other", condition: "value must be integer" }, "additionalProperties schemas must remain supported");

  for (const keyword of ["$schema", "$id", "$anchor", "$comment", "title", "description", "default", "examples", "deprecated", "readOnly", "writeOnly", "x-ask-contract", "x-ask-metric-catalog"]) {
    expectValid("ok", { type: "string", [keyword]: keyword.startsWith("x-") ? { arbitrary: "annotation payload" } : keyword === "examples" ? ["ok"] : keyword === "deprecated" || keyword === "readOnly" || keyword === "writeOnly" ? true : "annotation" }, `${keyword} must be an explicitly supported annotation`);
  }
  expectInvalid("ok", { type: "string", mysteryValidation: true }, { keyword: "mysteryValidation", condition: "unsupported schema keyword" }, "unknown validation keywords must fail closed");
  expectInvalid("ok", { type: "string", "x-unapproved": true }, { keyword: "x-unapproved", condition: "unsupported schema keyword" }, "unapproved custom annotations must fail closed");
  expectInvalid("ok", { type: "string", format: "hostname" }, { keyword: "format", condition: "unsupported format hostname" }, "unsupported formats must fail closed");
  const deterministicSchema = { type: "object", required: ["first", "second"], additionalProperties: false };
  const deterministicErrors = validate({ zed: true, alpha: true }, deterministicSchema);
  assert.deepEqual(deterministicErrors, validate({ alpha: true, zed: true }, deterministicSchema), "validation errors must be deterministic across object key order");
  assert.ok(deterministicErrors.every((entry) => /^instance .+: keyword .+: condition /u.test(entry)), `every validation error must identify instance path, keyword, and condition:\n${deterministicErrors.join("\n")}`);

  assert.equal(typeof validator.auditManagedSchemaInventory, "function", "the managed schema inventory audit must be exported");
  const inventory = validator.auditManagedSchemaInventory(root);
  assert.ok(inventory.schemaCount >= 113, `the live public managed schema inventory must retain all 113 baseline schemas; found ${inventory.schemaCount}`);
  assert.deepEqual(inventory.unsupported, [], `all managed schemas must use supported vocabulary:\n${inventory.unsupported.join("\n")}`);
  for (const keyword of ["allOf", "anyOf", "oneOf", "not", "if", "then", "else", "contains", "minContains", "maxContains", "minProperties", "propertyNames", "exclusiveMinimum", "prefixItems", "items"]) {
    assert.ok(inventory.keywords.includes(keyword), `managed inventory must classify ${keyword}`);
  }

  console.log(`JSON Schema validator tests passed (${inventory.schemaCount} managed schemas, ${inventory.keywords.length} keywords)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
