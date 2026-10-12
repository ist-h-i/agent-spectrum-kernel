import { validatePortfolioFoundation } from "./ask-benchmark.mjs";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePfLibraryProductionAuthority, buildEvidenceMap } from "./ask-benchmark-pf-library-authority.mjs";
import { validatePfLibraryInputClosure } from "./ask-benchmark-pf-library-source.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
test("library task retains exact public input closure", () => {
  assert.equal(validatePfLibraryInputClosure({ root }).fixtureId, "pf-library-compat-upgrade");
});
test("library authority is complete while independent admission remains pending", () => {
  const result = validatePfLibraryProductionAuthority({ root });
  assert.equal(result.scoringReady, false);
  assert.equal(result.reviewStatus, "pending_independent_review");
  const admission=JSON.parse(readFileSync(resolve(root,"benchmarks/fixtures/checkpoint-b2/pf-library-compat-upgrade/final-admission-record.json"),"utf8"));
  assert.equal(admission.admission_status,"admission_pending");
});
test("scope, equivalence and evidence mutations are task-specific", () => {
  const value=buildEvidenceMap();
  assert.equal(value.evidenceMap.maps.length,3);
  assert.equal(value.mutationAsset.mutations.length,3);
  assert.deepEqual(value.evidenceMap.scope_boundary_authority.allowed_candidate_paths,["workspace/src/archive-compat.mjs", "workspace/migration-record.json"]);
});

test("dedicated runtime config binds this fixture input and public verification", () => {
 const config=JSON.parse(readFileSync(resolve(root,"benchmarks/pf-library-compat-upgrade.config.json"),"utf8"));
 validatePortfolioFoundation(config, resolve(root,"benchmarks/pf-library-compat-upgrade.config.json"), { root });
 const fixture=config.fixtures[0];
 assert.equal(fixture.id,"pf-library-compat-upgrade");
 const catalogFixture=JSON.parse(readFileSync(resolve(root,"benchmarks/portfolio-catalog.json"),"utf8")).fixtures.find(x=>x.fixture_id===fixture.id);
 for(const field of ["suite","task_class","difficulty","repetitions","aggregate_eligible"])assert.deepEqual(fixture[field],catalogFixture[field]);
 const prefix="benchmarks/fixtures/checkpoint-b2/pf-library-compat-upgrade";
 assert.equal(fixture.input_manifest_path,prefix+"/input-manifest.json");
 assert.equal(fixture.verification_command_contract.path,prefix+"/verification-command-contract.json");
 for(const [path,digest] of [[fixture.input_manifest_path,fixture.input_manifest_sha256],[fixture.verification_command_contract.path,fixture.verification_command_contract.sha256]])
  assert.equal(createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex"),digest);
});
