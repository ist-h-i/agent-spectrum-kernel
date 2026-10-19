// Exercises the public personal commands with artificial targets and fake
// provider/comparison/grading only. The separate nine-fixture test owns coverage
// of the full primary population; this test owns bounded composition/resume.
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { setup, fakeEngineeringTemplate, collectSyntheticGrade } from "./test-helpers-personal-evolution-primary-pair.mjs";
import { setupPrimaryScoringVersion } from "./test-helpers-primary-scoring-version.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { readUserComparisonPlan, startUserComparison } from "./ask-user-comparison.mjs";
import { renderCommandEvent } from "./ask-benchmark-command-evidence.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment } from "./evolution-loop.mjs";
import { validatePersonalEvolutionRunPolicy } from "./ask-personal-evolution-unattended.mjs";
import * as codexApi from "./ask-personal-evolution-codex-generation.mjs";
import * as pairApi from "./ask-personal-evolution-primary-pair.mjs";
import * as gradingApi from "./ask-primary-evaluation-grading.mjs";

const ROOT = resolve(import.meta.dirname, ".."), fixtureId = "mn-build-option-update", addition = "\nSynthetic scoped target rule.\n";
const json = path => JSON.parse(readFileSync(path));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const read = (f, digest) => readContentAddressedJson({ storeRoot: f.storeRoot, digest }).value;
const value = path => json(path).value;

