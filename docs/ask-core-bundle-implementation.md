# ASK Core Bundle implementation

IMP-318-CORE-1 / FVC-318-CORE-1, revision 1. Upstream:
DES-KERNEL-STANDALONE-1 revision 2 at fb32ac6f, adopted for implementation by the
user on 2026-10-05. This is a new opt-in product; default legacy installers,
canonical-only K, #291/#313 and saved experiments remain unchanged.

Proof: formal_verification_contract. Triggers: public_api_schema_or_compatibility,
state_concurrency_persistence_lifecycle_or_cross_module, multi_session_multi_agent_or_handoff,
merge_release_or_stable_trace. No compact downgrade.

| Obligation | Evidence required |
| --- | --- |
| O1 | Approved instruction body, core contract ownership, exact mandatory dependency closure and classified optional/example edges; zero Skills in core. |
| O2 | New-root installer only; shared exact core in core and Full; Full retains all normal manifest Skills/prompts/command and supplement. |
| O3 | Closed core capabilities separate from selected_skills; unknown signals/capabilities refuse, mandatory specialization/risk/final gates absent stop admission. |
| O4 | One logical core baseline and ledger; Full projections consume the same obligation; legacy managed runner cannot mistake new state for old admission. |
| O5 | Frozen source/projected inventories, independent caller digest, read-only audit/replay, no model/executor/grant; tamper/links/extra paths/stale authority refuse. |
| O6 | New comparison identity, common inputs/prompt/runtime/accounting/retries; capability blockage never becomes a score; original reference/old protocols preserved. |
| O7 | Model-free focused/negative and old comparison regressions; independent review, generated freshness, repository validation and exact-head CI. |

Native/model execution remains unadmitted. A model-free profile checks structural
capability/output contracts only, never actual model compliance or managed
isolation/promotion. Mac/Ubuntu static CI cannot verify Windows/WSL or real
three-arm effectiveness. Completion receipts will bind the submitted head.

## Product and reuse boundary

`products/ask-core-bundle/AGENTS.md` is the opt-in instruction source for
`ask-core-bundle@1.0.0`. Both profiles install its exact bytes as AGENTS.md and
CUSTOM_INSTRUCTIONS.md. Core capabilities are a closed separate inventory,
not pretend selected Skills. Core installs 34 assets and its new state file,
with no Skill directory. Full installs 203 assets and its new state file,
retaining all 47 Skills, 5 prompts and 1 command from the actual existing Node
installers plus all 40 previously bounded Full supplement assets.

The generated manifest pins raw source bytes, projected bytes, version, complete
literal builder/import chain and core contract/schema reference edges. Mandatory
imports and schema references must be included. Only three exact document/example
references are explicitly classified as deferred: aggregate epic admission,
lifecycle worked examples, and optional observability ledger documentation.
Classification does not authorize the deferred operation. Unknown references fail.
Computed I/O and future agent behavior remain unverified.

Selective reuse: #314's separation of task inputs, scoring/control and saved
results is retained in the legacy pilot/controller; this product does not add
a replacement real model adapter. Existing Full selection and renderers are
reused from the frozen inventory at `docs/mac-ask-full-static-inventory.json`
and the #320 supplement at `docs/mac-ask-full-reference-supplement.json`.
The generator checks both original digests and all source pins before using
the Node installers. No #313 branch is merged or cherry-picked. Existing
AGENTS.md, CUSTOM_INSTRUCTIONS.md, Skill sources, installer defaults, measured
records, old K, old Full inventories and original evaluator reference remain
unchanged. #291's 14 pairs/28 trials and all acceptance criteria are unchanged.

## Full projections and runner contract

Only files in a newly created Full candidate are projected. Skill instruction
references to legacy adapter state point to the new core-bundle-state instead.
The review-ai-quality and evidence-ledger Skill entries consume the one current
core-owned obligation/result for the exact target; review-router consumes that
same baseline. An explicitly requested Skill is checked for availability under
an `extension:*` provider and cannot overwrite the common core provider. This
is logical obligation ownership, not proof of physical Skill invocation counts.

Legacy install-state and codex-install-state in the NEW candidate contain
explicit superseded/non-native markers. Legacy managed runners and strict
Stage B admission cannot interpret the new product as their old accepted
installation. The new runner contract validates closed structured review output
and inline envelope/provider binding only. Findings, exact signal gates, missing
evidence and final-decision matrix retain their canonical contracts. Core does
not perform a missing specialized, risk or final-merge gate. Real/native launch
is expressly refused; managed sidecar/discovery/isolation/promotion conformance
requires a separate adapter and admission. No runner flags are relaxed.

