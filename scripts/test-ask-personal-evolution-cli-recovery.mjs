import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { devNull } from "node:os";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setup } from "./test-helpers-personal-evolution-primary-pair.mjs";
import { setupPrimaryScoringVersion } from "./test-helpers-primary-scoring-version.mjs";
import { canonicalDigest, readContentAddressedJson } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { reportUserComparison } from "./ask-user-comparison.mjs";
import * as codexApi from "./ask-personal-evolution-codex-generation.mjs";
import * as pairApi from "./ask-personal-evolution-primary-pair.mjs";
import * as gradingApi from "./ask-primary-evaluation-grading.mjs";
import { preparationGitOperation } from "./ask-preparation-git-diagnostic.mjs";

const ROOT = resolve(import.meta.dirname, ".."), id = "mp-data-migration-handoff";
const json = path => JSON.parse(readFileSync(path));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
function files(root) { return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  const path = join(root, entry.name); return entry.isDirectory() ? Object.entries(files(path)) : [[path, comparisonHash(readFileSync(path))]];
})); }
function unchanged(snapshot) { for (const [path, digest] of Object.entries(snapshot)) assert.equal(comparisonHash(readFileSync(path)), digest, path); }
async function failChallengerRead(action) {
  const original = childProcess.spawnSync; let reads = 0, failures = 0;
  childProcess.spawnSync = (bin, args, options) => {
    if (bin === "git" && options?.cwd?.endsWith(`seed-${id}`) && args.includes("--show-toplevel") && ++reads === 2) {
      failures++; return { status: null, signal: null, error: Object.assign(new Error("synthetic spawn failure"), { code: "EAGAIN" }),
        stdout: Buffer.alloc(0), stderr: Buffer.from("private stderr must not escape") };
    }
    return original(bin, args, options);
  };
  syncBuiltinESMExports();
  try { return { result: await action(), failures }; }
  finally { childProcess.spawnSync = original; syncBuiltinESMExports(); }
}

