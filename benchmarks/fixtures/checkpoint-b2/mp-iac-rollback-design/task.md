# Design a bounded infrastructure rollout and rollback

A platform team wants to introduce a published API version through a production Lambda canary. The service must remain recoverable if the canary performs poorly, and an approver needs a bounded proposal before any production write. Assess the supplied Terraform change using the change request, configuration, candidate plan, current state, command catalog, rollback policy, and knowledge-promotion policy.

Create `workspace/change-plan.json` that decides whether the supplied plan is usable, separates safe preparation from production mutations, preserves the exact approval boundary, defines a truthful rollback with fail-closed stop conditions, and records whether the lesson is eligible for durable promotion.

The plan must make the candidate's usability and supporting reasons clear, identify the preparation that may occur before approval, state the exact apply gate, and describe rollback triggers, recovery limits, preservation duties, and stop conditions. It must also assess knowledge-promotion eligibility from the supplied policy and evidence. Record unresolved operational definitions as limitations rather than inventing thresholds or claiming readiness beyond the evidence.

Use `workspace/change-plan.schema.json`. Identifiers that name supplied plans, commands, roles, or destinations must match those objects. Labels for reasons, purposes, conditions, facts, and citations are local names; ground each section, including preparation, in supplied paths, lines, and exact trimmed source excerpts. Each preparation step must use a supplied non-mutating command and its exact mode. The order and content of the proposal remain your responsibility.

Do not run infrastructure commands, modify supplied files, apply or approve a plan, edit remote state, or write outside `workspace/change-plan.json`.

Validate the file with `npm run validate:change-plan` from the workspace. This checks structure, source references, and command safety; it does not approve the plan or establish operational readiness.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"change-plan.schema.json":"a22fdc8d5593c0b7c2b9be08bcb1412fad906687cd207ac663ea23d11fa6db02","docs/change-request.md":"24458fee92c2ed7fa5bfe95f56af6911f1b8639ff10b8ac110c00395c6916c00","docs/knowledge-policy.md":"89a5a96997bbafca5d6c13de68ac4c4f05ca376a8abfcdb06cca41fa3fdc485b","docs/rollback-policy.md":"050283401cd2f99f120cc41ced0fc3a33195e1e5d9daae1acb4588264d866d3d","infra/alias.tf":"6d9ebfd9960efe5c773b4c6e01423041a269c7145c2b02239727281c6f3108a6","infra/iam.tf":"225e670871ac615237ede92602f96400bf9e84b2dbbc44493e88b6aa1e5498ba","operations/commands.json":"e8807a8289288edb4881104b4cd773b0e1f34ebab685e201481be5126bbe2db3","package-lock.json":"913b787bd230691adf255631664e80b87e6a1ae1478fb1f1e4f73ec7a17abac5","package.json":"a2f69220942a021487ab441d25d013d427320103a85f2845221758e381ec9377","plans/candidate-plan.json":"ae22f7b6f66f252b12530a951592d398be08c56c5702e12bd926f95bffb8f916","scripts/validate-change-plan.mjs":"393dc63a5a948086f29eec67fbab4922b13ab8b8d9fd5c7571365ad23e425e0e","state/current-state.json":"153f59ae462f3a68017ee8cad14548ae83407fd654a220c6733e6b1631621e18"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm run validate:change-plan
```
