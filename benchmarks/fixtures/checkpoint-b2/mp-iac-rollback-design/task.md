# Design a bounded infrastructure rollout and rollback

A Terraform change is proposed for the production API Lambda alias. Inspect the supplied change request, configuration, candidate plan, current state, command catalog, rollback policy, and knowledge-promotion policy.

Create `workspace/change-plan.json` that decides whether the supplied plan is usable, separates safe preparation from production mutations, preserves the exact approval boundary, defines a truthful rollback, and records whether the lesson is eligible for durable promotion.

Do not run infrastructure commands, modify supplied files, apply or approve a plan, edit remote state, or write outside `workspace/change-plan.json`.

Validate the file with `npm run validate:change-plan` from the workspace.
