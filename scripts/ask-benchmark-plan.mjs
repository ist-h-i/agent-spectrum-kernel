import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { computePortfolioPlanId } from "./ask-benchmark-schema.mjs";

export const PORTFOLIO_CONDITIONS = Object.freeze(["plain", "kernel_only", "adaptive_ask", "full_ask"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function balancedPortfolioConditionOrder(seed, adapterTrack, fixtureId, repetition) {
  const base = [...PORTFOLIO_CONDITIONS].sort((left, right) => sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${left}`).localeCompare(sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${right}`)));
  const shift = (repetition - 1) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

export function buildPortfolioPlan({ root, config, repositoryRevision, seed }) {
  const configSha256 = sha256(readFileSync(config._configPath));
  const protocolSha256 = sha256(readFileSync(config._protocolPath));
  const seedSha256 = sha256(seed);
  const planId = computePortfolioPlanId({ configSha256, protocolSha256, repositoryRevision, seed });
  const planDigest = planId.slice("plan-".length);
  const blocks = [];
  for (const adapter of config.adapter_tracks) {
    for (const fixture of config.fixtures) {
      for (let repetition = 1; repetition <= fixture.repetitions; repetition += 1) {
        const blockId = `block-${planDigest.slice(0, 16)}-${sha256(`${planId}:${adapter.id}:${fixture.id}:${repetition}`).slice(0, 12)}`;
        const orderedConditions = balancedPortfolioConditionOrder(seed, adapter.id, fixture.id, repetition);
        const cases = orderedConditions.map((condition, index) => ({
          case_id: `case-${planDigest.slice(0, 16)}-${sha256(`${planId}:${adapter.id}:${fixture.id}:${repetition}:${condition}`).slice(0, 16)}`,
          block_id: blockId,
          adapter_track: adapter.id,
          fixture_id: fixture.id,
          suite: fixture.suite,
          task_class: fixture.task_class,
          difficulty: fixture.difficulty,
          aggregate_eligible: fixture.aggregate_eligible,
          repetition,
          registered_repetitions: fixture.repetitions,
          condition,
          condition_order_position: index + 1,
          input_manifest_path: fixture.input_manifest_path,
          input_manifest_sha256: fixture.input_manifest_sha256,
        }));
        blocks.push({ order_key: sha256(`${seed}:block-order:${adapter.id}:${fixture.id}:${repetition}`), cases });
      }
    }
  }
  blocks.sort((left, right) => left.order_key.localeCompare(right.order_key));
  return {
    schema_version: config.execution_plan.schema_version,
    schema_path: config.execution_plan.schema_path,
    program: config.program,
    plan_id: planId,
    protocol_path: relative(root, config._protocolPath),
    protocol_sha256: protocolSha256,
    config_path: relative(root, config._configPath),
    config_sha256: configSha256,
    repository_revision: repositoryRevision,
    randomization_seed: {
      seed_id: `seed-${seedSha256.slice(0, 16)}`,
      value: seed,
      sha256: seedSha256,
    },
    ordering_strategy: config.ordering.strategy,
    conditions: config.conditions.map((entry) => entry.id),
    adapter_tracks: config.adapter_tracks.map((entry) => ({ id: entry.id, runtime_status: entry.runtime_status })),
    pool_adapter_results: config.pool_adapter_results,
    cases: blocks.flatMap((block) => block.cases),
  };
}
