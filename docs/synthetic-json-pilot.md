# Synthetic JSON pilot: local implementation contract

Implementation artifact: IMP-SYNTHETIC-JSON-PILOT-1, revision 2.
Upstream: approved synthetic-pilot-plan.md, SHA-256
031998814f245922dc6def065c9aeaff78139a12ab1154407236e79426fd761f.
Verification artifact: VER-SYNTHETIC-JSON-PILOT-1; selected
formal_verification_contract under ask.verification-proof-policy@1.0.0 because
the new journal lifecycle, subprocess bounds and cross-module regression need
multiple checks and durable handoff.

Proof obligations: fixed plain/kernel_only slots, create-once execution,
120-second planned timeout/SIGKILL, retry zero, private complete failure records,
strict bounded JSON P1, fixed-answer P2, seed-only workspace P3, fail/unscored
continuation, process/accounting/security stop, source/profile identity checks,
and digest-verified reopen. Focused check:
`node --test scripts/test-ask-synthetic-json-pilot.mjs`.
Shared regression check: usage and prompt-delivery suites. Fake checks cannot
establish native sandbox enforcement, CLI startup, authentication or model
session identity on the target host. Those are insufficient-evidence conditions
for live acceptance, not failures of the fake wiring check.

Entry points:
`node scripts/ask-synthetic-json-pilot.mjs prepare-fake` prints an artifact root.
`node scripts/ask-synthetic-json-pilot.mjs run-fake /canonical/artifact/root`
executes two owned Node fake processes only.
`node scripts/ask-synthetic-json-pilot.mjs reopen /canonical/artifact/root`
verifies saved evidence and prints a fixed-field report.

The same runner now implements a native adapter using official codex exec and
codex sandbox. One separately authorized local pair has completed the wiring checks below.
Every future live execution requires fresh exact-plan approval. Commands:

```sh
node scripts/ask-synthetic-json-pilot.mjs prepare-live /absolute/pilot-descriptor.json
# Review privateRoot/planDigest, then obtain NEW exact-plan approval.
node scripts/ask-synthetic-json-pilot.mjs bind-live-permission /canonical/privateRoot NEW_APPROVAL_REFERENCE
node scripts/ask-synthetic-json-pilot.mjs run-live /canonical/privateRoot
node scripts/ask-synthetic-json-pilot.mjs reopen /canonical/privateRoot
```

Preparation requires committed clean source, pinned CLI0.157.1 Darwin-arm64 image
SHA-256 27ceb5f9b957b43a519efe4eaa3816a0bffb0a531a2c89af18840c0a3c016a7d
and Node v24.19.0. Descriptor accepts nativeExecutable/authSource plus optional
new privateRoot/canonical workspaceParent/exact controllerRoot only. Native
image bytes are hashed without starting it. Auth source is a declared canonical
existing auth.json path; preparation does not stat/read it. Unknown fields fail.
Prepare and bind launch no Codex. Binding is a trusted-operator action AFTER
explicit approval; its reference is audit evidence, not cryptographic human
identity. Old Stage B grants cannot bind this kind/plan. Native execution requires
the new exact source/plan/image permission and immutable once-only run claim.

Run combines one model-free canary control (10 seconds), then on success only
plain/kernel_only execs (120 seconds each), distinct workspaces/homes/sessions.
The one control checks own public readability and nonsecret private/controller/
other-trial denial; it never probes actual auth content. It includes managed
requirements via --include-managed-config. Failure stops, no replacement/retry.
Fake-only verification invokes no real CLI/provider/auth operation; the separate
authorized live observation is recorded below.
Fake native-transport simulation executes only owned Node fake processes and
labels its evidence fake_native; it cannot start an arbitrary/native executable.

Fake workspaces are fresh sibling temporary directories outside controller and
evidence roots. Fake CODEX_HOME is fresh in the private evidence root, contains
no credentials, and is not inherited from the caller. Fake sessions verify
wiring only. The fake environment is a closed nonsecret map. Test-only shortened
timeouts and usage/grader fault scenarios are explicitly synthetic and cannot
alter the fixed planned live limits.

`fake_exec_starts`, `exec_starts` and native/control starts count direct launch attempts conservatively, including a
failed spawn. It is distinct from the number of successfully created OS
processes; PID/exit/error evidence records the observed outcome. Cleanup checks
the detached group; it does not claim detection of processes escaping that group.

