#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTER_RENDERER_METADATA } from "./adapter-runtime-inventory.mjs";
import { buildAdapterProjectionBundle } from "./adapter-runtime-bundle.mjs";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { computeAdapterProfileFingerprint, computeProfilePathSetDigest } from "./validate-repo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profilePath = resolve(root, "docs/fixtures/adapter-runtime-profiles.json");
const evidencePath = resolve(root, "docs/fixtures/adapter-runtime-evidence.json");
const bundlePath = resolve(root, "docs/fixtures/adapter-runtime-bundle.json");
const verificationProofPath = resolve(root, "docs/fixtures/verification-proof-policy-cases.json");
const profileArtifact = JSON.parse(readFileSync(profilePath, "utf8"));
const evidenceArtifact = JSON.parse(readFileSync(evidencePath, "utf8"));

const registrations = {
  claude_code: {
    metadata: ADAPTER_RENDERER_METADATA.claude_code,
    plan: (profile) => buildClaudeProjectionPlan({ profileName: profile.rendering.renderer_profile }),
  },
  codex: {
    metadata: ADAPTER_RENDERER_METADATA.codex,
    plan: (profile) => buildCodexProjectionPlan({ profileName: profile.rendering.renderer_profile }),
  },
};

for (const profile of profileArtifact.profiles) {
  const registration = registrations[profile.adapter_id];
  if (!registration) continue;
  const plan = registration.plan(profile);
  profile.canonical_contract.source_paths = plan.renderer_inputs.canonical.map((input) => input.path).sort();
  profile.canonical_contract.source_digest = plan.canonical_source_digest;
  profile.rendering.renderer_id = registration.metadata.rendererId;
  profile.rendering.renderer_version = registration.metadata.rendererVersion;
  profile.rendering.renderer_inputs = plan.renderer_inputs;
  profile.schema_version = "1.2.0";
  profile.rendering.compact_profiles = plan.compactProfiles;
  profile.normalized_event_schema_refs = profile.adapter_id === "claude_code"
    ? ["schemas/adapter-runtime-event.schema.json", "schemas/metrics-event.schema.json"]
    : ["schemas/adapter-runtime-event.schema.json"];
  profile.rendering.asset_kinds = [...new Set(plan.projectedManagedAssets.map((asset) => asset.asset_kind))].sort();
  profile.generated_assets.managed_assets = plan.projectedManagedAssets;
  profile.profile_fingerprint = computeAdapterProfileFingerprint(profile);
}

for (const record of evidenceArtifact.records) {
  record.subject_digest = computeProfilePathSetDigest(root, record.observed_paths);
  if (record.scope !== "profile_projection") continue;
  const profile = profileArtifact.profiles.find((candidate) => candidate.adapter_id === record.adapter_id && candidate.rendering.renderer_profile === record.renderer_profile);
  if (!profile) throw new Error(`No runtime profile matches evidence record ${record.record_id}`);
  record.profile_id = profile.profile_id;
  record.profile_fingerprint = profile.profile_fingerprint;
}

writeFileSync(evidencePath, `${JSON.stringify(evidenceArtifact, null, 2)}\n`);
const evidenceDigest = `sha256:${createHash("sha256").update(readFileSync(evidencePath)).digest("hex")}`;
for (const profile of profileArtifact.profiles) {
  for (const capability of profile.capabilities) {
    for (const reference of capability.evidence_refs) {
      if (reference.artifact_ref === "docs/fixtures/adapter-runtime-evidence.json") reference.artifact_digest = evidenceDigest;
    }
  }
}
writeFileSync(profilePath, `${JSON.stringify(profileArtifact, null, 2)}\n`);
const verificationProofBytes = readFileSync(verificationProofPath, "utf8");
const verificationProofArtifact = JSON.parse(verificationProofBytes);
const verificationPromptProxy = verificationProofArtifact.size_proxy?.generated_localized_prompt;
const codexImplementationPlan = buildCodexProjectionPlan({ profileName: "implementation" });
const verificationPromptArtifact = codexImplementationPlan.compactProfileArtifacts.find(({ metadata }) => (
  metadata.profile_id === verificationPromptProxy?.candidate_profile_id
  && metadata.prompt_name === verificationPromptProxy?.candidate_prompt_name
));
if (!verificationPromptArtifact) throw new Error("Codex verification prompt proxy is missing from the implementation projection");
const verificationPromptBytes = Buffer.from(verificationPromptArtifact.content, "utf8");
const previousVerificationPromptFields = `"candidate_expected_bytes": ${verificationPromptProxy.candidate_expected_bytes},\n      "candidate_sha256": "${verificationPromptProxy.candidate_sha256}"`;
verificationPromptProxy.candidate_expected_bytes = verificationPromptBytes.byteLength;
verificationPromptProxy.candidate_sha256 = createHash("sha256").update(verificationPromptBytes).digest("hex");
const nextVerificationPromptFields = `"candidate_expected_bytes": ${verificationPromptProxy.candidate_expected_bytes},\n      "candidate_sha256": "${verificationPromptProxy.candidate_sha256}"`;
if (!verificationProofBytes.includes(previousVerificationPromptFields)) throw new Error("Codex verification prompt proxy fields are not in the canonical fixture form");
writeFileSync(verificationProofPath, verificationProofBytes.replace(previousVerificationPromptFields, nextVerificationPromptFields));
const currentBundle = JSON.parse(readFileSync(bundlePath, "utf8"));
writeFileSync(bundlePath, `${JSON.stringify({ ...currentBundle, ...buildAdapterProjectionBundle() }, null, 2)}\n`);

console.log("Adapter runtime fixtures updated");
