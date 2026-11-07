# Improvement-loop implementation and acceptance readiness

Audit/specification `instruction-loop-readiness-spec@1`. The audited main baseline
is `24da9de3b6f06da0d982f47ce2924f020eb220a8` (PR454), with the exact reviewed tree
of `7391f842`. The following separates implemented mechanics, missing integration,
and acceptance that was not performed. Successful model-free tests do not prove
real-model effectiveness or actual instruction use.

| Requested outcome | Implemented at the audited main baseline | Remaining work / evidence |
| --- | --- | --- |
| 1. Business feedback -> candidates (#176) | Public structured observations are validated/grouped/ranked, then enter candidate generation and public case selection (`instruction-loop-feedback`, component/native candidate paths). | The host must supply reviewed public observations. A generic raw-log collector is not implemented or required. Normal-work host emission and measured business value need acceptance; broader Golden Rule maturity is not proven. |
| 2. Two human judgments | The supervisor binds exact case and result/change packets to journals. AI recovery is automatic via the Codex assessor or a host-AI assessment input; restore is a fresh change-type judgment. | Real-model one-cycle acceptance remains unperformed. Initial configuration/model-call grants are setup responsibilities, not substituted human case/change approvals. |
| 3. Environment Eval / individual assets | Component composition and bounded Markdown create/revise/exclude feed individual Registry versions and the complete declared environment. Fixed layer/support context and previous case results reach generation. | Fixed executable helpers are preserved, not rewritten by this authoring port. Ambient/global machine context is not the declared environment. Real-model quality and use remain unverified. |
| 4. Adopt/reject/switch/restore/delete | Exact target plans, parent approval, optional normal-owner leases, Registry switching, chained restore and rejection cleanup are connected. | Tests operate temporary owners. Owned private copies can be deleted and candidates retired; shared assets, CAS and audit history remain. Generic CAS garbage collection is not implemented. Real-user application/restore is unverified. |
| 5. Resume / duplicate prevention | Durable reservations, pinned runtime/profile inputs, positive completion inspection, attempt recovery and partial preparation resume are implemented. | Unknown provider/owner partial effects remain explicit, not permission to replay or overwrite. Authenticated interruption/recovery must be accepted for the actual provider. |
| 6. Continue improving | Bounded1..10-cycle operation carries actual baseline, active owner anchor, case outcomes, decisions, costs and uncertainty into fresh approvals. | Real repeated-cycle execution and business-value effects are unverified. No indefinite background scheduler is added. |
| 7. Selected local export/import (#180) | Preview/explicit export intent, dependency closure, quarantine, duplicate/conflict planning and new local candidates; v1 Markdown and v1.1 bounded UTF-8 helpers import inertly. | Actual recipient acceptance remains. Binaries/archives, automatic transport/sharing/conflict resolution, dependency installation and legal/source authenticity certification are not implemented; they are not silently added requirements. |
| 8. Common/specialist/application/personal layers | Exact layer locks feed generation; explicit receiving mappings proceed through receiving Eval and change approval before local adoption. | Real operator/receiver acceptance is unverified. Labels do not grant precedence or organizational authority; initial trusted configuration remains necessary. |

## Claude is more than an instruction-file format

`claude_code` components, `.claude` mappings, portable packages, composition and
local normal-owner leases are implemented and tested in temporary environments.
Standalone adapter-neutral `authoring-prepare` / `authoring-import` and host-AI
`--assessment` inputs are available. These do not implement an authenticated
Claude application dispatcher inside the automatic component loop.

The shipped automatic authoring and recovery-assessor model ports accept Codex,
with explicit synthetic fixture ports for software tests. A Claude-app model
port, normal-loop external-host authoring completion, and app-specific result/
provider-closure capture are missing integration, not merely successful code
awaiting authentication. Practical task execution has caller-owned pinned command
ports; the retained Full/native reference runner remains Codex-specific. Existing
restricted Claude runtime/saved-result contracts do not prove the new loop runs
inside an authenticated Claude app.

No Claude app invocation, credential setup, configuration mutation, new user Eval
or real-owner adoption belongs to this readiness work. Authenticated acceptance
must wait for the owner's environment and separate case/change judgments.

## Safe configuration-only preparation

The readiness follow-up validates the already-supported provider kinds at
configuration and runtime construction, before allocating a lifecycle stage.
Previously an unsupported provider could pass configure and consume generation
before failing. Supported profile admission is unchanged except that these
already-unsupported ports now refuse early. The retained native trial-kind enum
is also checked at configuration, before preparation. Instruction adapter and model provider
are independent: a Codex port may author a Claude-format asset; that is not
Claude-app dispatch. Custom trusted runtimes remain separate extension points.
The retained native runtime is an opaque command definition; a hand-assembled
command definition is trusted custom code and has no profile-validation claim.
Its standard profile/configuration factory performs the early checks.
Supported Codex/fixture profiles, composition-only generation and host-AI
assessment inputs keep their existing behavior. Existing source-pinned configs
must keep their pinned runtime; do not replace files beneath an active run. New
runtime source requires a newly generated configuration for a fresh run. This
follow-up does not migrate or resume old runs under changed source pins.

`node scripts/supervised-instruction-loop-cli.mjs readiness --profile PROFILE`
inspects a caller-provided profile and runtime source pins without publishing a
config, creating a journal, executing cases, launching model/version probes,
reading credentials or mutating an owner. Its report identifies selected ports,
shipped capabilities and the authentication/executable/environment evidence that
was not probed. `execution_readiness` is `not_probed`, not a ready-to-run badge.
It does not print local paths, observation text, tasks or authority inventories,
and does not accept model-call or decision flags. Initial host/admin setup is
still necessary; copying one Skill does not install the whole runtime.

## Remaining execution order

1. Finish/review the configuration-only guard/readiness follow-up and prepare
   pinned user configuration plus a human-readable exact case/change packet.
   Do not start an operational Eval while preparing.
2. Design the external-host/Claude authoring completion port: durable request and
   response binding, actual provider evidence, unknown completion inspection and
   no duplicate invocation. Software fixtures may verify the protocol; no app
   command/authentication convention is guessed before the owner selects it.
3. Once resource use is coordinated with the separate36 trials and the owner
   authorizes new cases/budget, accept one Codex cycle in an isolated declared
   environment. Retain useful partial evidence and retry/exclude/reference
   decisions; do not optimize results by cherry-picking.
4. After exact change approval, accept reject/adopt/restore and a fresh continuing
   cycle against the selected owner. Use disposable targets before any actual
   owner. Verify actual instruction use, source/config pins and recovery evidence.
5. Accept selected-package/layer integration at the receiving boundary using the
   receiver's cases and approval. Do not invent transport or automatic sharing.
6. When the Claude environment is supplied, implement/bind its actual model and
   closure ports, then accept one/repeated cycles and restore under its real
   capabilities. Format-compatible temporary tests do not discharge this step.

The concurrent36 trials are a separate measurement activity. Their completion
neither authorizes new cases nor proves this framework's authenticated lifecycle.
Their source, processes, auth and fixed conditions must remain untouched.

Formal Verification Contract `instruction-loop-readiness-verification@1`:
- R-01: unsupported authoring/assessor kinds refuse before config publication;
  component/Full practical runtimes also refuse before lifecycle allocation when
  given hand-assembled definitions. The standard native configuration factory
  checks authoring and trial kinds; opaque custom command runtimes are excluded.
- R-02: component/Full practical/native standard factories preserve known Codex
  and fixture selection; omitted assessor remains host-AI recovery.
- R-03: readiness is deterministic, source/profile-bound and read-only for Codex
  and Claude-format profiles. Sentinel executables must never start, no trial or
  owner write occurs, no local profile contents leak to the summary.
- R-04: the helper is part of existing runtime source pins and existing CI owner;
  regression checks and static validation preserve old supported configuration.

Implementation contract `instruction-loop-readiness-implementation@1`: upstream
this audit and the parent preparation request; scope provider preflight, read-only
inspection, existing Skill guidance and model-free software regressions. Actual
commands/results and source revision accompany the handoff. No real Eval/app/
owner acceptance is claimed by these tests.