No winner, percentage, significance, full ASK efficacy or formal Issue 291
admission claim is produced. Per-condition criterion/format/process/usage and
unscored reason are reported. Provider request count and actual cost remain
unobserved in the live pilot; token thresholds are post-completion stops.

Changes are limited to two public fixture files, the pilot module, its owned
fake process and tests, this contract, and exporting the existing contained
process helper with an opt-in to retain process evidence on cleanup failure.
Default helper behavior is unchanged. Formal scorer/preparation/authority and security settings are
unchanged. No generated files or new dependency is involved.

## Native argv, environment and authentication

The adapter reuses effectiveCommand, renderSuccessorStdin, contained cleanup,
usage, stable-file/digest/schema parts. Non-ephemeral sessions, strict-config,
ignored user config/user-project rules, JSON/schema and fixed gpt-6.1-sol/medium
and approval never are shared. System/managed requirements are retained.
Named workspace profile denies private evidence root, exact controller working
root, workspace parent and canonical auth source; :workspace_roots write permits
the active trial, keeping other trials denied. Narrow controllerRoot=repo alone
is rejected because sibling controller design/grader copies must remain denied.
Native sessions must show model/effort/provider/version/cwd, distinct sessions
and exactly one turn per trial, workspace-write/network-off and explicit denies plus own workspace
write. Pinned CLI0.157.1 also adds one read-only active execve runtime directory
at `<private>/<condition>/codex-home/tmp/arg0/codex-arg0XXXXXX` (six ASCII
alphanumeric suffix characters). Session validation accepts only that exact
normalized directory, at most once, unchanged across contexts. It still rejects
other private/controller/auth grants, runtime writes, parent/child/alias paths,
sibling trials and multiple runtime directories. This reflects the CLI's existing
policy; it does not change argv or OS permissions and is not whole-process isolation. Tools are allowed; Judge's tool-free stream parser is not used.

Environment input is only fresh HOME/CODEX_HOME, LANG/LC_ALL=C, TZ=UTC and fixed
Node/system PATH. API keys/proxies/provider overrides/NODE_OPTIONS/caller homes
are not inherited. Darwin may add nonsecret __CF_USER_TEXT_ENCODING at exec;
tests account for that specific OS addition. Plugins/apps/multi-agent/memory
dependency installs/web search/websocket transports are disabled in both cases.
This is a model-tool boundary, not parent-CLI or same-UID process confinement.

Pinned official source ignores configured overrides of built-in openai provider.
The closed ask_pilot_openai alias retains name OpenAI, Responses, OpenAI auth,
official ChatGPT Codex base URL, request/stream retry0, websocket/search off.
Both conditions share the alias. If managed allowed-provider policy rejects it,
stop rather than weaken policy or fall back to ineffective built-in overrides.
[Official provider merge](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/model-provider-info/src/lib.rs).

Future execution explicitly needs metadata validation of a canonical existing
owner-only auth.json and fresh-home symlinks, normal CLI credential reads and
ordinary refresh/write of that existing cache. Controller never reads/hashes/
copies credentials. File storage and ChatGPT login method are fixed; no login,
logout, keys or keyring operation is invoked by the runner. The pinned backend
uses OpenOptions truncate/write/create through the symlink, so refresh can write
the original file. This is not read-only auth or refresh0. Auth unavailability,
alias/owner/inode drift or incompatible policy fails rather than falls back.
[Official auth file storage](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/login/src/auth/storage.rs).

## Payload, budgets and next execution authorization

Nonsecret model data: public task/input JSON, output schema, ordinary Codex
system/developer/runtime context and tool outputs; kernel_only additionally
sends exact AGENTS.md. Expected totals/grader/other results/controller artifacts
are not task inputs. Intended inference/catalog destination is HTTPS
chatgpt.com/backend-api/codex; normal sign-in refresh/managed-policy traffic is
handled by official CLI services. Auth travels through normal CLI authentication
and is never captured as a token/header artifact by the controller. This code
does not enforce whole-CLI egress allowlisting or enumerate every initialization
endpoint. No new OS/network/filesystem exception or global setting is proposed.

