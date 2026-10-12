import { readFileSync } from "node:fs";

const schema = JSON.parse(readFileSync(new URL("../schemas/member.schema.json", import.meta.url), "utf8"));

// This local importer supports the supplied flat field constraints only.
export function importMember(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("member must be an object");
  for (const [name, rule] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(payload, name)) continue;
    const value = payload[name];
    if (typeof value !== rule.type) throw new TypeError(`${name} must be ${rule.type}`);
    if (rule.type === "string" && value.length < rule.minLength) throw new TypeError(`${name} must not be empty`);
  }
  if (schema.additionalProperties === false) {
    for (const name of Object.keys(payload)) {
      if (!Object.hasOwn(schema.properties, name)) throw new TypeError(`unknown field: ${name}`);
    }
  }
  for (const name of schema.required) {
    if (!Object.hasOwn(payload, name)) throw new TypeError(`missing field: ${name}`);
  }
  return { memberId: payload.memberId, displayName: payload.displayName, enabled: payload.enabled ?? true };
}
