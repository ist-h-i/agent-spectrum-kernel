# Personal Prompt target application and persistent restoration

Spec: SPEC-PERSONAL-TARGET-1@1. Upstream: Issue379 PV1-1/6, the owner's
2026-10-21 local implementation delegation, ADR0004/0005/0011 and
SPEC/IMPL-PERSONAL-SOURCE-INSTALL. The requirement remains actual-target adoption
and restoration capability. A legitimate no-op does not remove that requirement.

Implementation Contract: IMP-PERSONAL-TARGET-1@1; upstream SPEC-PERSONAL-TARGET-1@1.
Change class: feature. Integration base5f3d574b (includes PR414). This is an independently reviewable
physical-application boundary, not a replacement evaluator, authority or runner.

## Observable behavior

- PT1: accept an explicit canonical normal Git repository target. Existing
  project code, AGENTS, skills, hooks, Git metadata and unrelated files remain
  owned by the project. Own only the exact five rendered Prompt basenames under
  `.agents/prompts/` and `.agent-spectrum-kernel/personal-prompt-target-state.json`
  plus its operation marker/lock. Reject links/hardlinks/special files on write
  paths, unsafe Git metadata, target containment with source/CAS and changed target identity.
- PT2: require the existing complete, approved adopt_candidate Evolution receipt
  and caller-trusted experiment/evaluation/human/Asset/Portfolio closure. Reverify
  the exact role selection and registered rendered bytes. Neither quality scores,
  a no-op receipt, generated content, plan JSON, stored state nor a model's verdict
  supplies adoption, target-write or rollback authority.
- PT3: expose plan/apply/status and plan-restore/restore as a small explicit local
  API/CLI. A JSON plan binds target realpath/device/inode, Git HEAD/index/worktree,
  source identity, closure digest, receipt, selection, role and closed inventory.
  Plan data contains no reusable execution capability or implicit permission.
  Every mutator needs exact plan confirmation, independent caller-trusted closure
  inputs and explicit authorization. Recompute the plan from live inputs before
  writing; do not execute serialized arbitrary operations.
- PT4: initialize the approved parent only where the five paths are absent or
  already byte-identical and unowned. Apply the candidate only over the exact
  recorded parent and its installed Portfolio lock. A known installer that owns
  any of these Prompt paths is a conflict, including an existing Codex projection.
  Do not take over its files, weaken doctor, detach it or silently create two owners.
  Normal standalone/kernel-only repositories with no conflicting Prompt owner are
  the first supported targets. Existing Codex-owner handover is a separate explicit
  integration requirement, not represented as completed by this slice.
- PT5: reuse installer-lifecycle managed records, previous-successful state and
  exact five-file rollback snapshot. State is durable; plan/apply/restore can run
  in separate Node processes. No WeakMap or live process handle is needed.
- PT6: restore requires a fresh verified rollback selection/lock whose predecessor
  is the adoption receipt's result lock and whose target is its exact rollback
  anchor, with separately trusted rollback authority. Verify candidate bytes,
  state and all parent snapshot bytes before mutation. Persist the restored parent
  and rollback lock so the old adoption cannot simply be replayed after restore.
  A parent's older receipt is historical metadata. The current candidate receipt
  must match the independently trusted adoption closure; parent Asset, installed
  lock, selection and snapshot must match that closure's approved rollback target.
- PT7: serialize target mutations with an exclusive owned local lock. Preserve
  foreign locks and installer in-progress markers. Both apply and restore use the
  existing lifecycle in-progress/pending-state mechanism. A partial failure is
  recovery_required, not unchanged; retain partial files/snapshots, do not retry,
  force, remove unknown markers or infer child/process termination.
- PT8: no model, comparison, grading, Portfolio transition, credential operation,
  global setting change, or automatic adoption is launched by this boundary.
  CLI closure files are private and outside the target; their raw digest must be
  supplied separately by the trusted operator. The library retains the existing
  caller-trusted-context boundary; it does not authenticate an organization from
  a self-digested JSON file. File-byte success does not prove runtime loading,
  effectiveness or Operational governance acceptance.

Plans and closure material stay outside target/source-owned input paths and are
private local records. Public responses expose fixed reason codes and digests,
not raw errors, prompts, rollback contents or authentication data. Source identity
reuses buildSetupSourceIdentity; state and filesystem mutation reuse the existing
installer lifecycle. CAS adoption and physical writes remain separate operations,
not one transaction. Host power loss and malicious concurrent filesystem changes
are not guaranteed recoverable by these process-level guards.

## Formal verification and tasks

Verification Contract: FVC-PERSONAL-TARGET-1@1; upstream SPEC-PERSONAL-TARGET-1@1.
Select formal_verification_contract under ask.verification-proof-policy@1.0.0:
public API, persisted lifecycle, authorization, external filesystem I/O and
handoff/stable trace triggers apply. Formal proof is not downgraded after a failure.