Direct starts <=3: control<=1 separately, exec<=2. Each exec120s/SIGKILL,
retry/resume/replacement0; retained streams1MiB each, answer64KiB, session reads
4MiB. Post-completion token threshold30,000/trial or60,000 cumulative is not a
hard token/cost cap. One exec may contain multiple provider/tool requests.
Live provider and credential-operation counts are unobserved, never inferred0.
Fail/unscored task grading alone continues; process/profile/evidence/usage failure
stops. Claims/process/limited streams/answer/grade/usage/session/report are private
and reopen verifies selected evidence. Auth/cache/database contents are excluded;
only auth LINK identity is sealed without content access.

Development approval does not authorize future real authentication/provider or
these live commands. Each new approval must bind exact source/plan/native/profile/canonical auth source,
permit normal auth read/refresh/write, control1 then exec2, public payload/provider
traffic/private evidence and post-completion budget limits. The recorded pair
observes startup, canary enforcement and model-session acceptance on one host;
it does not establish those facts for other hosts or future source revisions.
First failure spends the grant and stops without extra diagnostics or widening.
Source changes require fresh binding. No formal28/freeze/admission/merge authority
or previous spent permit is reused.


## Observed session compatibility correction

The first live pilot at source c5dd1e6b stopped with session_identity_failure.
Its saved metadata shows gpt-6.1-sol/medium, restricted network, correct named
profile and deny roots, plus the CLI-required active arg0 helper read grant.
The earlier validator incorrectly rejected this extra runtime grant. A minimal
synthetic fixture reproduces that specific failure; negative tests retain real
identity/profile failure rejection. Original live report/seal/claims are immutable;
corrected offline metadata validation is not a replacement live result or permit.

Observed turn usage was input21798 (cached input7040 included), output514,
total22312. That historical 20000 threshold counted input+output, including cached
input; it is not uncached billing tokens. Thus the same trial independently
exceeded its threshold. Three token-usage updates show request totals7082,
7498 and7732; initial input7009 includes runtime/tool/system context and task,
so it does not isolate startup overhead. A future approved change could reduce
workspace tool round trips by explicitly asking for one tool call to read input
and write answer, but must retain the same task/grading and required runtime
context. Do not raise thresholds or reuse the consumed permission.


## Shared task input minimization

Both plain and kernel_only use the same shorter public task bytes. The task
prefers a single tool call to read input.json, aggregate rows and write
answer.json, avoiding separate inspection/rereads unless necessary; final output
is concise schema-valid JSON with a one-sentence summary. It provides no answer
or aggregation code. The row validity/ordering/file rules, P1-P3 grading, final
schema, fixed comparison order, kernel bytes and runtime permissions are unchanged.
This is prompt guidance, not an enforced tool-call count or provider request cap.
Model compliance and token savings remain unverified. Fixed token thresholds
are 30000/trial and 60000 cumulative for new schema1.2 plans. Fake tests establish identical task delivery
and preserved controller behavior, not model/token effects. The first consumed
live plan and evidence stay immutable; future execution requires a new committed
source/plan and fresh permission after prepare-only (no auth link or CLI start).


New native plans deny the exact controller directory one level above the old
working root, containing both source/design copies and the preserved prior
pilot artifacts in sibling controller directories. They place new private evidence and trial
workspaces outside it. The previous narrow root remains accepted only for
legacy command identity/reopen; new native preparation rejects it before
materialization. This adds read denial without changing OS settings or moving
old evidence. Authentication and all token/launch limits remain unchanged.


## Usage checklist

For a model-free wiring check, use the prepare-fake/run-fake/reopen commands
above with the exact returned privateRoot. To run the regression checks:

```sh
node --test scripts/test-ask-synthetic-json-pilot.mjs
node --test scripts/test-ask-benchmark-prompt-successor-usage.mjs scripts/test-ask-benchmark-prompt-successor-delivery.mjs
```

For a future native run, use Node24.19.0 on Darwin arm64 and the pinned native
image. Supply a private descriptor with nativeExecutable and authSource;
controllerRoot, when explicit, must be the exact canonical repository grandparent.
Place private evidence and trial workspaces outside that controller directory,
and ensure it contains all known controller/design/prior-result copies. This
fixed layout is part of this bounded pilot, not a general repository installer.
Do not include credentials in the descriptor or publish its local path fields.
Preparation validates the declared authentication source path as text only;
actual ownership/link metadata is checked at run time without reading content.

