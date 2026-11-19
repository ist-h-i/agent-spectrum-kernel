import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderClaudeFixedEntryProfile, renderClaudePluginFixedEntryProfiles } from "./claude-fixed-entry-profile.mjs";

const source = readFileSync(new URL("../adapters/claude-code/project/.claude/commands/skill-handoff.md", import.meta.url), "utf8");
const render = (sourceBody) => renderClaudeFixedEntryProfile("skill-handoff.md", {
  sourceBody,
  canonicalContract: { revision: "test", source_digest: `sha256:${"a".repeat(64)}`, source_paths: [] },
  profileFingerprint: `sha256:${"b".repeat(64)}`,
}).content;

test("Claude command and plugin handoffs use one canonical stop-condition owner", () => {
  for (const content of [render(source), renderClaudePluginFixedEntryProfiles().find((p) => p.metadata.prompt_name === "handoff").content]) {
    assert.equal((content.match(/Emit exactly one fenced JSON `Execution Envelope`/gu) ?? []).length, 1);
    assert.equal((content.match(/Execution Envelope\.stop_reason\.stop_if/gu) ?? []).length, 1);
    assert.doesNotMatch(content, /^\s*Stop condition:/mu);
    assert.match(content, /risk-gate/u);
    assert.match(content, /Forbidden scope:/u);
    assert.match(content, /Unverified evidence:/u);
  }
});
for (const [name, mutate] of [
  ["duplicate legacy stop field", (s) => s.replace("Verification:", "Verification:\nStop condition:")],
  ["bulleted legacy stop field", (s) => `${s}\n- Stop condition: stop before approval`],
  ["parallel stop owner", (s) => s.replace("Keep stop conditions only in", "Keep stop conditions also in")],
  ["missing canonical stop field", (s) => s.replace("Execution Envelope.stop_reason.stop_if", "separate pause field")],
  ["second envelope directive", (s) => `${s}\nEmit exactly one fenced JSON \`Execution Envelope\``],
  ["non-exact envelope count", (s) => s.replace("Emit exactly one", "Emit any number of")],
]) test(`Claude handoff rejects ${name}`, () => assert.throws(() => render(mutate(source)), /canonical handoff|duplicate the stop condition/u));
