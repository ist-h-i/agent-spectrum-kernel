// Public artificial fixtures only. No Codex/provider/model is invoked.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalDigest, contentAddressedObjectPath, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { registerAsset, verifyAssetRegistry } from "./asset-registry.mjs";
import { buildPersonalEvolutionTraceBinding, inspectPersonalEvolutionTrace } from "./ask-personal-evolution-trace.mjs";
import { runPersonalEvolutionCommand } from "./ask-personal-evolution-cli.mjs";
import { sealPersonalEvolutionPromptPair } from "./ask-personal-evolution-primary-pair.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { setup, blocksFor, collectSyntheticTerminal, fakeEngineeringTemplate, collectSyntheticGrade } from "./test-helpers-personal-evolution-primary-pair.mjs";

const read = (f, digest) => readContentAddressedJson({ storeRoot: f.storeRoot, digest }).value;
const publish = (f, artifact) => putContentAddressedJson({ storeRoot: f.storeRoot, artifact }).digest;
const assetRef = asset => Object.fromEntries(["asset_type", "stable_id", "version", "record_digest", "content_digest"].map(key => [key, asset[key]]));
function tree(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? [[path, "directory"], ...tree(path)] : [[path, comparisonHash(readFileSync(path))]];
  });
}
function at(content, path = content.files[0].path, changed = false) {
  const file = content.files.find(item => item.path === path);
  const lines = Buffer.from(file.bytes_base64, "base64").toString("utf8").split("\n");
  const line = changed ? lines.findIndex(value => value.includes("Synthetic scoped target rule")) + 1 : 1;
  assert.ok(line > 0);
  return { path, file_digest: file.raw_digest, start_line: line, end_line: line,
    excerpt_digest: comparisonHash(Buffer.from(lines[line - 1])) };
}
function prepared(t) {
  const f = setup(t), { blocks } = blocksFor(t, f);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest] };
  const preparation = read(f, options.preparationObjectDigest), candidate = read(f, preparation.candidate_object_digest);
  const observation = read(f, preparation.observation_object_digest);
  const before = read(f, candidate.parent_asset.content_digest), after = read(f, candidate.candidate_asset.content_digest);
  const promptChange = { registry_snapshot_digest: candidate.registry.snapshot_digest, before_asset: candidate.parent_asset,
    after_asset: candidate.candidate_asset, locations: before.files.map(file => ({ before: at(before, file.path), after: at(after, file.path, true) })),
    selection_reason: { status: "Hypothesis", summary: "The observed gap may be addressed by this instruction." },
    evidence_refs: observation.evidence_refs, responsibility: "Preserve task requirement references.",
    expected_effect: { status: "Hypothesis", summary: "The requirement may be retained more reliably." },
    side_effects: "Additional instruction overhead is unmeasured.", prompt_mappings: [] };
  return { ...f, options, blocks, sealed, candidate, observation, before, after, promptChange };
}
function annotated(f, changes, recording = "retrospective") {
  const trace = buildPersonalEvolutionTraceBinding(f.options, { recording, changes });
  const traceObjectDigest = publish(f, trace);
  return { ...f.options, traceObjectDigest };
}
// A real Skill-typed Registry revision with an explicit *recorded*, hypothetical
// transformation into the existing fixed Prompt; no filename-based inference.
function skillChange(f) {
  const reference = JSON.parse(readFileSync(join(import.meta.dirname, "../docs/fixtures/asset-registry/reference.json")));
  const registry = verifyAssetRegistry({ storeRoot: f.storeRoot, snapshotDigest: reference.snapshot_digest });
  const old = registry.assets.find(item => item.asset_type === "skill"), descriptor = structuredClone(old.record);
  delete descriptor.object_kind;
  const sourceRoot = join(f.root, "trace-skill-source");
  descriptor.version = "synthetic-trace-skill-2";
  descriptor.version_scheme = "semantic";
  descriptor.derivation = { kind: "full_content_revision", parent: assetRef(old), delta: { kind: "replacement", summary: "synthetic Skill instruction change" } };
  descriptor.maintenance.rollback.target = assetRef(old);
  descriptor.content = { package_format: "canonical_json_base64_files", files: old.content.files.map(file => {
    const bytes = Buffer.from("# Synthetic Skill revision\nSynthetic scoped target rule.\n");
    const path = join(sourceRoot, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
    return { path: file.path, media_type: file.media_type, raw_digest: comparisonHash(bytes) };
  }) };
  const saved = registerAsset({ storeRoot: f.storeRoot, sourceRoot, predecessorSnapshotDigest: reference.snapshot_digest, descriptor });
  const next = { ...assetRef(descriptor), record_digest: saved.record_digest, content_digest: saved.content_digest };
  const mapping = { kind: "recorded_transform", source_before: at(old.content), source_after: at(read(f, saved.content_digest)),
    prompt_before: at(f.before), prompt_after: at(f.after, f.after.files[0].path, true) };
  const correspondence = { object_kind: "personal_skill_prompt_correspondence_v1", source_before_asset: assetRef(old), source_after_asset: next,
    prompt_before_asset: f.candidate.parent_asset, prompt_after_asset: f.candidate.candidate_asset, ...mapping };
  mapping.evidence_ref = { artifact_id: "synthetic-transform-receipt", digest: publish(f, correspondence) };
  return { ...structuredClone(f.promptChange), registry_snapshot_digest: saved.snapshot_digest, before_asset: assetRef(old), after_asset: next,
    locations: [{ before: mapping.source_before, after: mapping.source_after }], prompt_mappings: [mapping] };
}

test("trace reconstructs all Prompt changes, exact observation and missing source facts without writing", t => {
  const f = prepared(t), before = tree(f.root), result = inspectPersonalEvolutionTrace(f.options);
  assert.equal(result.status, "NOT_RUN"); assert.equal(result.recording, "historical_reconstruction");
  assert.equal(result.bindings.observation_digest, f.observation.observation_digest);
  assert.deepEqual(result.observation.evidence_refs, f.observation.evidence_refs);
  assert.equal(result.prompt_file_changes.length, f.before.files.length);
  assert.equal(result.handoff.length, 2); assert.equal(result.handoff[1].role, "challenger");
  assert.deepEqual(result.handoff[1].asset, f.candidate.candidate_asset);
  assert.equal(result.chronology, "Unknown"); assert.equal(result.model_use, "Unknown");
  assert.ok(result.next_checks.some(item => item.includes("Skill to Prompt")));
  assert.deepEqual(tree(f.root), before);
  const noPair = { ...f.args }; delete noPair.experimentObjectDigest; delete noPair.trustedExperimentObjectDigests;
  const partial = inspectPersonalEvolutionTrace(noPair);
  assert.deepEqual(partial.handoff, []); assert.equal(partial.saved_results, null); assert.equal(partial.status, "Unknown");
  assert.deepEqual(partial.candidate.delta, f.candidate.delta);
});

test("Skill correspondence, locations, hypotheses and multiple changes remain explicit", t => {
  const f = prepared(t), skill = skillChange(f), options = annotated(f, [skill, f.promptChange]);
  const before = tree(f.root), result = inspectPersonalEvolutionTrace(options);
  assert.equal(result.recording, "post_hoc_annotation"); assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].before_asset.asset_type, "skill");
  assert.equal(result.changes[0].prompt_mappings[0].identity_status, "Verified");
  assert.equal(result.changes[0].prompt_mappings[0].semantic_derivation, "Hypothesis");
  assert.equal(result.changes[0].selection_reason.status, "Hypothesis");
  assert.equal(result.changes[1].file_changes.length, f.after.files.length);
  assert.deepEqual(result.unexplained_prompt_changes, []);
  assert.equal(result.causal_quality_contribution, "Unknown"); assert.deepEqual(tree(f.root), before);
  const incomplete = annotated(f, [{ ...skill, locations: [], prompt_mappings: [], evidence_refs: [] }]);
  const missing = inspectPersonalEvolutionTrace(incomplete);
  assert.ok(missing.missing.some(item => item.startsWith("exact changed locations")));
  assert.ok(missing.missing.some(item => item.startsWith("observation evidence")));
  assert.equal(missing.unexplained_prompt_changes.length, f.after.files.length);
});