| Obligation | Observable acceptance and evidence |
| --- | --- |
| O1 / PT1-4 | Normal artificial Git target retains project-owned code/Git/AGENTS; exact parent→candidate bytes, only five managed Prompt files plus own state/markers change. Missing authorization, mismatched confirmation and foreign target refuse before writes. |
| O2 / PT2-3 | Missing/foreign/untrusted/non-adoption closure, wrong selection/asset/receipt, resealed forged plan, extra paths, accessors/proxies, source change, HEAD/index/worktree or target inode drift refuse without adopting metadata as authority. |
| O3 / PT5-6 | Separate CLI processes save a plan, apply parent, plan/apply candidate, and independently plan/restore parent using current trusted rollback selection. Exact snapshot and installed lock survive reload; old adoption replay after restore refuses. |
| O4 / PT1,7 | Foreign lock, old artificial state, known installer prompt ownership, in-progress marker, managed symlink/hardlink and local candidate/snapshot drift refuse and preserve evidence. |
| O5 / PT7 | A controlled filesystem failure in an owned fixture retains pending lifecycle state and partial artifacts; subsequent normal plan/status/mutation refuses. No arbitrary user-project failure is manufactured. |
| O6 / PT8 | Tests use synthetic complete closure and private temporary Git targets only. Fake adoption witnesses do not authorize real candidate application. No model/native execution or historical C1/AH14 mutation. Existing artificial-only API regression remains intact. |

Ordered local tasks: extract shared adoption/materialization validation without
changing artificial target guards; add serializable normal-target planning and
explicit apply/restore boundary; add thin closed CLI; prove positive/restart and
refusal/partial paths; run source-artificial regression, repository validation,
runtime freshness, syntax/whitespace; preserve raw outcomes for parent review.

Likely files: a shared Prompt adoption verifier, one normal-target module/CLI,
existing artificial module imports, reusable synthetic test helper, focused tests,
this contract and proposed ADR0014. No scoring, generation, personal run authority,
adoption decision policy, normal installer ownership or user project is changed.

## Explicit local interface

`scripts/ask-personal-prompt-target.mjs` exposes:

| Operation | Required caller input | Result |
| --- | --- | --- |
| `planPersonalPromptTargetApply` | canonical `targetRoot`, independently trusted `closure`, `selectionObjectDigest`, `role` (`parent` or `candidate`) | `{plan,digest}`; hashes/inventory only, no serialized write operations |
| `applyPersonalPromptTargetPlan` | `prepared` plan, fresh trusted `closure`, `confirmedDigest`, literal `authorized:true` | applied plan/installed-lock digests; no runtime loading claim |
| `planPersonalPromptTargetRestore` | canonical `targetRoot`, independently trusted `closure`, fresh `rollbackSelectionObjectDigest` | `{plan,digest}` bound to exact candidate bytes and parent snapshot |
| `restorePersonalPromptTargetPlan` | same explicit mutator fields | restored parent with fresh installed rollback lock and retained parent snapshot |
| `inspectPersonalPromptTarget` | canonical `targetRoot` | physical status only; adoption authority is never inferred |

The thin `scripts/ask-personal-prompt-target-cli.mjs` maps these to `plan-apply`,
`apply`, `plan-restore`, `restore`, `status`. All commands require a private
regular single-link request file outside target/source, using `--request PATH`
and independently supplied raw SHA-256 `--request-digest sha256:…`. The request is
the corresponding API input. Mutating CLI requests contain only `prepared` and
`closure`; `--authorized --confirm sha256:…` supplies authorization separately.
They do not read a global current pointer, start generation/comparison/model
runs, or accept force. Existing setup binding may invoke read-only local Git
metadata probes; it does not request remote data.
Public failures expose only `personal_target_refused` or
`personal_target_recovery_required`, with exit1. Closure data and raw filesystem
errors are never copied to those responses. The private request digest protects
exact operator-selected bytes; it does not authenticate their authority origin.

Concrete future target delta is limited to these five Prompt files and dedicated
state/marker/lock. A normal Codex-installed user project is currently a **blocked
ownership integration**, not a recommended first target. Before actual acceptance,
the owner must identify a no-conflict target or separately review ownership
handover; supply an actual eligible adoption receipt and independent trust inputs;
inspect its target-bound plan; and explicitly authorize that exact digest. A later
restore independently requires its current explicit rollback closure/selection.

Local verification commands (planned, not outcomes):

~~~sh
node --test scripts/test-personal-prompt-target-application.mjs
node --test scripts/test-ask-personal-source-install.mjs
node scripts/validate-repo.mjs
node scripts/adapter-runtime-bundle.mjs --check
~~~

Actual user-project acceptance remains a later separately authorized operation:
parent supplies the exact target, trusted actual adopt/rollback closure, selected
lock and reviewed plan digest. The current C1 no-op is ineligible. A passing
synthetic fixture is not that approval or final PV1-1/6 completion. Ordinary
GitHub publication and CI work are authorized; local verification and independent
review must precede the Draft PR. No actual user target has been selected here.

## Initial local evidence

At the final uncommitted implementation tree on base4ac4903a, the focused suite
completed with tests7/pass7/fail0/cancelled0/skipped0/todo0, 277414.0945ms. It
includes separate-process parent→candidate→fresh-lock restoration, historical
parent receipt metadata, Git HEAD/index/worktree/inode binding, re-sealed plan
refusal, ownership/unsafe path refusal and controlled apply **and restore** EIO.
Both fault paths retained pending state/snapshot and refused repeat mutation;
the restore fault also retained the original candidate state file unchanged.
The shared artificial-target regression completed tests6/pass6/fail0 with no
skips, 168052.976625ms. Existing artificial target guards remain unchanged.

Earlier missing-module red, initial canonical-CAS/Proxy failures and independent
review findings were retained in local audit logs. The relevant defects were
fixed; their initial results are not rewritten as successful runs. A source-only
independent review found no remaining findings after the parent-receipt fix;
the automated gate awaited the final subject's run. Current commands and eventual
committed-subject/CI results belong to the PR evidence. These synthetic results
do not establish actual user-target or full PV1-1/6 acceptance.
