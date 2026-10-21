# Operator procedure for a partial Codex Prompt ownership pair

SPEC/IMP/FVC-PERSONAL-TARGET-1@3 extends @2 only with a human-controlled
recovery procedure and its artificial failure drill (M1-6). There is no new
production recovery API, automatic retry, authority or rollback policy.
Upstream: Issue379 PV1-1/6/7; ADR0005; Proposed ADR0014. Normal apply/restore
recovery remains separate from this owner-operation journal schema.

## Supported destination and scope

This procedure has one destination: exact registered parent Prompt bytes,
original complete current-full Codex ownership, and absent personal ownership.
For interrupted **handover**, abort the uncompleted ownership transfer; for
interrupted **return**, finish the already authorized return. Never finish a
partially authorized handover to a candidate or choose the locally newest state.

The five Prompt files must already equal the independently verified registered
parent. Candidate bytes, unknown edits, historical/partial Codex profiles or
missing original evidence stop this procedure; use a separately reviewed case.
This procedure writes **no Prompt, project code, AGENTS, Skill, hook, command or
Git file**. Its only repair writes are the pinned original raw
`.agent-spectrum-kernel/codex-install-state.json` and removal of the personal
state proven to be an allowed known endpoint. Evidence is retained; only exact
known journal/marker/owned lock may be cleared after completion checks.

## M1 — prerequisites, independent authority and incident freeze

1. Stop the attempted operation and keep ordinary personal/Codex/setup commands
   stopped. Do not use `--force`, retries, normal `recover`, an old approval, a
   local journal as authority, or marker removal to get past the stop. If no
   single operator can exclude concurrent writers, retain the stop. Do not
   infer liveness/termination from a PID or change security settings.
2. Keep the **pre-operation, privately saved outside-target** reviewed owner
   plan/digest, source revision/identity, target realpath/device/inode,
   HEAD/index/tree snapshot, original raw Codex owner-state bytes and their
   independently supplied digest. Retain raw pre-operation personal state or
   independently recorded absence. Missing data is a stop, not permission to
   reconstruct a trusted baseline from the failed target.
3. Reverify the actual approved Evolution adopt_candidate closure and independent
   Registry/Portfolio trust inputs. For parent restoration require the existing
   separately trusted `external_portfolio_rollback_authority`, current exact
   rollback selection/lock, predecessor equal to the adoption result lock and
   target equal to that receipt's rollback anchor. Use existing
   `verifiedInputs` / `verifyRollbackSelection`, not a new authority verifier.
   A retained raw owner state, CAS object or C1 no-op grants none of this.
   Aborting ownership handover itself performs no new Portfolio transition;
   this procedure nevertheless requires the current independently approved
   parent destination. Do not manufacture a Portfolio rollback to fit the files.
4. Obtain explicit incident-specific target-write approval for the exact repair
   record/destination. Broad PR merge approval, fake approvals or permission to
   run this test do not authorize an actual target repair. The record binds all
   independently saved pins, current full observed snapshot, raw journal/marker
   digests, source, rollback selection, destination and closed two-state delta.
   The human checks it and confirms its exact digest. Store each confirmation
   privately outside the target; it is one reviewed observation, not a reusable
   repair capability. Re-observe/review after any interruption or changed bytes.

## M2 — preserve and compare before any repair write

1. Capture raw current Codex state, current personal state or absence, owner
   journal, marker, current tree/HEAD/index/target identity and modes into a
   private outside-target incident record. Publish an immutable content-addressed
   archive with the existing CAS utility and verify its read-back digest. Keep
   target-local owner-history objects. This archive records identity, not trust.
2. Parse the bounded regular single-link files without duplicate JSON keys.
   Refuse symlinks/hardlinks/special files or unsafe ancestors. The journal must
   be `ask.personal-prompt-owner-operation@1`, with its original exact plan equal
   to the independently saved plan. Recompute that plan digest; compare its
   target/source/owner pin and independently captured before tree/state, not
   only values that agree with one another inside the journal.
3. Verify known endpoints separately: current Codex raw digest must be the
   independently planned before-owner or after-owner digest. Current personal
   bytes must be exact saved before bytes/absence or the plan-sealed pending
   state/absence. Match pending state to the plan's state digest and exact known serialized bytes. Match marker
   operation, plan digest, state path, pending owner digest and pending state.
   Refuse extra/duplicate JSON fields and raw reformatting of an observed
   journal/marker or personal endpoint. Preserve independently recorded modes;
   current Codex mode must equal its original recorded mode, existing personal
   mode must equal its recorded mode, and newly created personal/journal/marker
   modes must equal the known0600 creation mode. No chmod is part of repair.
   No third endpoint, truncated state, stale source or transplanted journal is
   acceptable. Do not normalize JSON or chmod unknown files into a match.
4. Verify all five current files against the trusted registered parent bytes;
   verify every originally Codex-owned file and all other tree entries/modes
   against independent pre-operation evidence. Git HEAD/index and target
   identity must match. Preserve pre-existing immutable evidence byte-for-byte;
   validate new CAS history objects without treating them as authority. Refuse
   changed or new unrelated files, unknown owners, markers or foreign locks.

## M3 — operator applies only the reviewed pair

