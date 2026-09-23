# Session checkpoint runtime contract

Issue #275 Slice 2 extends the [Agent Session State Contract](agent-session-state-contract.md) with bounded repository snapshots, content-addressed checkpoints and fresh-process resume validation. It does not introduce another lifecycle or control authority.

This is an opt-in runtime API contract, not an always-on agent instruction. Keeping it separate avoids changing unrelated adapter projections and compact verification prompts when only checkpoint behavior changes. The schemas are `schemas/repository-snapshot.schema.json` and `schemas/session-checkpoint.schema.json`; the implementation is `scripts/session-checkpoint.mjs`.

## Repository identity

A snapshot records Git-derived repository identity, branch, HEAD/tree, index entries, worktree identity, changed paths, Plan/package references, integration base, contract identities and bounded verification-evidence references. It contains digests and references, never source bodies or printed diffs.

Creation and resume both compare the checkout with the current Plan and active package target binding. The branch must match. The integration base must resolve to the Plan's exact base commit and tree. Its default is the pinned Plan base, not the moving HEAD. HEAD may advance through descendant commits on the authorized branch; unrelated history is rejected. A saved snapshot cannot authorize a different branch or base even when its live-state fields agree with the checkout.

Index identity comes from Git's staged object IDs, modes and paths. Worktree identity hashes actual regular-file bytes and executable bits for the union of HEAD-tracked paths, index-tracked paths and visible untracked files. Git-clean tracked files are included because filters and index flags can hide byte changes from `git diff`. Diff-based path queries disable textconv and external diff drivers. A staged edit followed by a worktree reversion still appears in the changed-path inventory.

Submodules, symlinks (including dangling symlinks), non-regular files and non-UTF-8 Git paths fail closed. Recursive submodule identity is not implemented; an ignore setting does not make a submodule safe to resume. Empty regular files and explicitly optional missing targets are supported.

Capture bounds are 128 changed paths, 128 explicit target or contract paths per list, 64 evidence references, 4,096 observed worktree paths and 64 MiB of observed file bytes. Tracked files are bounded to 8 MiB each; explicit target/contract and visible untracked files retain the 256 KiB limit. Git command output is bounded to 8 MiB. Exceeding a bound rejects capture; no partial inventory is accepted.

Ignored untracked files are outside automatic Git-state coverage. Relevant ignored contracts or targets must be explicitly named. Every explicit path identity includes its byte digest and an `executable` boolean (any execute bit set); a chmod-only change is rejected even for ignored files. Missing optional paths use `executable: false`. Explicit path records lacking this field are rejected rather than treated as exact continuation. Dirty continuation requires the same working environment and byte identities; a snapshot does not restore unsaved changes or certify the checkout's correctness. Quiesce writers during capture, publication and resume; this is not a filesystem transaction or lock.

## Saving state versus executing work

Saving requires a structurally and semantically valid current Work Package Plan, its trusted validation context, and its policy/decision/lineage. It does not require an executable Plan. A valid `bounded` or `proposed` Plan can preserve an unresolved blocker, human decision or required approval. An `accepted` Plan that contradicts unresolved controls remains invalid under the unchanged upstream Plan validator.

Execution permission still comes from `validateWorkPackagePlanExecutable`. Any unresolved execution condition produces an `await_control_resolution` next action with a null task ID. Callers cannot override that action with an ordered task. Completed packages must preserve dependency closure. Control IDs, evidence and stop conditions are derived from the supplied authoritative Plan, not independently asserted by the caller.

Snapshot and checkpoint objects use the existing content-addressed store. A resumable reference is published only after both stored objects have been read back and validated. Before any write, the store and resume-reference output must be outside and not overlap the worktree or its Git metadata, including a linked worktree's shared Git directory. Symlink output paths and ignored output directories inside the worktree are rejected. After CAS publication, the full resume validator must confirm that the stored state still matches the live checkout and evidence before a resume reference can be published. A valid waiting state remains publishable without authorizing work. An unreferenced partial object is not a resume entrypoint.

## Resume outcomes

A fresh process revalidates the Plan, snapshot, checkpoint, live repository, path/contract identities and evidence references. Unknown packages, dependency violations, stale HEAD/tree, different index/worktree bytes, altered controls, missing/tampered objects or an invalid Plan return `state_valid: false`, `status: blocked` and no restart package. Validation never checks out, resets or overwrites repository files.

Valid saved state with unresolved execution conditions returns `state_valid: true` and `status: blocked`. Its bounded restart package retains the phase, control IDs, evidence and stop references, with an await-only next action. This permits inspecting and handing off the waiting state, not executing repository work. Non-executable lifecycle/admission states also remain blocked even when there are no explicit control IDs.

Only an exact, executable continuation returns `context_rollover_required`. The adapter capability is `restart_package_only`: automatic creation of a fresh execution context is not implemented or implied. The Execution Envelope remains the sole runner-owned control authority; checkpoint fields are validated projections and references, not a replacement approval system.

These artifacts must not contain raw prompts, transcripts, source bodies, command output, secrets, customer data or personal data. A saved Plan reference is not independent proof of completion, security, readiness or verification success.

## Verification

Run `node scripts/test-session-checkpoint.mjs` with the repository's Node 24 environment. The suite rebinds synthetic Plans to real temporary Git repositories without editing historical fixtures. It exercises fresh-process CAS continuation, initial and resumed target mismatches, descendant versus unrelated history, raw-byte drift hidden by textconv/index flags, executable-only drift in explicit ignored targets/contracts, index/worktree divergence, unsupported submodules, empty/missing paths, bounds, waiting-state control preservation, unsafe output locations and publication-time state drift. The original Plan validators, schema validator and CAS implementation remain in the integration path.