test("bounded personal run uses the existing commands, exact reviews and original saved results", async t => {
  let active;
  t.mock.module("./ask-personal-evolution-codex-generation.mjs", { exports: { ...codexApi,
    inspectPreparedPersonalEvolutionCodexGeneration: input => codexApi.inspectPreparedPersonalEvolutionCodexGeneration(input, {
      spawnProcess: (executable, argv) => {
        const f = active; f.providers++; assert.equal(executable, "must-never-launch-codex");
        const child = new EventEmitter(); child.pid = 1234567; child.exitCode = null; child.signalCode = null;
        child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
        child.kill = () => assert.fail("successful fake must not terminate");
        let prompt = ""; child.stdin.on("data", chunk => { prompt += chunk; });
        child.stdin.once("finish", () => {
          const input = JSON.parse(prompt.split("\nPUBLIC_GENERATION_INPUT\n")[1]);
          assert.equal(prompt.includes(fixtureId), false, "generation never receives the holdout");
          writeFileSync(argv[argv.indexOf("--output-last-message") + 1], JSON.stringify({ status: "completed",
            files: input.parent_files.map(file => ({ path: file.path,
              text: Buffer.from(file.bytes_base64, "base64").toString("utf8") + (f.noChange ? "" : addition) })) }));
          queueMicrotask(() => { child.exitCode = 0; child.emit("exit", 0, null); child.emit("close", 0, null); });
        }); queueMicrotask(() => child.emit("spawn")); return child;
      } }),
    startPreparedPersonalEvolutionCodexGeneration: async (...args) => {
      const result = await codexApi.startPreparedPersonalEvolutionCodexGeneration(...args);
      if (active.loseGenerationReturn) { active.loseGenerationReturn = false; throw new Error("lost fake generation return after receipt"); }
      return result;
    } } });
  t.mock.module("./ask-primary-evaluation-grading.mjs", { exports: { ...gradingApi,
    createPrimaryEvaluationGradingAdapter: ({ resourcesPath, resourcesDigest }) => {
      const f = active; assert.equal(comparisonHash(readFileSync(resourcesPath)), resourcesDigest);
      const role = resourcesPath.includes("baseline") ? "baseline" : "challenger";
      return { preflight: () => ({ status: "ready", blockers: [] }), grade: async block => {
        f.grades++; const outputParent = join(json(resourcesPath).output_root, block.fixture_id); mkdirSync(outputParent, { recursive: true });
        const result = await collectSyntheticGrade(f.t, f, block, f.template, { outputParent,
          quality: f.regression ? (role === "baseline" ? 0.75 : 0.25) : 0.5,
          safety: f.reject && role === "challenger" ? "fail" : "pass" });
        return { status: "completed", producer: { record_root: result.producer.recordRoot, digest: result.producer.externalDigest },
          conditions: [{ condition: "full_ask", public_artifacts: { engineering_result: result.engineering_result } }] };
      } };
    } } });
  const startComparison = async (root, digest, options) => {
    const f = active; f.comparisons++; const loaded = readUserComparisonPlan(root);
    const contract = json(join(ROOT, "benchmarks/fixtures/checkpoint-b2", fixtureId, "verification-command-contract.json"));
    return startUserComparison(root, digest, { ...options, runner: async invocation => {
      f.sessions++; invocation.onSpawn({ pid: process.pid });
      const events = contract.commands.flatMap((command, i) => [
        { type: "item.started", item: { id: `fake-${i}`, type: "command_execution", command: renderCommandEvent(command), status: "in_progress" } },
        { type: "item.completed", item: { id: `fake-${i}`, type: "command_execution", command: renderCommandEvent(command), status: "completed", exit_code: 0, aggregated_output: "synthetic" } },
      ]);
      events.push({ type: "thread.started", thread_id: `${loaded.plan.run_id}-${f.sessions}` }, { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 5 } });
      writeFileSync(invocation.argv[invocation.argv.indexOf("--output-last-message") + 1], "synthetic unchanged output\n");
      return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 5,
        stdout: events.map(event => JSON.stringify(event)).join("\n") + "\n", stderr: "" };
    }, verifier: async invocation => { invocation.onSpawn({ pid: process.pid });
      return { spawnObserved: true, terminationConfirmed: true, exitCode: 0, durationMs: 1, stdout: "synthetic pass\n", stderr: "" }; } });
  };
  t.mock.module("./ask-personal-evolution-primary-pair.mjs", { exports: { ...pairApi,
    startPersonalEvolutionPromptPair: async options => {
      const result = await pairApi.startPersonalEvolutionPromptPair({ ...options, startComparison });
      if (active.loseComparisonReturn) { active.loseComparisonReturn = false; throw new Error("lost fake comparison return after results"); }
      return result;
    } } });
  const { runPersonalEvolutionCommand: run } = await import("./ask-personal-evolution-cli.mjs");
  async function fixture(st, options = {}) {
    const scoring = setupPrimaryScoringVersion(st), f = setup(st, { deferGeneration: true,
      portfolioBudgets: { cost_policy: "subscription_no_additional_spend_v1" },
      entryCostEstimate: { token_count: { status: "known", value: 1 }, duration_ms: { status: "known", value: 1 }, cost_microunits: { status: "unknown", value: null } },
      availableBudget: { token_count: { status: "known", value: 90000000 }, duration_ms: { status: "known", value: 604800000 }, cost_microunits: { status: "unknown", value: null } } });
    Object.assign(f, { t: st, providers: 0, comparisons: 0, sessions: 0, grades: 0, ...options }); active = f;
    f.template = fakeEngineeringTemplate(f.root, fixtureId);
    const reference = json(join(ROOT, "docs/fixtures/prompt-v2-preregistration/reference.json")), adapter = reference.adapters[0];
    const selection = read(f, adapter.baseline_selection.selection_object_digest);
    const selectorContext = structuredClone(read(f, selection.context_object_digest)); delete selectorContext.context_digest;
    selectorContext.available_budget = f.availableBudget;
    const resources = {};
    for (const role of ["baseline", "challenger"]) {
      const path = join(f.root, `resource-template-${role}.json`);
      write(path, { kind: "ask_primary_grading_resources_v1", output_root: join(f.root, `unused-template-output-${role}`), fixtures: {} });
      resources[role] = { path, digest: comparisonHash(readFileSync(path)) };
    }
    let experimentDigest = adapter.evolution.experiment_object_digest;
    if (f.reject) {
      const draft = structuredClone(read(f, experimentDigest));
      draft.recommendation_policy = { no_match: "insufficient_evidence", rules: [{ rule_id: "synthetic-unsafe-stop",
        decision_scope: "rejection_proposal_only", recommendation: "stop",
        match: { quality: ["observed", "contradicted", "unknown"], safety: ["unsafe"], cost: ["observed", "unknown"],
          variance: ["observed", "unknown", "unavailable"], mechanism: ["unavailable"], external_outcome: ["unavailable"] } }] };
      experimentDigest = publishEvolutionExperiment({ storeRoot: f.storeRoot, experiment: buildEvolutionExperiment(draft) }).object_digest;
    }
    f.reviewer = join(f.root, "reviewer.mjs"); f.reviewLog = join(f.root, "review-count.txt");
    // This fake reviewer checks independent exact source/scope facts. It cannot
    // approve arbitrary candidate text merely because a process exited zero.
    writeFileSync(f.reviewer, `import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { canonicalDigest } from ${JSON.stringify(pathToFileURL(join(ROOT, "scripts/content-addressed-store.mjs")).href)};
let text=""; for await (const chunk of process.stdin) text+=chunk;
const input=JSON.parse(text); appendFileSync(${JSON.stringify(f.reviewLog)}, "review\\n");
if(process.argv[2]==="crash") process.exit(2);
assert.ok(input.source.inherited_scope && input.source.inherited_permissions_and_effects && input.source.inherited_maintenance);
const safe=input.source.files.every(file=>file.after===file.before || file.after===file.before+${JSON.stringify(addition)});
const verdict=safe && process.argv[2]!=="decline" ? "approved" : "declined";
const result={input_digest:canonicalDigest(input), candidate_asset:input.source.candidate_asset, verdict,
reason:safe?"Exact synthetic changes preserve reviewed scope and effects.":"Unexpected source change.",
file_reviews:input.files.map(file=>({path:file.path,raw_digest:file.raw_digest,verdict,reason:"Inspected exact synthetic file bytes."}))};
if(process.argv[2]==="malformed") result.input_digest=canonicalDigest("different input");
console.log(JSON.stringify(result));\n`);
    const policy = { allowedPaths: f.content.files.map(file => file.path),
      sourceReview: { command: [process.execPath, f.reviewer, f.reviewMode ?? "approve"], timeoutMs: 30000,
        source: { path: f.reviewer, digest: comparisonHash(readFileSync(f.reviewer)) }, allowExistingApproval: false },
      decisionActions: f.actions ?? ["retain_current", "revise_candidate", "insufficient_evidence", "reject_candidate"],
      maxCycles: f.cycles ?? 1, maxDurationMs: 604800000, maxComparisonTokens: f.tokenBudget ?? 90000000 };
    f.config = join(f.root, "management.json"); f.profile = join(f.root, "profile"); f.output = join(f.root, "run");
    f.problem = join(f.root, "problem.txt"); writeFileSync(f.problem, "Artificial problem: preserve the explicitly requested option target.");
    write(f.config, { storeRoot: f.storeRoot, blueprint: f.policy, generationActor: f.generation.generationActor,
      trust: { trustedAssetAuthorityContexts: [], trustedPortfolioAuthorityContexts: [f.parentAuthority], trustedHighImpactApprovalGrants: [] },
      portfolioAuthority: f.authority, selectorContext, experimentTemplateObjectDigest: experimentDigest,
      evaluationAuthority: { authority_id: "synthetic-unattended-evaluation", authority_revision: 1, authority_evidence_digest: canonicalDigest("synthetic") },
      generation: { executable: "must-never-launch-codex", timeoutMs: 3600000 },
      evaluation: { publicInputRoot: join(ROOT, "benchmarks/fixtures/checkpoint-b2"), cliBin: join(f.root, "must-never-launch-codex"),
        cliVersion: "fake-not-launched", model: "gpt-5.6-sol", reasoning: "high", evidenceKind: "synthetic", scoringVersion: scoring.selector, gradingResources: resources },
      unattended: policy });
    const configured = await run(["configure", "--config", f.config, "--profile", f.profile]);
    assert.equal(configured.unattended_policy_digest, canonicalDigest(policy));
    f.start = () => run(["run", "--profile", f.profile, "--output", f.output, "--target", f.parentAsset.stable_id,
      "--problem", f.problem, "--confirmed-policy-digest", configured.unattended_policy_digest]);
    f.resume = () => run(["run", "--output", f.output]);
    f.reviews = () => existsSync(f.reviewLog) ? readFileSync(f.reviewLog, "utf8").trim().split("\n").length : 0;
    return f;
  }
  const counts = f => ({ providers: f.providers, comparisons: f.comparisons, sessions: f.sessions, grades: f.grades, reviews: f.reviews() });
  await t.test("two insufficient cycles close, keep Unknown and retain predecessor; resume repeats no dispatch", async st => {
    const f = await fixture(st, { cycles: 2 }), done = await f.start();
    assert.equal(done.status, "completed", JSON.stringify(done)); assert.equal(done.portfolio_adoption_performed, false); assert.equal(done.installation_performed, false);
    assert.equal(done.auxiliary_token_usage, "Unknown"); assert.equal(done.cycles.length, 2);
    assert.deepEqual(counts(f), { providers: 2, comparisons: 4, sessions: 12, grades: 4, reviews: 2 });
    for (const item of done.cycles) {
      const state = await run(["status", "--cycle", item.cycle_root]);
      assert.equal(state.recommendation.recommendation, "insufficient_evidence"); assert.equal(state.evidence.dimensions.cost.conclusion, "unknown");
      const receipt = read(f, item.receipt_object_digest); assert.deepEqual(receipt.base_heads, receipt.result_heads);
      assert.ok(value(join(item.cycle_root, "source-review-result.json")).review.file_reviews.every(file => file.verdict === "approved"));
    }
    const second = value(join(f.output, "cycle-2/input.json"));
    assert.equal(second.predecessorReceiptObjectDigest, done.cycles[0].receipt_object_digest);
    assert.equal(second.observationInput.evidence_refs.at(-1).digest, done.cycles[0].receipt_object_digest);
    const before = counts(f); assert.deepEqual(await f.resume(), done); assert.deepEqual(counts(f), before);
    const changed = join(f.root, "different-problem.txt"); writeFileSync(changed, "Different problem.");
    await assert.rejects(run(["run", "--output", f.output, "--problem", changed]), /cannot change public problem/);
    assert.deepEqual(counts(f), before);
  });
  await t.test("two unsafe-result rejections retire only each reviewed candidate and retain baseline/Portfolio", async st => {
    const f = await fixture(st, { cycles: 2, reject: true }), done = await f.start();
    assert.equal(done.status, "completed", JSON.stringify(done)); assert.equal(done.cycles.length, 2);
    for (const item of done.cycles) {
      const receipt = read(f, item.receipt_object_digest), old = read(f, receipt.base_heads.registry_snapshot_digest), next = read(f, receipt.result_heads.registry_snapshot_digest);
      assert.equal(receipt.action, "reject_candidate"); assert.equal(receipt.result_heads.portfolio_lock_digest, receipt.base_heads.portfolio_lock_digest);
      const candidate = value(join(item.cycle_root, "source-review.json")).candidate_asset;
      assert.equal(next.entries.find(entry => entry.record_digest === candidate.record_digest).state, "retired");
      assert.deepEqual(next.entries.filter(entry => entry.record_digest !== candidate.record_digest), old.entries.filter(entry => entry.record_digest !== candidate.record_digest));
      assert.equal(next.entries.find(entry => entry.record_digest === f.parentAsset.record_digest).state,
        old.entries.find(entry => entry.record_digest === f.parentAsset.record_digest).state);
    }
    assert.deepEqual(counts(f), { providers: 2, comparisons: 4, sessions: 12, grades: 4, reviews: 2 });
    const before = counts(f); assert.equal((await f.resume()).status, "completed"); assert.deepEqual(counts(f), before);
  });
  await t.test("unchanged candidate and negative quality evidence can complete without adoption", async st => {
    for (const options of [{ noChange: true }, { regression: true }]) await st.test(JSON.stringify(options), async child => {
      const f = await fixture(child, options), done = await f.start(); assert.equal(done.status, "completed", JSON.stringify(done));
      const state = await run(["status", "--cycle", join(f.output, "cycle-1")]);
      assert.equal(state.report.pairs[0].quality_delta, options.regression ? -0.5 : 0);
      assert.equal(state.recommendation.recommendation, "insufficient_evidence");
      assert.equal(read(f, done.cycles[0].receipt_object_digest).action, "insufficient_evidence");
    });
  });
  await t.test("lost generation/comparison returns resume their saved terminals once", async st => {
    const f = await fixture(st, { loseGenerationReturn: true, loseComparisonReturn: true });
    assert.equal((await f.start()).status, "needs_action"); assert.equal(f.providers, 1); assert.equal(f.comparisons, 0);
    assert.equal((await f.resume()).status, "needs_action"); assert.equal(f.providers, 1); assert.equal(f.comparisons, 2);
    assert.equal((await f.resume()).status, "completed");
    assert.deepEqual(counts(f), { providers: 1, comparisons: 2, sessions: 6, grades: 2, reviews: 1 });
  });
  await t.test("declined, malformed and consumed incomplete reviews stop and never manufacture approval", async st => {
    for (const mode of ["decline", "malformed", "crash"]) await st.test(mode, async child => {
      const f = await fixture(child, { reviewMode: mode }), result = await f.start();
      assert.equal(result.status, "needs_action", JSON.stringify(result)); assert.equal(f.comparisons, 0);
      assert.equal(existsSync(join(f.output, "cycle-1/source-review.json")), false);
      const before = counts(f); assert.equal((await f.resume()).status, "needs_action"); assert.deepEqual(counts(f), before);
      assert.equal(f.reviews(), 1);
    });
  });
  await t.test("policy admission stops before dispatch and allowed decisions stay bounded", async st => {
    const f = await fixture(st, { tokenBudget: 1 });
    assert.equal((await f.start()).status, "needs_action"); assert.deepEqual(counts(f), { providers: 0, comparisons: 0, sessions: 0, grades: 0, reviews: 0 });
    const policy = json(f.config).unattended;
    for (const action of ["adopt_candidate", "retire_asset"]) assert.throws(() => validatePersonalEvolutionRunPolicy({ ...policy, decisionActions: [action] }));
    for (const path of ["../escape", "/absolute", "some//file", "some/"]) assert.throws(() => validatePersonalEvolutionRunPolicy({ ...policy, allowedPaths: [path] }));
  });
});
