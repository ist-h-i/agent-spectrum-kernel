# Personal Prompt target recovery and Codex ownership handover

SPEC-PERSONAL-TARGET-1@2 / IMP-PERSONAL-TARGET-1@2.
Upstream: SPEC-PERSONAL-TARGET-1@1; PV1-1/6; A5.4/A3.1; ADR0014;
the owner's2026-10-21 explicit continuation. Formal verification remains
FVC-PERSONAL-TARGET-1@2, extendingO1-6 rather than downgrading after findings.
Only owned artificial Git fixtures may be mutated by this implementation task.

Implementation Contract: IMP-PERSONAL-TARGET-1@2; change refs R1-6/C1-5.
The actual boundary extends the existing physical adapter, its thin CLI, the
normal Codex entry guard and conservative doctor diagnostics. Reuse the normal
installer's pure full-install plan for complete current ownership validation;
do not reproduce its file/command renderer or replace its health contracts.
Codex setup planning/apply also refuses active personal state/journal/foreign
lock before its subset simulation or core phase. A staging copy must not hide
the real target's personal ownership metadata.

## Partial operation contract

- R1: before the existing lifecycle mutator, exclusively create a bounded private
  operation journal. It binds the reviewed original plan, exact pre-operation
  tree entries/state/file presence, target identity, source, receipt and selected
  role. The ordinary lifecycle pending marker remains separate. Journal data is
  not target-write, adoption or rollback authority.
  The original plan also seals the creation file mode. A journal value cannot
  redefine that mode to explain a later chmod.
- R2: recovery is explicit plan/recover, with independently supplied original
  plan digest, current caller-trusted adoption closure, fresh explicit rollback
  selection and separate exact recovery-plan authorization. Do not infer the
  original pin or authority from a local journal, marker, plan or PID.
  Both planner and mutator require `originalPlanDigest` directly. Keep the
  original adoption closure exact; a new rollback authority is supplied as
  `rollbackTrustedPortfolioAuthorityContexts`, separately from that closure,
  and bound by the new recovery plan. Local state does not authenticate it.
- R3: recovery of an interrupted apply aborts its physical effect to the exact
  prior parent (or uninstalled state for initial bootstrap). Recovery of an
  interrupted restore completes that separately authorized parent restoration.
  Neither operation retries generation, evaluation, adoption or candidate apply.
- R4: reverify the current candidate/parent registered bytes and all snapshot,
  state, selection/lock and source bindings. Each affected current Prompt must
  be exactly an allowed endpoint; unrelated tree/HEAD/index drift, unknown bytes,
  truncated state, symlinks/hardlinks, a foreign lock or an old marker without the
  new journal freezes the target. Never force or manufacture recoverability.
- R5: before recovery writes, archive the original raw journal and marker using
  the existing immutable CAS publisher under a dedicated target-local evidence
  root. The archive has content identity only and grants no authority. Keep it
  after recovery. A recovery write failure preserves journal/pending evidence;
  a later separately authorized recovery must revalidate all inputs again.
- R6: only after verifying exact recovered files/state may recovery remove its
  known marker and journal. Preserve unknown/replaced evidence. Delete only
  registered Prompt files proven absent before bootstrap; do not remove project
  files or any Prompt directory. Empty directories remain because original
  absence cannot establish ownership of a directory now occupying that path.
  Target-local immutable recovery evidence intentionally remains.

## Explicit local interfaces

| API / CLI | Independent input beyond the target and trusted closure |
| --- | --- |
| `planPersonalPromptTargetRecovery` / `plan-recover` | `originalPlanDigest`, fresh `rollbackSelectionObjectDigest`, `rollbackTrustedPortfolioAuthorityContexts` (may be an explicit empty array if already trusted in the original closure) |
| `recoverPersonalPromptTargetPlan` / `recover` | reviewed `prepared`, exact `confirmedDigest`, `authorized:true`, independently supplied `originalPlanDigest` and `rollbackTrustedPortfolioAuthorityContexts` |
| `planPersonalPromptCodexHandover` / `plan-handover` | parent `selectionObjectDigest`, independently reviewed raw `ownerStateDigest` |
| `handoverPersonalPromptCodexPlan` / `handover` | reviewed `prepared`, exact `confirmedDigest`, `authorized:true`, independent `ownerStateDigest` |
| `planPersonalPromptCodexReturn` / `plan-return` | current parent `selectionObjectDigest` matching the installed lock, independent original `ownerStateDigest` |
| `returnPersonalPromptCodexPlan` / `return` | reviewed `prepared`, exact `confirmedDigest`, `authorized:true`, independent original `ownerStateDigest` |

