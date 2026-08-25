#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyAssetLifecycleTransitions,
  buildAssetLifecycleAuthorityContext,
  createEmptyAssetRegistry,
  exportAssetRegistryReference,
  listAssets,
  registerAsset,
  resolveAsset,
  verifyAssetRegistry,
} from "./asset-registry.mjs";
import {
  contentAddressedObjectPath,
  listContentAddressedJson,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";

const REPOSITORY_ID = "github.com/ist-h-i/agent-spectrum-kernel";
const SOURCE_REVISION = "656edf1ac611890a3ae5a93a90e9076f50ee2488";
const REGISTRY_ID = "ask-local-assets";
const SCOPE_ID = "agent-spectrum-kernel";
const repositoryRoot = resolve(import.meta.dirname, "..");

const samples = {
  skill: {
    assetType: "skill",
    stableId: "ask.skill.test-first-verification",
    version: `git:${SOURCE_REVISION}`,
    path: "skills/test-first-verification/SKILL.md",
    mediaType: "text/markdown; charset=utf-8",
    sha256: "sha256:6ab90c0cc61752132f25bb579a35b98e0e9b2ed1a8b36dc2a82db715b9e44684",
  },
  prompt: {
    assetType: "prompt",
    stableId: "ask.prompt-template.codex.skill-verify",
    version: `git:${SOURCE_REVISION}`,
    path: "adapters/codex/prompts/skill-verify.md",
    mediaType: "text/markdown; charset=utf-8",
    sha256: "sha256:0fb394cd590cfd00215e581d3d159a31967437f039156f5e5e3d6b4f1b157b82",
  },
  evaluator: {
    assetType: "evaluator_reference",
    stableId: "ask.evaluator-reference.mn-build-option-update",
    version: `git:${SOURCE_REVISION}`,
    path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-reference.json",
    mediaType: "application/json",
    sha256: "sha256:bc701eb717206d68fed24c037106ae72d3f7d52b63dfcf71a8d767d599f35874",
  },
};

const rawDigest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const textDigest = (value) => rawDigest(Buffer.from(String(value), "utf8"));

let caseCount = 0;
function check(label, action) {
  action();
  caseCount += 1;
  return label;
}

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
  caseCount += 1;
}

function copyFixture(sourceRoot, relativePath) {
  const target = resolve(sourceRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(repositoryRoot, relativePath), target);
  return target;
}

function assetDescriptor({
  sample,
  path = sample.path,
  rawSha256 = sample.sha256,
  stableId = sample.stableId,
  version = sample.version,
  dependencies = [],
  derivation = { kind: "root", parent: null, delta: null },
  rollbackTarget = null,
  applicabilityNotes = [],
} = {}) {
  const typeExtension = sample.assetType === "skill"
    ? { kind: "skill", entrypoint: path }
    : sample.assetType === "prompt"
      ? { kind: "prompt_template", adapter: "codex", entrypoint: path, rendered_runtime_content: false }
      : {
          kind: "public_evaluator_reference",
          fixture_id: "mn-build-option-update",
          entrypoint: path,
          private_evaluator_content_included: false,
        };
  return {
    schema_version: "1.0.0",
    asset_type: sample.assetType,
    stable_id: stableId,
    version,
    version_scheme: version.startsWith("git:") ? "git_revision" : "semantic",
    type_extension: typeExtension,
    content: {
      package_format: "canonical_json_base64_files",
      files: [{
        path,
        media_type: sample.mediaType,
        raw_digest: rawSha256,
      }],
    },
    source: {
      kind: "git_repository",
      repository_id: REPOSITORY_ID,
      revision: SOURCE_REVISION,
    },
    provenance: {
      origin: "repository_file",
      license: {
        status: "unknown",
        spdx_id: null,
        evidence_ref: null,
      },
      owner: {
        status: "unknown",
        owner_id: null,
        evidence_ref: null,
      },
    },
    derivation,
    dependencies,
    compatibility: {
      asset_contract_versions: ["1.0.0"],
      runtime_profiles: [],
    },
    applicability: {
      models: { status: "unknown", included: [], excluded: [] },
      adapters: sample.assetType === "prompt"
        ? { status: "bounded", included: ["codex"], excluded: [] }
        : { status: "unknown", included: [], excluded: [] },
      stacks: { status: "unknown", included: [], excluded: [] },
      domains: { status: "unknown", included: [], excluded: [] },
      projects: { status: "bounded", included: [REPOSITORY_ID], excluded: [] },
      task_classes: { status: "unknown", included: [], excluded: [] },
      included_scopes: ["local_repository"],
      excluded_scopes: ["automatic_portfolio_activation"],
      required_capabilities: [],
      notes: applicabilityNotes,
    },
    permissions_and_effects: {
      status: "declared_by_consumer",
      permission_refs: [],
      effect_refs: [],
    },
    safety: {
      status: "not_evaluated",
      classifications: [],
      constraint_refs: [],
    },
    mechanism_and_evidence: {
      status: "not_evaluated",
      mechanism_refs: [],
      evidence_refs: [],
    },
    evaluation_history: {
      status: "not_evaluated",
      evidence_refs: [],
      cost: null,
    },
    maintenance: {
      stale_status: "not_assessed",
      refresh_conditions: [],
      regression_refs: [],
      retirement: null,
      rollback: {
        status: "requires_explicit_authority",
        target: rollbackTarget,
        authority_ref: null,
      },
    },
  };
}

function exactAssetRef(resolved) {
  return {
    asset_type: resolved.asset_type,
    stable_id: resolved.stable_id,
    version: resolved.version,
    record_digest: resolved.record_digest,
    content_digest: resolved.content_digest,
  };
}

