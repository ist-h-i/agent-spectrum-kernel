// One public fixture exercises the user commands. The existing nine-fixture
// roundtrip remains the population regression. All dispatch here is synthetic.
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { setup, fakeEngineeringTemplate, collectSyntheticGrade } from "./test-helpers-personal-evolution-primary-pair.mjs";
import { CANONICAL_PRIMARY_FIXTURE_IDS } from "./ask-primary-fixture-recipe.mjs";
import { syntheticV7ScoringVersion } from "./test-helpers-primary-evaluation-v7.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { setupPrimaryScoringVersion } from "./test-helpers-primary-scoring-version.mjs";
import { readUserComparisonPlan, startUserComparison } from "./ask-user-comparison.mjs";
import { renderCommandEvent } from "./ask-benchmark-command-evidence.mjs";
import * as codexApi from "./ask-personal-evolution-codex-generation.mjs";
import * as pairApi from "./ask-personal-evolution-primary-pair.mjs";
import * as gradingApi from "./ask-primary-evaluation-grading.mjs";

const ROOT = resolve(import.meta.dirname, ".."), fixtureId = "mn-build-option-update";
const json = path => JSON.parse(readFileSync(path));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
function files(root) { return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  const path = join(root, entry.name); return entry.isDirectory() ? Object.entries(files(path)) : [[path, comparisonHash(readFileSync(path))]];
})); }

