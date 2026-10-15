// Synthetic, local-only selection/experiment checks; no execution adapter calls.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { buildPortfolioManifest, validatePortfolioManifest, createEmptyPortfolioLock,
  publishPortfolioManifest, buildPortfolioAuthorityContext, applyPortfolioTransitions,
  resolvePortfolioSelection, verifyPortfolioSelection, computePortfolioSelectionDigest } from "./portfolio-manager.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, verifyEvolutionExperiment,
  computePromptV2ExactProjectionDigests } from "./evolution-loop.mjs";
import { describePersonalEvolutionPromptPair, sealPersonalEvolutionPromptPair,
  verifyPersonalEvolutionPromptPairResults, startPersonalEvolutionPromptPair } from "./ask-personal-evolution-primary-pair.mjs";
import { setup, blocksFor, bindSyntheticRoleGrading } from "./test-helpers-personal-evolution-primary-pair.mjs";

const mode = "subscription_no_additional_spend_v1";
const known = value => ({ status: "known", value });
const unknown = () => ({ status: "unknown", value: null });
const unbounded = () => ({ status: "unbounded", maximum: null });
const limits = () => ({ token_count: unbounded(), duration_ms: unbounded(), cost_microunits: unbounded() });
const cost = () => ({ token_count: known(10), duration_ms: known(10), cost_microunits: unknown() });
const available = () => ({ token_count: known(1000), duration_ms: known(1000), cost_microunits: unknown() });
const optIn = () => ({ portfolioBudgets: { cost_policy: mode }, entryCostEstimate: cost(), availableBudget: available() });
const read = (f, digest) => readContentAddressedJson({ storeRoot: f.storeRoot, digest }).value;
const resolve = (f, selectorContext = f.alignArgs.selectorContext) => resolvePortfolioSelection({ ...f.args,
  lockDigest: f.aligned.roles.baseline.portfolio.lock_digest,
  selectorContext: { ...selectorContext, portfolio_lock_digest: f.aligned.roles.baseline.portfolio.lock_digest } });

test("absent policy retains legacy unknown-cost hold and no serialized default", t => {
  const f = setup(t, { entryCostEstimate: cost(), availableBudget: available() });
  assert.equal(f.aligned.status, "NOT_RUN"); assert.equal(f.aligned.action, "hold");
  assert.ok(f.aligned.reasons.some(reason => reason.code === "budget_unknown"));
  const manifest = read(f, f.planned.plan.manifests.baseline.manifest_digest);
  assert.equal(Object.hasOwn(manifest.budgets, "cost_policy"), false);
  assert.deepEqual(buildPortfolioManifest(manifest), manifest);
});

for (const estimated of [unknown(), known(17)]) test(`opt-in preserves ${estimated.status} estimated cost and unknown availability`, t => {
  const options = optIn(); options.entryCostEstimate.cost_microunits = estimated;
  const f = setup(t, options); assert.ok(f.aligned.roles);
  const first = resolve(f), second = resolve(f);
  assert.deepEqual(first.selection, second.selection);
  assert.equal(first.selection.decision, "selected"); assert.equal(first.selection.cost_policy, mode);
  assert.deepEqual(first.selection.budget.cost_microunits.estimated, estimated);
  assert.deepEqual(first.selection.budget.cost_microunits.available, unknown());
  assert.equal(first.selection.budget.cost_microunits.status, "unknown");
  assert.deepEqual(verifyPortfolioSelection({ ...f.args, selectionObjectDigest: first.selection_object_digest }).selection,
    JSON.parse(JSON.stringify(first.selection)));
  for (const mutate of [value => delete value.cost_policy, value => value.budget.cost_microunits.estimated = known(0)]) {
    const forged = structuredClone(first.selection); mutate(forged);
    forged.selection_digest = computePortfolioSelectionDigest(forged);
    const pin = putContentAddressedJson({ storeRoot: f.storeRoot, artifact: forged }).digest;
    assert.throws(() => verifyPortfolioSelection({ ...f.args, selectionObjectDigest: pin }), /deterministic reconstruction/);
  }
});

