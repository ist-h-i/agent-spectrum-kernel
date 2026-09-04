import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MANAGED_SCHEMA_DIRECTORIES = Object.freeze([
  "schemas",
  "benchmarks/schemas",
  "benchmarks/fixtures",
  "adapters/claude-code/plugin/schemas",
]);

export const STANDARD_ANNOTATION_KEYWORDS = Object.freeze([
  "$schema", "$id", "$anchor", "$comment", "title", "description", "default", "examples", "deprecated", "readOnly", "writeOnly",
]);

export const APPROVED_CUSTOM_ANNOTATION_KEYWORDS = Object.freeze([
  "x-ask-contract", "x-ask-metric-catalog",
]);

export const SUPPORTED_VALIDATION_KEYWORDS = Object.freeze([
  "$defs", "$ref", "additionalProperties", "allOf", "anyOf", "const", "contains", "dependentSchemas", "else", "enum",
  "exclusiveMinimum", "format", "if", "items", "maxContains", "maxItems", "maxLength", "maximum", "minContains",
  "minItems", "minLength", "minProperties", "minimum", "not", "oneOf", "pattern", "patternProperties", "prefixItems",
  "properties", "propertyNames", "required", "then", "type", "uniqueItems",
]);

const ALLOWED_TYPES = new Set(["object", "array", "string", "boolean", "number", "integer", "null"]);
const SUPPORTED_FORMATS = new Set(["date", "date-time", "uuid"]);
const ANNOTATION_KEYWORDS = new Set([...STANDARD_ANNOTATION_KEYWORDS, ...APPROVED_CUSTOM_ANNOTATION_KEYWORDS]);
const VALIDATION_KEYWORDS = new Set(SUPPORTED_VALIDATION_KEYWORDS);
const MAP_OF_SCHEMAS = new Set(["$defs", "properties", "patternProperties", "dependentSchemas"]);
const ARRAY_OF_SCHEMAS = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const SINGLE_SCHEMAS = new Set(["not", "if", "then", "else", "contains", "items", "additionalProperties", "propertyNames"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validationError(path, keyword, condition) {
  return `instance ${path}: keyword ${keyword}: condition ${condition}`;
}

function schemaLocation(path, key) {
  return `${path}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function inspectSchemaNode(schema, path, result) {
  if (typeof schema === "boolean") return;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    result.unsupported.push(`${path}: schema must be an object or boolean`);
    return;
  }
  for (const [keyword, keywordValue] of Object.entries(schema)) {
    if (!VALIDATION_KEYWORDS.has(keyword) && !ANNOTATION_KEYWORDS.has(keyword)) {
      result.unsupported.push(`${path}: unsupported schema keyword ${keyword}`);
      continue;
    }
    result.keywordSet.add(keyword);
    if (ANNOTATION_KEYWORDS.has(keyword)) continue;
    const keywordPath = schemaLocation(path, keyword);
    if (MAP_OF_SCHEMAS.has(keyword)) {
      if (!keywordValue || typeof keywordValue !== "object" || Array.isArray(keywordValue)) {
        result.unsupported.push(`${keywordPath}: ${keyword} must be an object of schemas`);
        continue;
      }
      for (const [name, child] of Object.entries(keywordValue)) inspectSchemaNode(child, schemaLocation(keywordPath, name), result);
      if (keyword === "patternProperties") {
        for (const pattern of Object.keys(keywordValue)) {
          try { new RegExp(pattern, "u"); } catch { result.unsupported.push(`${schemaLocation(keywordPath, pattern)}: patternProperties key must be a valid regular expression`); }
        }
      }
      continue;
    }
    if (ARRAY_OF_SCHEMAS.has(keyword)) {
      if (!Array.isArray(keywordValue) || keywordValue.length === 0) {
        result.unsupported.push(`${keywordPath}: ${keyword} must be a non-empty array of schemas`);
        continue;
      }
      keywordValue.forEach((child, index) => inspectSchemaNode(child, `${keywordPath}/${index}`, result));
      continue;
    }
    if (SINGLE_SCHEMAS.has(keyword)) {
      inspectSchemaNode(keywordValue, keywordPath, result);
      continue;
    }
    if (keyword === "type") {
      const types = Array.isArray(keywordValue) ? keywordValue : [keywordValue];
      if (types.length === 0 || types.some((type) => typeof type !== "string" || !ALLOWED_TYPES.has(type))) {
        result.unsupported.push(`${keywordPath}: unsupported type ${types.find((type) => !ALLOWED_TYPES.has(type)) ?? "empty type array"}`);
      }
    } else if (keyword === "format" && (typeof keywordValue !== "string" || !SUPPORTED_FORMATS.has(keywordValue))) {
      result.unsupported.push(`${keywordPath}: unsupported format ${String(keywordValue)}`);
    } else if (keyword === "pattern") {
      if (typeof keywordValue !== "string") result.unsupported.push(`${keywordPath}: pattern must be a string`);
      else try { new RegExp(keywordValue, "u"); } catch { result.unsupported.push(`${keywordPath}: pattern must be a valid regular expression`); }
    } else if (keyword === "$ref" && typeof keywordValue !== "string") {
      result.unsupported.push(`${keywordPath}: $ref must be a string`);
    } else if (keyword === "required" && (!Array.isArray(keywordValue) || keywordValue.some((entry) => typeof entry !== "string") || new Set(keywordValue).size !== keywordValue.length)) {
      result.unsupported.push(`${keywordPath}: required must be an array of unique strings`);
    } else if (keyword === "enum" && (!Array.isArray(keywordValue) || keywordValue.length === 0)) {
      result.unsupported.push(`${keywordPath}: enum must be a non-empty array`);
    } else if (["minLength", "maxLength", "minItems", "maxItems", "minContains", "maxContains", "minProperties"].includes(keyword)
      && (!Number.isInteger(keywordValue) || keywordValue < 0)) {
      result.unsupported.push(`${keywordPath}: ${keyword} must be a non-negative integer`);
    } else if (["minimum", "maximum", "exclusiveMinimum"].includes(keyword) && (typeof keywordValue !== "number" || !Number.isFinite(keywordValue))) {
      result.unsupported.push(`${keywordPath}: ${keyword} must be a finite number`);
    } else if (keyword === "uniqueItems" && typeof keywordValue !== "boolean") {
      result.unsupported.push(`${keywordPath}: uniqueItems must be boolean`);
    } else if (["minContains", "maxContains"].includes(keyword) && !Object.hasOwn(schema, "contains")) {
      result.unsupported.push(`${keywordPath}: ${keyword} requires contains`);
    }
  }
}

export function inspectSchemaSupport(schema, { schemaPath = "#" } = {}) {
  const result = { keywordSet: new Set(), unsupported: [] };
  inspectSchemaNode(schema, schemaPath, result);
  return { keywords: [...result.keywordSet].sort(), unsupported: result.unsupported.sort() };
}

function inspectReferenceSupport(schema, context, visitedDocuments = new Set()) {
  if (typeof schema === "boolean" || !schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const unsupported = [];
  if (Object.hasOwn(schema, "$ref") && typeof schema.$ref === "string") {
    const referenced = loadReferencedSchema(schema.$ref, context.baseDir, context.rootSchema);
    if (referenced.schema === null || referenced.schema === undefined) unsupported.push(`reference ${schema.$ref} is unavailable`);
    else if (referenced.documentIdentity && !visitedDocuments.has(referenced.documentIdentity)) {
      visitedDocuments.add(referenced.documentIdentity);
      const referencedRoot = referenced.rootSchema ?? referenced.schema;
      unsupported.push(...inspectSchemaSupport(referencedRoot, { schemaPath: referenced.identity }).unsupported);
      unsupported.push(...inspectReferenceSupport(referencedRoot, { baseDir: referenced.baseDir, rootSchema: referencedRoot }, visitedDocuments));
    }
  }
  for (const [keyword, keywordValue] of Object.entries(schema)) {
    if (MAP_OF_SCHEMAS.has(keyword) && keywordValue && typeof keywordValue === "object" && !Array.isArray(keywordValue)) {
      for (const child of Object.values(keywordValue)) unsupported.push(...inspectReferenceSupport(child, context, visitedDocuments));
    } else if (ARRAY_OF_SCHEMAS.has(keyword) && Array.isArray(keywordValue)) {
      for (const child of keywordValue) unsupported.push(...inspectReferenceSupport(child, context, visitedDocuments));
    } else if (SINGLE_SCHEMAS.has(keyword)) {
      unsupported.push(...inspectReferenceSupport(keywordValue, context, visitedDocuments));
    }
  }
  return unsupported;
}

function managedSchemaPaths(root) {
  const paths = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".schema.json")) paths.push(path);
    }
  }
  for (const relativeDirectory of MANAGED_SCHEMA_DIRECTORIES) walk(resolve(root, relativeDirectory));
  return paths.sort();
}

export function auditManagedSchemaInventory(root) {
  const paths = managedSchemaPaths(root);
  const keywords = new Set();
  const unsupported = [];
  for (const path of paths) {
    let schema;
    try { schema = readJson(path); } catch (caught) {
      unsupported.push(`${path}: invalid JSON: ${caught.message}`);
      continue;
    }
    const inspected = inspectSchemaSupport(schema, { schemaPath: path });
    inspected.keywords.forEach((keyword) => keywords.add(keyword));
    unsupported.push(...inspected.unsupported);
    unsupported.push(...inspectReferenceSupport(schema, { baseDir: dirname(path), rootSchema: schema }).map((item) => `${path}: ${item}`));
  }
  return { schemaCount: paths.length, schemaPaths: paths, keywords: [...keywords].sort(), unsupported: unsupported.sort() };
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
  return false;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function equalJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function resolveJsonPointer(root, pointer) {
  if (pointer === "#" || pointer === "") return root;
  if (!pointer.startsWith("#/")) return null;
  try {
    return pointer.slice(2).split("/").map((part) => decodeURIComponent(part).replaceAll("~1", "/").replaceAll("~0", "~")).reduce((current, key) => current?.[key], root);
  } catch {
    return null;
  }
}

function loadReferencedSchema(ref, baseDir, rootSchema) {
  if (ref.startsWith("#")) {
    return { schema: resolveJsonPointer(rootSchema, ref), baseDir, rootSchema, identity: `${baseDir}|${ref}`, documentIdentity: null };
  }
  const hashIndex = ref.indexOf("#");
  const fileRef = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : ref.slice(hashIndex);
  const path = resolve(baseDir, fileRef);
  if (!existsSync(path)) return { schema: null, baseDir: dirname(path), rootSchema: null, identity: `${path}${fragment}`, documentIdentity: path };
  let referencedRoot;
  try { referencedRoot = readJson(path); } catch { return { schema: null, baseDir: dirname(path), rootSchema: null, identity: `${path}${fragment}`, documentIdentity: path }; }
  return {
    schema: fragment ? resolveJsonPointer(referencedRoot, fragment) : referencedRoot,
    baseDir: dirname(path),
    rootSchema: referencedRoot,
    identity: `${path}${fragment}`,
    documentIdentity: path,
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
  return false;
}

function propertyPath(path, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$-]*$/u.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function schemaSupportErrors(unsupported, path) {
  return unsupported.map((item) => {
    const unknownKeyword = /unsupported schema keyword ([^\s]+)/u.exec(item)?.[1];
    const unsupportedType = /unsupported type (.+)$/u.exec(item)?.[1];
    const unsupportedFormat = /unsupported format (.+)$/u.exec(item)?.[1];
    if (unknownKeyword) return validationError(path, unknownKeyword, "unsupported schema keyword");
    if (unsupportedType) return validationError(path, "type", `unsupported type ${unsupportedType}`);
    if (unsupportedFormat) return validationError(path, "format", `unsupported format ${unsupportedFormat}`);
    return validationError(path, "schema", item);
  });
}

function evaluate(value, schema, context, path, refStack) {
  if (schema === true) return [];
  if (schema === false) return [validationError(path, "schema", "boolean schema is false")];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [validationError(path, "schema", "schema is unavailable")];
  const errors = [];

  if (Object.hasOwn(schema, "$ref")) {
    const referenced = loadReferencedSchema(schema.$ref, context.baseDir, context.rootSchema);
    if (referenced.schema === null || referenced.schema === undefined) errors.push(validationError(path, "$ref", `reference ${schema.$ref} is unavailable`));
    else {
      const referenceKey = `${referenced.identity}|${path}`;
      if (refStack.has(referenceKey)) errors.push(validationError(path, "$ref", `cyclic reference ${schema.$ref}`));
      else {
        errors.push(...evaluate(value, referenced.schema, { baseDir: referenced.baseDir, rootSchema: referenced.rootSchema }, path, new Set([...refStack, referenceKey])));
      }
    }
  }

  for (const subschema of schema.allOf ?? []) errors.push(...evaluate(value, subschema, context, path, refStack));
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.filter((candidate) => evaluate(value, candidate, context, path, refStack).length === 0).length;
    if (matches === 0) errors.push(validationError(path, "anyOf", "must match at least one branch"));
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => evaluate(value, candidate, context, path, refStack).length === 0).length;
    if (matches !== 1) errors.push(validationError(path, "oneOf", `must match exactly one branch; matched ${matches}`));
  }
  if (Object.hasOwn(schema, "not") && evaluate(value, schema.not, context, path, refStack).length === 0) errors.push(validationError(path, "not", "subschema matched"));
  if (Object.hasOwn(schema, "if")) {
    const conditionMatches = evaluate(value, schema.if, context, path, refStack).length === 0;
    const branchKeyword = conditionMatches ? "then" : "else";
    if (Object.hasOwn(schema, branchKeyword)) {
      const branchErrors = evaluate(value, schema[branchKeyword], context, path, refStack);
      if (branchErrors.length > 0) errors.push(validationError(path, branchKeyword, conditionMatches ? `if matched; ${branchErrors.join(" | ")}` : `if did not match; ${branchErrors.join(" | ")}`));
    }
  }

  if (Object.hasOwn(schema, "const") && !equalJson(value, schema.const)) errors.push(`${validationError(path, "const", `value must equal ${canonicalJson(schema.const)}`)}; ${path}: must equal ${canonicalJson(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => equalJson(entry, value))) errors.push(`${validationError(path, "enum", `value must equal one of ${schema.enum.map(canonicalJson).join(", ")}`)}; ${path}: must be one of ${schema.enum.map(canonicalJson).join(", ")}`);
  if (Object.hasOwn(schema, "type") && !typeMatches(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join(" or ") : schema.type;
    return [...errors, `${validationError(path, "type", `value must be ${expected}`)}; ${path}: must be ${schema.type}`];
  }

  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) errors.push(`${validationError(path, "minLength", `length must be >= ${schema.minLength}`)}; ${path}: must not be empty`);
    if (schema.maxLength !== undefined && length > schema.maxLength) errors.push(`${validationError(path, "maxLength", `length must be <= ${schema.maxLength}`)}; ${path}: exceeds maxLength`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${validationError(path, "pattern", `value must match ${schema.pattern}`)}; ${path}: does not match pattern`);
    if (schema.format !== undefined && !validFormat(value, schema.format)) errors.push(`${validationError(path, "format", `value must match ${schema.format}`)}; ${path}: invalid ${schema.format}`);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${validationError(path, "minimum", `value must be >= ${schema.minimum}`)}; ${path}: must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${validationError(path, "maximum", `value must be <= ${schema.maximum}`)}; ${path}: must be <= ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(validationError(path, "exclusiveMinimum", `value must be > ${schema.exclusiveMinimum}`));
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${validationError(path, "minItems", `item count must be >= ${schema.minItems}`)}; ${path}: has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${validationError(path, "maxItems", `item count must be <= ${schema.maxItems}`)}; ${path}: has too many items`);
    if (schema.uniqueItems && new Set(value.map(canonicalJson)).size !== value.length) errors.push(`${validationError(path, "uniqueItems", "items must be unique")}; ${path}: items must be unique`);
    const prefixCount = Array.isArray(schema.prefixItems) ? schema.prefixItems.length : 0;
    for (let index = 0; index < Math.min(prefixCount, value.length); index += 1) errors.push(...evaluate(value[index], schema.prefixItems[index], context, `${path}[${index}]`, refStack));
    if (Object.hasOwn(schema, "items")) {
      for (let index = prefixCount; index < value.length; index += 1) {
        if (schema.items === false) errors.push(validationError(`${path}[${index}]`, "items", "additional items are forbidden"));
        else errors.push(...evaluate(value[index], schema.items, context, `${path}[${index}]`, refStack));
      }
    }
    if (Object.hasOwn(schema, "contains")) {
      const matches = value.filter((entry, index) => evaluate(entry, schema.contains, context, `${path}[${index}]`, refStack).length === 0).length;
      const minimum = schema.minContains ?? 1;
      if (matches < minimum) errors.push(validationError(path, Object.hasOwn(schema, "minContains") ? "minContains" : "contains", `matching items must be >= ${minimum}; matched ${matches}`));
      if (schema.maxContains !== undefined && matches > schema.maxContains) errors.push(validationError(path, "maxContains", `matching items must be <= ${schema.maxContains}; matched ${matches}`));
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(validationError(path, "minProperties", `property count must be >= ${schema.minProperties}`));
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        const missingPath = propertyPath(path, required);
        errors.push(`${validationError(missingPath, "required", `property ${required} is required`)}; ${missingPath}: is required`);
      }
    }
    const properties = schema.properties ?? {};
    const patterns = Object.entries(schema.patternProperties ?? {}).map(([pattern, child]) => [new RegExp(pattern, "u"), child]);
    for (const [key, propertyValue] of Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
      const childPath = propertyPath(path, key);
      if (Object.hasOwn(schema, "propertyNames")) {
        const propertyNameErrors = evaluate(key, schema.propertyNames, context, childPath, refStack);
        if (propertyNameErrors.length > 0) errors.push(validationError(childPath, "propertyNames", `property name ${JSON.stringify(key)} is invalid; ${propertyNameErrors.join(" | ")}`));
      }
      let matched = false;
      if (Object.hasOwn(properties, key)) {
        matched = true;
        errors.push(...evaluate(propertyValue, properties[key], context, childPath, refStack));
      }
      for (const [pattern, childSchema] of patterns) {
        if (pattern.test(key)) {
          matched = true;
          errors.push(...evaluate(propertyValue, childSchema, context, childPath, refStack));
        }
      }
      if (!matched && Object.hasOwn(schema, "additionalProperties")) {
        if (schema.additionalProperties === false) errors.push(`${validationError(childPath, "additionalProperties", "property is not allowed")}; ${childPath}: unknown property`);
        else if (schema.additionalProperties !== true) errors.push(...evaluate(propertyValue, schema.additionalProperties, context, childPath, refStack));
      }
    }
    for (const [trigger, dependentSchema] of Object.entries(schema.dependentSchemas ?? {})) {
      if (!Object.hasOwn(value, trigger)) continue;
      const dependentErrors = evaluate(value, dependentSchema, context, path, refStack);
      if (dependentErrors.length > 0) errors.push(validationError(path, "dependentSchemas", `property ${trigger} is present; ${dependentErrors.join(" | ")}`));
    }
  }
  return errors;
}

export function validateSchemaValue(value, schema, context = {}, path = "$") {
  const inspected = inspectSchemaSupport(schema);
  if (inspected.unsupported.length > 0) return schemaSupportErrors(inspected.unsupported, path);
  const effectiveContext = { baseDir: context.baseDir ?? process.cwd(), rootSchema: context.rootSchema ?? schema };
  const referenceErrors = inspectReferenceSupport(schema, effectiveContext);
  if (referenceErrors.length > 0) {
    return referenceErrors.sort().flatMap((item) => item.startsWith("reference ")
      ? [validationError(path, "$ref", item)]
      : schemaSupportErrors([item], path));
  }
  return evaluate(value, schema, effectiveContext, path, new Set());
}

export function validateJsonSchema(value, { schemaPath } = {}) {
  if (!schemaPath || !existsSync(schemaPath)) return [validationError("$", "schema", "JSON Schema is unavailable")];
  let schema;
  try {
    schema = readJson(schemaPath);
  } catch (error) {
    return [validationError("$", "schema", `JSON Schema is invalid: ${error.message}`)];
  }
  return validateSchemaValue(value, schema, { baseDir: dirname(schemaPath), rootSchema: schema });
}