function lifecycleTransition(resolved, fromState, toState) {
  return {
    asset: exactAssetRef(resolved),
    from_state: fromState,
    to_state: toState,
  };
}

function lifecycleAuthority({
  predecessorSnapshotDigest,
  transitions,
  revision,
  kind = "external_asset_lifecycle_authority",
  registryId = REGISTRY_ID,
  repositoryId = REPOSITORY_ID,
  scopeId = SCOPE_ID,
}) {
  return buildAssetLifecycleAuthorityContext({
    registryId,
    repositoryId,
    scopeId,
    predecessorSnapshotDigest,
    transitions,
    authority: {
      kind,
      authority_id: "issue-276-test-maintainer-authority",
      authority_revision: revision,
      authority_evidence_digest: textDigest(`external:${kind}:${revision}`),
    },
  });
}

function assertDeepFrozen(value, path = "$", seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} must be immutable`);
  for (const [key, entry] of Object.entries(value)) assertDeepFrozen(entry, `${path}.${key}`, seen);
}

const root = mkdtempSync(resolve(tmpdir(), "ask-asset-registry-"));
try {
  const sourceRoot = resolve(root, "source");
  const storeRoot = resolve(root, "store");
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(storeRoot, { recursive: true });

  for (const sample of Object.values(samples)) copyFixture(sourceRoot, sample.path);

  check("three checked-in sample identities are exact", () => {
    for (const sample of Object.values(samples)) {
      assert.equal(rawDigest(readFileSync(resolve(sourceRoot, sample.path))), sample.sha256, sample.path);
    }
  });

  const runtimeFixturePath = resolve(repositoryRoot, "docs/fixtures/adapter-runtime-profiles.json");
  const runtimeFixtureDigestBefore = rawDigest(readFileSync(runtimeFixturePath));

  const empty = createEmptyAssetRegistry({
    storeRoot,
    registryId: REGISTRY_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  check("empty registry is a shared-CAS snapshot", () => {
    assert.match(empty.snapshot_digest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(empty.created, true);
    assert.equal(existsSync(contentAddressedObjectPath({ storeRoot, digest: empty.snapshot_digest })), true);
    assert.deepEqual(listAssets({ storeRoot, snapshotDigest: empty.snapshot_digest }), []);
  });

  check("registry ordering uses locale-independent code-unit order", () => {
    const orderStoreRoot = resolve(root, "ordering-store");
    const orderEmpty = createEmptyAssetRegistry({
      storeRoot: orderStoreRoot,
      registryId: "ordering-test",
      repositoryId: REPOSITORY_ID,
      scopeId: SCOPE_ID,
    });
    const lowercase = registerAsset({
      storeRoot: orderStoreRoot,
      sourceRoot,
      predecessorSnapshotDigest: orderEmpty.snapshot_digest,
      descriptor: assetDescriptor({ sample: samples.skill, stableId: "ask.skill.order.a" }),
    });
    const uppercase = registerAsset({
      storeRoot: orderStoreRoot,
      sourceRoot,
      predecessorSnapshotDigest: lowercase.snapshot_digest,
      descriptor: assetDescriptor({ sample: samples.skill, stableId: "ask.skill.order.A" }),
    });
    assert.deepEqual(
      listAssets({ storeRoot: orderStoreRoot, snapshotDigest: uppercase.snapshot_digest }).map((asset) => asset.stable_id),
      ["ask.skill.order.A", "ask.skill.order.a"],
    );
  });

  const skillDescriptor = assetDescriptor({ sample: samples.skill });
  const skillRegistration = registerAsset({
    storeRoot,
    sourceRoot,
    predecessorSnapshotDigest: empty.snapshot_digest,
    descriptor: skillDescriptor,
  });
  const skillCandidate = resolveAsset({
    storeRoot,
    snapshotDigest: skillRegistration.snapshot_digest,
    stableId: samples.skill.stableId,
    version: samples.skill.version,
    state: "candidate",
  });

  check("identical registration is idempotent", () => {
    const retry = registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: skillRegistration.snapshot_digest,
      descriptor: structuredClone(skillDescriptor),
    });
    assert.equal(retry.snapshot_digest, skillRegistration.snapshot_digest);
    assert.equal(retry.record_digest, skillRegistration.record_digest);
    assert.equal(retry.content_digest, skillRegistration.content_digest);
    assert.equal(retry.created, false);
  });

  const promptDescriptor = assetDescriptor({
    sample: samples.prompt,
    dependencies: [exactAssetRef(skillCandidate)],
  });
  const promptRegistration = registerAsset({
    storeRoot,
    sourceRoot,
    predecessorSnapshotDigest: skillRegistration.snapshot_digest,
    descriptor: promptDescriptor,
  });
  const promptCandidate = resolveAsset({
    storeRoot,
    snapshotDigest: promptRegistration.snapshot_digest,
    stableId: samples.prompt.stableId,
    version: samples.prompt.version,
    state: "candidate",
  });
  const evaluatorRegistration = registerAsset({
    storeRoot,
    sourceRoot,
    predecessorSnapshotDigest: promptRegistration.snapshot_digest,
    descriptor: assetDescriptor({ sample: samples.evaluator }),
  });
  const candidateSnapshotDigest = evaluatorRegistration.snapshot_digest;
  const evaluatorCandidate = resolveAsset({
    storeRoot,
    snapshotDigest: candidateSnapshotDigest,
    stableId: samples.evaluator.stableId,
    version: samples.evaluator.version,
    state: "candidate",
  });

  check("three heterogeneous Assets register as candidates", () => {
    const verified = verifyAssetRegistry({ storeRoot, snapshotDigest: candidateSnapshotDigest });
    assert.equal(verified.snapshot_digest, candidateSnapshotDigest);
    assert.equal(verified.assets.length, 3);
    assert.deepEqual(verified.assets.map((entry) => entry.asset_type).sort(), ["evaluator_reference", "prompt", "skill"]);
    assert.deepEqual(new Set(verified.assets.map((entry) => entry.state)), new Set(["candidate"]));
    assert.equal(evaluatorCandidate.record.type_extension.entrypoint, samples.evaluator.path);
    assertDeepFrozen(verified);
  });

  check("candidate list ordering is deterministic", () => {
    const first = listAssets({ storeRoot, snapshotDigest: candidateSnapshotDigest });
    const second = listAssets({ storeRoot, snapshotDigest: candidateSnapshotDigest });
    assert.deepEqual(first, second);
    assert.deepEqual(first.map((entry) => entry.stable_id), [...first.map((entry) => entry.stable_id)].sort());
  });

  check("explicit candidate resolution closes dependencies", () => {
    assert.equal(promptCandidate.state, "candidate");
    assert.equal(promptCandidate.content.files[0].raw_digest, samples.prompt.sha256);
    assert.deepEqual(promptCandidate.dependency_closure.map((entry) => exactAssetRef(entry)), [exactAssetRef(skillCandidate)]);
    assertDeepFrozen(promptCandidate);
  });

  expectFailure(
    "candidate cannot satisfy default resolution",
    () => resolveAsset({ storeRoot, snapshotDigest: candidateSnapshotDigest, stableId: samples.prompt.stableId }),
    /default resolution requires exactly one current Asset|no current Asset revision/iu,
  );

  check("content, record, and snapshot share the generic CAS", () => {
    for (const digest of [
      skillRegistration.content_digest,
      skillRegistration.record_digest,
      candidateSnapshotDigest,
    ]) {
      const path = contentAddressedObjectPath({ storeRoot, digest });
      assert.equal(existsSync(path), true, digest);
      assert.match(path, /\/objects\/sha256\/[a-f0-9]{2}\/[a-f0-9]{62}\.json$/u);
    }
    const stored = new Set(listContentAddressedJson({ storeRoot }).map((entry) => entry.digest));
    assert.equal(stored.has(skillRegistration.content_digest), true);
    assert.equal(stored.has(skillRegistration.record_digest), true);
    assert.equal(stored.has(candidateSnapshotDigest), true);
  });

  const objectCountBeforeCollisions = listContentAddressedJson({ storeRoot }).length;
  expectFailure(
    "same stable ID/version cannot replace metadata",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: assetDescriptor({
        sample: samples.skill,
        applicabilityNotes: ["coordinated metadata substitution"],
      }),
    }),
    /stable (?:ID|id).*version.*collision|Asset identity collision/iu,
  );

  const substitutePath = "substitution/test-first-verification.md";
  const substituteBytes = Buffer.from(`${readFileSync(resolve(sourceRoot, samples.skill.path), "utf8")}\nsubstituted\n`, "utf8");
  mkdirSync(dirname(resolve(sourceRoot, substitutePath)), { recursive: true });
  writeFileSync(resolve(sourceRoot, substitutePath), substituteBytes);
  expectFailure(
    "coordinated content and metadata substitution cannot replace an identity",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: assetDescriptor({
        sample: samples.skill,
        path: substitutePath,
        rawSha256: rawDigest(substituteBytes),
        applicabilityNotes: ["coordinated substitution"],
      }),
    }),
    /stable (?:ID|id).*version.*collision|coordinated substitution/iu,
  );
  check("identity collisions do not publish orphan content or records", () => {
    assert.equal(listContentAddressedJson({ storeRoot }).length, objectCountBeforeCollisions);
  });

  const driftPath = "drift/skill.md";
  const originalSkillBytes = readFileSync(resolve(sourceRoot, samples.skill.path));
  mkdirSync(dirname(resolve(sourceRoot, driftPath)), { recursive: true });
  writeFileSync(resolve(sourceRoot, driftPath), originalSkillBytes);
  const driftDescriptor = assetDescriptor({
    sample: samples.skill,
    stableId: "ask.skill.content-drift-test",
    path: driftPath,
    rawSha256: rawDigest(originalSkillBytes),
  });
  writeFileSync(resolve(sourceRoot, driftPath), Buffer.from("changed after descriptor\n", "utf8"));
  expectFailure(
    "source content drift fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: driftDescriptor,
    }),
    /source content digest mismatch|source content drift/iu,
  );

  const missingDependency = {
    asset_type: "skill",
    stable_id: "ask.skill.not-registered",
    version: "1.0.0",
    record_digest: textDigest("missing-record"),
    content_digest: textDigest("missing-content"),
  };
  expectFailure(
    "missing dependency fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: assetDescriptor({
        sample: samples.evaluator,
        stableId: "ask.evaluator-reference.missing-dependency-test",
        dependencies: [missingDependency],
      }),
    }),
    /missing dependency|dependency .*not registered/iu,
  );

  expectFailure(
    "dependency digest transplant fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: assetDescriptor({
        sample: samples.evaluator,
        stableId: "ask.evaluator-reference.transplant-test",
        dependencies: [{
          asset_type: skillCandidate.asset_type,
          stable_id: skillCandidate.stable_id,
          version: skillCandidate.version,
          record_digest: promptCandidate.record_digest,
          content_digest: promptCandidate.content_digest,
        }],
      }),
    }),
    /dependency .*digest mismatch|dependency transplant/iu,
  );

  const selfCycleId = "ask.skill.self-cycle-test";
  expectFailure(
    "dependency cycle fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: assetDescriptor({
        sample: samples.skill,
        stableId: selfCycleId,
        version: "1.0.0",
        dependencies: [{
          asset_type: "skill",
          stable_id: selfCycleId,
          version: "1.0.0",
          record_digest: textDigest("self-record"),
          content_digest: textDigest("self-content"),
        }],
      }),
    }),
    /self dependency|dependency cycle/iu,
  );

  const outsidePath = resolve(root, "outside.md");
  writeFileSync(outsidePath, originalSkillBytes);
  expectFailure(
    "source path escape fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: assetDescriptor({
        sample: samples.skill,
        stableId: "ask.skill.path-escape-test",
        path: "../outside.md",
        rawSha256: rawDigest(originalSkillBytes),
      }),
    }),
    /source path .*escape|outside source root|source path traversal/iu,
  );

  const symlinkPath = "symlink/skill.md";
  mkdirSync(dirname(resolve(sourceRoot, symlinkPath)), { recursive: true });
  symlinkSync(resolve(sourceRoot, samples.skill.path), resolve(sourceRoot, symlinkPath));
  expectFailure(
    "source symlink traversal fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: assetDescriptor({
        sample: samples.skill,
        stableId: "ask.skill.symlink-test",
        path: symlinkPath,
        rawSha256: samples.skill.sha256,
      }),
    }),
    /source .*symlink|traverses a symlink/iu,
  );

  const selfAdmitted = assetDescriptor({
    sample: samples.skill,
    stableId: "ask.skill.self-admission-test",
  });
  selfAdmitted.initial_lifecycle_state = "admitted";
  expectFailure(
    "registration input cannot self-admit",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: selfAdmitted,
    }),
    /registration .*candidate|initial lifecycle state .*candidate|unknown .*initial_lifecycle_state/iu,
  );

  expectFailure(
    "verification-evidence object is not an Asset registration input",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: {
        schema_version: "1.0.0",
        schema_path: "schemas/verification-evidence.schema.json",
        program: "ask_verification_evidence",
        evidence_id: `verification-evidence-${"a".repeat(64)}`,
        evidence_digest: `sha256:${"a".repeat(64)}`,
        producer: { kind: "developer" },
      },
    }),
    /verification evidence .*not .*Asset|Asset descriptor .*schema|unknown .*verification/iu,
  );

  const selfVerifiedLicense = assetDescriptor({
    sample: samples.skill,
    stableId: "ask.skill.self-verified-license-test",
  });
  selfVerifiedLicense.provenance.license = {
    status: "verified",
    spdx_id: "MIT",
    evidence_ref: "sha256:self-declared-license-evidence",
  };
  expectFailure(
    "registration cannot self-verify license authority",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: selfVerifiedLicense,
    }),
    /cannot establish verified license|verified license .*not .*authority/iu,
  );

  const ambiguousApplicability = assetDescriptor({
    sample: samples.prompt,
    stableId: "ask.prompt-template.ambiguous-applicability-test",
  });
  ambiguousApplicability.applicability.adapters = {
    status: "unknown",
    included: ["codex"],
    excluded: [],
  };
  expectFailure(
    "unknown applicability cannot carry a positive allowlist",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      descriptor: ambiguousApplicability,
    }),
    /applicability adapters unknown status cannot carry/iu,
  );

  const incompleteStoreRoot = resolve(root, "incomplete-store");
  mkdirSync(incompleteStoreRoot, { recursive: true });
  const incompleteEmpty = createEmptyAssetRegistry({
    storeRoot: incompleteStoreRoot,
    registryId: "incomplete-test",
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const incompleteRegistration = registerAsset({
    storeRoot: incompleteStoreRoot,
    sourceRoot,
    predecessorSnapshotDigest: incompleteEmpty.snapshot_digest,
    descriptor: skillDescriptor,
  });
  unlinkSync(contentAddressedObjectPath({
    storeRoot: incompleteStoreRoot,
    digest: incompleteRegistration.content_digest,
  }));
  expectFailure(
    "incomplete registry snapshot fails closed",
    () => verifyAssetRegistry({
      storeRoot: incompleteStoreRoot,
      snapshotDigest: incompleteRegistration.snapshot_digest,
    }),
    /content-addressed object does not exist|missing .*object|incomplete registry snapshot/iu,
  );

  const candidateAssets = [skillCandidate, promptCandidate, evaluatorCandidate];
  const admitTransitions = candidateAssets.map((asset) => lifecycleTransition(asset, "candidate", "admitted"));
  const admitAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: candidateSnapshotDigest,
    transitions: admitTransitions,
    revision: "admit-real-assets-1",
  });
  check("lifecycle authority context is deterministic", () => {
    const repeated = lifecycleAuthority({
      predecessorSnapshotDigest: candidateSnapshotDigest,
      transitions: structuredClone(admitTransitions),
      revision: "admit-real-assets-1",
    });
    assert.deepEqual(repeated, admitAuthority);
    assert.match(admitAuthority.context_digest, /^sha256:[a-f0-9]{64}$/u);
  });

  expectFailure(
    "verification producer identity cannot authorize Asset lifecycle",
    () => buildAssetLifecycleAuthorityContext({
      registryId: REGISTRY_ID,
      repositoryId: REPOSITORY_ID,
      scopeId: SCOPE_ID,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      transitions: admitTransitions,
      authority: {
        kind: "verification_evidence_producer",
        authority_id: "verification-producer",
        authority_revision: "1",
        authority_evidence_digest: textDigest("verification-producer-evidence"),
      },
    }),
    /verification evidence producer identity is not Asset lifecycle authority|unsupported Asset lifecycle authority kind/iu,
  );

  expectFailure(
    "lifecycle transition requires caller authority",
    () => applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      authorityContext: null,
    }),
    /lifecycle authority context .*required|missing lifecycle authority/iu,
  );

  const wrongRepositoryAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: candidateSnapshotDigest,
    transitions: admitTransitions,
    revision: "wrong-repository",
    repositoryId: "github.com/example/transplant",
  });
  expectFailure(
    "wrong repository authority fails closed",
    () => applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: candidateSnapshotDigest,
      authorityContext: wrongRepositoryAuthority,
    }),
    /lifecycle authority .*repository|wrong lifecycle authority/iu,
  );

  const admitted = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: candidateSnapshotDigest,
    authorityContext: admitAuthority,
  });
  expectFailure(
    "transitioned snapshot cannot trust its stored context",
    () => verifyAssetRegistry({ storeRoot, snapshotDigest: admitted.snapshot_digest }),
    /trusted lifecycle authority context .*required|untrusted lifecycle authority/iu,
  );
  expectFailure(
    "wrong caller context cannot verify transitioned snapshot",
    () => listAssets({
      storeRoot,
      snapshotDigest: admitted.snapshot_digest,
      trustedAuthorityContexts: [wrongRepositoryAuthority],
    }),
    /trusted lifecycle authority context .*required|untrusted lifecycle authority/iu,
  );
  check("exact caller context verifies admitted snapshot", () => {
    const verified = verifyAssetRegistry({
      storeRoot,
      snapshotDigest: admitted.snapshot_digest,
      trustedAuthorityContexts: [admitAuthority],
    });
    assert.deepEqual(new Set(verified.assets.map((entry) => entry.state)), new Set(["admitted"]));
  });

  const staleAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: candidateSnapshotDigest,
    transitions: admitTransitions,
    revision: "stale-admit-real-assets",
  });
  expectFailure(
    "stale lifecycle authority predecessor fails closed",
    () => applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: admitted.snapshot_digest,
      authorityContext: staleAuthority,
      trustedAuthorityContexts: [admitAuthority],
    }),
    /stale lifecycle authority|predecessor snapshot .*mismatch/iu,
  );

  const admittedAssets = listAssets({
    storeRoot,
    snapshotDigest: admitted.snapshot_digest,
    trustedAuthorityContexts: [admitAuthority],
  }).map((summary) => resolveAsset({
    storeRoot,
    snapshotDigest: admitted.snapshot_digest,
    stableId: summary.stable_id,
    version: summary.version,
    state: "admitted",
    trustedAuthorityContexts: [admitAuthority],
  }));
  const currentTransitions = admittedAssets.map((asset) => lifecycleTransition(asset, "admitted", "current"));
  const currentAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: admitted.snapshot_digest,
    transitions: currentTransitions,
    revision: "make-real-assets-current-1",
  });
  const current = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: admitted.snapshot_digest,
    authorityContext: currentAuthority,
    trustedAuthorityContexts: [admitAuthority],
  });
  const realAssetTrust = [admitAuthority, currentAuthority];

  const currentEvaluator = resolveAsset({
    storeRoot,
    snapshotDigest: current.snapshot_digest,
    stableId: samples.evaluator.stableId,
    trustedAuthorityContexts: realAssetTrust,
  });
  const retireEvaluatorAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: current.snapshot_digest,
    transitions: [lifecycleTransition(currentEvaluator, "current", "retired")],
    revision: "retire-evaluator-reference-1",
  });
  const retiredEvaluatorSnapshot = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: current.snapshot_digest,
    authorityContext: retireEvaluatorAuthority,
    trustedAuthorityContexts: realAssetTrust,
  });
  const retiredEvaluatorTrust = [...realAssetTrust, retireEvaluatorAuthority];
  expectFailure(
    "retired revision cannot satisfy default resolution",
    () => resolveAsset({
      storeRoot,
      snapshotDigest: retiredEvaluatorSnapshot.snapshot_digest,
      stableId: samples.evaluator.stableId,
      trustedAuthorityContexts: retiredEvaluatorTrust,
    }),
    /default resolution requires exactly one current Asset|no current Asset revision/iu,
  );
  const retiredEvaluator = resolveAsset({
    storeRoot,
    snapshotDigest: retiredEvaluatorSnapshot.snapshot_digest,
    stableId: samples.evaluator.stableId,
    version: samples.evaluator.version,
    state: "retired",
    trustedAuthorityContexts: retiredEvaluatorTrust,
  });
  check("retired exact revision remains reconstructable", () => {
    assert.equal(retiredEvaluator.record_digest, evaluatorCandidate.record_digest);
    assert.equal(retiredEvaluator.state, "retired");
  });
  const invalidRetiredReactivation = lifecycleAuthority({
    predecessorSnapshotDigest: retiredEvaluatorSnapshot.snapshot_digest,
    transitions: [lifecycleTransition(retiredEvaluator, "retired", "current")],
    revision: "invalid-retired-reactivation",
    kind: "external_asset_rollback_authority",
  });
  expectFailure(
    "retired state is terminal",
    () => applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: retiredEvaluatorSnapshot.snapshot_digest,
      authorityContext: invalidRetiredReactivation,
      trustedAuthorityContexts: retiredEvaluatorTrust,
    }),
    /retired -> current is not allowed|retired.*terminal|transition .*not allowed/iu,
  );

  expectFailure(
    "missing current context fails full verification",
    () => verifyAssetRegistry({
      storeRoot,
      snapshotDigest: current.snapshot_digest,
      trustedAuthorityContexts: [admitAuthority],
    }),
    /trusted lifecycle authority context .*required|untrusted lifecycle authority/iu,
  );

  check("default resolution returns one exact current revision", () => {
    const currentPrompt = resolveAsset({
      storeRoot,
      snapshotDigest: current.snapshot_digest,
      stableId: samples.prompt.stableId,
      trustedAuthorityContexts: realAssetTrust,
    });
    assert.equal(currentPrompt.version, samples.prompt.version);
    assert.equal(currentPrompt.state, "current");
    assert.equal(currentPrompt.content.files[0].raw_digest, samples.prompt.sha256);
  });

  const currentSkill = resolveAsset({
    storeRoot,
    snapshotDigest: current.snapshot_digest,
    stableId: samples.skill.stableId,
    trustedAuthorityContexts: realAssetTrust,
  });
  const historicalAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: current.snapshot_digest,
    transitions: [lifecycleTransition(currentSkill, "current", "historical")],
    revision: "make-skill-historical-1",
  });
  const historical = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: current.snapshot_digest,
    authorityContext: historicalAuthority,
    trustedAuthorityContexts: realAssetTrust,
  });
  const historicalTrust = [...realAssetTrust, historicalAuthority];
  expectFailure(
    "historical revision cannot satisfy default resolution",
    () => resolveAsset({
      storeRoot,
      snapshotDigest: historical.snapshot_digest,
      stableId: samples.skill.stableId,
      trustedAuthorityContexts: historicalTrust,
    }),
    /default resolution requires exactly one current Asset|no current Asset revision/iu,
  );
  check("historical exact revision remains reconstructable", () => {
    const reconstructed = resolveAsset({
      storeRoot,
      snapshotDigest: historical.snapshot_digest,
      stableId: samples.skill.stableId,
      version: samples.skill.version,
      state: "historical",
      trustedAuthorityContexts: historicalTrust,
    });
    assert.equal(reconstructed.record_digest, skillCandidate.record_digest);
    assert.equal(reconstructed.content.files[0].raw_digest, samples.skill.sha256);
  });

  const lifecycleV1Path = "synthetic/lifecycle-prompt-v1.md";
  const lifecycleV2Path = "synthetic/lifecycle-prompt-v2.md";
  const lifecycleV1Bytes = Buffer.from("Synthetic registry lifecycle fixture v1.\n", "utf8");
  const lifecycleV2Bytes = Buffer.from("Synthetic registry lifecycle fixture v2.\n", "utf8");
  mkdirSync(dirname(resolve(sourceRoot, lifecycleV1Path)), { recursive: true });
  writeFileSync(resolve(sourceRoot, lifecycleV1Path), lifecycleV1Bytes);
  writeFileSync(resolve(sourceRoot, lifecycleV2Path), lifecycleV2Bytes);
  const syntheticSample = {
    ...samples.prompt,
    stableId: "ask.prompt-template.lifecycle-test",
    version: "1.0.0",
    path: lifecycleV1Path,
    sha256: rawDigest(lifecycleV1Bytes),
  };
  const missingParentStableId = "ask.prompt-template.missing-parent-test";
  expectFailure(
    "missing exact parent fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: historical.snapshot_digest,
      trustedAuthorityContexts: historicalTrust,
      descriptor: assetDescriptor({
        sample: syntheticSample,
        stableId: missingParentStableId,
        version: "2.0.0",
        derivation: {
          kind: "full_content_revision",
          parent: {
            asset_type: "prompt",
            stable_id: missingParentStableId,
            version: "1.0.0",
            record_digest: textDigest("missing-parent-record"),
            content_digest: textDigest("missing-parent-content"),
          },
          delta: { kind: "replacement", summary: "Missing-parent negative fixture." },
        },
      }),
    }),
    /missing parent|parent .*not registered/iu,
  );
  expectFailure(
    "cross-Asset parent transplant fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: historical.snapshot_digest,
      trustedAuthorityContexts: historicalTrust,
      descriptor: assetDescriptor({
        sample: syntheticSample,
        stableId: syntheticSample.stableId,
        version: "2.0.0",
        derivation: {
          kind: "full_content_revision",
          parent: exactAssetRef(skillCandidate),
          delta: { kind: "replacement", summary: "Cross-Asset parent negative fixture." },
        },
      }),
    }),
    /parent transplant|parent .*same stable ID|Asset parent/iu,
  );
  const lifecycleV1Registration = registerAsset({
    storeRoot,
    sourceRoot,
    predecessorSnapshotDigest: historical.snapshot_digest,
    trustedAuthorityContexts: historicalTrust,
    descriptor: assetDescriptor({ sample: syntheticSample }),
  });
  const lifecycleV1 = resolveAsset({
    storeRoot,
    snapshotDigest: lifecycleV1Registration.snapshot_digest,
    stableId: syntheticSample.stableId,
    version: "1.0.0",
    state: "candidate",
    trustedAuthorityContexts: historicalTrust,
  });
  expectFailure(
    "missing exact rollback target fails closed",
    () => registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: lifecycleV1Registration.snapshot_digest,
      trustedAuthorityContexts: historicalTrust,
      descriptor: assetDescriptor({
        sample: syntheticSample,
        path: lifecycleV2Path,
        rawSha256: rawDigest(lifecycleV2Bytes),
        version: "2.0.0",
        rollbackTarget: {
          asset_type: "prompt",
          stable_id: syntheticSample.stableId,
          version: "0.0.0",
          record_digest: textDigest("missing-rollback-record"),
          content_digest: textDigest("missing-rollback-content"),
        },
      }),
    }),
    /missing rollback target|rollback target .*not registered/iu,
  );
  const lifecycleV2Descriptor = assetDescriptor({
    sample: syntheticSample,
    path: lifecycleV2Path,
    rawSha256: rawDigest(lifecycleV2Bytes),
    version: "2.0.0",
    rollbackTarget: exactAssetRef(lifecycleV1),
    derivation: {
      kind: "full_content_revision",
      parent: exactAssetRef(lifecycleV1),
      delta: {
        kind: "replacement",
        summary: "Replace the complete synthetic v1 content with the complete v2 content.",
      },
    },
  });
  const lifecycleV2Registration = registerAsset({
    storeRoot,
    sourceRoot,
    predecessorSnapshotDigest: lifecycleV1Registration.snapshot_digest,
    trustedAuthorityContexts: historicalTrust,
    descriptor: lifecycleV2Descriptor,
  });
  const lifecycleV2 = resolveAsset({
    storeRoot,
    snapshotDigest: lifecycleV2Registration.snapshot_digest,
    stableId: syntheticSample.stableId,
    version: "2.0.0",
    state: "candidate",
    trustedAuthorityContexts: historicalTrust,
  });
  assert.deepEqual(lifecycleV2.record.maintenance.rollback.target, exactAssetRef(lifecycleV1));

  const admitV1Authority = lifecycleAuthority({
    predecessorSnapshotDigest: lifecycleV2Registration.snapshot_digest,
    transitions: [lifecycleTransition(lifecycleV1, "candidate", "admitted")],
    revision: "admit-synthetic-v1",
  });
  const admitV1 = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: lifecycleV2Registration.snapshot_digest,
    authorityContext: admitV1Authority,
    trustedAuthorityContexts: historicalTrust,
  });
  const trustAfterAdmitV1 = [...historicalTrust, admitV1Authority];
  const admittedV1 = resolveAsset({
    storeRoot,
    snapshotDigest: admitV1.snapshot_digest,
    stableId: syntheticSample.stableId,
    version: "1.0.0",
    state: "admitted",
    trustedAuthorityContexts: trustAfterAdmitV1,
  });
  const currentV1Authority = lifecycleAuthority({
    predecessorSnapshotDigest: admitV1.snapshot_digest,
    transitions: [lifecycleTransition(admittedV1, "admitted", "current")],
    revision: "current-synthetic-v1",
  });
  const currentV1 = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: admitV1.snapshot_digest,
    authorityContext: currentV1Authority,
    trustedAuthorityContexts: trustAfterAdmitV1,
  });
  const trustAfterCurrentV1 = [...trustAfterAdmitV1, currentV1Authority];
  const candidateV2AfterCurrentV1 = resolveAsset({
    storeRoot,
    snapshotDigest: currentV1.snapshot_digest,
    stableId: syntheticSample.stableId,
    version: "2.0.0",
    state: "candidate",
    trustedAuthorityContexts: trustAfterCurrentV1,
  });
  const admitV2Authority = lifecycleAuthority({
    predecessorSnapshotDigest: currentV1.snapshot_digest,
    transitions: [lifecycleTransition(candidateV2AfterCurrentV1, "candidate", "admitted")],
    revision: "admit-synthetic-v2",
  });
  const admitV2 = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: currentV1.snapshot_digest,
    authorityContext: admitV2Authority,
    trustedAuthorityContexts: trustAfterCurrentV1,
  });
  const trustAfterAdmitV2 = [...trustAfterCurrentV1, admitV2Authority];
  const currentV1Resolved = resolveAsset({
    storeRoot,
    snapshotDigest: admitV2.snapshot_digest,
    stableId: syntheticSample.stableId,
    version: "1.0.0",
    state: "current",
    trustedAuthorityContexts: trustAfterAdmitV2,
  });
  const admittedV2 = resolveAsset({
    storeRoot,
    snapshotDigest: admitV2.snapshot_digest,
    stableId: syntheticSample.stableId,
    version: "2.0.0",
    state: "admitted",
    trustedAuthorityContexts: trustAfterAdmitV2,
  });

  const unpairedSupersedeAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: admitV2.snapshot_digest,
    transitions: [lifecycleTransition(currentV1Resolved, "current", "superseded")],
    revision: "invalid-unpaired-supersede",
  });
  expectFailure(
    "superseding a current revision requires an exact same-batch replacement",
    () => applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: admitV2.snapshot_digest,
      authorityContext: unpairedSupersedeAuthority,
      trustedAuthorityContexts: trustAfterAdmitV2,
    }),
    /superseded transition .*same-batch replacement current revision/iu,
  );

  const invalidSecondCurrentAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: admitV2.snapshot_digest,
    transitions: [lifecycleTransition(admittedV2, "admitted", "current")],
    revision: "invalid-second-current",
  });
  expectFailure(
    "multiple current revisions fail atomically",
    () => applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: admitV2.snapshot_digest,
      authorityContext: invalidSecondCurrentAuthority,
      trustedAuthorityContexts: trustAfterAdmitV2,
    }),
    /multiple current|current revision already exists|exactly one current/iu,
  );

  const replacementTransitions = [
    lifecycleTransition(currentV1Resolved, "current", "superseded"),
    lifecycleTransition(admittedV2, "admitted", "current"),
  ];
  const replacementAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: admitV2.snapshot_digest,
    transitions: replacementTransitions,
    revision: "replace-synthetic-v1-with-v2",
  });
  const replaced = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: admitV2.snapshot_digest,
    authorityContext: replacementAuthority,
    trustedAuthorityContexts: trustAfterAdmitV2,
  });
  const replacedTrust = [...trustAfterAdmitV2, replacementAuthority];
  check("atomic replacement selects v2 as current", () => {
    const selected = resolveAsset({
      storeRoot,
      snapshotDigest: replaced.snapshot_digest,
      stableId: syntheticSample.stableId,
      trustedAuthorityContexts: replacedTrust,
    });
    assert.equal(selected.version, "2.0.0");
    assert.equal(selected.state, "current");
  });
  expectFailure(
    "superseded revision cannot substitute through default-like resolution",
    () => resolveAsset({
      storeRoot,
      snapshotDigest: replaced.snapshot_digest,
      stableId: syntheticSample.stableId,
      version: "1.0.0",
      trustedAuthorityContexts: replacedTrust,
    }),
    /non-current resolution requires explicit state|default resolution requires exactly one current Asset/iu,
  );
  const supersededV1 = resolveAsset({
    storeRoot,
    snapshotDigest: replaced.snapshot_digest,
    stableId: syntheticSample.stableId,
    version: "1.0.0",
    state: "superseded",
    trustedAuthorityContexts: replacedTrust,
  });
  const currentV2 = resolveAsset({
    storeRoot,
    snapshotDigest: replaced.snapshot_digest,
    stableId: syntheticSample.stableId,
    trustedAuthorityContexts: replacedTrust,
  });

  const rollbackTransitions = [
    lifecycleTransition(currentV2, "current", "historical"),
    lifecycleTransition(supersededV1, "superseded", "current"),
  ];
  const notRollbackAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: replaced.snapshot_digest,
    transitions: rollbackTransitions,
    revision: "rollback-with-normal-authority",
  });
  expectFailure(
    "rollback cannot use ordinary lifecycle authority",
    () => applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: replaced.snapshot_digest,
      authorityContext: notRollbackAuthority,
      trustedAuthorityContexts: replacedTrust,
    }),
    /rollback .*authority|rollback transition .*requires/iu,
  );
  const rollbackAuthority = lifecycleAuthority({
    predecessorSnapshotDigest: replaced.snapshot_digest,
    transitions: rollbackTransitions,
    revision: "rollback-synthetic-v2-to-v1",
    kind: "external_asset_rollback_authority",
  });
  const rolledBack = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: replaced.snapshot_digest,
    authorityContext: rollbackAuthority,
    trustedAuthorityContexts: replacedTrust,
  });
  const rollbackTrust = [...replacedTrust, rollbackAuthority];
  check("explicit rollback restores v1 and preserves v2 history", () => {
    const selected = resolveAsset({
      storeRoot,
      snapshotDigest: rolledBack.snapshot_digest,
      stableId: syntheticSample.stableId,
      trustedAuthorityContexts: rollbackTrust,
    });
    assert.equal(selected.version, "1.0.0");
    assert.equal(selected.state, "current");
    const preserved = resolveAsset({
      storeRoot,
      snapshotDigest: rolledBack.snapshot_digest,
      stableId: syntheticSample.stableId,
      version: "2.0.0",
      state: "historical",
      trustedAuthorityContexts: rollbackTrust,
    });
    assert.equal(preserved.content.files[0].raw_digest, rawDigest(lifecycleV2Bytes));
  });

  check("reference export is deterministic and path-independent", () => {
    const first = exportAssetRegistryReference({
      storeRoot,
      snapshotDigest: rolledBack.snapshot_digest,
      trustedAuthorityContexts: rollbackTrust,
    });
    const second = exportAssetRegistryReference({
      storeRoot,
      snapshotDigest: rolledBack.snapshot_digest,
      trustedAuthorityContexts: rollbackTrust,
    });
    assert.deepEqual(first, second);
    assert.equal(first.snapshot_digest, rolledBack.snapshot_digest);
    assert.equal(stableCanonicalJson(first).includes(sourceRoot), false);
    assert.equal(stableCanonicalJson(first).includes(repositoryRoot), false);
    assert.equal(stableCanonicalJson(first).includes("/Users/"), false);
  });

  check("verification returns detached immutable values", () => {
    const verified = verifyAssetRegistry({
      storeRoot,
      snapshotDigest: rolledBack.snapshot_digest,
      trustedAuthorityContexts: rollbackTrust,
    });
    assertDeepFrozen(verified);
    assert.throws(() => verified.assets.push({}), TypeError);
    const repeated = verifyAssetRegistry({
      storeRoot,
      snapshotDigest: rolledBack.snapshot_digest,
      trustedAuthorityContexts: rollbackTrust,
    });
    assert.equal(repeated.snapshot_digest, verified.snapshot_digest);
    assert.deepEqual(repeated.assets, verified.assets);
  });

  check("fresh process fully verifies the exact snapshot", () => {
    const contextsPath = resolve(root, "trusted-authority-contexts.json");
    writeFileSync(contextsPath, `${stableCanonicalJson(rollbackTrust)}\n`);
    const moduleUrl = pathToFileURL(resolve(import.meta.dirname, "asset-registry.mjs")).href;
    const probe = `
      import { readFileSync } from "node:fs";
      import { verifyAssetRegistry } from ${JSON.stringify(moduleUrl)};
      const trustedAuthorityContexts = JSON.parse(readFileSync(process.argv[3], "utf8"));
      const result = verifyAssetRegistry({
        storeRoot: process.argv[1],
        snapshotDigest: process.argv[2],
        trustedAuthorityContexts,
      });
      process.stdout.write(JSON.stringify({ snapshot_digest: result.snapshot_digest, asset_count: result.assets.length }));
    `;
    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      probe,
      storeRoot,
      rolledBack.snapshot_digest,
      contextsPath,
    ], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), {
      snapshot_digest: rolledBack.snapshot_digest,
      asset_count: 5,
    });
  });

  check("Asset registration and lifecycle do not change runtime fixtures", () => {
    assert.equal(rawDigest(readFileSync(runtimeFixturePath)), runtimeFixtureDigestBefore);
  });

  console.log(`asset registry tests passed (${caseCount} cases)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
