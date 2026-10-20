// Bounded composition of existing user operations, not an execution/scoring engine.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, realpathSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalDigest, readStableBytes, parseJsonRejectDuplicateKeys, readContentAddressedJson,
  assertNoSymlinkPathSegments } from "./content-addressed-store.mjs";
import { publishJsonAtomicNoReplace } from "./ask-benchmark-atomic-publication.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { executeCodexSession } from "./codex-exec-runner.mjs";
import { personalEvolutionPairLimits, validatePersonalEvolutionFixtureSelection } from "./ask-personal-evolution-primary-pair.mjs";

const ROOT = resolve(import.meta.dirname, ".."), ACTIONS = ["retain_current", "revise_candidate", "insufficient_evidence", "reject_candidate"];
const json = path => parseJsonRejectDuplicateKeys(readStableBytes(path, "unattended input").toString("utf8"));
const exact = (v, keys) => { assert.ok(v && typeof v === "object" && !Array.isArray(v), "closed unattended object required");
  assert.deepEqual(Object.keys(v).sort(), [...keys].sort(), "closed unattended input required"); };
const same = (a, b) => assert.equal(canonicalDigest(a), canonicalDigest(b), "fixed unattended input drift");
const positive = n => assert.ok(Number.isSafeInteger(n) && n > 0, "positive explicit execution budget required");
function path(v) { assert.ok(typeof v === "string" && resolve(v) === v); assertNoSymlinkPathSegments(v, "unattended path", { allowMissingLeaf: true }); return v; }
const overlap = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
function snapshot(file) { const v = json(file); exact(v, ["value", "digest"]); same(v.digest, canonicalDigest(v.value)); return v.value; }
function save(file, value) { publishJsonAtomicNoReplace({ outputPath: file, artifact: { value, digest: canonicalDigest(value) }, label: "unattended command input" }); }
const read = (profile, digest) => readContentAddressedJson({ storeRoot: profile.storeRoot, digest }).value;
export function validatePersonalEvolutionRunPolicy(policy) {
  exact(policy, ["allowedPaths", "sourceReview", "decisionActions", "maxCycles", "maxDurationMs", "maxComparisonTokens"]);
  for (const key of ["maxCycles", "maxDurationMs", "maxComparisonTokens"]) positive(policy[key]);
  assert.ok(Array.isArray(policy.allowedPaths) && policy.allowedPaths.length && new Set(policy.allowedPaths).size === policy.allowedPaths.length);
  for (const name of policy.allowedPaths) assert.match(name, /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/-]+(?<!\/)$/u);
  assert.ok(Array.isArray(policy.decisionActions) && policy.decisionActions.length && new Set(policy.decisionActions).size === policy.decisionActions.length);
  assert.ok(policy.decisionActions.every(action => ACTIONS.includes(action)), "application is outside unattended decision policy");
  const review = policy.sourceReview; exact(review, ["command", "timeoutMs", "source", "allowExistingApproval"]);
  positive(review.timeoutMs); assert.ok(review.timeoutMs <= 2147483647);
  assert.equal(typeof review.allowExistingApproval, "boolean");
  assert.ok(Array.isArray(review.command) && review.command.length >= 2 && review.command.every(v => typeof v === "string" && !v.includes("\0")));
  path(review.command[0]); exact(review.source, ["path", "digest"]); path(review.source.path);
  assert.ok(review.command.slice(1).includes(review.source.path), "pinned source reviewer must be a command argument");
  assert.match(review.source.digest, /^sha256:[a-f0-9]{64}$/u);
  return policy;
}
function reviewerSource(policy) { assert.equal(comparisonHash(readStableBytes(policy.sourceReview.source.path, "source reviewer")), policy.sourceReview.source.digest, "source reviewer changed"); }
function reviewInput(source, policyDigest) {
  return { policy_digest: policyDigest, source, files: source.files.map(f => ({ path: f.path,
    before_digest: comparisonHash(Buffer.from(f.before)), raw_digest: comparisonHash(Buffer.from(f.after)) })) };
}
export function validatePersonalEvolutionSourceReviewResult(record, input) {
  exact(record, ["input_digest", "candidate_asset", "verdict", "reason", "file_reviews"]);
  assert.equal(record.input_digest, canonicalDigest(input)); same(record.candidate_asset, input.source.candidate_asset);
  assert.ok(["approved", "declined", "needs_action"].includes(record.verdict));
  assert.ok(typeof record.reason === "string" && record.reason.trim() && record.reason.length <= 2048);
  assert.ok(Array.isArray(record.file_reviews)); assert.equal(record.file_reviews.length, input.files.length);
  for (const [i, file] of input.files.entries()) {
    const reviewed = record.file_reviews[i]; exact(reviewed, ["path", "raw_digest", "verdict", "reason"]);
    assert.equal(reviewed.path, file.path); assert.equal(reviewed.raw_digest, file.raw_digest);
    assert.ok(typeof reviewed.reason === "string" && reviewed.reason.trim() && reviewed.reason.length <= 2048);
    assert.ok(["approved", "declined", "needs_action"].includes(reviewed.verdict));
    if (record.verdict === "approved") assert.equal(reviewed.verdict, "approved", "every exact file needs source review");
  }
  return record;
}
function acceptReview(record, input) {
  validatePersonalEvolutionSourceReviewResult(record, input);
  assert.equal(record.verdict, "approved", "source review declined or needs action");
  return record;
}
async function sourceApproval({ cycle, profile, policy, policyDigest, command, deadline }) {
  const view = await command(["review-source", "--cycle", cycle]), gen = view.generation;
  assert.equal(gen.status, "candidate_ready", "generation must be terminal and ready");
  assert.equal(gen.invocation_consumed, true);
  const approval = join(cycle, "source-review.json"), request = join(cycle, "source-review-request.json"), result = join(cycle, "source-review-result.json");
  if (existsSync(request) && !existsSync(result)) throw new Error("source review consumed without a verified result; no retry");
  const input = reviewInput(view.source, policyDigest);
  for (const file of view.source.files) if (file.before !== file.after)
    assert.ok(policy.allowedPaths.includes(file.path), "candidate changed a path outside run policy");
  if (existsSync(approval) && !existsSync(result)) {
    assert.equal(policy.sourceReview.allowExistingApproval, true, "existing source approval was not authorized by run policy");
    const fact = read(profile, snapshot(approval).reviewObjectDigest);
    assert.equal(fact.kind, "personal_explicit_source_review_v1"); assert.equal(fact.content_digest, gen.candidate_asset.content_digest);
    same(fact.inherited_parent, profile.blueprint.parent_asset); same(fact.candidate_asset, gen.candidate_asset);
    assert.equal(fact.fresh_for_fixed_comparison, true); assert.equal(fact.authority_implied, false);
    same(fact.reviewed_scope, view.source.inherited_scope);
    same(fact.reviewed_permissions_and_effects, view.source.inherited_permissions_and_effects);
    same(fact.reviewed_maintenance, view.source.inherited_maintenance);
    return view;
  }
  reviewerSource(policy);
  let reviewed;
  if (existsSync(result)) {
    const saved = snapshot(result); same(saved.input, input); same(snapshot(request), { input_digest: canonicalDigest(input), policy_digest: policyDigest });
    reviewed = acceptReview(saved.review, input);
  } else {
    assert.ok(Date.now() + policy.sourceReview.timeoutMs <= deadline, "run deadline cannot reserve full source review");
    save(request, { input_digest: canonicalDigest(input), policy_digest: policyDigest });
    const child = await executeCodexSession({ executable: policy.sourceReview.command[0], argv: policy.sourceReview.command.slice(1),
      cwd: cycle, input: JSON.stringify(input), timeoutMs: policy.sourceReview.timeoutMs, terminationScope: "direct_child" });
    assert.ok(child.spawnObserved && child.terminationConfirmed && child.exitCode === 0 && !child.error && !child.cleanupError
      && !child.timedOut && !child.interrupted && !child.outputLimited, "source reviewer incomplete; preserve request and do not retry");
    const raw = parseJsonRejectDuplicateKeys(child.stdout.toString("utf8"));
    // Retain even a declined result; it never grants source approval.
    save(result, { input, review: raw }); reviewed = acceptReview(raw, input);
  }
  if (!existsSync(approval)) {
    const outcome = await command(["review-source", "--cycle", cycle, "--approve", "--reason",
      `Confirmed unattended policy ${policyDigest}; completed source review ${canonicalDigest(reviewed)}: ${reviewed.reason}`.slice(0, 2048)]);
    if (outcome.status === "needs_action") throw new Error(`source approval/evaluation stopped: ${outcome.reason}`);
    return outcome;
  }
  return view;
}