test("pre-evaluation chronology requires independent exact pins; annotations cannot upgrade old records", t => {
  const f = prepared(t), options = annotated(f, [f.promptChange], "pre_evaluation");
  assert.equal(inspectPersonalEvolutionTrace(options).recording, "unconfirmed_pre_evaluation_claim");
  const chronologyEvidence = publish(f, { object_kind: "synthetic_controller_chronology_v1",
    trace_object_digest: options.traceObjectDigest, pair_registration_object_digest: options.pairRegistrationObjectDigest,
    phase: "before_pair_start", real_authority: false });
  const pin = { trace_object_digest: options.traceObjectDigest, pair_registration_object_digest: options.pairRegistrationObjectDigest,
    evidence_ref: { artifact_id: "synthetic-controller-pre-start-pin", digest: chronologyEvidence } };
  assert.equal(inspectPersonalEvolutionTrace({ ...options, trustedPreEvaluationTraceBindings: [pin] }).chronology, "Supported");
  assert.throws(() => inspectPersonalEvolutionTrace({ ...options, trustedPreEvaluationTraceBindings: [{ ...pin,
    pair_registration_object_digest: canonicalDigest("foreign-pair") }] }), /chronology pair mismatch/);
  const retro = annotated(f, [f.promptChange]);
  assert.equal(inspectPersonalEvolutionTrace({ ...retro, trustedPreEvaluationTraceBindings: [{ ...pin,
    trace_object_digest: retro.traceObjectDigest }] }).recording, "post_hoc_annotation");
  const noPair = { ...f.args }; delete noPair.experimentObjectDigest; delete noPair.trustedExperimentObjectDigests;
  const fake = buildPersonalEvolutionTraceBinding(noPair, { recording: "retrospective", changes: [f.promptChange] });
  const body = { ...fake, recording: "pre_evaluation" }; delete body.trace_digest;
  const forged = publish(f, { ...body, trace_digest: canonicalDigest(body) });
  assert.throws(() => inspectPersonalEvolutionTrace({ ...noPair, traceObjectDigest: forged,
    trustedPreEvaluationTraceBindings: [{ ...pin, trace_object_digest: forged, pair_registration_object_digest: null }] }), /independently pinned pair/);
  mkdirSync(join(f.sealed.registration.output_root, "invocation"), { recursive: true });
  assert.throws(() => buildPersonalEvolutionTraceBinding(f.options, { recording: "pre_evaluation", changes: [f.promptChange] }), /consumed/);
});

