import { validatePortfolioFoundation } from "./ask-benchmark.mjs";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePfApiPaginationProductionAuthority, buildEvidenceMap } from "./ask-benchmark-pf-api-pagination-authority.mjs";
import { validatePfApiPaginationInputClosure } from "./ask-benchmark-pf-api-pagination-source.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
test("pagination task retains exact public input closure", () => {
  assert.equal(validatePfApiPaginationInputClosure({ root }).fixtureId, "pf-api-pagination-behavior");
});
test("pagination authority is complete while independent admission remains pending", () => {
  const result = validatePfApiPaginationProductionAuthority({ root });
  assert.equal(result.scoringReady, false);
  assert.equal(result.reviewStatus, "pending_independent_review");
  const admission=JSON.parse(readFileSync(resolve(root,"benchmarks/fixtures/checkpoint-b2/pf-api-pagination-behavior/final-admission-record.json"),"utf8"));
  assert.equal(admission.admission_status,"admission_pending");
});
test("scope, equivalence and evidence mutations are task-specific", () => {
  const value=buildEvidenceMap();
  assert.equal(value.evidenceMap.maps.length,3);
  assert.equal(value.mutationAsset.mutations.length,3);
  assert.ok(value.evidenceMap.scope_boundary_authority.allowed_candidate_paths.includes("workspace/src/pagination.mjs"));
});

test("dedicated runtime config binds this fixture input and public verification", () => {
 const config=JSON.parse(readFileSync(resolve(root,"benchmarks/pf-api-pagination-behavior.config.json"),"utf8"));
 validatePortfolioFoundation(config, resolve(root,"benchmarks/pf-api-pagination-behavior.config.json"), { root });
 const fixture=config.fixtures[0];
 assert.equal(fixture.id,"pf-api-pagination-behavior");
 const prefix="benchmarks/fixtures/checkpoint-b2/pf-api-pagination-behavior";
 assert.equal(fixture.input_manifest_path,prefix+"/input-manifest.json");
 assert.equal(fixture.verification_command_contract.path,prefix+"/verification-command-contract.json");
 for(const [path,digest] of [[fixture.input_manifest_path,fixture.input_manifest_sha256],[fixture.verification_command_contract.path,fixture.verification_command_contract.sha256]])
  assert.equal(createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex"),digest);
});
