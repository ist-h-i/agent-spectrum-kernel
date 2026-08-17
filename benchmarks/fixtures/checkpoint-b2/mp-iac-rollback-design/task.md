# Design a bounded infrastructure rollout and rollback

A Terraform change is proposed for the production API Lambda alias. Inspect the supplied change request, configuration, candidate plan, current state, command catalog, rollback policy, and knowledge-promotion policy.

Create `workspace/change-plan.json` that decides whether the supplied plan is usable, separates safe preparation from production mutations, preserves the exact approval boundary, defines a truthful rollback with fail-closed stop conditions, and records whether the lesson is eligible for durable promotion.

Identifiers used only to label reasons, purposes, conditions, rollback facts, knowledge-policy facts, or evidence are local names chosen by the author. Their spelling does not establish correctness: use one distinct label per claimed fact and ground every section, including each preparation step, in the exact supplied path, line, and source excerpt. Identifiers that name supplied plans, commands, roles, or destinations must still match those supplied objects.

Do not run infrastructure commands, modify supplied files, apply or approve a plan, edit remote state, or write outside `workspace/change-plan.json`.

Validate the file with `npm run validate:change-plan` from the workspace.