test("approved interrupted preparation recovers through existing seal/inspect APIs without dispatch or changing old files", async t => {
  const scoring = setupPrimaryScoringVersion(t);
  const f = setup(t, { fixtureIds: [id], deferGeneration: true,
    portfolioBudgets: { cost_policy: "subscription_no_additional_spend_v1" },
    entryCostEstimate: { token_count: { status: "known", value: 1 }, duration_ms: { status: "known", value: 1 }, cost_microunits: { status: "unknown", value: null } },
    availableBudget: { token_count: { status: "known", value: 90000000 }, duration_ms: { status: "known", value: 604800000 }, cost_microunits: { status: "unknown", value: null } } });
  const reference = json(join(ROOT, "docs/fixtures/prompt-v2-preregistration/reference.json")), adapter = reference.adapters[0];
  const selection = readContentAddressedJson({ storeRoot: f.storeRoot, digest: adapter.baseline_selection.selection_object_digest }).value;
  const selectorContext = structuredClone(readContentAddressedJson({ storeRoot: f.storeRoot, digest: selection.context_object_digest }).value);
  delete selectorContext.context_digest; selectorContext.available_budget = f.availableBudget;
  const publicInputRoot = join(f.root, "public-inputs");
  const publicFixture = join(ROOT, "benchmarks/fixtures/checkpoint-b2", id);
  for (const file of json(join(publicFixture, "input-manifest.json")).fixtures[id].files) {
    const target = join(publicInputRoot, id, file.path); mkdirSync(dirname(target), { recursive: true }); cpSync(join(publicFixture, file.path), target);
  }
  const resources = Object.fromEntries(["baseline", "challenger"].map(role => {
    const path = join(f.root, `${role}-template.json`);
    write(path, { kind: "ask_primary_grading_resources_v1", output_root: join(f.root, `unused-${role}`), fixtures: {} });
    return [role, { path, digest: comparisonHash(readFileSync(path)) }];
  }));
  const config = join(f.root, "management.json"), profile = join(f.root, "profile"), cycle = join(f.root, "cycle");
  const problem = join(f.root, "problem.txt"); writeFileSync(problem, "Artificial handoff improvement observation without task answers.");
  write(config, { storeRoot: f.storeRoot, blueprint: f.policy, generationActor: f.generation.generationActor,
    trust: { trustedAssetAuthorityContexts: [], trustedPortfolioAuthorityContexts: [f.parentAuthority], trustedHighImpactApprovalGrants: [] },
    portfolioAuthority: f.authority, selectorContext, experimentTemplateObjectDigest: adapter.evolution.experiment_object_digest,
    evaluationAuthority: { authority_id: "synthetic-recovery-evaluation", authority_revision: 1, authority_evidence_digest: canonicalDigest("synthetic") },
    generation: { executable: "must-never-launch-codex", timeoutMs: 3600000 },
    evaluation: { publicInputRoot, cliBin: join(f.root, "must-never-launch-codex"), cliVersion: "fake-not-launched", model: "gpt-5.6-sol",
      reasoning: "high", evidenceKind: "synthetic", scoringVersion: scoring.selector, gradingResources: resources } });
  let providers = 0, comparisons = 0, grades = 0, workerCalls = 0;
  t.mock.module("./ask-personal-evolution-codex-generation.mjs", { exports: { ...codexApi,
    inspectPreparedPersonalEvolutionCodexGeneration: value => codexApi.inspectPreparedPersonalEvolutionCodexGeneration(value, {
      spawnProcess: (executable, argv) => {
        assert.equal(executable, "must-never-launch-codex"); providers++;
        const child = new EventEmitter(); child.pid = 1234567; child.exitCode = null; child.signalCode = null;
        child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
        child.kill = () => assert.fail("no termination needed for fake provider");
        let prompt = ""; child.stdin.on("data", chunk => { prompt += chunk; });
        child.stdin.once("finish", () => {
          const input = JSON.parse(prompt.split("\nPUBLIC_GENERATION_INPUT\n")[1]);
          writeFileSync(argv[argv.indexOf("--output-last-message") + 1], JSON.stringify({ status: "completed",
            files: input.parent_files.map(file => ({ path: file.path, text: Buffer.from(file.bytes_base64, "base64").toString("utf8") + "\nSynthetic handoff correction.\n" })) }));
          queueMicrotask(() => { child.exitCode = 0; child.emit("exit", 0, null); child.emit("close", 0, null); });
        }); queueMicrotask(() => child.emit("spawn")); return child;
      } }) } });
  t.mock.module("./ask-personal-evolution-primary-pair.mjs", { exports: { ...pairApi,
    startPersonalEvolutionPromptPair: () => { comparisons++; assert.fail("recovery must never start a comparison"); } } });
  t.mock.module("./ask-primary-evaluation-grading.mjs", { exports: { ...gradingApi,
    createPrimaryEvaluationGradingAdapter: () => ({ preflight: () => ({ status: "ready", blockers: [] }),
      grade: () => { grades++; assert.fail("recovery must never grade"); } }) } });
  // Test-only preload supplies fake grading and fault injection inside the real
  // isolated worker. Neither preload paths nor callbacks are product options.
  const control = join(f.root, "worker-test-mode"), preload = join(f.root, "worker-test-preload.mjs"); writeFileSync(control, "success");
  const moduleUrl = name => pathToFileURL(join(ROOT, "scripts", name)).href;
  writeFileSync(preload, `import { mock } from 'node:test';
import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module'; import { readFileSync } from 'node:fs';
import * as grading from ${JSON.stringify(moduleUrl("ask-primary-evaluation-grading.mjs"))};
import * as preparation from ${JSON.stringify(moduleUrl("ask-user-comparison-prepare.mjs"))};
mock.module(${JSON.stringify(moduleUrl("ask-primary-evaluation-grading.mjs"))}, {exports:{...grading,
  createPrimaryEvaluationGradingAdapter:()=>({preflight:()=>({status:'ready',blockers:[]}),grade:()=>{throw new Error('grading must never start')}})}});
if(readFileSync(${JSON.stringify(control)},'utf8')==='fail') {
  const original=cp.spawnSync;let reads=0;cp.spawnSync=(bin,args,options)=>{
    if(bin==='git'&&options?.cwd?.endsWith('seed-${id}')&&args.includes('--show-toplevel')&&++reads===2)
      return {status:null,signal:null,error:Object.assign(new Error('synthetic'),{code:'EAGAIN'}),stdout:Buffer.alloc(0),stderr:Buffer.from('private stderr must not escape')};
    return original(bin,args,options);};syncBuiltinESMExports();
  // Simulate the older fixed API's deliberately reduced error message.
  mock.module(${JSON.stringify(moduleUrl("ask-user-comparison-prepare.mjs"))},{exports:{...preparation,
    prepareUserComparison:options=>{try{return preparation.prepareUserComparison(options)}catch(error){throw new Error(error.message.split(':operation=')[0])}}}});
}
`);
  const originalSpawn = childProcess.spawnSync;
  childProcess.spawnSync = (bin, args, options) => {
    if (bin === process.execPath && args[0] === join(ROOT, "scripts/ask-personal-evolution-recovery-worker.mjs")) {
      workerCalls++; return originalSpawn(bin, ["--experimental-test-module-mocks", "--import", preload, ...args], options);
    }
    return originalSpawn(bin, args, options);
  }; syncBuiltinESMExports();
  t.after(() => { childProcess.spawnSync = originalSpawn; syncBuiltinESMExports(); });
  const { runPersonalEvolutionCommand: run } = await import("./ask-personal-evolution-cli.mjs?recovery-contract");
  await assert.rejects(run(["recover-preparation", "--cycle", "/nonexistent/artificial-cycle"]), /confirmed cycle and source-review digests required/u);
  await run(["configure", "--config", config, "--profile", profile]);
  assert.equal((await run(["start", "--profile", profile, "--cycle", cycle, "--target", f.parentAsset.stable_id, "--problem", problem])).status, "needs_source_review");
  const interrupted = await failChallengerRead(() => run(["review-source", "--cycle", cycle, "--approve", "--reason", "Synthetic human source approval only; quality unknown."]));
  assert.equal(interrupted.failures, 1); assert.equal(interrupted.result.status, "needs_action");
  assert.match(interrupted.result.detail, /local_preparation_failed:git:EAGAIN:operation=rev-parse:root/u);
  assert.equal(interrupted.result.detail.includes("private stderr"), false);
  assert.ok(existsSync(join(cycle, "evaluation", `baseline-${id}`, "control/plan.digest")));
  assert.equal(existsSync(join(cycle, "evaluation", `challenger-${id}`)), false);
  const preserved = files(cycle), approvals = json(join(cycle, "source-review.json")), initial = json(join(cycle, "input.json"));
  const command = outputRoot => ["recover-preparation", "--cycle", cycle, "--source", ROOT, "--output", outputRoot,
    "--input-digest", initial.digest, "--source-review-digest", approvals.digest];
  let index = 0;
  const rejectMutation = async (label, mutate, expected) => t.test(label, async () => {
    const output = join(f.root, `blocked-${index++}`), restore = mutate();
    try {
      const result = await run(command(output)); assert.equal(result.status, "needs_action", JSON.stringify(result));
      assert.match(result.detail, expected); assert.doesNotMatch(result.detail, /preparation_worker_failed/u);
      assert.equal(existsSync(output), false); assert.equal(existsSync(join(cycle, "pair.json")), false);
    } finally { restore(); }
    unchanged(preserved);
  });
  const edit = (path, change) => { const bytes = readFileSync(path); change(path); return () => writeFileSync(path, bytes); };
  await t.test("input snapshot confirmation rejects drift before preparation", async () => {
    const path = join(cycle, "input.json"), bytes = readFileSync(path); writeFileSync(path, `${bytes}\n `);
    // Formatting is irrelevant; modifying the actual immutable value is not.
    const value = json(path); value.value.cycleId += "-tampered"; write(path, value);
    try { await assert.rejects(run(command(join(f.root, "drift"))), /snapshot drift/u); }
    finally { writeFileSync(path, bytes); }
  });
  await t.test("confirmed input cannot select a different fixed source revision", async () => {
    const path = join(cycle, "input.json"), bytes = readFileSync(path), changed = json(path);
    changed.value.profile.sourceRevision = "a".repeat(40); changed.digest = canonicalDigest(changed.value); write(path, changed);
    const args = command(join(f.root, "wrong-revision")); args[args.indexOf(initial.digest)] = changed.digest;
    try { const result = await run(args); assert.equal(result.status, "needs_action"); assert.match(result.detail, /fixed source revision mismatch/u); }
    finally { writeFileSync(path, bytes); }
  });
  await t.test("source approval drift rejects before preparation", async () => {
    const path = join(cycle, "source-review.json"), bytes = readFileSync(path), changed = json(path);
    changed.value.candidate_asset.content_digest = canonicalDigest("tampered"); write(path, changed);
    try { await assert.rejects(run(command(join(f.root, "changed-approval"))), /snapshot drift/u); }
    finally { writeFileSync(path, bytes); }
  });
  await t.test("Git replacement cannot mask changed fixed API bytes before worker or import", async () => {
    const source = join(f.root, "artificial-fixed-api"); mkdirSync(source); mkdirSync(join(source, "scripts"));
    const git = args => {
      const result = originalSpawn("git", ["--no-optional-locks", "-c", `core.hooksPath=${devNull}`, "-c", "core.fsmonitor=false", ...args],
        { cwd: source, env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", GIT_CONFIG_GLOBAL: devNull,
          GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1" }, encoding: "utf8", shell: false });
      assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
    };
    git(["-c", "init.defaultBranch=main", "init"]);
    const api = join(source, "scripts/api.mjs"), identity = ["-c", "user.name=Artificial Recovery", "-c", "user.email=artificial@example.invalid", "-c", "commit.gpgsign=false"];
    writeFileSync(api, 'export const source = "original";\n'); git(["add", "--", "scripts/api.mjs"]);
    git([...identity, "commit", "-m", "Artificial fixed source"]); const fixed = git(["rev-parse", "HEAD"]);
    writeFileSync(api, 'export const source = "replacement";\n'); git(["add", "--", "scripts/api.mjs"]);
    const replacement = git([...identity, "commit-tree", git(["write-tree"]), "-m", "Artificial replacement"]);
    git(["replace", fixed, replacement]);
    assert.equal(git(["rev-parse", "HEAD"]), fixed); assert.equal(git(["status", "--porcelain", "--untracked-files=normal"]), "");
    const path = join(cycle, "input.json"), bytes = readFileSync(path), changed = json(path);
    changed.value.profile.sourceRevision = fixed; changed.digest = canonicalDigest(changed.value); write(path, changed);
    const output = join(f.root, "replaced-source"), args = command(output), callsBefore = workerCalls;
    args[args.indexOf("--source") + 1] = source; args[args.indexOf("--input-digest") + 1] = changed.digest;
    try {
      const result = await run(args); assert.equal(result.status, "needs_action"); assert.match(result.detail, /fixed source must be clean/u);
      assert.equal(workerCalls, callsBefore); assert.equal(existsSync(output), false); assert.equal(existsSync(join(cycle, "pair.json")), false);
    } finally { writeFileSync(path, bytes); }
    unchanged(preserved);
  });
  await rejectMutation("generated content change blocks recovery", () => edit(join(cycle, "generation/candidate/docs/fixtures/codex-pre-compact-prompts/skill-handoff.md"), path => writeFileSync(path, "tampered")), /generated file changed/u);
  await rejectMutation("public input change blocks recovery", () => edit(join(publicInputRoot, id, "task.md"), path => writeFileSync(path, "tampered")), /public input changed/u);
  await rejectMutation("fixed resource change blocks recovery", () => edit(resources.baseline.path, path => writeFileSync(path, "tampered")), /grading template changed/u);
  const oldControl = join(cycle, "evaluation", `baseline-${id}`, "control");
  for (const marker of ["start.json", "start.digest", "slots", "leases", "history"]) await rejectMutation(`started or unknown ${marker} blocks recovery`, () => {
    const path = join(oldControl, marker); writeFileSync(path, "unknown"); return () => rmSync(path);
  }, /partial comparison started or unknown/u);
  await rejectMutation("incomplete plan blocks recovery", () => edit(join(oldControl, "plan.digest"), path => writeFileSync(path, "unknown")), /saved plan changed/u);
  for (const file of ["control/task.md", "inputs/prompt.md", "control/verification.json", "control/node-test-reporter.mjs"])
    await rejectMutation(`partial ${file} drift blocks recovery`, () => edit(join(cycle, "evaluation", `baseline-${id}`, file), path => write(path, { artificially_tampered: true })), file === "control/task.md" ? /task|changed/u : /base task input drift|partial control input changed/u);
  await rejectMutation("external verification drift blocks recovery", () => edit(join(cycle, "evaluation", `${id}-verification.json`), path => write(path, { artificially_tampered: true })), /partial external verification changed/u);
  await rejectMutation("partial Git identity drift blocks recovery", () => edit(join(cycle, "evaluation", `baseline-${id}`, "arms/plain/.git/info/attributes"), path => writeFileSync(path, "changed")), /partial prepared Git metadata changed/u);
  await rejectMutation("partial prepared bytes cannot be edited", () => edit(join(cycle, "evaluation", `baseline-${id}`, "arms/plain/task.md"), path => writeFileSync(path, "tampered")), /partial prepared files changed/u);
  await rejectMutation("partial grading configuration cannot be edited", () => edit(join(cycle, "grading-baseline-resources.json"), path => write(path, { changed: true })), /partial grading configuration changed/u);
  await rejectMutation("unknown preparation child blocks recovery", () => {
    const path = join(cycle, "evaluation/unknown-child"); mkdirSync(path); return () => rmSync(path, { recursive: true });
  }, /unknown partial preparation entry/u);
  await rejectMutation("consumed generation without terminal receipt blocks recovery", () => {
    const path = join(f.storeRoot, "personal-generation-invocations", initial.value.requestObjectDigest.slice(7), "receipt.json"), backup = path + ".test-backup";
    renameSync(path, backup); return () => renameSync(backup, path);
  }, /completed generation required/u);
  await t.test("output collision is preserved without preparing", async () => {
    const output = join(f.root, "collision"); mkdirSync(output); writeFileSync(join(output, "sentinel"), "preserved");
    await assert.rejects(run(command(output)), /output already exists/u); assert.equal(readFileSync(join(output, "sentinel"), "utf8"), "preserved");
  });
  await t.test("an existing command lock remains untouched", async () => {
    const lock = join(cycle, ".command-lock"); mkdirSync(lock);
    try { assert.equal((await run(command(join(f.root, "locked")))).reason, "command_in_progress_or_interrupted"); assert.ok(existsSync(lock)); }
    finally { rmSync(lock, { recursive: true }); }
  });
  await t.test("another Git preparation failure preserves old and new partial artifacts", async () => {
    const output = join(f.root, "failed-recovery");
    writeFileSync(control, "fail"); let failed;
    try { failed = await run(command(output)); } finally { writeFileSync(control, "success"); }
    assert.equal(failed.reason, "preparation_recovery_failed_preserved");
    assert.match(failed.detail, /EAGAIN:operation=rev-parse:root/u); assert.equal(failed.detail.includes("private stderr"), false);
    const partial = files(output); assert.ok(Object.keys(partial).some(path => path.endsWith("control/plan.digest")));
    await assert.rejects(run(command(output)), /output already exists/u);
    unchanged(partial); unchanged(preserved); assert.equal(existsSync(join(cycle, "pair.json")), false);
  });
  const output = join(f.root, "recovered-preparation"), callsBefore = workerCalls;
  const recovered = await run(command(output));
  assert.equal(recovered.status, "prepared_comparison", JSON.stringify(recovered)); assert.equal(workerCalls, callsBefore + 1);
  assert.equal(recovered.models_started, false); assert.equal(recovered.grading_started, false);
  const pin = json(join(cycle, "pair.json")); assert.equal(canonicalDigest(pin.value), pin.digest);
  assert.equal(pin.value.outputRoot, join(output, "pair-output"));
  const registration = readContentAddressedJson({ storeRoot: f.storeRoot, digest: recovered.pair_object_digest }).value;
  for (const role of ["baseline", "challenger"]) for (const binding of registration.description.bindings[role]) {
    const report = reportUserComparison(binding.block.root);
    assert.equal(report.execution.start_consumed, false); assert.ok(report.slots.every(slot => slot.state === "not_started" && !slot.launch_requested));
    assert.deepEqual(binding.block.grading.scoring_version, scoring.selector);
  }
  assert.equal((await run(["status", "--cycle", cycle])).reason, "fixed_pair_not_started");
  await assert.rejects(run(command(join(f.root, "second-pair"))), /existing pair.json/u);
  unchanged(preserved); assert.equal(providers, 1); assert.equal(comparisons, 0); assert.equal(grades, 0);
  assert.equal(existsSync(join(output, "pair-output/invocation")), false);
});

test("Git diagnostic labels contain only the operation and a validated object ID", () => {
  assert.equal(preparationGitOperation(["--no-lazy-fetch", "-c", "core.hooksPath=/dev/null", "rev-parse", "--show-toplevel"]), "rev-parse:root");
  assert.equal(preparationGitOperation(["cat-file", "blob", "a".repeat(40)]), `cat-file:blob:object=${"a".repeat(40)}`);
  assert.equal(preparationGitOperation(["cat-file", "blob", "sensitive-arbitrary-argument"]), "cat-file:blob");
  assert.equal(preparationGitOperation(["config", "--local", "core.fsmonitor", "sensitive-arbitrary-value"]), "config:core.fsmonitor");
});
