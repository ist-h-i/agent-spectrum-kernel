# Minimal prospective runtime route for the primary comparison

Artifact SPEC-P24-RUNTIME-PREFLIGHT, upstream #379 and PR420. This follows the
instruction to advance public input/runtime preparation without a model start,
security setting change or historical regrading. It does not lift PR420's gates.

## Boundary decision

The source installer already owns Full's selected Skill set. Router availability
needs that set, not authentication, target identity, rollback history, previous
installation state or local configuration. Export a deterministic allowlist from
the existing source-owned Full projection plus verified public skill bytes.
Do not parse/copy an installation state or serialize a plan/config wholesale.
This is a **source-configured selection proposal**, not observed effective runtime
configuration. Full's current router still consumes install-state; that consumer
must be connected under an explicit future version with independent source pins.
No consumer, model input file, adapter setting or route authorization is added here.

`derivePreparedPrimaryPublicCapabilities(plan)` reuses the closed input preparer's
source/path/byte/mode validation, then returns a public document and separate
opaque input-contract binding. The document contains only Codex/full identity,
source projection fingerprint, sorted source-selected Skills and pinned public
Skill entry files. It contains no host/root path, installer identity, environment,
credential, provider, management file, installed/stale Skill or claimed permission.
Runtime selection remains unobserved; routing/execution/scoring authority false.
The document's bytes are identical across the three requested model settings;
the separate binding may differ. Only Full receives such a future input; P/K
must not receive Full's Skill inventory. Current starts remain blocked.

## Required observations, normal implementation and human decisions

| Hold | Required observation / accepted fact | Normal implementation and artificial proof | Human decision |
|---|---|---|---|
| Startup input closure | Actual initial instruction, Skill/plugin/tool metadata and any later discovered input must be within independently pinned public inputs; managed safety instructions remain effective | Bind startup source inventory/absence and discovery mechanism before dispatch; an empty project-doc limit or prompt is insufficient; unknown input blocks all conditions equally | No new approval for static source work. A change to managed/user security configuration is outside scope and must not be used as an implicit fix |
| Native cwd | Native command start/end must retain actual command cwd, exact command bytes, stable IDs and exit/termination | Current CLI exec JSON has no cwd. A supported app-server source contains cwd, but needs a version-pinned adapter to the existing lifecycle/receipt path, including unknown/late/mismatched/failed event negatives; controller cwd or agent prose never substitutes | A future process-only compatibility probe may need a new outer execution approval; the previously consumed high3 exception is not reusable |
| New scoring connection | Genuine runtime/input/candidate lineage, same processing version for P/K/F, genuine source/review/admission | New explicit processing/schema/source graph/resource bindings must admit only declared per-condition inputs; keep V8/V9 and old results untouched; synthetic captures cannot qualify runtime | Ordinary local implementation/review/admission needs no extra human approval. Starting models remains held by the parent |
| Full management dependency | Source-selected Skills match the public immutable Skill entry pins; actual runtime closure is separate | Export the public source selection now. Future router consumer must use the independently declared projection, reject absent/changed/conflicting evidence, and preserve missing-capability stops; never infer from directory presence or raw user fields | No need to disclose management state or change authentication. Definition/equivalence is a reviewed version contract; it is not silently declared satisfied here |

## Installed CLI and the smallest prospective path

Static local metadata identifies CLI package0.162.1 and its existing JS launcher;
no CLI process was invoked. The matching official rust-v0.162.1 source confirms:

- [exec event item](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/exec/src/exec_events.rs)
  (blob06565c097b28d3bf2ad592943cc30c776b45e236) does not retain cwd.
- [app-server item](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts)
  (blob1f132df8daf86a68640e5533bfbd52819bd85bed) does retain cwd.
- [global instruction provider](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/codex-home/src/instructions/mod.rs)
  and [project instruction loader](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core/src/agents_md.rs)
  are separate. Project byte limits alone do not establish global input closure.
- [config read params](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-protocol/schema/typescript/v2/ConfigReadParams.ts)
  and [Skill list params](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-protocol/schema/typescript/v2/SkillsListParams.ts)
  support cwd-scoped readbacks. Their results are discovery observations, not
  proof of every loaded prompt/input. Never persist raw config layers/host Skill
  text as task input or claim absence merely from a list response.

These source contracts are not a compatibility observation from the installed
binary. Replacing the native binary, overriding base/developer safety instructions,
copying auth, changing CODEX_HOME, or disabling managed policy is not a shortcut.
The app-server option is a candidate transport inside the existing runner, not
permission to add a parallel manager or start it now. If exact installed runtime
cannot provide closed startup evidence while retaining managed policy, report
unsupported and obtain a separate design decision before any model spend.

Before any model starts: (1) finish/pin the source-only Full projection consumer;
(2) qualify a source-bound transport with startup and native cwd evidence using
artificial events; (3) connect a new scoring version and genuine reviewed resource
admission; (4) only then consider one fresh non-model runtime compatibility probe,
with explicit output/stop conditions and any required outer approval; (5) fix the
requested model/effort/runtime/usage identity and register fresh common-task slots.
Do not request a model run or reuse high3 output while these conditions are unmet.

## Formal verification contract

VERIFICATION-P24-PUBLIC-CAPABILITY-PROPOSAL:

- C1: derive exact Full source selection and public Skill byte/mode pins; no directory inference.
- C2: deterministic document across model settings; binding separate; no secret/host/state fields copied.
- C3: source/hash/mode/path forgery or unselected contract refused before any output/dispatch.
- C4: proposal flags or supplied events cannot lift existing launch/scoring guards; runtime remains unknown.

Tests use ordinary temporary public preparation and artificial extra fields only.
No model/CLI/native qualifier/private grader, config read, session read or auth
read is executed. Final independent review and CI remain separate from runtime
acceptance. Client/focused/performance native3 and21ready/3blocked are unchanged.
