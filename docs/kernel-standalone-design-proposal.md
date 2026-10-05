# Standalone Kernel: separate design proposal

Design `DES-KERNEL-STANDALONE-1`, revision 2, 2026-10-05.
Status: proposal only, not adopted, no implementation or measurement permission.
Upstream: `DES-MAC-ASK-VALUE-1` revision 2; `IMP-318-QUAL-1` revision 1.
The user selected a separate design/approval plan, not a change to current K.

## Problem and source facts

Current canonical AGENTS section 8 routes non-trivial review to `skill-router`.
That router selects `review-router`, which requires `review-ai-quality` and any
signal-dependent gates. Zero Skills cannot satisfy this route. This is an
admission blocker, not an observed model failure or negative Kernel effect.
Existing adoption `kernel-only` selects all 47 manifest Skills without an
adapter; it is not the zero-Skill evaluation condition. No current standalone
zero-Skill implementation was found. Historical canonical-only benchmark rules
and measured outcomes remain unchanged and cannot supply current admission.

## Options and recommendation

| Option | What it measures | Consequence |
| --- | --- | --- |
| Preserve current canonical-only K | Current contract availability | Keep value comparison blocked; do not convert missing capability into a quality score |
| Supply minimal review Skills to K | Small review package versus Full | Changes K treatment; does not isolate Kernel alone; requires a renamed condition and new plan |
| Task-independent standalone Kernel, shared by K and Full | Base Kernel increment and added package increment | Recommended separate product design; freeze and approve a new shared Kernel/product revision before comparison |

A K-only standalone overlay while Full retains the old Kernel would confound
F−K with two different Kernel definitions. It is not the recommended design.

## Concrete proposed product boundary

Proposed product name: **ASK Core Bundle**, not existing adoption `kernel-only`.
Future comparison label: **K-core**, not current canonical-only K. The proposal
is zero Skills but includes AGENTS plus immutable mandatory core contracts and
pure contract helpers. It is not a single-file product. These names deliberately
prevent old installers, historical observations or current capability gates from
being silently reinterpreted.

The reviewable entry text is [the instruction draft](kernel-standalone-instruction-draft.md).
It is documentation only, outside active instruction/Skill/installer paths.
Source baseline is `c278ce96fdde6c122e1376be419cf5a0d29bb361` (canonical
AGENTS, existing contracts and Skills). No current product bytes are replaced.

### Core contract seed inventory

The proposed base includes these existing assets unchanged in meaning. Final
packaging must resolve every mandatory transitive dependency, not only this seed
list. Examples/historical locators are classified separately and must not become
new instructions. Missing closure blocks implementation admission; this design
does not claim an executable distribution already exists.

| Core responsibility | Candidate paths retained in the base |
| --- | --- |
| Claim statuses, ledger activation, legacy normalization | `docs/claim-evidence-status-contract.md`, `schemas/claim-evidence-status.schema.json`, `scripts/claim-evidence-status.mjs` |
| Proof-path selection and absorbing formal history | `docs/verification-proof-policy-contract.md`, `schemas/verification-proof-policy.schema.json`, `scripts/verification-proof-policy.mjs` |
| Artifact ownership, references, delta/conflict and claim trace | `docs/lifecycle-artifact-contract.md`, `docs/lifecycle-traceability-contract.md` |
| Bounded continuation | `docs/agent-session-state-contract.md` |
| Control authority and unmanaged compatibility | `docs/execution-envelope-contract.md`, `schemas/execution-envelope.schema.json`, `schemas/execution-envelope-record.schema.json`, `scripts/execution-envelope.mjs` |
| Review signals, finding fields and impact order | `schemas/review-signal-gate-map.json`, `docs/review-finding-contract.md`, `schemas/review-finding.schema.json` |

These are 16 existing seed paths plus the proposed entry. Pure helpers do not
become an adapter/runner and do not grant execution, provenance, isolation or
sidecar authority. Additional validators/helpers required by their imports or
contract semantics must be in the final frozen closure. No Skill may appear in
that closure; if a dependency cannot be moved to a core-owned contract without
changing meaning, it remains a named unresolved design decision.

### Canonical rule → base → Full mapping

“Retain” includes all subrules in the named source section. “Move” changes
procedure ownership, not removal of an obligation. No safety, evidence or proof
requirement is proposed for deletion. The current mandatory *invocation*
requirements do change prospectively; that is the explicit adoption decision.