export function personalCliRoundtrip(fixtureSet) {
  const scope = fixtureSet === "catalog24" ? "configured target → source review → saved comparison/readout"
    : "configured target → source review → saved comparison → explicit hold → fresh request";
  test(`same CLI ${fixtureSet}: ${scope}; lost returns never repeat dispatch`, async t => {
    const fixtureIds = fixtureSet === "catalog24" ? CANONICAL_PRIMARY_FIXTURE_IDS : [fixtureId];
    const scoring = fixtureSet === "catalog24" ? syntheticV7ScoringVersion(t, { fixtureIds, fixtureSet }) : setupPrimaryScoringVersion(t);
    const pending = setup(t, { fixtureIds, deferGeneration: true, portfolioBudgets: { cost_policy: "subscription_no_additional_spend_v1" },
      entryCostEstimate: { token_count: { status: "known", value: 1 }, duration_ms: { status: "known", value: 1 }, cost_microunits: { status: "unknown", value: null } },
      availableBudget: { token_count: { status: "known", value: 90000000 }, duration_ms: { status: "known", value: 604800000 }, cost_microunits: { status: "unknown", value: null } } });
    const reference = json(join(ROOT, "docs/fixtures/prompt-v2-preregistration/reference.json")), adapter = reference.adapters[0];
    const selection = read(pending.storeRoot, adapter.baseline_selection.selection_object_digest);
    const selectorContext = structuredClone(read(pending.storeRoot, selection.context_object_digest)); delete selectorContext.context_digest;
    selectorContext.available_budget = pending.availableBudget;
    const resources = {};
    for (const role of ["baseline", "challenger"]) {
      const path = join(pending.root, `resource-template-${role}.json`);
      write(path, { kind: "ask_primary_grading_resources_v1", output_root: join(pending.root, `unused-template-output-${role}`), fixtures: fixtureSet === "catalog24" ? Object.fromEntries(fixtureIds.map(id => [id, { frozenSourceRoot: scoring.runtime, ...scoring.resource }])) : {} });
      resources[role] = { path, digest: comparisonHash(readFileSync(path)) };
    }
    const configPath = join(pending.root, "management.json"), profile = join(pending.root, "profile"), cycle = join(pending.root, "cycle-1");
    const problem = join(pending.root, "problem.txt"); writeFileSync(problem, "Artificial development problem: preserve the explicitly requested option target.");
    write(configPath, { storeRoot: pending.storeRoot, blueprint: pending.policy, generationActor: pending.generation.generationActor,
      trust: { trustedAssetAuthorityContexts: [], trustedPortfolioAuthorityContexts: [pending.parentAuthority], trustedHighImpactApprovalGrants: [] },
      portfolioAuthority: pending.authority, selectorContext, experimentTemplateObjectDigest: adapter.evolution.experiment_object_digest,
      evaluationAuthority: { authority_id: "synthetic-independent-cli-evaluation", authority_revision: 1, authority_evidence_digest: canonicalDigest("synthetic") },
      generation: { executable: "must-never-launch-codex", timeoutMs: 3600000 },
      evaluation: { publicInputRoot: join(ROOT, "benchmarks/fixtures/checkpoint-b2"), cliBin: join(pending.root, "must-never-launch-codex"),
        cliVersion: "fake-not-launched", model: "gpt-5.6-sol", reasoning: "high", evidenceKind: "synthetic",
        scoringVersion: scoring.selector, gradingResources: resources, ...(fixtureSet === "catalog24" ? { fixtureSet } : {}) } });
    let providers = 0, comparisons = 0, sessions = 0, grades = 0, loseGenerationReturn = true, loseComparisonReturn = true;
    t.mock.module("./ask-personal-evolution-codex-generation.mjs", { exports: { ...codexApi,
      inspectPreparedPersonalEvolutionCodexGeneration: value => codexApi.inspectPreparedPersonalEvolutionCodexGeneration(value, {
        spawnProcess: (executable, argv, options) => {
          providers++; assert.equal(executable, "must-never-launch-codex");
          const child = new EventEmitter(); child.pid = 1234567; child.exitCode = null; child.signalCode = null;
          child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
          child.kill = () => assert.fail("successful fake must not terminate");
          let prompt = ""; child.stdin.on("data", chunk => { prompt += chunk; });
          child.stdin.once("finish", () => {
            const input = JSON.parse(prompt.split("\nPUBLIC_GENERATION_INPUT\n")[1]);
            for (const id of fixtureIds) assert.equal(prompt.includes(id), false, "holdout is excluded from generation");
            writeFileSync(argv[argv.indexOf("--output-last-message") + 1], JSON.stringify({ status: "completed",
              files: input.parent_files.map(file => ({ path: file.path,
                text: Buffer.from(file.bytes_base64, "base64").toString("utf8") + "\nSynthetic scoped target rule.\n" })) }));
            queueMicrotask(() => { child.exitCode = 0; child.emit("exit", 0, null); child.emit("close", 0, null); });
          }); queueMicrotask(() => child.emit("spawn")); return child;
        } }),
      startPreparedPersonalEvolutionCodexGeneration: async (...args) => {
        const result = await codexApi.startPreparedPersonalEvolutionCodexGeneration(...args);
        if (loseGenerationReturn) { loseGenerationReturn = false; throw new Error("synthetic lost generation return after receipt"); } return result;
      } } });
    const templates = Object.fromEntries(fixtureIds.map(id => [id, fakeEngineeringTemplate(pending.root, id)])), graders = new Map();
    t.mock.module("./ask-primary-evaluation-grading.mjs", { exports: { ...gradingApi,
      createPrimaryEvaluationGradingAdapter: ({ resourcesPath, resourcesDigest }) => {
        assert.equal(comparisonHash(readFileSync(resourcesPath)), resourcesDigest);
        if (!graders.has(resourcesPath)) graders.set(resourcesPath, {
          preflight: block => { assert.equal(block.grading.resources.path, resourcesPath); return { status: "ready", blockers: [] }; },
          grade: async block => {
            grades++; const outputParent = join(json(resourcesPath).output_root, block.fixture_id); mkdirSync(outputParent, { recursive: true });
            const result = await collectSyntheticGrade(t, pending, block, templates[block.fixture_id], { outputParent });
            return { status: "completed", producer: { record_root: result.producer.recordRoot, digest: result.producer.externalDigest },
              conditions: [{ condition: "full_ask", public_artifacts: { engineering_result: result.engineering_result } }] };
          },
        }); return graders.get(resourcesPath);
      } } });
    const startComparison = async (root, digest, options) => {
      comparisons++; const loaded = readUserComparisonPlan(root);
      const contract = json(join(ROOT, "benchmarks/fixtures/checkpoint-b2", loaded.plan.verification.recipe.fixture_id, "verification-command-contract.json"));
      return startUserComparison(root, digest, { ...options, runner: async invocation => {
        sessions++; invocation.onSpawn({ pid: process.pid });
        const events = contract.commands.flatMap((command, i) => [
          { type: "item.started", item: { id: `fake-${i}`, type: "command_execution", command: renderCommandEvent(command), status: "in_progress" } },
          { type: "item.completed", item: { id: `fake-${i}`, type: "command_execution", command: renderCommandEvent(command), status: "completed", exit_code: 0, aggregated_output: "synthetic" } },
        ]);
        events.push({ type: "thread.started", thread_id: `${loaded.plan.run_id}-${sessions}` }, { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 5 } });
        writeFileSync(invocation.argv[invocation.argv.indexOf("--output-last-message") + 1], "synthetic unchanged output\n");
        return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 5, stdout: events.map(event => JSON.stringify(event)).join("\n") + "\n", stderr: "" };
      }, verifier: async invocation => { invocation.onSpawn({ pid: process.pid });
        return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 1, stdout: "synthetic pass\n", stderr: "" }; } });
    };
    t.mock.module("./ask-personal-evolution-primary-pair.mjs", { exports: { ...pairApi,
      startPersonalEvolutionPromptPair: async options => {
        const result = await pairApi.startPersonalEvolutionPromptPair({ ...options, startComparison });
        if (loseComparisonReturn) { loseComparisonReturn = false; throw new Error("synthetic lost comparison return after saved results"); } return result;
      } } });
    const { runPersonalEvolutionCommand: run } = await import("./ask-personal-evolution-cli.mjs");
    const management = json(configPath);
    for (const [name, edit] of [
      ["missing", value => { delete value.evaluation.scoringVersion; }],
      ["null", value => { value.evaluation.scoringVersion = null; }],
      ["unknown-field", value => { value.evaluation.scoringVersion.fallback = true; }],
      ["missing-file", value => { value.evaluation.scoringVersion.path = join(pending.root, "missing-selector.json"); }],
      ["wrong-digest", value => { value.evaluation.scoringVersion.digest = canonicalDigest("wrong selector bytes"); }],
      ...(fixtureSet === "catalog24" ? [
        ["missing-set", value => { delete value.evaluation.fixtureSet; }],
        ["unknown-set", value => { value.evaluation.fixtureSet = "unknown"; }],
        ["null-set", value => { value.evaluation.fixtureSet = null; }],
        ["subset", value => { value.blueprint.evaluation_scope.fixture_ids = fixtureIds.slice(1); }],
        ["reversed", value => { value.blueprint.evaluation_scope.fixture_ids = [...fixtureIds].reverse(); }],
        ["old-version", value => {
          const manifest = json(scoring.selector.path); manifest.kind = "ask_primary_scoring_version_v6";
          const path = join(pending.root, "old-version-selector.json"); write(path, manifest);
          value.evaluation.scoringVersion = { path, digest: comparisonHash(readFileSync(path)) };
        }],
        ...["missing-fixture", "wrong-resource"].map(name => [name, value => {
          const config = json(resources.challenger.path);
          if (name === "missing-fixture") delete config.fixtures[fixtureIds[0]];
          else for (const role of ["baseline", "challenger"]) {
            const changed = json(resources[role].path); changed.fixtures[fixtureIds[0]].frozenSourceRoot = scoring.parent;
            const path = join(pending.root, `wrong-resource-${role}.json`); write(path, changed);
            value.evaluation.gradingResources[role] = { path, digest: comparisonHash(readFileSync(path)) };
          }
          if (name === "missing-fixture") {
            const path = join(pending.root, "missing-fixture-challenger.json"); write(path, config);
            value.evaluation.gradingResources.challenger = { path, digest: comparisonHash(readFileSync(path)) };
          }
        }]),
      ] : []),
    ]) {
      const bad = structuredClone(management); edit(bad); write(configPath, bad);
      const rejectedProfile = join(pending.root, `rejected-${name}`);
      await assert.rejects(run(["configure", "--config", configPath, "--profile", rejectedProfile]));
      assert.equal(existsSync(rejectedProfile), false, "invalid selector cannot create a usable profile");
      assert.equal(providers, 0); assert.equal(comparisons, 0); assert.equal(grades, 0);
    }
    write(configPath, management);
    assert.equal((await run(["configure", "--config", configPath, "--profile", profile])).status, "configured");
    assert.deepEqual(json(join(profile, "profile.json")).value.evaluation.scoringVersion, scoring.selector);
    assert.equal(providers + sessions, 0);
    const started = await run(["start", "--profile", profile, "--cycle", cycle, "--target", pending.parentAsset.stable_id, "--problem", problem]);
    assert.equal(started.status, "needs_action", JSON.stringify(started)); assert.match(started.detail, /lost generation/);
    assert.equal(providers, 1); assert.equal(sessions, 0);
    assert.equal((await run(["start", "--cycle", cycle])).status, "needs_source_review"); assert.equal(providers, 1);
    const source = await run(["review-source", "--cycle", cycle]);
    assert.ok(source.source.files.every(file => file.after.endsWith("Synthetic scoped target rule.\n")));
    assert.equal(source.source.quality_evidence, "not_evaluated");
    assert.equal((await run(["confirm-evaluation", "--cycle", cycle, "--confirm", "--reason", "too early"])).status, "needs_action");
    assert.equal(existsSync(join(cycle, "evaluation-confirmation.json")), false);
    const reviewed = await run(["review-source", "--cycle", cycle, "--approve", "--reason", "Reviewed exact synthetic files and inherited source scope/effects."]);
    assert.equal(reviewed.status, "needs_action", JSON.stringify(reviewed)); assert.match(reviewed.detail, /lost comparison/);
    assert.equal(comparisons, fixtureIds.length * 2); assert.equal(sessions, fixtureIds.length * 6); assert.equal(grades, fixtureIds.length * 2);
    const pair = json(join(cycle, "pair.json")).value, registration = read(pending.storeRoot, pair.input.pairRegistrationObjectDigest);
    for (const role of ["baseline", "challenger"]) {
      assert.deepEqual(registration.description.bindings[role].map(item => item.fixture_id), fixtureIds);
      for (const binding of registration.description.bindings[role]) {
        assert.deepEqual(binding.scoring_version, scoring.selector);
        for (const condition of ["plain", "kernel_principles_v2", "full_ask"]) {
          const slot = join(binding.block.root, "control/slots", condition), result = json(join(slot, "result.json"));
          assert.equal(result.state, "completed"); assert.equal(typeof result.reason, "string");
          for (const name of ["stdout.jsonl", "stderr.log", "changes.json"])
            assert.equal(comparisonHash(readFileSync(join(slot, name))), result.artifacts[name]);
          for (const check of result.verification.checks) for (const name of check.logs)
            assert.ok(existsSync(join(slot, name)));
        }
      }
    }
    if (fixtureSet === "catalog24") {
      assert.equal(registration.description.fixture_set, fixtureSet);
      assert.equal(registration.limits.overall_timeout_ms, 1224000000);
      assert.equal(registration.limits.token_budget, 240000000);
    }
    const terminal = files(join(cycle, "pair-output/invocation"));
    const resumed = await run(["start", "--cycle", cycle]);
    assert.equal(resumed.status, "needs_evaluation_confirmation", JSON.stringify(resumed));
    assert.deepEqual(resumed.report.pairs.map(item => item.fixture_id), fixtureIds);
    const connection = json(join(cycle, "pair-output/invocation/saved-result-connection.json"));
    assert.equal(connection.report.observations.length, fixtureIds.length * 2);
    for (const role of ["baseline", "challenger"]) assert.deepEqual(Object.keys(connection.savedResults[role]), fixtureIds);
    if (fixtureSet === "catalog24") {
      // Population coverage ends at the actual saved CLI readout. The unchanged
      // legacy case below owns decision/receipt/next-cycle lifecycle coverage.
      assert.equal(connection.report.status, "saved_pair_verified");
      assert.equal(connection.report.evidence_kind, "synthetic");
      assert.equal(connection.models_started_by_report, false); assert.equal(connection.authority_implied, false);
      assert.deepEqual(files(join(cycle, "pair-output/invocation")), terminal);
      assert.deepEqual({ providers, comparisons, sessions, grades }, { providers: 1, comparisons: 48, sessions: 144, grades: 48 });
      assert.equal(existsSync(join(pending.root, "must-never-launch-codex")), false);
      t.diagnostic("catalog24: 48 real prepared role plans, 144 fake sessions with saved logs, 48 synthetic grades and verified saved CLI readout; no real CLI/model/private admission");
      return;
    }
    assert.equal(resumed.recommendation.recommendation, "insufficient_evidence");
    assert.equal(resumed.evidence.dimensions.cost.conclusion, "unknown");
    assert.equal((await run(["confirm-evaluation", "--cycle", cycle])).status, "needs_evaluation_confirmation");
    assert.equal((await run(["decide", "--cycle", cycle, "--approve", "--reason", "no evaluation confirmation"])).status, "needs_action");
    assert.equal(existsSync(join(cycle, "decision.json")), false);
    const confirmed = await run(["confirm-evaluation", "--cycle", cycle, "--confirm", "--reason", "Reviewed saved comparison, original grading provenance and missing evidence."]);
    assert.equal(confirmed.status, "needs_decision", JSON.stringify(confirmed));
    const humanReason = "今回は保留を承認します。品質の改善は未確認です。";
    const done = await run(["decide", "--cycle", cycle, "--approve", "--reason", humanReason]);
    assert.equal(done.status, "completed", JSON.stringify(done));
    assert.equal(done.decision_reason, humanReason);
    const decision = json(join(cycle, "decision.json")).value;
    assert.equal(read(pending.storeRoot, decision.reasonObjectDigest).reason, humanReason);
    assert.ok(decision.decision.reason_codes.includes(`human_reason:${decision.reasonObjectDigest}`));
    const receipt = read(pending.storeRoot, done.receipt_object_digest);
    assert.deepEqual(receipt.result_heads, receipt.base_heads); assert.equal(receipt.steps.length, 0);
    assert.equal((await run(["start", "--cycle", cycle])).status, "completed");
    const contradicted = await run(["decide", "--cycle", cycle, "--decline", "--reason", "Cannot replace an already recorded decision."]);
    assert.equal(contradicted.status, "needs_action"); assert.match(contradicted.detail, /already recorded/);
    assert.equal(json(join(cycle, "decision.json")).value.decision.disposition, "approved");
    const nextRoot = join(pending.root, "cycle-2"), fresh = await run(["next", "--cycle", cycle, "--output", nextRoot, "--problem", problem]);
    assert.equal(fresh.status, "prepared", JSON.stringify(fresh)); assert.notEqual(fresh.request_object_digest, done.request_object_digest);
    const nextInput = json(join(nextRoot, "input.json")).value;
    assert.equal(nextInput.predecessorReceiptObjectDigest, done.receipt_object_digest);
    assert.equal(nextInput.observationInput.evidence_refs.at(-1).digest, done.receipt_object_digest);
    assert.deepEqual(files(join(cycle, "pair-output/invocation")), terminal);
    assert.deepEqual({ providers, comparisons, sessions, grades }, { providers: 1, comparisons: fixtureIds.length * 2, sessions: fixtureIds.length * 6, grades: fixtureIds.length * 2 });
    const gen = (await run(["result", "--cycle", cycle])).generation;
    const original = read(pending.storeRoot, gen.candidate_asset.record_digest);
    const reviewedAsset = json(join(cycle, "source-review.json")).value.candidate_asset;
    const reviewedRecord = read(pending.storeRoot, reviewedAsset.record_digest);
    assert.equal(original.safety.status, "not_evaluated"); assert.equal(original.maintenance.stale_status, "not_assessed");
    assert.equal(reviewedRecord.evaluation_history.status, "not_evaluated");
    assert.equal(reviewedRecord.provenance.owner.status, "unknown"); assert.equal(reviewedAsset.content_digest, gen.candidate_asset.content_digest);
    assert.equal(existsSync(join(pending.root, "must-never-launch-codex")), false);
    t.diagnostic(`1 fake provider, ${fixtureIds.length * 2} role starts, ${fixtureIds.length * 6} fake sessions, ${fixtureIds.length * 2} synthetic grades; explicit hold, unchanged terminal files, unstarted next request; no real CLI/provider/Mac operation`);
  });

}