for (const metric of ["token_count", "duration_ms"]) {
  for (const availabilityUnknown of [false, true]) test(`opt-in enforces known ${metric} limit with unknown cost/availability=${availabilityUnknown}`, t => {
    const options = optIn(); const policyLimits = limits(); policyLimits[metric] = { status: "bounded", maximum: 5 };
    options.portfolioBudgets.policy_limits = policyLimits;
    // An unknown-value bypass cannot hide a known exceeded hard planning bound.
    options.portfolioBudgets.unknown_value_action = "bypass";
    if (availabilityUnknown) options.availableBudget[metric] = unknown();
    const f = setup(t, options);
    assert.equal(f.aligned.status, "NOT_RUN");
    assert.ok(f.aligned.reasons.some(reason => reason.code === "budget_exceeded" && reason.action === "stop"));
  });
  test(`opt-in still blocks missing ${metric} estimate`, t => {
    const options = optIn(); options.entryCostEstimate[metric] = unknown();
    const f = setup(t, options); assert.equal(f.aligned.status, "NOT_RUN");
    assert.ok(f.aligned.reasons.some(reason => reason.code === "budget_unknown"));
  });
  test(`opt-in enforces declared available ${metric} quantity`, t => {
    const options = optIn(); options.availableBudget[metric] = known(5);
    const f = setup(t, options); assert.equal(f.aligned.status, "NOT_RUN");
    assert.ok(f.aligned.reasons.some(reason => reason.code === "budget_exceeded"));
  });
}

test("opt-in rejects bounded monetary limits, known available money and unknown modes", t => {
  const capped = optIn(); capped.portfolioBudgets.policy_limits = limits();
  capped.portfolioBudgets.policy_limits.cost_microunits = { status: "bounded", maximum: 20 };
  assert.throws(() => setup(t, capped), /subscription.*monetary|monetary.*subscription/);
  for (const estimate of [known(17), unknown()]) {
    const options = optIn(); options.entryCostEstimate.cost_microunits = estimate;
    options.availableBudget.cost_microunits = known(20);
    assert.throws(() => setup(t, options), /subscription.*available|available.*subscription/);
  }
  for (const policy of ["ignore_cost", null, { mode }]) {
    const options = optIn(); options.portfolioBudgets.cost_policy = policy;
    assert.throws(() => setup(t, options), /schema validation/);
  }
});

for (const failure of ["synthetic service limit", "synthetic permission refusal"]) test(`${failure} remains terminal under opt-in`, async t => {
  const f = setup(t, optIn()), { blocks } = blocksFor(t, f); bindSyntheticRoleGrading(f, blocks);
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  let starts = 0, grades = 0;
  const grader = () => ({ preflight: () => ({ status: "ready", blockers: [] }), grade: () => { grades++; throw new Error("unreachable"); } });
  const options = { ...f.args, pairRegistrationObjectDigest: sealed.object_digest, trustedPairRegistrationObjectDigests: [sealed.object_digest],
    confirmedPairObjectDigest: sealed.object_digest, gradingAdapters: { baseline: grader(), challenger: grader() },
    startComparison: async () => { starts++; throw new Error(failure); } };
  await assert.rejects(startPersonalEvolutionPromptPair(options), new RegExp(failure));
  assert.equal(starts, 1); assert.equal(grades, 0);
  assert.ok(existsSync(join(sealed.registration.output_root, "invocation/baseline-0-requested.json")));
  assert.equal(existsSync(join(sealed.registration.output_root, "invocation/challenger-0-requested.json")), false);
  await assert.rejects(startPersonalEvolutionPromptPair(options), /already consumed|EEXIST/);
  assert.equal(starts, 1); assert.equal(grades, 0);
});

test("opt-in does not relax source safety or explicit prohibited effects", t => {
  const unsafe = setup(t, { ...optIn(), sourceClassified: false });
  assert.equal(unsafe.aligned.status, "NOT_RUN");
  assert.ok(unsafe.aligned.reasons.some(reason => reason.code === "safety_unknown"));
  for (const effect of ["purchase", "subscription_upgrade", "top_up", "additional_paid_capacity", "paid_fallback",
    "credentials_change", "provider_settings_change", "payment_settings_change"]) {
    const f = setup(t, { ...optIn(), possibleEffects: [effect] });
    assert.equal(f.aligned.status, "NOT_RUN", effect);
    assert.ok(f.aligned.reasons.some(reason => reason.code === "prohibited_effect" && reason.action === "stop"), effect);
  }
});

