# Change request CR-482

The requested production change is a 10 percent canary from Lambda version `41` to published version `42` on `aws_lambda_alias.api_live`.
The authorized resource scope is `alias-canary`; IAM policy, reserved concurrency, function code, and remote state edits are outside this request.
A production write requires `platform-change-approver` approval of the exact saved-plan digest generated from the current state lineage and serial.
Approval for the forward plan does not authorize a later rollback plan; each production write needs its own exact-plan approval.
Preparation may format-check, validate configuration, and create a plan, but it must not mutate cloud resources.
The canary may proceed only after the plan contains the alias update and no change outside `alias-canary`.
Rollback triggers are `canary-error-rate-high` and `canary-p95-high`; either trigger requires returning all alias traffic to version `41`.