test("trace rejects foreign candidate/version/Registry, evidence refs, locations and modified digests", t => {
  const f = prepared(t), options = annotated(f, [f.promptChange]);
  const original = read(f, options.traceObjectDigest);
  for (const mutate of [
    trace => { trace.bindings.candidate_digest = canonicalDigest("foreign-candidate"); },
    trace => { trace.bindings.registry.snapshot_digest = canonicalDigest("foreign-registry"); },
    trace => { trace.changes[0].before_asset.version = "foreign-version"; },
    trace => { trace.changes[0].evidence_refs[0].digest = canonicalDigest("foreign-task-source"); },
    trace => { trace.changes[0].locations[0].before.excerpt_digest = canonicalDigest("changed-excerpt"); },
    trace => { trace.changes[0].locations[0].before.file_digest = canonicalDigest("changed-file"); },
    trace => { trace.changes[0].locations[0].before.end_line = 999999; },
  ]) {
    const trace = structuredClone(original); mutate(trace); const { trace_digest, ...body } = trace; trace.trace_digest = canonicalDigest(body);
    const changed = publish(f, trace); assert.throws(() => inspectPersonalEvolutionTrace({ ...options, traceObjectDigest: changed }));
  }
  assert.throws(() => inspectPersonalEvolutionTrace({ ...options, trustedPairRegistrationObjectDigests: [] }), /independent pre-result pair/);
  const path = contentAddressedObjectPath({ storeRoot: f.storeRoot, digest: options.traceObjectDigest }), saved = readFileSync(path);
  writeFileSync(path, Buffer.from("{}")); assert.throws(() => inspectPersonalEvolutionTrace(options)); writeFileSync(path, saved);
});

test("filename is not Skill identity and correspondence cannot silently reference another Prompt version", t => {
  const f = prepared(t), skill = skillChange(f);
  const wrongType = structuredClone(f.promptChange); wrongType.prompt_mappings = skill.prompt_mappings;
  assert.throws(() => annotated(f, [wrongType]), /filename containing skill/);
  const forged = structuredClone(skill), mapping = forged.prompt_mappings[0];
  const correspondence = read(f, mapping.evidence_ref.digest); correspondence.prompt_after_asset.version = "another-prompt-version";
  mapping.evidence_ref.digest = publish(f, correspondence);
  assert.throws(() => annotated(f, [forged]), /correspondence evidence mismatch/);
  const verbatim = structuredClone(skill), vm = verbatim.prompt_mappings[0]; vm.kind = "verbatim";
  const blank = content => {
    const loc = at(content), file = content.files[0];
    const line = Buffer.from(file.bytes_base64, "base64").toString("utf8").split("\n").findIndex(value => value === "") + 1;
    assert.ok(line > 0); return { ...loc, start_line: line, end_line: line, excerpt_digest: comparisonHash(Buffer.from("")) };
  };
  vm.source_before = blank(read(f, skill.before_asset.content_digest)); vm.prompt_before = blank(f.before);
  vm.source_after = at(read(f, skill.after_asset.content_digest), vm.source_after.path, true);
  const receiptFor = mapping => {
    const { evidence_ref, ...body } = mapping;
    return { object_kind: "personal_skill_prompt_correspondence_v1", source_before_asset: skill.before_asset,
      source_after_asset: skill.after_asset, prompt_before_asset: f.candidate.parent_asset,
      prompt_after_asset: f.candidate.candidate_asset, ...body };
  };
  vm.evidence_ref.digest = publish(f, receiptFor(vm));
  const verified = inspectPersonalEvolutionTrace(annotated(f, [verbatim]));
  assert.equal(verified.changes[0].prompt_mappings[0].byte_correspondence, "Verified");
  assert.equal(verified.changes[0].prompt_mappings[0].semantic_derivation, "Hypothesis");
  vm.source_after = at(read(f, skill.after_asset.content_digest)); vm.evidence_ref.digest = publish(f, receiptFor(vm));
  assert.throws(() => annotated(f, [verbatim]), /verbatim Skill Prompt bytes differ/);
});

