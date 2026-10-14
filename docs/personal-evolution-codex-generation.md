# Codex candidate generation adapter

Related: #383, #379, #176. This adapter connects `executeCodexSession` to the
existing once-generation connector. Its contract bounds the explicit public
payload and controller-managed output. Ordinary CLI/global configuration,
authentication destination, runtime identity and future tool-selected context
remain **Unknown**. Read-only sandbox does not prove effective read isolation.

## Spec

- Artifact ID: `SPEC-PERSONAL-CODEX-GENERATION`, revision 1.
- Upstream refs: #383 adopted bounded-input/output contract.
- AC-INPUT: inspect shows the exact existing public generation input, source
  artifact identity, fixed argv/paths and timeout without starting anything.
  No holdout, grading resources, full request policy, trust or store paths enter
  the prompt or supplied session workspace.
- AC-OUTPUT: only complete UTF-8 JSON with bounded parent-inventory Markdown
  revisions can become files. Controller owns descriptor, exact parent/version,
  provenance Unknowns and not-evaluated statuses; model cannot supply authority.
- AC-ONCE: start confirms inspected request/preparation, rechecks bindings and
  uses existing once claim, runner capture/import and held failure paths.
- AC-PARTIAL: bounded useful files from terminated failed/partial sessions are
  held; malformed output and unconfirmed termination cannot claim success.
- AC-HANDOFF: receipt/preparation references enter the existing independent
  source-review and nine-task preparation procedure. No scope expansion,
  evaluation trust or actual activation follows from registration.

## Verification Contract

- Artifact ID: `VERIFY-PERSONAL-CODEX-GENERATION`, revision 1.
- Upstream refs: `SPEC-PERSONAL-CODEX-GENERATION@1`.
- Selected proof: Formal Verification Contract under
  `ask.verification-proof-policy@1.0.0`; public/cross-module contract, persisted
  once lifecycle, regression and merge trace are formal triggers.
- V-PUBLIC (AC-INPUT): fake session asserts exact prompt/workspace boundary,
  immutable source/input/argv binding, no preparation dispatch and explicit
  ambient/runtime Unknowns.
- V-OUTPUT (AC-OUTPUT/AC-PARTIAL): positive import plus malformed JSON, duplicate
  keys/paths, traversal, symlinks, undeclared files, bytes/UTF-8 limits and
  controller-owned descriptor; partial/failure/cancellation retained as held.
- V-ONCE (AC-ONCE): existing receipt verification, source/input drift,
  unconfirmed and duplicate starts; no new retry/resume mechanism.
- V-HANDOFF (AC-HANDOFF): existing generation/import/pair regressions and the
  public nine-task fake roundtrip; repository validation, independent exact-head
  review and CI. These checks do not establish native CLI/model acceptance.
- Focused check: `node --test scripts/test-ask-personal-evolution-codex-generation.mjs`.
- Insufficient evidence: absent independent review, failed same-head checks,
  or any claim about live provider, private grading or quality/adoption.

## Implementation Contract

- Artifact ID: `IMPL-PERSONAL-CODEX-GENERATION`, revision 1.
- Upstream refs: `SPEC-PERSONAL-CODEX-GENERATION@1`,
  `VERIFY-PERSONAL-CODEX-GENERATION@1`.
- Change boundary: thin adapter, shared existing input projection, fake tests,
  this procedure and CI connection. No new ledger, controller, permission scheme,
  optimizer or scoring authority.

## Inspect before a separate human start

Use a committed, independently reviewed checkout. `sourceRoot` defaults to the
checkout containing the imported adapter. Inspection verifies the bytes of the
adapter, runner, once connector and import module against that checkout's HEAD
and the loaded source. It derives `source_revision` and `implementation_digest`
from those four artifacts; the operator supplies no invented internal hashes.
This inventory does not claim to authenticate the native CLI, all transitive
runtime behavior or effective ambient context. Uncommitted or drifted artifacts
stop before dispatch.

The JSON context contains `storeRoot`, `requestObjectDigest`, a **new**
`workspaceRoot`, explicit `timeoutMs`, and the existing exact parent trust
contexts. `executable` optionally names the ordinarily configured Codex launcher;
its default is `codex`. No model override, CLI args, environment, grader paths,
resume ID or approval factory is accepted. Request preparation is unchanged.
Existing generation requests and their bytes need no migration.

This is a preparation-only example; it contains no start call:

```js
import { inspectPreparedPersonalEvolutionCodexGenerationFile,
  startPreparedPersonalEvolutionCodexGeneration }
  from './scripts/ask-personal-evolution-codex-generation.mjs';
const prepared = inspectPreparedPersonalEvolutionCodexGenerationFile(
  contextPath, verifiedContextRawDigest);
const { handle, ...inspection } = prepared;
console.log(JSON.stringify(inspection, null, 2));
```

Review the actual public input, prompt/input digests, source inventory, executable,
fixed argv, dedicated workspace, timeout and Unknowns. The process uses
`exec --sandbox read-only --skip-git-repo-check --json --output-last-message ... -`
in a fresh empty `workspaceRoot/session`. The
[official CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
documents the non-repository-directory and final-message flags. Native CLI
compatibility remains untested here; refusal/unsupported flags produce held
failure without alternative args or a new execution path.

The caller supplies the timeout explicitly from its reviewed generation policy.
The adapter adds no token, cost or independent task-duration cap; ordinary service
limits still apply. It does not inspect credentials, alter global/security
settings, ignore rules, change authentication or grant broader sandbox access.
Ordinary configuration and future tool context remain uncontrollable factors.
The no-other-reads instruction is an instruction, not proof that all reads are
prevented. Keep private grading resources and holdouts outside the supplied
workspace/prompt and stop on concrete sensitive exposure.

Only after a **new direct human-to-Codex instruction** authorizes this inspected
request and preparation may the supervising caller use the following API in the
same process with its opaque `handle`. Do not put it in an unattended preparation
script:

```js
// HUMAN-AUTHORIZED START ONLY; this example is not executed by this document.
const result = await startPreparedPersonalEvolutionCodexGeneration(handle, {
  confirmedRequestObjectDigest: prepared.request_object_digest,
  confirmedPreparationDigest: prepared.preparation_digest
}, { signal: cancellationSignal });
```

The caller may omit the third argument when no AbortSignal is supplied. A fresh
authorized caller can inspect the same pinned context again in a new process and
compare its preparation digest to the reviewed value before start; it must not
substitute the new digest if it drifted. Opaque handles are never serialized.

Start rechecks source/input and delegates durable consumption to the existing
connector. A lost handle can be prepared again only while the existing status is
NOT_RUN; a consumed request is never restarted, even after disconnect. The runner
owns timeout/cancellation of its direct CLI child. Descendant/tool lifetime and
effective context are not asserted fully contained. Unconfirmed termination or
cleanup failure cannot import a final response. On disconnect, inspect the
existing generation status and preserve terminal/consumed_unknown evidence.

## Output and continuation

Model JSON contains only `status` and `files[{path,text}]`. All paths must be in
the fixed parent's Markdown inventory. Before writing, validate complete JSON,
unique paths, UTF-8, per-file nonempty text and the existing 256-file/512-entry/
512-KiB bounds. Final capture is bounded to 4 MiB to allow JSON string escaping;
the existing runner bounds stdout/stderr. Traversal, symlinks, hardlinked capture,
extra output and descriptor/authority fields are rejected.

Controller-owned descriptor retains exact parent/rollback and inherited
applicability/exclusions; it resets safety, permissions, evaluation and mechanism
to not_evaluated, freshness to not_assessed, and license/owner to unknown. Renderer
input and output hashes bind provenance. Descriptor source revision names the
verified generation implementation as required by the existing connector; it
does not prove that generated content is already published at that Git commit.
The connector's privacy fields describe the bounded public-input/output policy,
not an observed absence of arbitrary ambient data or a semantic source review.

Valid useful files from partial, nonzero-exit, interrupted or output-limited
sessions remain held with existing receipts. Invalid output remains held without
import. Raw process error/stdout/stderr text is not copied to the returned receipt.
Untrusted final capture stays local in the new session directory; do not publish
it automatically. Returned runner flags are observations, not authenticated
saved model/provider or privacy proof; existing durable `model_execution` remains
Unknown for ordinary transport. No retry/resume or parallel receipt ledger exists.

`candidate_ready` returns the existing execution receipt and preparation refs.
Follow [the nine-task procedure](personal-evolution-primary-loop.md): independent
source review/publication, fresh **both-role** eligibility/alignment, pre-result
experiment/pair, a separate direct human comparison start, saved original
grading/evaluation and governed adopt/hold/reject. This adapter does not broaden
the old three-class parent to nine classes or use the unrelated eight-task profile.
Quality/effectiveness, real comparison, real Mac apply/restore and repeated live
operation remain Unknown. No adapter code applies to real Mac settings.
