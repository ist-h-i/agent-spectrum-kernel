# Rollback policy

Rollback is a new forward change against the then-current Terraform state; reverting Git alone does not change the live alias.
The rollback target is primary version `41` with no secondary-version weight.
Generate a fresh rollback plan from the current state, review its exact digest, and obtain a separate `platform-change-approver` approval before applying it.
Preserve published version `42`, plan records, application logs, and change evidence for diagnosis.
Do not reuse the stale forward plan, delete version `42`, manually edit remote state, or treat a Git revert as completed rollback.
Stop if the current state lineage or serial cannot be read, the rollback plan changes resources outside `alias-canary`, or approval is missing.