export async function runUnattendedPersonalEvolution(options, command) {
  const output = path(options.output), runFile = join(output, "run-input.json");
  if (!existsSync(output)) {
    const profileRoot = path(options.profile), profileFile = join(profileRoot, "profile.json"), profile = snapshot(profileFile);
    const policy = validatePersonalEvolutionRunPolicy(profile.unattended), policyDigest = canonicalDigest(policy);
    assert.equal(options.confirmedPolicyDigest, policyDigest, "explicit confirmation of fixed unattended policy required");
    assert.equal(options.target, profile.blueprint.parent_asset.stable_id);
    const problem = readStableBytes(path(options.problem), "reviewed public problem").toString("utf8").trim();
    assert.ok(problem && problem.length <= 2048, "bounded reviewed public problem required");
    for (const fixed of [ROOT, profileRoot, profile.storeRoot, profile.evaluation.publicInputRoot, policy.sourceReview.source.path,
      profile.evaluation.scoringVersion.path, ...Object.values(profile.evaluation.gradingResources).map(ref => ref.path)])
      assert.ok(!overlap(output, fixed), "unattended output overlaps fixed inputs");
    assert.equal(realpathSync(dirname(output)), dirname(output)); reviewerSource(policy);
    mkdirSync(output, { mode: 0o700 });
    save(runFile, { profileRoot, profileDigest: canonicalDigest(profile), policyDigest, target: options.target, problem, startedAtMs: Date.now() });
    writeFileSync(join(output, "problem.txt"), problem, { mode: 0o600, flag: "wx" });
  }
  const fixed = snapshot(runFile), profile = snapshot(join(fixed.profileRoot, "profile.json"));
  same(canonicalDigest(profile), fixed.profileDigest); const policy = validatePersonalEvolutionRunPolicy(profile.unattended);
  same(canonicalDigest(policy), fixed.policyDigest);
  assert.equal(readStableBytes(join(output, "problem.txt"), "fixed public problem").toString("utf8"), fixed.problem);
  for (const [key, value] of [["profile", fixed.profileRoot], ["target", fixed.target], ["confirmedPolicyDigest", fixed.policyDigest]])
    if (options[key] !== undefined) assert.equal(options[key], value, "resume cannot change run inputs");
  if (options.problem !== undefined) assert.equal(readStableBytes(path(options.problem), "reviewed public problem").toString("utf8").trim(), fixed.problem, "resume cannot change public problem");
  const lock = join(output, ".command-lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch (error) { if (error.code === "EEXIST") return { status: "needs_action", reason: "run_in_progress_or_interrupted" }; throw error; }
  const deadline = fixed.startedAtMs + policy.maxDurationMs, summaries = [];
  const invoke = args => command(args, { deadlineAtMs: deadline });
  let cycle;
  const allowedAction = state => {
    const pair = snapshot(join(cycle, "pair.json")), experiment = read(profile, pair.input.experimentObjectDigest);
    const mapping = experiment.action_mapping.find(item => item.recommendation === state.recommendation.recommendation)?.actions;
    assert.ok(mapping?.length === 1 && policy.decisionActions.includes(mapping[0]), "frozen action requires separate application authority");
    return mapping[0];
  };
  try {
    const count = profile.blueprint.evaluation_scope.fixture_ids.length;
    const fixtureSet = validatePersonalEvolutionFixtureSelection(profile.blueprint.evaluation_scope.fixture_ids,
      profile.evaluation && Object.hasOwn(profile.evaluation, "fixtureSet") ? profile.evaluation.fixtureSet : "legacy9");
    const limits = personalEvolutionPairLimits(count, fixtureSet), tokens = limits.token_budget, duration = limits.overall_timeout_ms;
    for (let index = 1; index <= policy.maxCycles; index++) {
      cycle = join(output, `cycle-${index}`);
      const complete = existsSync(join(cycle, "completion.json"));
      if (existsSync(cycle)) {
        const input = snapshot(join(cycle, "input.json"));
        same({ ...input.profile, blueprint: profile.blueprint, trust: profile.trust }, profile);
        same(input.profile.blueprint.parent_asset, profile.blueprint.parent_asset);
        same(input.blueprint.evaluation_scope, profile.blueprint.evaluation_scope);
        assert.equal(input.observationInput.correction, fixed.problem, "cycle public problem drift");
        if (index === 1) { same(input.profile, profile); assert.equal(input.predecessorReceiptObjectDigest, null); }
      }
      let state;
      if (!complete) {
        assert.ok(index * tokens <= policy.maxComparisonTokens, "comparison admission budget exhausted before next cycle");
        assert.ok(Date.now() + duration < deadline, "run deadline cannot reserve full comparison");
        if (!existsSync(cycle)) {
          assert.ok(Date.now() + duration + profile.generation.timeoutMs + policy.sourceReview.timeoutMs < deadline, "run deadline cannot reserve generation/review/comparison");
          state = await invoke(["start", "--profile", fixed.profileRoot, "--cycle", cycle, "--target", fixed.target, "--problem", join(output, "problem.txt")]);
        }
        else state = await invoke(["status", "--cycle", cycle]);
        if (state.generation?.status === "NOT_RUN") state = await invoke(["start", "--cycle", cycle]);
        if (state.status === "needs_action") throw new Error(`cycle stopped: ${state.detail ?? state.reason}; no retry`);
        if (state.generation?.status === "candidate_ready")
          state = await sourceApproval({ cycle, profile, policy, policyDigest: fixed.policyDigest, command: invoke, deadline });
        if (state.status === "prepared_comparison") state = await invoke(["start", "--cycle", cycle]);
        if (!["needs_evaluation_confirmation", "needs_decision", "completed"].includes(state.status))
          throw new Error(`cycle stopped: ${state.reason ?? state.status}; no retry`);
        if (state.status !== "completed") {
          const action = allowedAction(state);
          if (state.status === "needs_evaluation_confirmation") state = await invoke(["confirm-evaluation", "--cycle", cycle, "--confirm", "--reason", `Evaluation confirmation delegated by fixed run policy ${fixed.policyDigest}.`]);
          assert.equal(state.status, "needs_decision", "evaluation confirmation did not produce an authorized decision");
          state = await invoke(["decide", "--cycle", cycle, "--approve", "--reason", `Fixed run policy ${fixed.policyDigest} authorizes ${action}; preserve all Unknown dimensions and the original baseline.`]);
          assert.equal(state.status, "completed", "decision did not complete its supported receipt");
        }
      }
      else {
        state = await invoke(["status", "--cycle", cycle]); assert.equal(state.status, "completed", "verified completion required");
        state = await sourceApproval({ cycle, profile, policy, policyDigest: fixed.policyDigest, command: invoke, deadline });
      }
      assert.equal(state.status, "completed", "verified completion required"); allowedAction(state);
      summaries.push({ cycle_root: cycle, receipt_object_digest: state.receipt_object_digest, recommendation: state.recommendation.recommendation });
      if (index < policy.maxCycles) {
        const next = join(output, `cycle-${index + 1}`);
        if (!existsSync(next)) {
          assert.ok(Date.now() < deadline, "run deadline reached before next request");
          const prepared = await invoke(["next", "--cycle", cycle, "--output", next, "--problem", join(output, "problem.txt")]);
          assert.equal(prepared.status, "prepared");
        }
        assert.equal(snapshot(join(next, "input.json")).predecessorReceiptObjectDigest, state.receipt_object_digest, "next-cycle predecessor drift");
      }
    }
    return { status: "completed", reason: "cycle_limit_reached", cycles: summaries, portfolio_adoption_performed: false, installation_performed: false,
      auxiliary_token_usage: "Unknown", comparison_token_reservation: tokens * policy.maxCycles };
  } catch (error) {
    return { status: "needs_action", reason: "unattended_run_stopped_preserved", detail: String(error.message).slice(0, 2048),
      cycle_root: cycle, cycles: summaries, next_command: "inspect preserved records; do not retry consumed or unknown work" };
  } finally { rmdirSync(lock); }
}
