#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPortfolioAuthorityContext,
  buildPortfolioSelectionContext,
  computePortfolioSelectionBasisDigest,
  createEmptyPortfolioLock,
  exportPortfolioReference,
  publishPortfolioManifest,
  applyPortfolioTransitions,
  resolvePortfolioSelection,
  verifyPortfolioLock,
  verifyPortfolioSelection,
} from "./portfolio-manager.mjs";
import {
  buildVerificationRequirements,
  verificationCommandIdentity,
} from "./verification-evidence.mjs";
import {
  canonicalDigest,
  listContentAddressedJson,
  readJsonFileStrict,
} from "./content-addressed-store.mjs";
import { verifyAssetRegistry } from "./asset-registry.mjs";

const REPOSITORY_ID = "github.com/ist-h-i/agent-spectrum-kernel";
const SCOPE_ID = "agent-spectrum-kernel";
const PORTFOLIO_ID = "ask.portfolio.reference";
const SOURCE_REVISION = "9586ea62888c896e6bda7e5647972218fe96ea0d";
const repositoryRoot = resolve(import.meta.dirname, "..");
const assetFixtureRoot = resolve(repositoryRoot, "docs/fixtures/asset-registry");
const fixtureRoot = resolve(repositoryRoot, "docs/fixtures/portfolio-manager");
const fixtureStoreRoot = resolve(fixtureRoot, "store");
const fixtureReferencePath = resolve(fixtureRoot, "reference.json");

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exactAssetRef(asset) {
  return {
    asset_type: asset.asset_type,
    stable_id: asset.stable_id,
    version: asset.version,
    record_digest: asset.record_digest,
    content_digest: asset.content_digest,
  };
}

function selector({ adapter = "codex", capabilities = ["local_filesystem"] } = {}) {
  const bounded = (included) => ({ status: "bounded", included, excluded: [] });
  return {
    task_classes: bounded(["implementation"]),
    projects: bounded([REPOSITORY_ID]),
    models: bounded(["gpt-5.6-sol"]),
    adapters: bounded([adapter]),
    stacks: bounded(["node"]),
    domains: bounded(["ai-engineering"]),
    capabilities: bounded(capabilities),
    risk_classes: bounded(["ordinary"]),
  };
}

function quantity(status, value = null) {
  return { status, value };
}

function limit(status, maximum = null) {
  return { status, maximum };
}

function baseManifestDraft({ registry, revision, entries = [], rollbackTarget = null, benchmarkCondition }) {
  const kernelBytes = execFileSync("git", ["show", `${SOURCE_REVISION}:AGENTS.md`], { cwd: repositoryRoot, encoding: null });
  const configPath = "benchmarks/adaptive-portfolio.config.json";
  const configBytes = execFileSync("git", ["show", `${SOURCE_REVISION}:${configPath}`], { cwd: repositoryRoot, encoding: null });
  return {
    schema_version: "1.0.0",
    object_kind: "portfolio_manifest",
    portfolio_id: PORTFOLIO_ID,
    revision,
    source_revision: SOURCE_REVISION,
    repository_id: REPOSITORY_ID,
    scope_id: SCOPE_ID,
    kernel_foundation: {
      kind: "canonical_kernel",
      source_revision: SOURCE_REVISION,
      source_path: "AGENTS.md",
      content_digest: rawDigest(kernelBytes),
    },
    registry: {
      registry_id: registry.registry_id,
      repository_id: registry.repository_id,
      scope_id: registry.scope_id,
      snapshot_revision: registry.snapshot_revision,
      snapshot_digest: registry.snapshot_digest,
    },
    selectors: selector(),
    selection_context_allowlist: {
      task_classes: ["implementation", "risk-gated-production"],
      projects: [REPOSITORY_ID],
      models: ["gpt-5.6-sol"],
      adapters: ["codex"],
      stacks: ["node"],
      domains: ["ai-engineering"],
      risk_classes: ["ordinary"],
      capabilities: ["local_filesystem"],
      operation_scopes: ["automatic_portfolio_activation", "local_repository"],
    },
    entries,
    evidence_requirements: [],
    selection_policy: {
      portfolio_inapplicable_action: "stop",
      selector_conflict_action: "stop",
      empty_selection_action: "bypass",
    },
    budgets: {
      policy_limits: {
        token_count: limit("unbounded"),
        duration_ms: limit("unbounded"),
        cost_microunits: limit("unbounded"),
      },
      unknown_value_action: "downgrade",
      exceeded_action: "stop",
    },
    safety_guardrails: {
      unknown_safety_action: "downgrade",
      high_impact_without_approval_action: "stop",
      prohibited_effects: [],
    },
    unresolved_conflicts: [],
    rollback: {
      mode: rollbackTarget === null ? "none" : "exact",
      target: rollbackTarget,
      required_authority_kind: "external_portfolio_rollback_authority",
    },
    benchmark_compatibility: [{
      condition_id: benchmarkCondition,
      config_path: configPath,
      config_digest: rawDigest(configBytes),
      frozen_results_mutated: false,
    }],
  };
}

