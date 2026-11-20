# Design a bounded canary rollout and rollback

A platform approver must decide whether to authorize a canary and how operators will recover if it fails. Use the local Terraform proposal, supplied plan and state, command catalog, and policies in `docs/`. The examples in `plans/pre-apply-records.json` pair saved plans with the state observed at the proposed write. Use them to describe when a decision made during preparation must be revisited.

Write only `change-plan.json` using `change-plan.schema.json`. Identify why the supplied candidate is usable or blocked and the preparation still permitted. Specify the write target, scope, state identity, plan digest and approving role for forward and recovery changes. Describe what to do when a prerequisite changes, what evidence to retain, and what observable traffic state establishes recovery. Keep unresolved thresholds and the durable knowledge policy explicit.

Use catalog IDs for plans, commands and roles, use local descriptive condition labels, and cite real supplied paths, lines and exact trimmed excerpts. Each preparation step must identify its command and its mode. Treat all records as tabletop inputs. Do not run infrastructure commands or change any state. Run `npm run validate:change-plan` and report the result.
