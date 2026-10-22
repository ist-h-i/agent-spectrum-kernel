// Read-only provenance over the existing observation, Registry and pair verifiers.
// This module never publishes, starts a worker, or changes a frozen artifact.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { verifyAssetRegistry } from "./asset-registry.mjs";
import { inspectPersonalEvolution } from "./ask-personal-evolution.mjs";
import { verifyPersonalEvolutionPromptPairResults } from "./ask-personal-evolution-primary-pair.mjs";
import { assertPersonalEvolutionFields as fields, freezePersonalEvolutionValue } from "./ask-personal-evolution-observation.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";

const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const ref = asset => Object.fromEntries(["asset_type", "stable_id", "version", "record_digest", "content_digest"].map(key => [key, asset[key]]));
const statuses = ["Verified", "Supported", "Hypothesis", "Unknown", "Falsified"];
function summary(value) {
  assert.ok(typeof value === "string" && value.trim() && value.length <= 2048, "bounded public trace summary required");
}
function evidence(value) {
  fields(value, ["artifact_id", "digest"], "public trace evidence reference"); summary(value.artifact_id);
  assert.match(value.digest, /^sha256:[a-f0-9]{64}$/u);
}
function claim(value) {
  fields(value, ["status", "summary"], "trace claim"); assert.ok(statuses.includes(value.status)); summary(value.summary);
}
function registeredAsset(options, registryDigest, asset, repositoryId, scopeId) {
  const registry = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: registryDigest,
    trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
  assert.equal(registry.repository_id, repositoryId, "trace source repository mismatch");
  assert.equal(registry.scope_id, scopeId, "trace source scope mismatch");
  fields(asset, ["asset_type", "stable_id", "version", "record_digest", "content_digest"], "exact trace Asset");
  const found = registry.assets.filter(item => equal(ref(item), asset));
  assert.equal(found.length, 1, "trace exact Asset absent from Registry");
  return found[0];
}
function fileDelta(before, after) {
  const paths = [...new Set([...before.files, ...after.files].map(file => file.path))].sort();
  return paths.flatMap(path => {
    const a = before.files.find(file => file.path === path), b = after.files.find(file => file.path === path);
    if (a?.raw_digest === b?.raw_digest) return [];
    let lineChange = null;
    try {
      const decode = file => file ? new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(file.bytes_base64, "base64")).split("\n") : [];
      const oldLines = decode(a), newLines = decode(b); let prefix = 0, suffix = 0;
      while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
      while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
        && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
      const span = lines => ({ start_line: prefix + 1, line_count: lines.length - prefix - suffix,
        excerpt_digest: comparisonHash(Buffer.from(lines.slice(prefix, lines.length - suffix).join("\n"))) });
      lineChange = { before: span(oldLines), after: span(newLines) };
    } catch { /* Binary content has exact file digests, without invented text. */ }
    return [{ path, change: !a ? "added" : !b ? "removed" : "modified", before_digest: a?.raw_digest ?? null,
      after_digest: b?.raw_digest ?? null, before_bytes: a?.byte_length ?? null, after_bytes: b?.byte_length ?? null,
      line_change: lineChange }];
  });
}
function location(content, value) {
  fields(value, ["path", "file_digest", "start_line", "end_line", "excerpt_digest"], "trace location");
  const file = content.files.find(item => item.path === value.path);
  assert.ok(file, "trace location absent from exact Asset"); assert.equal(file.raw_digest, value.file_digest, "trace location file digest changed");
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(file.bytes_base64, "base64")).split("\n");
  assert.ok(Number.isSafeInteger(value.start_line) && Number.isSafeInteger(value.end_line)
    && value.start_line > 0 && value.end_line >= value.start_line && value.end_line <= lines.length, "trace location line range invalid");
  const bytes = Buffer.from(lines.slice(value.start_line - 1, value.end_line).join("\n"));
  assert.equal(comparisonHash(bytes), value.excerpt_digest, "trace excerpt digest changed");
  return bytes;
}
function context(options) {
  const inspection = inspectPersonalEvolution({ ...options,
    artifacts: options.experimentObjectDigest ? { experimentObjectDigest: options.experimentObjectDigest } : {} });
  const preparation = read(options.storeRoot, options.preparationObjectDigest);
  const candidate = read(options.storeRoot, preparation.candidate_object_digest);
  const observation = read(options.storeRoot, preparation.observation_object_digest);
  const pair = options.pairRegistrationObjectDigest ? verifyPersonalEvolutionPromptPairResults(options) : null;
  const registration = pair ? read(options.storeRoot, options.pairRegistrationObjectDigest) : null;
  if (options.savedResults) {
    assert.ok(registration, "saved results require a pinned pair");
    for (const [role, values] of Object.entries(options.savedResults)) {
      assert.ok(["baseline", "challenger"].includes(role), "foreign saved-result role");
      for (const fixture of Object.keys(values)) assert.ok(registration.description.bindings[role].some(item => item.fixture_id === fixture), "foreign saved-result fixture");
    }
  }
  const bindings = { preparation_object_digest: options.preparationObjectDigest,
    observation_object_digest: preparation.observation_object_digest, observation_digest: observation.observation_digest,
    candidate_object_digest: preparation.candidate_object_digest, candidate_digest: candidate.candidate_digest,
    registry: candidate.registry, parent_asset: candidate.parent_asset, candidate_asset: candidate.candidate_asset,
    experiment_object_digest: options.experimentObjectDigest ?? null,
    pair_registration_object_digest: options.pairRegistrationObjectDigest ?? null };
  return { inspection, candidate, observation, pair, registration, bindings };
}
function changes(options, ctx, entries) {
  assert.ok(Array.isArray(entries) && entries.length > 0 && entries.length <= 32, "bounded nonempty trace changes required");
  const seen = new Set();
  return entries.map(entry => {
    fields(entry, ["registry_snapshot_digest", "before_asset", "after_asset", "locations", "selection_reason",
      "evidence_refs", "responsibility", "expected_effect", "side_effects", "prompt_mappings"], "trace change");
    const { repository_id, scope_id } = ctx.candidate.registry;
    const before = registeredAsset(options, entry.registry_snapshot_digest, entry.before_asset, repository_id, scope_id);
    const after = registeredAsset(options, entry.registry_snapshot_digest, entry.after_asset, repository_id, scope_id);
    assert.ok(["skill", "prompt"].includes(before.asset_type), "trace target must be a Skill or Prompt Asset");
    assert.equal(before.asset_type, after.asset_type); assert.equal(before.stable_id, after.stable_id);
    assert.ok(equal(after.record.derivation.parent, entry.before_asset), "trace revision parent mismatch");
    const key = canonicalDigest([entry.before_asset, entry.after_asset]); assert.ok(!seen.has(key), "duplicate trace change"); seen.add(key);
    claim(entry.selection_reason); claim(entry.expected_effect); summary(entry.responsibility); summary(entry.side_effects);
    assert.ok(Array.isArray(entry.evidence_refs) && entry.evidence_refs.length <= 32);
    for (const item of entry.evidence_refs) {
      evidence(item); assert.ok(ctx.observation.evidence_refs.some(observed => equal(item, observed)), "trace evidence is not from this observation");
    }
    const delta = fileDelta(before.content, after.content);
    assert.ok(delta.length > 0, "trace change has no content difference");
    assert.ok(Array.isArray(entry.locations) && entry.locations.length <= 128);
    for (const item of entry.locations) {
      fields(item, ["before", "after"], "trace changed location"); assert.ok(item.before || item.after);
      if (item.before) location(before.content, item.before);
      if (item.after) location(after.content, item.after);
      if (item.before && item.after) assert.equal(item.before.path, item.after.path);
      assert.ok(delta.some(file => file.path === (item.before ?? item.after).path), "trace location is not a changed file");
    }
    assert.ok(Array.isArray(entry.prompt_mappings) && entry.prompt_mappings.length <= 128);
    const promptBefore = read(options.storeRoot, ctx.candidate.parent_asset.content_digest);
    const promptAfter = read(options.storeRoot, ctx.candidate.candidate_asset.content_digest);
    const mappings = entry.prompt_mappings.map(mapping => {
      fields(mapping, ["kind", "source_before", "source_after", "prompt_before", "prompt_after", "evidence_ref"], "Skill to Prompt mapping");
      assert.equal(before.asset_type, "skill", "a filename containing skill does not establish a Skill Asset");
      assert.equal(ctx.candidate.candidate_asset.asset_type, "prompt");
      assert.ok(["verbatim", "recorded_transform"].includes(mapping.kind)); evidence(mapping.evidence_ref);
      const sourceA = location(before.content, mapping.source_before), sourceB = location(after.content, mapping.source_after);
      const promptA = location(promptBefore, mapping.prompt_before), promptB = location(promptAfter, mapping.prompt_after);
      assert.ok(!sourceA.equals(sourceB), "mapping must identify a source change");
      assert.ok(!promptA.equals(promptB), "mapping must identify a Prompt change");
      const correspondence = { object_kind: "personal_skill_prompt_correspondence_v1", source_before_asset: entry.before_asset,
        source_after_asset: entry.after_asset, prompt_before_asset: ctx.candidate.parent_asset,
        prompt_after_asset: ctx.candidate.candidate_asset, ...mapping };
      delete correspondence.evidence_ref;
      assert.ok(equal(read(options.storeRoot, mapping.evidence_ref.digest), correspondence), "Skill Prompt correspondence evidence mismatch");
      if (mapping.kind === "verbatim") assert.ok(sourceA.equals(promptA) && sourceB.equals(promptB), "verbatim Skill Prompt bytes differ");
      return { ...mapping, identity_status: "Verified", byte_correspondence: mapping.kind === "verbatim" ? "Verified" : "Unknown",
        semantic_derivation: "Hypothesis" };
    });
    return { ...entry, file_changes: delta, prompt_mappings: mappings,
      missing_locations: delta.filter(file => !entry.locations.some(item => (item.before ?? item.after).path === file.path)).map(file => file.path),
      selection_causality: "Hypothesis", model_use: "Unknown", quality_contribution: "Unknown" };
  });
}