Use the existing `withPersonalPromptTargetLock` for each manual write phase;
validate its owned empty directory identity and exclude only that owned lock
from the reviewed snapshot. After acquiring it, repeat M1/M2 against the current
snapshot immediately before writing. A foreign lock is never removed.

1. Replace only `codex-install-state.json` with the exact independently pinned
   original raw owner bytes. Preserve its reviewed mode; never build a new
   owner state from the journal or discard unrelated ownership records.
2. Verify phase1 changed exactly the approved Codex file entry and no other
   entry, mode or Git binding. Save its start-confirmation digest, original
   plan/owner/journal pins, observed end-binding and exact personal-state raw
   digest/absence in a private outside-target completion record; independently
   confirm that record's raw digest. A marker-absent mixed pair may proceed to
   phase2 only when it exactly matches this independently retained checkpoint.
   A journal, boolean or self-consistent local state cannot supply it. Missing,
   altered or stale checkpoint stays stopped. This is evidence of the already
   approved first manual write, not authority for a new repair destination.
   Leave the journal and any marker present. If interrupted here, report partial;
   archive the new observation and completed-phase checkpoint, obtain a new exact repair confirmation, and
   repeat all checks. Known before/after pairs may still be recoverable; unknown
   edits remain stopped. No automatic retry follows an exception.
3. Under a newly reviewed observation and the same shared-lock discipline,
   remove `personal-prompt-target-state.json` only if its exact current endpoint
   was reviewed and the approved destination is absence. An already absent
   state is a verified endpoint. No recursive removal or directory deletion.
4. A failure in either phase retains journal/remaining marker/archive and is not success.
   Never clear the stop just because the original Codex file now looks correct.

## M4 — verify destination, then clear only known stop records

Before clearing anything, independently reverify original owner raw digest,
absence of personal ownership, five registered parent digests, every protected
file/mode, target identity and unchanged HEAD/index. Match the raw journal and
any marker to the independently archived exact digests again. Marker absence
with a retained known journal is supported only when both files are the exact
plan-sealed completed owner pair, or the exact approved destination (original
Codex bytes and absent personal state). A mixed pair without its marker is an
unknown endpoint and stays stopped, except the exact manual phase1 checkpoint
specified in M3 above. Record absence explicitly; never invent a
replacement marker to make the evidence fit. Under the owned shared lock, clear
only those known marker (if still present) and journal files, journal last. Keep all immutable
history and incident archives. Unknown replacement metadata stays untouched.
Failure during cleanup is partial, not complete; retain the remaining stop and
re-review the new observation before another manual action.

Run the normal installer **read-only** `--profile full --check` and doctor.
Require the original complete ownership inventory, no delegation/lease, normal
installer check success, no new doctor failure and the complete baseline doctor report/checks, including status. Recheck the protected tree and modes after installer/doctor, not only before cleanup.
Recheck exact owner bytes, no personal state/journal/marker/foreign lock, all
protected bytes and evidence read-back after these checks. Any mismatch is a
stop with evidence; do not force a healthy result. No runtime loading,
Activated/Operational or model effectiveness follows from these checks.

## M5 — completion record

Record source/target and exact repair-confirmation digests, incident archive
object digest, rollback authority/selection identity, original owner digest,
five parent digests, unchanged Git/protected-files result, normal installer and
doctor outputs, and any retained metadata. State separately what was attempted,
failed, recovered, unknown and not executed. Close this incident only after all
M4 checks. Keep the adoption/rollback and historical attempt identities intact;
no new model/Portfolio/evaluation operation or hidden attempt resume is allowed.

## M6 — artificial drill and acceptance limits

The owned fixture archive uses the existing CAS's explicit96MiB maximum, as the
production owner-history publisher does; no global limit or trust policy is
changed. Oversize evidence stops before repair rather than being truncated.

`node --test scripts/test-personal-prompt-owner-manual-recovery.mjs` exercises
both handover and return, interrupted before the first owner write, between
owner writes, after both owner writes before marker cleanup, and after marker removal before journal cleanup. Return cases
first use real fixture candidate apply and separately trusted rollback. Each
case verifies normal entry points remain stopped, immutable raw evidence,
independent plan/owner/trust checks, the reviewed original-owner destination,
exact parent/protected files, normal installer check and full baseline doctor-report restoration, followed by a protected-tree/mode recheck.
Missing authorization/owner pin/rollback trust, mode drift, raw JSON reformatting, unknown Prompt/project/owner/
journal/marker edits and a foreign lock remain unchanged and stopped. The test
also pauses after the first manual repair write and requires a fresh review;
marker-absent handover additionally proves checkpoint absence/tampering refuses.

The fixture uses a real normal installer on newly owned temporary Git targets,
synthetic independently trusted closure and operator-chosen manual steps. It
exports no repair utility and exposes no production command. Eight artificial
failure cases exercise this bounded procedure, not actual Mac acceptance,
forced-crash safety, arbitrary incident recoverability or new target authority.
AH14/C1 originals and actual projects are never the drill targets.

Actual use still requires an eligible specifically selected target, independent
actual adoption/rollback inputs, archived original pins and exact incident
approval. This procedure adds no automatic repair prerequisite to PV1; it makes
the required recovery steps concrete. PV1-6 actual target acceptance remains
open until separately authorized and observed.
