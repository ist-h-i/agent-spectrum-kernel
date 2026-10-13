import { validatePortfolioFoundation } from "./ask-benchmark.mjs";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePfReviewErrorProductionAuthority, buildEvidenceMap } from "./ask-benchmark-pf-review-error-authority.mjs";
import { validatePfReviewErrorInputClosure } from "./ask-benchmark-pf-review-error-source.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
test("review error task retains exact public input closure", () => {
  assert.equal(validatePfReviewErrorInputClosure({ root }).fixtureId, "pf-review-error-contract");
});
test("review error authority is complete while independent admission remains pending", () => {
  const result = validatePfReviewErrorProductionAuthority({ root });
  assert.equal(result.scoringReady, false);
  assert.equal(result.reviewStatus, "pending_independent_review");
  const admission=JSON.parse(readFileSync(resolve(root,"benchmarks/fixtures/checkpoint-b2/pf-review-error-contract/final-admission-record.json"),"utf8"));
  assert.equal(admission.admission_status,"admission_pending");
});
test("scope, equivalence and evidence mutations are task-specific", () => {
  const value=buildEvidenceMap();
  assert.equal(value.evidenceMap.maps.length,3);
  assert.equal(value.mutationAsset.mutations.length,3);
  assert.ok(value.evidenceMap.scope_boundary_authority.allowed_candidate_paths.includes("workspace/review.json"));
});

test("dedicated runtime config binds this fixture input and public verification", () => {
 const config=JSON.parse(readFileSync(resolve(root,"benchmarks/pf-review-error-contract.config.json"),"utf8"));
 validatePortfolioFoundation(config, resolve(root,"benchmarks/pf-review-error-contract.config.json"), { root });
 const fixture=config.fixtures[0];
 assert.equal(fixture.id,"pf-review-error-contract");
 const catalogFixture=JSON.parse(readFileSync(resolve(root,"benchmarks/portfolio-catalog.json"),"utf8")).fixtures.find(x=>x.fixture_id===fixture.id);
 for(const field of ["suite","task_class","difficulty","repetitions","aggregate_eligible"])assert.deepEqual(fixture[field],catalogFixture[field]);
 const prefix="benchmarks/fixtures/checkpoint-b2/pf-review-error-contract";
 assert.equal(fixture.input_manifest_path,prefix+"/input-manifest.json");
 assert.equal(fixture.verification_command_contract.path,prefix+"/verification-command-contract.json");
 for(const [path,digest] of [[fixture.input_manifest_path,fixture.input_manifest_sha256],[fixture.verification_command_contract.path,fixture.verification_command_contract.sha256]])
  assert.equal(createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex"),digest);
});
