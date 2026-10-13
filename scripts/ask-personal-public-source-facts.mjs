// Public bytes/custody facts only: no registration, safety promotion or authority.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { devNull } from "node:os";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { buildPersonalPromptMaterialization } from "./ask-personal-prompt-materialization.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";

const names = ["skill-handoff.md", "skill-implement.md", "skill-investigate.md", "skill-review.md", "skill-verify.md"];
export function inspectPersonalPublicPromptSource({ repositoryRoot, materializationOptions, taskClass }) {
  assert.equal(resolve(repositoryRoot), repositoryRoot); assert.equal(realpathSync(repositoryRoot), repositoryRoot);
  assert.ok(lstatSync(join(repositoryRoot, ".git")).isDirectory(), "independent public repository required");
  const { materialization } = buildPersonalPromptMaterialization(materializationOptions, { taskClass, hash: comparisonHash });
  assert.equal(materialization.content.files.length, 5);
  assert.deepEqual(materialization.content.files.map(file => basename(file.path)).sort(), names);
  const revision = materialization.record.source.revision;
  assert.match(revision, /^[a-f0-9]{40}$/u);
  const git = args => {
    const result = spawnSync("git", ["-c", `core.hooksPath=${devNull}`, ...args], { cwd: repositoryRoot, shell: false,
      encoding: null, timeout: 10000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull,
        GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" } });
    assert.equal(result.status, 0, "public Git correspondence unavailable"); return result.stdout;
  };
  const files = materialization.content.files.map(file => {
    assert.match(file.path, /^docs\/fixtures\/(?:codex-pre-compact-prompts|prompt-v2-preregistration\/rendered\/codex)\/skill-(?:handoff|implement|investigate|review|verify)\.md$/u,
      "public ASK archived instruction path required");
    const bytes = Buffer.from(file.bytes_base64, "base64"), tracked = git(["cat-file", "blob", `${revision}:${file.path}`]);
    assert.ok(tracked.equals(bytes), "Git/CAS public source drift");
    const text = bytes.toString("utf8"); assert.ok(Buffer.from(text).equals(bytes));
    return { path: file.path, raw_digest: comparisonHash(bytes), byte_length: bytes.length, git_cas_correspondence: "Verified",
      input_kind: "registered_public_markdown", private_evaluator_path: false, semantic_content_review: "separate_independent_review_required" };
  });
  const body = { kind: "personal_public_prompt_source_facts_v1", source_asset: materialization.asset,
    source_repository_id: materialization.record.source.repository_id, payload_git_revision: revision,
    inspected_repository_commit: git(["rev-parse", "HEAD"]).toString("utf8").trim(), files,
    provenance: structuredClone(materialization.record.provenance), existing_applicability: structuredClone(materialization.record.applicability),
    facts_status: "Verified", facts_scope: "exact public Git/CAS bytes and registered public Markdown path inventory",
    safety_promotion: false, quality_evidence: "not_evaluated", model_effectiveness: "Unknown",
    copyright_or_owner_identity_proven: false, runtime_activation_implied: false, models_started: false };
  return Object.freeze({ ...body, facts_digest: canonicalDigest(body) });
}
