import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportMember } from "../src/member-export.mjs";
import { importMember } from "../src/member-import.mjs";

test("current producer payload imports with the same field values", () => {
  const member = Object.freeze({ memberId: "member-7", displayName: "Sample Member", enabled: false });
  assert.deepEqual(importMember(exportMember(member)), member);
});

test("v2 rejects the obsolete field spelling", () => {
  assert.throws(() => importMember({ memberId: "member-7", display_name: "Sample Member" }), TypeError);
});

test("memberId type and nonempty constraint are retained", () => {
  assert.throws(() => importMember({ memberId: 7 }), /memberId must be string/u);
  assert.throws(() => importMember({ memberId: "" }), /memberId must not be empty/u);
});

test("enabled keeps its boolean constraint", () => {
  assert.throws(() => importMember({ enabled: "false" }), /enabled must be boolean/u);
});

test("unknown fields remain rejected", () => {
  assert.throws(() => importMember({ extra: "ignored" }), /unknown field: extra/u);
});

test("unrelated schema declarations retain the local contract", () => {
  const schema = JSON.parse(readFileSync(new URL("../schemas/member.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("memberId"));
  assert.deepEqual(schema.properties.memberId, { type: "string", minLength: 1 });
  assert.deepEqual(schema.properties.enabled, { type: "boolean" });
});
