import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

export function validateSchemaValue(value, schema, context, path = "$") {
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
