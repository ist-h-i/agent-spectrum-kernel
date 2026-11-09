# ASK source application through the supervised loop

Spec `instruction-loop-source-application@1` extends the existing second change
judgment, not the consumer Full installer. The host pins an opt-in
`normal.kind: ask_source_repository_v1`, an existing clean ASK checkout, repository
and remote identity, base branch/revision and new publication branch. Generated
instructions cannot choose destinations or executable commands.

The standard plan compares the measured candidate to its measured baseline and
requires the configured owner base to have that exact tree. It allows canonical
Skill Markdown and the fixed generated paths only. It binds the candidate source,
base tree, resulting tree and each before/after digest before human approval.
Planning never changes the source checkout or publishes anything.

After the existing change approval, apply prepares a separate private Git clone
of that exact version and a typed external-host application request. A durable
claim's first successful response permits the host AI to use its existing GitHub
tools for the specified branch, PR, CI/review and normal merge. Repeated claims
return inspection-only permission. This port starts no model and adds no human
judgment. It standardizes the host tool handoff; core does not implement GitHub
credentials, CI policy or review decisions.

A PR or push is pending, not applied. Completion requires the exact request/claim,
reported merged PR, CI/review evidence and a locally inspectable normal merge
commit with the expected parents and exact measured tree. The host fetches that
commit into the private publication clone and checks it out before completion.
Git byte/graph checks are independently validated; remote authentication, CI and
review are explicitly host-reported evidence. No JSON statement alone certifies
remote authentication. Activation/cleanup and next-baseline promotion follow only
that completion. The merged private checkout is retained as the next source base.

Closed inputs and durable claim/completion records reject foreign receipts,
conflicts, changed source/base/remote and duplicate execution permission. Interrupted
public operations remain claimed and require observation of the existing branch/PR;
they never authorize another push, PR or force-push. Owned publication clones,
plans and evidence are version history and are retained. Existing generation-staging
cleanup remains bounded by its manifest. Shared/remote repositories and refs are
never cleanup targets.

Consumer owner behavior and explicit null-target result-only behavior remain
unchanged. Source restoration does not fall through to the consumer installer:
it requires a separately pinned exact revert candidate and the same change-review
protocol. Automatic inverse-plan generation is outside this first source port.
Existing runs are not retroactively assigned a source target.

Formal Verification Contract:
- SA01: Full generation synchronizes/checks the five fixed Claude entries before
  commit, bounds derived writes and preserves failure receipts.
- SA02: source planning has no source/remote write; rejects target/base/remote,
  candidate or non-instruction drift and reports exact byte differences.
- SA03: only the second approved change starts the private application handoff;
  one durable claim grants execution, repeats only observation.
- SA04: branch/PR-only, foreign or mismatched completions cannot finish apply or
  activate a version. Lost responses recover by inspecting retained records.
- SA05: exact merged graph/tree plus bound evidence finishes apply; continuation
  uses the verified merged source, never an unmerged publication.
- SA06: fake-host/local-Git integration preserves the old consumer/null-owner
  paths. Tests make no network, model, real owner or authenticated-Claude calls.

Actual remote execution through this new port remains unverified until an approved
future source-target cycle supplies real host evidence.

## Host setup and execution

Use this opt-in `normal` block in a fresh Full practical profile, and set
`policy.normal_target` to the same absolute checkout path. Existing registered
Assets and `assetAuthority` still supply their own Registry lifecycle authority.
The host prepares these settings; users are not asked to author runtime JSON.

```json
{"kind":"ask_source_repository_v1","target":"/absolute/clean/ask-checkout",
 "repository":"github.com/OWNER/REPOSITORY",
 "remote_url":"https://github.com/OWNER/REPOSITORY.git","base_branch":"main",
 "base_revision":"EXACT_40_HEX_BASE_COMMIT","publication_branch":"ask-improvement/cycle-001"}
```

Both Eval case approval and change approval use ordinary `operate`. After the
second approval the loop pauses at `awaiting_source_application` for the AI host,
not another human decision. `--root` below is the current cycle root reported by
`operation-status`; use its pinned config, not the outer operation directory.

```sh
node scripts/supervised-instruction-loop-cli.mjs source-application-request --root CYCLE --config CONFIG
node scripts/supervised-instruction-loop-cli.mjs source-application-claim --root CYCLE --config CONFIG --claim CLAIM_JSON
node scripts/supervised-instruction-loop-cli.mjs source-application-complete --root CYCLE --config CONFIG --submission COMPLETION_JSON
```

A claim has `handoff_digest`, stable `execution_id` and `actor`. Only
`claim_created:true` / `execute_new:true` permits starting publication. If that
response is lost, the identical claim returns false: inspect the existing branch,
PR and host execution instead of replaying them. Save original tool evidence in
the owned request directory, beside its `publication` clone. Completion contains
that request/claim digest, `publication` with repository/base/branch/head,
`state:merged`, normal merge commit/tree, PR number and host-reported passed CI /
approved review, plus bounded relative evidence paths and digests. Inspect the
request for the closed contract. It is not an executable command supplied by a
candidate. Fetch/check out the observed merge only in the private publication
clone; never reset the shared checkout or force-push.

An ordinary `operate` then inspects completion and performs existing Registry
activation, manifest-bounded generation-staging cleanup and final report. It
retains source publication Git history, receipt and evidence. A subsequent cycle
uses the verified merged checkout/commit as its source and owner base. Changed
base/tree or a conflict requires a newly reviewed exact plan; the old judgment is
not transplanted. Source restoration similarly uses a new exact revert candidate
through this source path, rather than consumer installer rollback.