test("saved results preserve negative difference and missingness; another run cannot enter the trace", async t => {
  const f = prepared(t), options = annotated(f, [f.promptChange], "pre_evaluation"), template = fakeEngineeringTemplate(f.root);
  const savedResults = { baseline: {}, challenger: {} }, trusted = [];
  for (const role of ["baseline", "challenger"]) {
    const block = f.blocks[role][0]; collectSyntheticTerminal(t, block);
    const saved = await collectSyntheticGrade(t, f, block, template, { quality: role === "baseline" ? 0.75 : 0.25,
      safety: role === "challenger" ? "unknown" : "pass" });
    savedResults[role][block.fixture_id] = saved; trusted.push(saved.engineering_result.digest);
  }
  const completed = { ...options, savedResults, trustedSavedEngineeringResultDigests: trusted }, before = tree(f.root);
  const result = inspectPersonalEvolutionTrace(completed);
  assert.equal(result.status, "saved_pair_verified"); assert.equal(result.saved_results.evidence_kind, "synthetic");
  assert.equal(result.saved_results.pairs[0].quality_delta, -0.5);
  assert.equal(result.recording, "unconfirmed_pre_evaluation_claim"); assert.equal(result.model_use, "Unknown");
  assert.equal(result.causal_quality_contribution, "Unknown"); assert.deepEqual(tree(f.root), before);
  assert.throws(() => buildPersonalEvolutionTraceBinding(completed, { recording: "pre_evaluation", changes: [f.promptChange] }), /unstarted pair/);
  assert.throws(() => inspectPersonalEvolutionTrace({ ...completed, savedResults: { baseline: savedResults.baseline, challenger: savedResults.baseline } }));
  assert.throws(() => inspectPersonalEvolutionTrace({ ...completed, savedResults: { ...savedResults, foreign: {} } }), /foreign saved-result role/);
  const missing = inspectPersonalEvolutionTrace({ ...completed, savedResults: { baseline: savedResults.baseline } });
  assert.equal(missing.status, "hold_incomplete"); assert.equal(missing.saved_results.incomplete_role_count, 1);
  const grade = savedResults.challenger[f.blocks.challenger[0].fixture_id], bytes = readFileSync(grade.engineering_result.path);
  writeFileSync(grade.engineering_result.path, Buffer.concat([bytes, Buffer.from(" ")]));
  assert.throws(() => inspectPersonalEvolutionTrace(completed)); writeFileSync(grade.engineering_result.path, bytes);
});

test("CLI trace is a read-only entrance with pinned input bytes and strict options", async t => {
  const f = prepared(t), options = annotated(f, [f.promptChange]), path = join(f.root, "trace-input.json");
  const bytes = Buffer.from(JSON.stringify(options)); writeFileSync(path, bytes);
  const before = tree(f.root), args = ["trace", "--input", path, "--input-digest", comparisonHash(bytes)];
  const result = await runPersonalEvolutionCommand(args);
  assert.equal(result.kind, "personal_evolution_trace_readout_v1"); assert.equal(result.models_started, false);
  assert.equal(result.mutation_performed, false); assert.deepEqual(tree(f.root), before);
  await assert.rejects(runPersonalEvolutionCommand(["trace", "--input", path, "--input-digest", canonicalDigest("wrong")]));
  await assert.rejects(runPersonalEvolutionCommand([...args, "--approve"]));
  await assert.rejects(runPersonalEvolutionCommand([...args, "--cycle", f.root]));
});
