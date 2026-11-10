# Adopt a measured review candidate without repeating its evaluation

This bounded continuation transfers the two review Skills and their finding
contract from a completed RC01 baseline/candidate comparison to a different
publication commit on current main. It does not infer that current main as a
whole was evaluated. The original coordinator, trial journal and human gates
remain unchanged.

The bridge accepts only an observed, completed one-pair RC01 standard comparison
with its actual saved case approval, both revision-labelled conditions, all
attempts selected, completed grading and closed execution. It rechecks frozen
answers, handoff, rubric bindings, grades, metrics and instruction projection.
The recorded runtime must pin the exact worker settings. A host assertion boolean
alone is insufficient.

The publication must be clean and versioned. Its changes are limited to:
- `skills/review-router/SKILL.md`
- `skills/review-ai-quality/SKILL.md`
- `docs/review-finding-contract.md`
- `scripts/test-review-route.mjs`
- the existing closed generated-source allowlist.

All three canonical files must change. Every changed publication file, including
the regression test and generated files, must exactly match the measured source
revision. The measured trial's canonical instruction bytes must also match.
Unrelated current-main content is retained but explicitly unmeasured. The narrow
test-file exception is available only with this revalidated proof; ordinary
source publication still rejects arbitrary test or runtime code changes.

## Preparation API

Use `scripts/instruction-loop-measured-adoption.mjs`:

1. Prepare a separate, owned source clone and Full projection from the chosen
   publication commit. Retain the exact owned archive/manifest/layout; register
   changed assets with `registerFullInstructionCandidate`. The registration,
   environment, actual Full files and archive are checked, not manufactured by
   the import. A retained candidate is not a new model generation.
2. Call `prepareMeasuredSourceAdoptionBinding({evaluationRoot, settingsPath,
   configPath, measuredSourceRoot, measuredRevision, baselineRevision, candidate,
   outputPath})`. It writes an immutable local proof and returns `{path,digest}`.
3. Build the normal Full practical profile/config for the current clean main
   owner and publication branch. Its policy has the same case/public digest,
   baseline/candidate conditions, one repetition and two trials.
4. Call `prepareMeasuredSourceAdoptionImport({profile, policy, candidate,
   binding})`, using the config's pinned policy. Save the returned import.
5. Run the existing supervised controller:

```sh
node scripts/supervised-instruction-loop-cli.mjs advance --root /absolute/fresh-run --config /absolute/config.json --import /absolute/completed-import.json
```

This verifies the import again, records a historical continuation, and prepares
the exact source change packet. It does not call a solver, reselect tests or
consume an older gate. After recording the user's adoption against this fresh
packet, the normal source-owner handoff handles publication. A created PR is
not application: only verified merged Git content permits version activation,
owned-staging cleanup and the final report.

Source planning and subsequent application inspections recheck the proof,
measured journal/approval, source identities, all changed bytes and frozen grade
artifacts. Source-only completion does not imply browser/runtime coverage or
complete billed token accounting. Human approval and remote publication records
are host evidence, not cryptographic user authentication.

Model-free checks:

```sh
node --experimental-test-module-mocks --test scripts/test-instruction-loop-measured-adoption.mjs scripts/test-instruction-loop-source-application.mjs scripts/test-supervised-instruction-loop.mjs scripts/test-instruction-loop-practical-runtime.mjs
```
