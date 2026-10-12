import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateMnFrontendDefaultProductionAuthority, buildEvidenceMap } from "./ask-benchmark-mn-frontend-default-fix-authority.mjs";
import { validateMnFrontendDefaultInputClosure } from "./ask-benchmark-mn-frontend-default-source.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
test("frontend task retains exact public input closure", () => {
  assert.equal(validateMnFrontendDefaultInputClosure({ root }).fixtureId, "mn-frontend-default-fix");
});
test("frontend authority is complete while independent admission remains pending", () => {
  const result = validateMnFrontendDefaultProductionAuthority({ root });
  assert.equal(result.scoringReady, false);
  assert.equal(result.reviewStatus, "pending_independent_review");
  const admission=JSON.parse(readFileSync(resolve(root,"benchmarks/fixtures/checkpoint-b2/mn-frontend-default-fix/final-admission-record.json"),"utf8"));
  assert.equal(admission.admission_status,"admission_pending");
});
test("scope, equivalence and evidence mutations are task-specific", () => {
  const value=buildEvidenceMap();
  assert.equal(value.evidenceMap.maps.length,3);
  assert.equal(value.mutationAsset.mutations.length,3);
  assert.ok(value.evidenceMap.scope_boundary_authority.allowed_candidate_paths.includes("workspace/src/display-preferences.mjs"));
});

test("dedicated runtime config binds this fixture input and public verification", () => {
 const config=JSON.parse(readFileSync(resolve(root,"benchmarks/mn-frontend-default-fix.config.json"),"utf8"));
 const fixture=config.fixtures[0];
 assert.equal(fixture.id,"mn-frontend-default-fix");
 const prefix="benchmarks/fixtures/checkpoint-b2/mn-frontend-default-fix";
 assert.equal(fixture.input_manifest_path,prefix+"/input-manifest.json");
 assert.equal(fixture.verification_command_contract.path,prefix+"/verification-command-contract.json");
 for(const [path,digest] of [[fixture.input_manifest_path,fixture.input_manifest_sha256],[fixture.verification_command_contract.path,fixture.verification_command_contract.sha256]])
  assert.equal(createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex"),digest);
});