| Current canonical source | Proposed base instruction/contract | Full addition and rationale |
| --- | --- | --- |
| Operating intent, all six duties | Operating intent; retain all duties | More procedural assets, no weaker baseline |
| §0 classes and lightest workflow | Same seven task classes; distinguish operating layer directly | Operating-mode router and delivery router add packaged selection; remove mandatory invocation for ordinary core tasks so zero-Skill work has a real route |
| §0 adoption/effectiveness/metrics/reporting mode-router-first | Classify the layer, stop when requested operation requires absent extension | Existing adoption/observability/operation Skills supply those procedures; no pretend benchmark/reporting capability |
| §1 five statuses, unsupported claims, missing evidence | Evidence section plus unchanged claim contract/schema | Specialized claim processing cannot upgrade truth strength |
| §2 all minimum context and observed conventions | Evidence and context; retain complete inspection set | Project/framework assets supplement relevant context |
| §3 six prohibited scope expansions, broader issue reporting | Scope section; retain all | No Full license for cleanup outside scope |
| §4 approval-required actions and four uncertainty fields | Core authorization check retains every listed action/field | `risk-gate` remains mandatory for every covered action, and when additionally required by task/profile or exact review signal; managed approval enforcement stays runner-owned |
| §5 defaults and observed abstraction justification | Scope section; retain all | Stack overlays add constraints, not architectural permission |
| §6 focused question/reversible assumption/final disclosure | Assumptions section; retain all | Requirement/domain Skills add structured elicitation; cannot settle human-owned decisions |
| §7 policy, closed compact facts, formal triggers/history, check types and unavailable-check disclosure | Verification section plus unchanged bundled policy/schema/selector and lifecycle contracts | Test-first/controlled implementation add procedure; no downgrade, missing-proof waiver or invented result |
| §7.5 applicability, no trivial-state burden, not proof | Continuity section plus unchanged bounded session contract | Handoff tooling may store/refer state; no global state requirement |
| §8 trivial stays Kernel, explicit relevant Skill honored | Core task procedures; explicit installed extension honored | Skill route available in Full; missing explicit required extension remains capability_missing |
| §8 mandatory routers for non-trivial delivery/design/investigation/review/handoff | Replace mandatory invocation with written generic core procedures; move baseline/router semantics into core contract | Full adds richer procedures, including controlled implementation, test-first, requirement/spec/work-package and handoff generation; same core entry remains always-on |
| §8 vague business/durable-domain routing | Core design exposes human decisions and bounded acceptance; required specialized judgments stop if absent | Requirement-grill/work-package/domain-ledger procedures remain extensions, not replicated expertise |
| §8 generic-first project/stack overlays, no load-all | Core before relevant available extension; overlays supplement, never replace; smallest relevant context | Full must update routers to consume core classification and avoid duplicate baseline; install-all is not activate-all |
| §8 risk-gate before covered action | Core approval boundary always applies; required risk-gate absent stops dependent action | Full supplies risk-gate plus unchanged managed enforcement when available; no simulated Skill success |
| §9 all nine shortcuts, proportionate evidence | Final draft paragraph and verification; retain all | Full changes no evidentiary standard |
| §10 inline evidence/formal-ledger trigger | Move evidence-ledger procedure into core Evidence section; canonical closed triggers unchanged | Existing Skill becomes a projection/optional invocation of one core obligation, not a second ledger |
| §10 implementation fields/evidence results | Outputs plus unchanged artifact ownership/trace | Full outputs the same fields/reference-plus-delta contract |
| §10 envelope transport/single control authority | Outputs plus unchanged envelope contracts/schemas | Runner remains optional infrastructure; no inline-to-sidecar upgrade or authority inferred from prose |
| §10 mandatory baseline review result | Move `review-ai-quality` baseline procedure to core; same logical gate and result contract, explicitly no physical Skill invocation claim | Full consumes the same one logical baseline; review Skills must project it and avoid a second competing result |
| §10 exact-signal additional gates, missing evidence and findings | Retain canonical map, closed four-field missing records, exact findings and deterministic order | Required specialized gate remains required; absent gate blocks its judgment even when core baseline finishes |
| §10 requested-only final Decision, inventory presentation | Retain final-gate ownership; absent final-merge Skill blocks requested final decision | Full supplies final gate, never auto-merges; no skipped-heavy boilerplate |
| §10 handoff seven fields | Core handoff output and bounded state contract | Full adds packaged handoff procedure; no extra permission |