test("manifest/basis binding, experiment roles and saved pair keep the exact opt-in", t => {
  const f = setup(t, optIn()), { blocks } = blocksFor(t, f);
  assert.ok(f.aligned.roles);
  for (const role of ["baseline", "challenger"]) {
    const selection = read(f, f.aligned.roles[role].selection_object_digest);
    const manifest = read(f, selection.manifest.manifest_digest);
    assert.equal(manifest.budgets.cost_policy, mode); assert.equal(selection.cost_policy, mode);
    const changed = structuredClone(manifest); delete changed.budgets.cost_policy;
    assert.throws(() => validatePortfolioManifest(changed), /selection-basis digest mismatch/);
  }
  const described = describePersonalEvolutionPromptPair({ ...f.args, blocks });
  assert.ok(Object.values(described.bindings).flat().every(item => item.cost_policy === mode));
  const sealed = sealPersonalEvolutionPromptPair({ ...f.args, blocks, outputRoot: join(f.root, "pair-output") });
  const result = verifyPersonalEvolutionPromptPairResults({ ...f.args, pairRegistrationObjectDigest: sealed.object_digest,
    trustedPairRegistrationObjectDigests: [sealed.object_digest] });
  assert.equal(result.status, "NOT_RUN"); assert.equal(result.recommendation.recommendation, "insufficient_evidence");
  const forgedPair = structuredClone(sealed.registration);
  delete forgedPair.description.bindings.baseline[0].cost_policy;
  const { pair_digest, ...forgedBody } = forgedPair; forgedPair.pair_digest = canonicalDigest(forgedBody);
  const forgedPin = putContentAddressedJson({ storeRoot: f.storeRoot, artifact: forgedPair }).digest;
  assert.throws(() => verifyPersonalEvolutionPromptPairResults({ ...f.args, pairRegistrationObjectDigest: forgedPin,
    trustedPairRegistrationObjectDigests: [forgedPin] }), /pair pre-result bindings\/source drift/);

  // A legitimate independently pinned legacy baseline cannot be mixed with the
  // opt-in challenger merely by recomputing the experiment's own digest.
  const selected = resolve(f), original = read(f, selected.selection.manifest.manifest_digest);
  const legacy = structuredClone(original); delete legacy.budgets.cost_policy;
  delete legacy.asset_set_digest; delete legacy.selection_basis_digest;
  legacy.rollback.mode = "none"; legacy.rollback.target = null;
  legacy.revision = "synthetic-legacy-cost-role"; legacy.entries[0].cost_estimate.cost_microunits = known(0);
  const published = publishPortfolioManifest({ storeRoot: f.storeRoot, draft: legacy });
  const empty = createEmptyPortfolioLock({ storeRoot: f.storeRoot, portfolioId: legacy.portfolio_id,
    repositoryId: legacy.repository_id, scopeId: legacy.scope_id });
  const manifest = Object.fromEntries(["portfolio_id", "revision", "manifest_digest", "asset_set_digest"].map(key => [key, published[key]]));
  const authority = buildPortfolioAuthorityContext({ portfolioId: legacy.portfolio_id, repositoryId: legacy.repository_id,
    scopeId: legacy.scope_id, predecessorLockDigest: empty.lock_digest,
    transitions: [{ manifest, from_state: null, to_state: "current" }], authority: f.authority });
  const lock = applyPortfolioTransitions({ storeRoot: f.storeRoot, predecessorLockDigest: empty.lock_digest, authorityContext: authority });
  const trust = [...f.args.trustedPortfolioAuthorityContexts, authority];
  const selection = resolvePortfolioSelection({ storeRoot: f.storeRoot, lockDigest: lock.lock_digest, trustedPortfolioAuthorityContexts: trust,
    selectorContext: { ...f.alignArgs.selectorContext, portfolio_lock_digest: lock.lock_digest,
      available_budget: { ...available(), cost_microunits: known(100) } } });
  assert.equal(selection.selection.decision, "selected");
  const draft = structuredClone(read(f, f.args.experimentObjectDigest));
  Object.assign(draft.roles.baseline, { portfolio: { ...manifest, lock_digest: lock.lock_digest },
    selection_digest: selection.selection.selection_digest, selection_object_digest: selection.selection_object_digest });
  Object.assign(draft.projection, computePromptV2ExactProjectionDigests(draft.roles));
  const experiment = publishEvolutionExperiment({ storeRoot: f.storeRoot, experiment: buildEvolutionExperiment(draft) });
  assert.throws(() => verifyEvolutionExperiment({ ...f.args, experimentObjectDigest: experiment.object_digest,
    trustedPortfolioAuthorityContexts: trust }), /baseline.*challenger.*cost policy/);
});