function treeDigest() {
  const gitTree = execFileSync("git", ["rev-parse", `${SOURCE_REVISION}^{tree}`], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  return canonicalDigest({ source_revision: SOURCE_REVISION, git_tree: gitTree });
}

function missingEvidenceRequirement({ requirementId, entryId, selectionBasisDigest }) {
  const target = {
    repository_id: REPOSITORY_ID,
    target_revision: SOURCE_REVISION,
    tree_digest: treeDigest(),
  };
  const gateId = `${requirementId}.gate`;
  const requirements = buildVerificationRequirements({
    requiredGates: [{
      gate_id: gateId,
      reuse_identity: {
        gate: {
          gate_id: gateId,
          contract_digest: canonicalDigest({ contract: requirementId }),
          category: "test",
        },
        target,
        consumed_inputs: [{
          kind: "manifest",
          path: "portfolio-selection-basis.json",
          digest: selectionBasisDigest,
        }],
        execution: {
          command: verificationCommandIdentity({
            executable: "node",
            argument_identities: [{
              kind: "public",
              identity_digest: canonicalDigest({ command: requirementId }),
            }],
            working_directory: ".",
          }),
          runner: {
            runner_id: "ask-local-sample",
            runner_version: "1.0.0",
            adapter_id: "codex",
            adapter_version: "1.0.0",
            evidence_level: "behavior_verified",
          },
          toolchain: [{
            name: "node",
            version: "24",
            identity_digest: canonicalDigest({ toolchain: "node-24" }),
          }],
          environment: {
            os: "portable",
            architecture: "portable",
            identity_digest: canonicalDigest({ environment: "portable-sample" }),
          },
        },
      },
      required_obligation_refs: [`${requirementId}.obligation`],
      authority: {
        independent_judgment_required: false,
        accepted_producers: [{
          kind: "ci",
          identity_digest: canonicalDigest({ producer: "sample-ci" }),
        }],
        accepted_evidence_levels: ["behavior_verified"],
      },
      execution_availability: "available",
    }],
  });
  return {
    requirement_id: requirementId,
    entry_ids: [entryId],
    requirements,
    allowed_dispositions: ["reuse_exact"],
    required_current_state_refs: [{
      state_id: "repository-tree",
      state_digest: target.tree_digest,
    }],
  };
}

function selectionContext(lockDigest) {
  return buildPortfolioSelectionContext({
    schema_version: "1.0.0",
    object_kind: "portfolio_selection_context",
    selection_phase: "pre_result",
    portfolio_lock_digest: lockDigest,
    repository_id: REPOSITORY_ID,
    project_id: REPOSITORY_ID,
    source_revision: SOURCE_REVISION,
    tree_digest: treeDigest(),
    task_class: "implementation",
    model: "gpt-5.6-sol",
    adapter: "codex",
    stack: "node",
    domain: "ai-engineering",
    risk_class: "ordinary",
    capabilities: ["local_filesystem"],
    operation_scopes: ["local_repository"],
    available_budget: {
      token_count: quantity("known", 100000),
      duration_ms: quantity("known", 900000),
      cost_microunits: quantity("known", 1000000),
    },
    current_state_refs: [{
      state_id: "repository-tree",
      state_digest: treeDigest(),
    }],
  });
}

function authority(kind, revision) {
  return {
    kind,
    authority_id: "ask.portfolio.sample-authority",
    authority_revision: revision,
    authority_evidence_digest: canonicalDigest({ authority: revision }),
  };
}

function generateFixture() {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ask-portfolio-manager-samples-"));
  const storeRoot = resolve(temporaryRoot, "store");
  cpSync(resolve(assetFixtureRoot, "store"), storeRoot, { recursive: true });
  const assetReference = readJsonFileStrict(resolve(assetFixtureRoot, "reference.json"), "Asset Registry sample reference");
  const registry = verifyAssetRegistry({
    storeRoot,
    snapshotDigest: assetReference.snapshot_digest,
  });
  const candidateSkill = registry.assets.find((asset) => asset.stable_id === "ask.skill.test-first-verification");
  assert.ok(candidateSkill, "checked Asset Registry sample must contain the candidate Skill");

  const empty = createEmptyPortfolioLock({
    storeRoot,
    portfolioId: PORTFOLIO_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const kernelDraft = baseManifestDraft({
    registry,
    revision: "reference-kernel-only-v1",
    benchmarkCondition: "kernel_only",
  });
  const kernelPublication = publishPortfolioManifest({ storeRoot, draft: kernelDraft });
  const kernelRef = {
    portfolio_id: PORTFOLIO_ID,
    revision: kernelPublication.revision,
    manifest_digest: kernelPublication.manifest_digest,
    asset_set_digest: kernelPublication.asset_set_digest,
  };
  const kernelContext = buildPortfolioAuthorityContext({
    portfolioId: PORTFOLIO_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: empty.lock_digest,
    transitions: [{ manifest: kernelRef, from_state: null, to_state: "current" }],
    authority: authority("external_portfolio_activation_authority", "kernel-only-v1"),
  });
  const kernelLock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: empty.lock_digest,
    authorityContext: kernelContext,
  });
  const kernelSelector = selectionContext(kernelLock.lock_digest);
  const kernelSelection = resolvePortfolioSelection({
    storeRoot,
    lockDigest: kernelLock.lock_digest,
    selectorContext: kernelSelector,
    trustedPortfolioAuthorityContexts: [kernelContext],
  });
  assert.equal(kernelSelection.selection.decision, "selected");
  assert.equal(kernelSelection.selection.selected_assets.length, 0);
  verifyPortfolioSelection({
    storeRoot,
    selectionObjectDigest: kernelSelection.selection_object_digest,
    selectorContext: kernelSelector,
    trustedPortfolioAuthorityContexts: [kernelContext],
  });

  const candidateEntry = {
    entry_id: "test-first-challenger",
    role: "challenger",
    assurance_lane: "challenger",
    asset: exactAssetRef(candidateSkill),
    expected_registry_state: "candidate",
    expected_scope_id: SCOPE_ID,
    selectors: selector(),
    exposure: { mode: "shadow", canary_percent: null },
    prohibited_task_classes: ["risk-gated-production"],
    activation_requirement: "portfolio_activation",
    evidence_requirement_ids: ["test-first-challenger-evidence"],
    cost_estimate: {
      token_count: quantity("unknown"),
      duration_ms: quantity("unknown"),
      cost_microunits: quantity("unknown"),
    },
    failure_actions: {
      inapplicable: "downgrade",
      capability_missing: "downgrade",
      prohibited_task: "stop",
      evidence_missing: "downgrade",
      evidence_stale: "downgrade",
      evidence_conflict: "stop",
      safety_unknown: "downgrade",
    },
  };
  const adaptiveDraft = baseManifestDraft({
    registry,
    revision: "reference-adaptive-ask-v1",
    entries: [candidateEntry],
    rollbackTarget: kernelRef,
    benchmarkCondition: "adaptive_ask",
  });
  const selectionBasisDigest = computePortfolioSelectionBasisDigest(adaptiveDraft);
  adaptiveDraft.evidence_requirements = [missingEvidenceRequirement({
    requirementId: "test-first-challenger-evidence",
    entryId: candidateEntry.entry_id,
    selectionBasisDigest,
  })];
  const adaptivePublication = publishPortfolioManifest({ storeRoot, draft: adaptiveDraft });
  const adaptiveRef = {
    portfolio_id: PORTFOLIO_ID,
    revision: adaptivePublication.revision,
    manifest_digest: adaptivePublication.manifest_digest,
    asset_set_digest: adaptivePublication.asset_set_digest,
  };
  const adaptiveContext = buildPortfolioAuthorityContext({
    portfolioId: PORTFOLIO_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: kernelLock.lock_digest,
    transitions: [
      { manifest: kernelRef, from_state: "current", to_state: "superseded" },
      { manifest: adaptiveRef, from_state: null, to_state: "current" },
    ],
    authority: authority("external_portfolio_activation_authority", "adaptive-ask-v1"),
  });
  const adaptiveLock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: kernelLock.lock_digest,
    authorityContext: adaptiveContext,
    trustedPortfolioAuthorityContexts: [kernelContext],
  });
  const adaptiveSelector = selectionContext(adaptiveLock.lock_digest);
  const adaptiveSelection = resolvePortfolioSelection({
    storeRoot,
    lockDigest: adaptiveLock.lock_digest,
    selectorContext: adaptiveSelector,
    trustedPortfolioAuthorityContexts: [kernelContext, adaptiveContext],
  });
  assert.equal(adaptiveSelection.selection.decision, "downgrade");
  assert.equal(adaptiveSelection.selection.selected_assets.length, 0);
  assert.ok(adaptiveSelection.selection.reasons.some((reason) => reason.code === "evidence_missing"));
  assert.ok(adaptiveSelection.selection.reasons.some((reason) => reason.code === "safety_unknown"));
  verifyPortfolioSelection({
    storeRoot,
    selectionObjectDigest: adaptiveSelection.selection_object_digest,
    selectorContext: adaptiveSelector,
    trustedPortfolioAuthorityContexts: [kernelContext, adaptiveContext],
  });
  const verifiedLock = verifyPortfolioLock({
    storeRoot,
    lockDigest: adaptiveLock.lock_digest,
    trustedPortfolioAuthorityContexts: [kernelContext, adaptiveContext],
  });
  assert.equal(verifiedLock.lock.entries.length, 2);
  assert.equal(verifiedLock.lock.current_manifest_digest, adaptivePublication.manifest_digest);

  const reference = {
    schema_version: "1.0.0",
    program: "ask_portfolio_manager_samples",
    source_revision: SOURCE_REVISION,
    registry_snapshot_digest: registry.snapshot_digest,
    kernel_only: exportPortfolioReference({
      storeRoot,
      lockDigest: kernelLock.lock_digest,
      selectionObjectDigests: [kernelSelection.selection_object_digest],
      trustedPortfolioAuthorityContexts: [kernelContext],
    }),
    adaptive_ask: exportPortfolioReference({
      storeRoot,
      lockDigest: adaptiveLock.lock_digest,
      selectionObjectDigests: [adaptiveSelection.selection_object_digest],
      trustedPortfolioAuthorityContexts: [kernelContext, adaptiveContext],
    }),
    frozen_benchmark_results_mutated: false,
  };
  assertPortableReference(reference);
  return {
    temporaryRoot,
    storeRoot,
    reference,
    finalLockDigest: adaptiveLock.lock_digest,
  };
}

