# Public evaluator and Kernel route qualification

Implementation Contract `IMP-318-QUAL-1` revision 1 references
`IMP-318-THREE-1` revision 1 and `DES-MAC-ASK-VALUE-1` revision 2.
C1 adds explicit existing frozen public source-root qualification; C2 binds it
into preparation and read-only replay; C3 records the canonical zero-Skill route
block without substituting instructions. No task, condition, scoring rule,
reference, private evaluator, authority seal or grant changes are authorized.

Formal Verification Contract `FVC-318-QUAL-1` revision 1 retains the formal
cross-module/persistence proof selected under
`ask.verification-proof-policy@1.0.0`. O1 requires the existing public reference,
pinned public reference bytes, source inventory, immutable Git revision and dependency closure to verify with
the unchanged generic verifier. O2 refuses current-byte drift, changed frozen
bytes, missing history, linked/overlapping roots and changed qualification at
replay. O3 keeps canonical AGENTS bytes, zero Skills, identical public inputs and
prompt/policy/order, and reports missing required routes rather than providing a
new Kernel policy. O4 keeps private authority/human/native admission unknown,
starts zero model/CLI processes, and preserves old evidence. E1 is failing
focused checks; E2 is frozen-root integration and tamper negatives; E3 is the
344 local regressions plus new tests; E4 is repository/bundle/whitespace checks,
independent review and exact-head CI.

## Work that can close without model execution

The public evaluator reference fixes revision `ab2ce5fe` and its source graph.
The current checkout has schema changes, so verifying that reference against
current bytes correctly fails. A separate checkout of the declared revision
verifies with the existing verifier and original bundle identity: this is public
source qualification, not a replacement evaluator or private admission. Keep
that checkout outside every task root. Preparation may bind its canonical path;
replay rechecks its immutable bytes/graph without running a grader or model.
The default current-checkout path continues to refuse drift.

## Work requiring a decision or separate execution approval

Canonical AGENTS routes non-trivial review to `skill-router`, while K contains
zero Skills. Supplying a substitute Skill or standalone policy would change the
comparison condition. This implementation preserves K and records
`capability_missing`; its fair successful workflow is not admitted. Future
choices are to retain the existing condition as an admission blocker, or explicitly
redesign and approve a standalone Kernel condition in a separate plan. The user
selected the separate standalone-Kernel design/approval plan on 2026-10-05. This
slice does not implement that new definition, change K or authorize a measured
comparison; the current condition remains blocked. Missing capability is not a
negative effectiveness score. Measuring operational refusal would require its
own question, frozen protocol and fresh authorization, separate from this value
comparison.

Private evaluator bytes/independence, human admission, native executable and
sandbox evidence, actual Skill discovery/read/use, execution budget and new real
execution authorization remain outside this slice. Qualification of public
source alone never changes `live_ready=false` or admits native execution.

The pinned public reference SHA is
`sha256:16aa4e11e6dd3cae7ae9b1d445b388f3b4177d9c797fa833657bc5ed03f7ddb2`.
All 52 declared public source files and the original dependency graph are checked
by the existing verifier. The controller performs read-only Git object queries;
it does not create/fetch a checkout, import a historical module or run a grader.
Supply the existing checkout explicitly; CI uses full Git history for model-free
test-only detached checkouts. Local paths remain in private protocol records.

## Exact dependency and existing product findings

Canonical `AGENTS.md` section 8 routes non-trivial delivery/review to
`skill-router`; it does not directly name `review-router` as the destination for
every such task. `skills/skill-router/SKILL.md` maps PR review to `review-router`
and requires selected capability to exist. `skills/review-router/SKILL.md`
requires one `review-ai-quality` baseline and stops if that capability is
missing. Additional gates depend on observed signals; importing all gates is
not the minimum solution. These are source-contract findings, not observed
model routing or an instruction to supply those Skills to K.

The existing adoption `kernel-only` profile is different:
`scripts/ask-setup.mjs::planningSource` selects all `manifest.json.skills` and
rejects empty selection. It means core installation without an adapter, not
canonical AGENTS with zero Skills. The historical B2 protocol does define
canonical-AGENTS-only, but it is not a current self-contained product policy and
its historical measurements cannot qualify the current missing workflow.

A task-independent standalone design proposal is in
[kernel standalone design](kernel-standalone-design-proposal.md). It is pending
adoption; no new definition or instructions are applied by this implementation.