## Model-free commands

Run from this source checkout with Node 24.x. Target roots must be NEW absolute
canonical paths outside the source checkout, in an existing canonical parent.
The installer creates owner-private roots; it never changes permissions on an
existing root. POSIX ownership/mode checks are bounded local checks, not proof
of ACL, model isolation or Windows storage behavior. No dependencies, Codex or
authentication are installed or read. The Full builder starts only the fixed
existing Node installers with empty PATH.

```sh
node scripts/generate-ask-core-bundle.mjs --check
node --test scripts/test-ask-core-bundle.mjs
node scripts/install-ask-core-bundle.mjs install /absolute/new-core core
node scripts/install-ask-core-bundle.mjs install /absolute/new-full full
node scripts/install-ask-core-bundle.mjs audit /absolute/new-core 'sha256:<state-digest-returned-by-install>'
node scripts/ask-local-core-comparison.mjs prepare /absolute/new-comparison '{"task_class":"review","signals":[]}'
node scripts/ask-local-core-comparison.mjs replay /absolute/new-comparison 'sha256:<plan-digest-returned-by-prepare>'
```

Record the returned digest independently. Audit/replay require that external
digest and perform read-only exact source, file, directory, link and closed
state checks. A missing/mismatched digest, stale source, altered state or assets,
extra empty directory, symlink/hardlink or source/comparison overlap refuses
replay. A failed partial preparation is preserved; there is no hidden retry.
Only tests/generation remove their own newly created model-free temporary roots.

## New comparison definition and unverified admission

The new model-free protocol is distinct from the old canonical-only K protocol.
It prepares plain / shared-core / Full with exactly the same 13 existing public
task input files, and exact common core assets between core and Full. Controller
records, grading materials and frozen evaluator source stay outside task roots.
No private grader is read or copied. The original evaluator-reference bytes are
preserved. The six balanced condition orders and common runtime policy are
frozen: gpt-6.1-sol / medium, 120 seconds per trial, 50,000 tokens per trial and
150,000 cumulative, input plus output including cached tokens, post-trial limit
judgment (overshoot possible), zero retries. These are a NEW proposed policy,
not reuse of an old execution grant or budget. No trial executes in this slice.

Task/signal classification supplied by a caller is explicitly unverified. A
structurally available route does not admit the actual task. The saved plan
always blocks actual execution for missing trusted task/signal classification,
independent private evaluator admission, native runtime denies/discovery, and
fresh execution authorization. Missing mandatory core extensions add an explicit
capability_missing admission reason. Semantic scores are null and measured
comparison validity is false in all cases. Full carries available specialized
Skills but their actual execution/evidence is also unknown.

The official-document-backed route decision remains in
[local-eval-distribution.md](local-eval-distribution.md): Node/POSIX shared core,
macOS and glibc Ubuntu targets, Windows entry through already-installed WSL2,
native Windows outside the current entry, Docker optional future work. This
new product adds no Docker, VM, installation or permission-changing fallback.

| Route | Evidence this slice can establish | Still unverified |
| --- | --- | --- |
| Current Mac arm64, Node 24.19.0 | Actual local Node installer/import/audit/replay and negative tests | Real new-product Codex run, effectiveness, clean-user distribution |
| macOS 15 CI | Model-free install/output/replay contracts | Actual CLI/model/isolation; x64 host coverage |
| Ubuntu 24.04 CI | Same model-free contracts on the CI host | Linux real CLI/model; arm64 and Ubuntu 22.04 hosts |
| Windows WSL2 | Planned Linux-route entry only | Actual WSL host/setup/storage/termination and real pair/reopen |
| Native Windows / Docker | No new entry or implementation | Separate boundary design/admission |

Next acceptance evidence: independently admit an actual task and its exact
required signal gates; freeze an independent evaluator and a native adapter
with discovery/deny, timeout, usage, identity and offline result semantics;
obtain a fresh bounded execution grant; then run and reopen a new three-arm
comparison and actual clean-user Mac/Linux/WSL route checks. A static pass or
#314's two pilot trials does not establish ASK superiority or three-OS support.

## Verification record

E-CORE-1: `node --test scripts/test-ask-core-bundle.mjs`: 12/12 passed locally;
O1–O6 covered by real Node installation, installed pure helper import, negative
reference/state/replay tests and structured output/provider conformance.
The independent review found and the implementation fixed absolute-reference
rebasing, replay source-overlap omission and core provider replacement by an
explicit Full extension. None required model calls. O7 additionally requires
old regression tests, generated freshness, repository/runtime-bundle checks and
exact submitted-head CI; their publication receipt records the final results.
