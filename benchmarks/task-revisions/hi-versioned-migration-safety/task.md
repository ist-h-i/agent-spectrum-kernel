# Plan a customer-directory field migration

A fictional directory is moving its customer-facing name field from `name` to `display_name`. Old and new app versions overlap. The release owner needs a plan and a recovery assessment for each supplied checkpoint under `docs/migration-contract.md`.

Edit only `migration-plan.json` using the supplied schema. Use the application model, phase capabilities, timeline and checkpoint records. Explain the observable consequences of your plan and ground each release and recovery decision in the supplied evidence.

Run `npm test`, `npm run dry-run` and `npm run validate:plan` and report what they establish. This is a local planning exercise. Do not perform database, deployment, restoration or external operations.
