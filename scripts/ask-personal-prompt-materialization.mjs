// Exact registered public Prompt input. No renderer, model, or installation.
import assert from "node:assert/strict";
import { canonicalDigest, parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { verifyAssetRegistry } from "./asset-registry.mjs";

export const PERSONAL_PROMPT_INPUT_PATH = "inputs/full_ask-prompt.md";
export const PERSONAL_PROMPT_ASSET_PATH = "control/personal-prompt-asset.json";
export const PERSONAL_PROMPT_RUNTIME_V2 = "selected_active_reference_v2";
const V2_WRAPPER = [
  "Registered Prompt runtime selected_active_reference_v2.",
  "Use only the selected entrypoint below as the active mode for this task.",
  "The other registered files are reference data, not additional active modes.",
  "Do not execute their mode-specific steps unless the active entrypoint explicitly calls for reference consultation.",
  "These public instructions do not grant permission, prove Skill loading, or establish quality.",
].join("\n");
export const PERSONAL_PROMPT_WRAPPER_DIGEST = canonicalDigest(V2_WRAPPER);
const rawHash = (bytes, hash) => hash(bytes);
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const refOf = asset => Object.fromEntries(["asset_type", "stable_id", "version", "record_digest", "content_digest"].map(key => [key, asset[key]]));
function keys(value, expected) { assert.ok(value && typeof value === "object" && !Array.isArray(value)); assert.deepEqual(Object.keys(value).sort(), [...expected].sort()); }
export function personalPromptInput(base, entry) {
  return `${base}\n\nSelected registered Prompt instructions for this F session:\n${entry}\n`;
}
function bundleText(materialization, hash) {
  const v2 = materialization.kind === "personal_registered_prompt_materialization_v2";
  keys(materialization, ["kind", "asset", "registry_snapshot_digest", "entrypoint", "record", "content", ...(v2 ? ["runtime_contract"] : [])]);
  if (v2) {
    keys(materialization.runtime_contract, ["version", "wrapper_digest"]);
    assert.equal(materialization.runtime_contract.version, PERSONAL_PROMPT_RUNTIME_V2);
    assert.equal(materialization.runtime_contract.wrapper_digest, PERSONAL_PROMPT_WRAPPER_DIGEST, "wrapper contract drift");
  } else assert.equal(materialization.kind, "personal_registered_prompt_materialization_v1");
  const { asset, record, content, entrypoint } = materialization;
  assert.equal(asset.asset_type, "prompt"); assert.equal(canonicalDigest(record), asset.record_digest);
  for (const key of ["asset_type", "stable_id", "version"]) assert.equal(asset[key], record[key]);
  assert.equal(canonicalDigest(content), asset.content_digest); assert.equal(record.content.content_digest, asset.content_digest);
  assert.ok(same(content.type_extension, record.type_extension));
  assert.equal(record.type_extension.kind, "rendered_prompt_bundle", "unrendered Prompt needs an explicit runtime projection");
  assert.equal(record.type_extension.adapter, "codex", "personal primary requires Codex rendered Prompt");
  assert.ok(record.type_extension.entrypoints.includes(entrypoint), "entrypoint not in the exact registered bundle");
  for (const file of content.files) {
    const bytes = Buffer.from(file.bytes_base64, "base64");
    assert.equal(bytes.length, file.byte_length);
    assert.equal(bytes.toString("base64"), file.bytes_base64); assert.equal(rawHash(bytes, hash), file.raw_digest);
  }
  const files = content.files.filter(file => file.path === entrypoint); assert.equal(files.length, 1);
  // The exact role Asset is the whole rendered bundle. Passing only one file
  // would hide candidate changes elsewhere despite a distinct Asset digest.
  const ordered = [files[0], ...content.files.filter(file => file.path !== entrypoint).sort((a, b) => a.path.localeCompare(b.path))];
  if (v2) {
    const decoded = ordered.map(file => {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(file.bytes_base64, "base64"));
      assert.ok(text.trim(), "empty rendered Prompt file");
      return { path: file.path, raw_digest: file.raw_digest, text };
    });
    assert.equal(decoded.length, 5, "v2 requires the registered five-mode bundle");
    assert.deepEqual(decoded.map(file => file.path.split("/").at(-1)).sort(),
      ["skill-handoff.md", "skill-implement.md", "skill-investigate.md", "skill-review.md", "skill-verify.md"]);
    const active = decoded[0];
    assert.ok(!/(?:^|\n)(?:ACTIVE ENTRYPOINT |END ACTIVE ENTRYPOINT|REFERENCE ONLY REGISTERED FILES|END REFERENCE DATA)/u.test(active.text),
      "active Prompt text collides with runtime frame");
    return V2_WRAPPER + "\n\nACTIVE ENTRYPOINT " + JSON.stringify(active.path) + " " + active.raw_digest
      + "\n" + active.text + "\nEND ACTIVE ENTRYPOINT\n\nREFERENCE ONLY REGISTERED FILES (JSON data)\n"
      + JSON.stringify(decoded.slice(1)) + "\nEND REFERENCE DATA";
  }
  return ordered.map(file => {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(file.bytes_base64, "base64"));
    assert.ok(text.trim(), "empty rendered Prompt file");
    return `Registered Prompt file: ${file.path}\n${text}`;
  }).join("\n\n");
}
export function buildPersonalPromptMaterialization(options, { taskClass, hash }) {
  const v2 = Object.hasOwn(options, "runtimeVersion");
  keys(options, ["storeRoot", "registrySnapshotDigest", "asset", "entrypoint", "trustedAssetAuthorityContexts", ...(v2 ? ["runtimeVersion"] : [])]);
  if (v2) assert.equal(options.runtimeVersion, PERSONAL_PROMPT_RUNTIME_V2, "unknown Prompt runtime contract");
  const registry = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: options.registrySnapshotDigest,
    trustedAuthorityContexts: options.trustedAssetAuthorityContexts });
  const assets = registry.assets.filter(asset => same(refOf(asset), options.asset)); assert.equal(assets.length, 1, "registered Prompt Asset required");
  const asset = assets[0]; assert.ok(["candidate", "current"].includes(asset.state), "ineligible instruction Asset");
  assert.ok(asset.record.applicability.task_classes.included.includes(taskClass), "Prompt task applicability missing; no task alias or quality zero");
  assert.ok(!asset.record.applicability.task_classes.excluded.includes(taskClass));
  const materialization = { kind: v2 ? "personal_registered_prompt_materialization_v2" : "personal_registered_prompt_materialization_v1",
    ...(v2 ? { runtime_contract: { version: PERSONAL_PROMPT_RUNTIME_V2, wrapper_digest: PERSONAL_PROMPT_WRAPPER_DIGEST } } : {}), asset: structuredClone(options.asset),
    registry_snapshot_digest: options.registrySnapshotDigest, entrypoint: options.entrypoint,
    record: asset.record, content: asset.content };
  const text = bundleText(materialization, hash);
  return { materialization, materialization_digest: canonicalDigest(materialization), entry_text: text,
    input_path: PERSONAL_PROMPT_INPUT_PATH, materialization_path: PERSONAL_PROMPT_ASSET_PATH };
}
export function verifyPersonalPromptMaterialization({ plan, read, hash }) {
  const binding = plan.arms.full_ask.personal_prompt;
  if (!binding) return null;
  keys(binding, ["materialization_path", "materialization_digest", "input_path", "input_digest"]);
  assert.equal(binding.materialization_path, PERSONAL_PROMPT_ASSET_PATH); assert.equal(binding.input_path, PERSONAL_PROMPT_INPUT_PATH);
  assert.equal(read(plan.input.path).toString("utf8"), plan.prompt, "base task input drift");
  assert.equal(hash(read(plan.input.path)), plan.input.digest);
  const materialization = parseJsonRejectDuplicateKeys(read(binding.materialization_path).toString("utf8"));
  assert.equal(canonicalDigest(materialization), binding.materialization_digest, "Prompt materialization drift");
  const entry = bundleText(materialization, hash);
  const input = read(binding.input_path);
  assert.equal(hash(input), binding.input_digest, "Prompt runtime input drift");
  assert.equal(input.toString("utf8"), personalPromptInput(plan.prompt, entry), "Prompt input must preserve the exact task boundary");
  for (const [condition, arm] of Object.entries(plan.arms)) if (condition !== "full_ask") assert.equal(arm.personal_prompt, undefined, "Prompt cannot alter P/K-principles");
  return materialization;
}