// Pure authoring: callers may preserve the returned NEW object in their CAS.
// No existing preparation, plan, result or consumed attempt is ever appended to.
export function buildPersonalEvolutionTraceBinding(options, { recording, changes: entries }) {
  assert.ok(["pre_evaluation", "retrospective"].includes(recording));
  const ctx = context(options); changes(options, ctx, entries);
  if (recording === "pre_evaluation") {
    assert.ok(ctx.pair && ctx.pair.status === "NOT_RUN", "new pre-evaluation trace requires a verified unstarted pair");
    assert.equal(existsSync(join(ctx.registration.output_root, "invocation")), false, "consumed pair cannot acquire pre-evaluation trace");
  }
  const body = { kind: "personal_evolution_trace_binding_v1", recording, bindings: ctx.bindings, changes: structuredClone(entries) };
  return freezePersonalEvolutionValue({ ...body, trace_digest: canonicalDigest(body) });
}

export function inspectPersonalEvolutionTrace(options) {
  const ctx = context(options), missing = [], promptBefore = read(options.storeRoot, ctx.candidate.parent_asset.content_digest),
    promptAfter = read(options.storeRoot, ctx.candidate.candidate_asset.content_digest);
  let entries = [], recording = "historical_reconstruction", chronology = "Unknown";
  if (options.traceObjectDigest) {
    const trace = read(options.storeRoot, options.traceObjectDigest);
    fields(trace, ["kind", "recording", "bindings", "changes", "trace_digest"], "saved trace binding");
    const { trace_digest, ...body } = trace;
    assert.equal(trace.kind, "personal_evolution_trace_binding_v1"); assert.equal(trace_digest, canonicalDigest(body), "trace digest changed");
    assert.ok(equal(trace.bindings, ctx.bindings), "trace candidate/version/observation/Registry/pair binding mismatch");
    assert.ok(["pre_evaluation", "retrospective"].includes(trace.recording));
    entries = changes(options, ctx, trace.changes);
    recording = trace.recording === "retrospective" ? "post_hoc_annotation" : "unconfirmed_pre_evaluation_claim";
    if (trace.recording === "pre_evaluation") {
      assert.ok(ctx.pair, "pre-evaluation trace requires an exact independently pinned pair");
      const pin = options.trustedPreEvaluationTraceBindings?.find(item => item.trace_object_digest === options.traceObjectDigest);
      if (pin) {
        fields(pin, ["trace_object_digest", "pair_registration_object_digest", "evidence_ref"], "independent trace chronology pin");
        assert.equal(pin.pair_registration_object_digest, options.pairRegistrationObjectDigest, "trace chronology pair mismatch"); evidence(pin.evidence_ref);
        recording = "pre_evaluation_binding"; chronology = "Supported";
      } else missing.push("independent controller evidence that this trace was fixed before pair start");
    }
  } else missing.push("trace binding: exact source revisions, locations, selection reasons and Skill to Prompt correspondence");
  const promptChanges = fileDelta(promptBefore, promptAfter);
  const covered = new Set(entries.flatMap(entry => entry.before_asset.asset_type === "prompt"
    && equal(entry.before_asset, ctx.candidate.parent_asset) && equal(entry.after_asset, ctx.candidate.candidate_asset)
    ? entry.locations.map(item => (item.before ?? item.after).path) : entry.prompt_mappings.map(item => item.prompt_after.path)));
  const unexplained = promptChanges.filter(file => !covered.has(file.path)).map(file => file.path);
  if (unexplained.length) missing.push("selection rationale / source mapping for every unexplained Prompt file change");
  for (const entry of entries) {
    if (!entry.evidence_refs.length) missing.push(`observation evidence for ${entry.before_asset.stable_id}`);
    if (entry.missing_locations.length) missing.push(`exact changed locations for ${entry.before_asset.stable_id}`);
    if (entry.before_asset.asset_type === "skill" && !entry.prompt_mappings.length) missing.push(`Skill to Prompt mapping for ${entry.before_asset.stable_id}`);
  }
  if (!ctx.pair) missing.push("independently pinned experiment/pair and fresh plan/run/role handoff");
  if (ctx.pair?.status !== "saved_pair_verified") missing.push("complete saved results for the same fixed pair; preserve unstarted or incomplete work");
  missing.push("model use evidence", "causal quality contribution evidence");
  const handoff = ctx.registration ? ["baseline", "challenger"].flatMap(role => ctx.registration.description.bindings[role].map(binding => ({
    role, fixture_id: binding.fixture_id, run_id: binding.run_id, plan_digest: binding.plan_digest,
    asset: (role === "baseline" ? ctx.candidate.parent_asset : ctx.candidate.candidate_asset),
    selection_object_digest: binding.selection_object_digest, prompt_materialization_digest: binding.prompt_materialization_digest,
    prompt_input_digest: binding.prompt_input_digest, runtime_contract: binding.prompt_runtime_contract,
    input_binding_status: "Verified", delivery_status: ctx.pair.status === "NOT_RUN" ? "NOT_RUN" : "Unknown",
    meaning: "fixed runtime input bytes; inspect saved execution lineage for delivery evidence; actual model use Unknown" }))) : [];
  return freezePersonalEvolutionValue({ kind: "personal_evolution_trace_readout_v1", status: ctx.pair?.status ?? "Unknown",
    bindings: ctx.bindings, observation: ctx.observation, recording, chronology,
    candidate: Object.fromEntries(["candidate_id", "delta", "hypothesis", "factors", "expected_upside", "risks"].map(key => [key, ctx.candidate[key]])),
    trace_object_digest: options.traceObjectDigest ?? null, changes: entries, prompt_file_changes: promptChanges,
    unexplained_prompt_changes: unexplained, handoff, saved_results: ctx.pair?.report ?? null,
    model_use: "Unknown", causal_quality_contribution: "Unknown", missing, next_checks: missing,
    models_started: false, mutation_performed: false, authority_implied: false, installation_implied: false });
}