1. Commit the intended source and ensure it is clean. prepare-live creates only
   a new plan/digest and empty directories; it starts no CLI or auth link.
2. Review source/plan/image/profile/input identities and approve the exact new
   plan, existing-sign-in link/use and ordinary refresh possibility, public
   model payload, control1+exec2 and post-completion budgets.
3. Bind that permission, run once, then reopen the saved evidence. Any drift or
   stop spends the namespace; do not retry, widen policy or replace a failed slot.
4. Publish only reviewed summary fields. Keep raw streams/sessions, credentials,
   authentication paths and machine/user identifiers private. A source change,
   including documentation, invalidates an executable plan's source identity.

Existing sign-in reuse is through symlinks for the official CLI, not credential
copying or new login. Missing/unusable sign-in fails; no alternative auth flow
is provided. The current grants are consumed and do not authorize these steps.

## Public local observation: synthetic wiring only

Observed execution source: `7b1b415037edb747d4acda46fe8b38453ea19fa8`.
Final local fake verification73/73 and shared usage/delivery47/47 passed;
independent source review passed. These results cover the tested source, not
remote CI or a future rebased source.

One separately approved lightweight pilot performed control1 and exec2, retry0.
Control passed; both execs exited0 without timeout, stream limit or recorded
residual-group/cleanup error. P1/P2/P3, final schema, observed model/reasoning,
provider/profile/cwd and separate session identity checks passed for both.

| Condition | Input tokens | Cached input (included) | Output | Total | Duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| plain | 14697 | 6912 | 639 | 15336 | 41.872s |
| kernel_only | 19558 | 9344 | 623 | 20181 | 60.273s |

The final stop was trial_token_threshold: kernel_only20181 exceeded20000.
Cumulative35517 also exceeded30000. Those then-current thresholds were evaluated
post-completion and are not hard token/cost caps. Reopen verified the evidence
seal and unchanged original report. No further live run was performed. A subsequent explicit budget approval
raises future schema1.2 limits to30000/trial and60000 cumulative; it does not
regrade this consumed schema1.1 result. Actual provider request count, credential refresh occurrences,
cost and remaining subscription quota were not observed.

The CLI/controller are trusted. The canary and saved permission metadata observe
a model-tool boundary, not same-UID/whole-process isolation or whole-CLI egress
allowlisting. The public synthetic task is not a secret holdout. Prompt guidance
encourages one tool call but does not enforce it, and token savings or ASK
performance/efficacy cannot be concluded from this single pair.

This lightweight official-exec pilot is separate from Issue291's formal28-trial
measurement and PR313's StageB/custom Judge wrapper. It does not repair or accept
StageB, qualify a Judge, satisfy formal measurement/admission/freeze gates, or
change those grants. The earlier failed pilot and its consumed permission remain
preserved; offline correction did not rewrite that original result.


## Future budget revision

New schema1.2 plans fix post-completion thresholds at30000 per trial and60000
cumulative, following explicit approval after observing15336/20181 (35517 total).
Timeout120s, two slots, retry0, provider-stop/usage-unknown and all other boundaries
remain unchanged. Cached input remains included in total tokens. This reserves
room for two trials but is not a hard token/cost cap or guaranteed subscription
capacity. With two slots and cumulative twice the per-trial threshold, a final
per-trial crossing can coincide with cumulative crossing; trial stop has priority.
Legacy schema1.1/20k/30k plans are accepted solely by reopen with their original
limits and seals. Binding/execution requires schema1.2; old grants/results remain
consumed and cannot be upgraded in place. Formal Issue291 budgets are untouched.


Future-budget source verification: focused fake75/75 and shared usage/delivery
47/47 passed with independent review. The pilot-only eight-file delta applied
cleanly to main@8fc64bf9e64056f709787b0abc5182efeb8c2dbe, where focused/shared
fake122/122 passed in an isolated copy. This demonstrates local source/helper
compatibility without PR313's unmerged changes; it is not remote CI, a published
branch, or live acceptance of a main-based candidate. Documentation updates do
not change the historical execution source or reclassify its stop.