The existing private request-file/raw-digest CLI checks remain. Recovery mutation
request files contain `prepared`, `closure`, `originalPlanDigest` and
`rollbackTrustedPortfolioAuthorityContexts`; owner mutations contain `prepared`,
`closure` and `ownerStateDigest`. `--authorized --confirm DIGEST` is still separate.
No force flag, model/external execution, trust inferred from a journal, or generic
serialized filesystem operations are accepted.

Added target-owned metadata: personal-prompt-target-state.json.operation.json
and personal-prompt-target-evidence/ beneath .agent-spectrum-kernel. Existing
state/marker/lock and the five Prompt paths remain closed. No Portfolio CAS
mutation or external request is needed by physical recovery.

## Codex ownership contract

- C1: default overlap still refuses. Handover is a separate explicit plan with
  an independently pinned Codex state digest and exact target authorization.
  Require complete normal installer identity, five owned Prompt records and
  byte identity with the independently approved registered parent. Reject
  partial installation, drift, missing fields, source/profile mismatch or a
  different registered baseline; do not normalize a stale bundle into current.
- C2: preserve the original Codex state and five-file hashes. Release only those
  five ownership records into a closed explicit delegation; personal state is
  their sole physical owner. Keep all other Codex/kernel files, blocks, skills,
  hooks, commands and runtime metadata untouched. Cross-state writes share the
  same durable journal, written before either state, retaining both exact raw
  before/after states. Both installers acquire the same exclusive target lock;
  a lease check alone is insufficient. A partial pair blocks both entry points.
- C3: initially admit only candidate content retaining the exact current compact
  parent content as prefix in each file. Do not discard or rewrite the existing
  contract/header/control bytes. A different generator/runtime contract is a
  separate reviewed compatibility requirement, not an inferred safety grant.
- C4: ordinary Codex update/rollback/detach refuses while delegation or its
  partial journal exists, including force requests. Doctor must not report the
  delegated surface as an unchanged healthy default full Codex projection or
  infer Activated/Operational; existing contract checks must not be weakened.
- C5: explicit return requires exact approved parent files, original owner-state
  pin and current independently trusted selection. Restore the exact original
  Codex owner state only after its untouched non-Prompt assets and paired
  personal/delegation state validate. Candidate must first undergo its separately
  authorized rollback. Preserve a non-owning immutable return-history artifact
  in the target snapshot so an old handover plan cannot become fresh again.
  Unknown/partial return remains stopped with evidence.

The first ownership implementation deliberately leaves a partial paired-owner
operation stopped: its distinct owner-operation journal retains both raw states,
and ordinary personal/Codex operations refuse. The apply/restore recovery API
does not accept this different journal schema. An owner-pair recovery contract
must be independently reviewed before any such repair; no automatic rollback,
force override, owner-state normalization or successful return is inferred.
Initial handover supports current full Codex with no managed partial files,
hooks or managed blocks; other ownership shapes refuse. A completed return
restores original raw Codex state and leaves immutable non-owning history, which
prevents the original handover plan from becoming fresh again.

The existing preregistration raw/historical parent differs from all five current
full compact renderer outputs. AH14 Full is a historical saved-run target, not
permission to rewrite evidence. C1 is approved_saved_noop and has no user-project
target locator. These inputs cannot be repurposed as a current handover approval.
Positive handover fixtures must construct fresh synthetic registered compact
parent/candidate assets and complete independently trusted fake approvals.

## Verification obligations

| ID | Required observable result |
| --- | --- |
| R-A | Separate-process recovery after parent/candidate apply EIO; prior bytes or proven absence restored, fresh rollback lock retained where installed. |
| R-B | Restore EIO completes parent; original raw journal/marker archived; unknown edits, forged pins/snapshots, unrelated drift and legacy marker refuse unchanged. |
| R-C | Recovery itself fails once, preserves evidence and can only proceed under a newly confirmed live plan after endpoint revalidation; no operation repeats model/Portfolio work. |
| C-A | Real normal installer on owned temporary Git repo, compatible freshly registered synthetic compact bundle: handover→candidate→rollback→owner return; only five Prompt paths and declared metadata change. |
| C-B | Ordinary installer refuses during lease, doctor does not falsely promote it; original owner metadata and baseline health return after exact restoration. |
| C-C | Raw historical bundle, mismatched profile/state, missing trust/pin, foreign owner and partial handover/return cannot claim success. |

Candidate discovery and actual acceptance remain read-only. A real operation
requires a newly selected eligible target and reviewed exact input/plan; this
task supplies none of that authority. Actual model/native execution, security or
authentication settings, real-project writes and historical regrading remain
outside scope. Implementation/review results and exact-head CI belong to PR417.