Baseline procedure sources are `skills/review-ai-quality/SKILL.md` and
`skills/review-router/SKILL.md`; formal ledger procedure source is
`skills/evidence-ledger/SKILL.md`. Selective reuse is documented here and in the
draft. This task does not copy/reclassify any #313 experiment record or runner.
No dependency is quietly deleted: generic router/baseline/ledger invocation is
re-expressed as core-owned procedure; domain/architecture/output/adversarial/
code-health/automated/risk/ADR/release/final-merge procedures remain extensions.

### Compatibility and unresolved admission work

Moving a logical baseline from selected Skill to core-owned capability requires
an explicit new product capability revision. Existing selected_skills-only
validators, route projection and missing-capability checks do not already admit
it. A future implementation must represent core capabilities separately, reject
unknown capability IDs and prove Full consumes exactly one current baseline.
Do not add the Skill to K, spoof selected_skills, or relax current validators.
A future core-owned ledger likewise needs one source and compatible Full
projections. This proposal changes no existing map, schema, validator or installer.

Preserving exact required specialized gates means **zero Skills does not promise
an unblocked complete review of every target**. If an ordinary target has output,
architecture, automated-evidence or other mapped signals, K-core may complete its
baseline but cannot complete dependent specialized/final judgments. The current
evaluation task has not been admitted under this proposal. Moving additional
gates into the base would be a further product design decision, not a fixture
exception. The user can adopt a useful baseline product without claiming this
resolves three-arm effectiveness measurement; retain that distinction.

Full after adoption must be a real installer projection of the same new product
revision: byte-identical core entry/contracts/capability definitions plus its
normal complete extension package, truthful install state and compatible
projections. Keep the current frozen Full candidate unchanged as history. An
old Full combined with a new K overlay is prohibited by the proposed comparison.

## Model-free feasibility inspection plan

Before implementation admission, inspect multiple generic task classes, not the
evaluation fixture or its grader: localized text edit; code bug/regression;
ambiguous design/domain decision; unknown-cause investigation; ordinary semantic
review with no specialized signals; review with an output/security/automated
signal; handoff/interruption; authorized and unauthorized external action.
For each record applicable core obligation, selected proof path, extension need,
expected stop/control transport and remaining judgment. Include missing target,
missing check, conflicting upstream proof and absent explicitly requested Skill.

1. Freeze draft/core seeds by source revision/digest; classify every file/import/
   schema/contract reference as mandatory, optional extension or historical/example.
   Resolve mandatory transitive closure with no Skills, dangling paths or implicit
   global installations. Pure-import smoke tests must run without launching CLI,
   model, credential access or network; unsupported execution semantics stay unknown.
2. Test closed proof/status/finding/missing-evidence schemas and formal absorbing
   history with existing model-free fixtures. Verify moved procedures preserve
   exact rule semantics rather than only matching section labels.
3. Test new core capability representation and optional-extension routing on the
   generic cases above. Missing specialized/managed capability must stop before
   dependent action; an absent specialized result must never become overall pass.
4. Compare future actual installer K-core/Full inventories and digests: identical
   core, zero K Skills, complete Full, common task inputs separate from graders.
   Replay must require no new model calls; preserve old records and candidate IDs.
5. Obtain independent task-agnostic design/implementation review. Publish static,
   synthetic, host-smoke and actual model/OS evidence as distinct categories.

Current work only checks draft/source availability and repository consistency;
this plan is not a claim that steps 1–5 or a runnable Core Bundle have passed.
Static inspection can establish dependency/rule coverage, not actual model
compliance, quality, latency, token usage, OS verification or effectiveness.

## Adoption decisions and later execution boundaries

The concrete adoption decision has three parts:

1. Adopt **ASK Core Bundle** as a zero-Skill *bundle*, including immutable core
   contracts/helpers, shared byte-identically by future K-core and Full; do not
   reinterpret existing product `kernel-only` or historical K.
2. Approve the draft's ownership moves (generic task routing, baseline review and
   formal ledger) and corresponding future core-capability/Full-projection
   revision, while retaining strict proof, approval and specialized-gate rules.
3. Accept that specialized/final judgments can still block K-core, or request a
   separate task-independent proposal to move specified additional responsibilities
   into the core. Do not waive them just to make an evaluation fixture runnable.

Approval would authorize a bounded implementation/freeze plan, not model runs,
merge/deployment or adoption into an end-user repository. Instruction text and
bundle closure must pass independent review before a new product revision is
applied. New three-arm protocol, human/evaluator/runtime admission, budgets and
fresh explicit execution permission remain necessary for real comparison.
K-core−P and Full−K-core identify the new treatments only; never pool old K
results or claim old frozen Full was measured. Current K remains blocked,
current synthetic driver and frozen public reference qualification are unchanged.