function assertPortableReference(value, location = "reference") {
  if (typeof value === "string") {
    assert.equal(isAbsolute(value), false, `${location} contains an absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPortableReference(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:^|_)latest(?:_|$)/iu.test(key)) assert.equal(entry, false, `${location}.${key} must deny mutable latest use`);
      assertPortableReference(entry, `${location}.${key}`);
    }
  }
}

function listTree(root) {
  const result = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name))) {
      const path = resolve(current, entry.name);
      const relativePath = relative(root, path).split(sep).join("/");
      assert.equal(entry.isSymbolicLink(), false, `fixture symlink is prohibited: ${relativePath}`);
      if (entry.isDirectory()) visit(path);
      else {
        assert.equal(entry.isFile(), true, `unsupported fixture entry: ${relativePath}`);
        result.push(relativePath);
      }
    }
  }
  visit(root);
  return result;
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function expectedTree(generated) {
  const files = listTree(generated.storeRoot);
  const objectFiles = listContentAddressedJson({ storeRoot: generated.storeRoot })
    .map(({ digest }) => {
      const hex = digest.slice("sha256:".length);
      return `objects/sha256/${hex.slice(0, 2)}/${hex.slice(2)}.json`;
    })
    .sort(compareText);
  assert.deepEqual(files, objectFiles, "Portfolio sample store contains files outside the shared CAS object set");
  return [...files.map((path) => `store/${path}`), "reference.json"].sort(compareText);
}

function referenceBytes(reference) {
  return Buffer.from(`${JSON.stringify(reference, null, 2)}\n`, "utf8");
}

function writeFixture(generated) {
  const expectedFiles = expectedTree(generated);
  rmSync(fixtureRoot, { recursive: true, force: true });
  for (const relativePath of expectedFiles) {
    const target = resolve(fixtureRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    if (relativePath === "reference.json") writeFileSync(target, referenceBytes(generated.reference));
    else copyFileSync(resolve(generated.storeRoot, relativePath.slice("store/".length)), target);
  }
  verifyCheckedInFixture(generated);
}

function verifyCheckedInFixture(generated) {
  assert.equal(existsSync(fixtureRoot), true, `missing checked-in fixture: ${fixtureRoot}`);
  assert.equal(lstatSync(fixtureRoot).isDirectory(), true, `fixture root is not a directory: ${fixtureRoot}`);
  const expectedFiles = expectedTree(generated);
  assert.deepEqual(listTree(fixtureRoot), expectedFiles, "checked-in Portfolio fixture has missing or extra paths");
  for (const relativePath of expectedFiles) {
    const expectedBytes = relativePath === "reference.json"
      ? referenceBytes(generated.reference)
      : readFileSync(resolve(generated.storeRoot, relativePath.slice("store/".length)));
    assert.deepEqual(readFileSync(resolve(fixtureRoot, relativePath)), expectedBytes, `${relativePath} bytes are stale`);
  }
  const checkedReference = readJsonFileStrict(fixtureReferencePath, "Portfolio Manager fixture reference");
  assert.deepEqual(checkedReference, generated.reference, "checked-in Portfolio reference differs from fresh export");
  assert.equal(listContentAddressedJson({ storeRoot: fixtureStoreRoot }).length, listContentAddressedJson({ storeRoot: generated.storeRoot }).length);
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--write") return "write";
  if (argv.length === 1 && argv[0] === "--check") return "check";
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return "help";
  throw new Error("Usage: node scripts/portfolio-manager-samples.mjs --write | --check");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let generated;
  try {
    const mode = parseArgs(process.argv.slice(2));
    if (mode === "help") {
      console.log("Usage: node scripts/portfolio-manager-samples.mjs --write | --check");
    } else {
      generated = generateFixture();
      if (mode === "write") writeFixture(generated);
      else verifyCheckedInFixture(generated);
      const objectCount = listContentAddressedJson({ storeRoot: generated.storeRoot }).length;
      console.log(`Portfolio Manager sample fixture ${mode === "write" ? "written" : "is current"}: ${objectCount} objects, lock ${generated.finalLockDigest}`);
    }
  } catch (error) {
    console.error(`portfolio-manager-samples failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (generated?.temporaryRoot) rmSync(generated.temporaryRoot, { recursive: true, force: true });
  }
}
