# Mac Core Bundle native adapter preparation

IMP-318-NATIVE-1 / FVC-318-NATIVE-1 revision 1. Upstream: adopted
ask-core-bundle@1.0.0, PR #322 at e52ad82a; Issues #318/#315. User approved
adapter implementation and task/evaluator preparation on 2026-10-05, excluding
real CLI/canary/model launches, grants, auth/security changes, private host
publication and merge. New dedicated branch preserves all earlier definitions.

Proof is formal_verification_contract (public compatibility, cross-module state,
persistence and stable trace). O1: frozen Core/Full remain unchanged. O2: explicit
common three-arm native command/discovery/output/permission contracts, no launch
API. O3: closed synthetic observation and lifecycle, typed failure/unknown, stop
and retry0, no actual evidence/admission from synthetic success. O4: MN public
input/reference/source binding without private material; MP capability blockage
preserved. O5: fresh private model-free preparation, external digest and offline
read-only replay reject tampering. O6: tests, independent review, repository and
exact-head CI; no real runs or grants.

Independent result-blind task review selects mn-focused-regression-test as the
smallest candidate: ordinary implementation/verification, five original public
inputs, focused test change only, unchanged production/spec/package and actual
npm test evidence. A test pass alone is insufficient: existing scoring also
requires mixed-case regression detection, preserved prior coverage, scope and
trusted execution evidence. No scoring authority or private bundle is replaced.
The original public evaluator reference/input/source binding is checked under
its pinned revision ab2ce5fe and unchanged generic verifier; current source drift
must fail. Private evaluator bytes/independence and fresh human admission stay
unknown. No expected solution, mutation oracle or grading file is task input.

MP remains available for qualification, but its explicit final merge review and
specialized review gates are absent from zero-Skill Core. Do not weaken that task
or count capability_missing as an inferior score. MN is selected before any new
result; it remains an unadmitted candidate, not an effectiveness observation.

The adapter emits reviewable argv/environment/path contracts and inspects supplied
synthetic captures. It never spawns Codex, a canary, a shell or a grader; there is
no authority/grant creation or native launch command. Real observation authenticity,
CLI image, global/project instruction discovery, Full Skill discovery/read/use,
resolved permissions, auth reads/refresh/write-back, session capture and host
termination are not established by tests. All returned live_ready and measured
comparison validity remain false, actual model/CLI starts zero and scores null.

The intended Mac lane is arm64, Node 24.19.0 and Codex 0.157.1 candidate, pending
fresh image/runtime verification. All arms share model gpt-6.1-sol / medium,
strict config, tool network deny, zero transport/controller retry and common
instruction discovery limit. Unlike the old JSON pilot, project_doc_max_bytes
must not be zero: that would suppress the new common AGENTS. Full must discover
its actual local .agents/skills, while plain has no ASK assets. Global/user/ancestor
instructions and Skills remain an explicit contamination blocker until controlled
and observed. CLI defaults, requested configuration and synthetic receipts are
not observations of the host.

Proposed fresh screening block only: one separately authorized preflight/canary,
then plain/core/Full one trial each in a balanced order. Startup120s, task120s,
absolute240s, drain2s per trial; input+output including cached tokens, 50k/trial,
150k/block, post-trial stopping with possible overshoot, retry0. Canary time/token
budget, actual image/source/plan digests, independent evaluator/human authority,
private roots/protected copies, discovery probes, auth/network/session auxiliary
communication and trusted capture receiver require a separate exact result-blind
plan and fresh execution approval. Previous spent grants cannot be reused.
No real entry is enabled by this implementation. Linux/WSL actual hosts follow.

Official references reviewed 2026-10-05:
[configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
[CLI](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
[AGENTS discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[Skills](https://learn.chatgpt.com/docs/build-skills).
These describe requested interfaces, not admission of the pinned local image.

## Model-free commands and limitations

Use a new absolute destination outside all controller checkouts and old records;
its parent must already be canonical. The CLI offers only `prepare` and `replay`:

```sh
node scripts/ask-core-native-preparation.mjs prepare /tmp/NEW-OWNED-DESTINATION
node scripts/ask-core-native-preparation.mjs replay /tmp/NEW-OWNED-DESTINATION sha256:EXTERNAL-PLAN-DIGEST
```

The preparation output supplies the external digest; keep that digest independently.
An optional JSON third argument may select `task`, balanced `orderIndex` (0–5),
and an existing public-only `frozenSourceRoot`. This does not create execution
permission. No command named run exists. Placeholder image/auth/runtime/tool paths
are deliberately uninspected and must never be treated as runnable host bindings.
Preparation actually installs frozen Core/Full with Node and copies only original
public inputs; replay reads the preparation inventory, not any measured result.
The task delta helper verifies supplied scope only, never regression semantics.
Actual task execution, reliable capture receiver, discovery receipts, evaluator
execution and persisted measured-result grading/replay are subsequent work.

The capture parser checks a supplied session identity separately from its turn
identity, so reusing a session with a different turn stops the synthetic block.
Known token sums are lower bounds when another capture has unknown usage; such a
capture stops subsequent slots, rather than treating unknown as zero. Successful
synthetic capture inspection always retains null scores and unknown authenticity.
Literal import pins bind the helper source chain; they do not establish every
computed runtime dependency or actual executable/tool identity.

Reuse is selective: the pure usage parser and pure event-clock budget from the
existing local pilot path, the original input-closure/public source verifier,
and the #322 frozen installers. No #313 branch or old grant/evidence is copied.
The user chose a separately designed and approved standalone Kernel definition
for a future comparison; the old canonical Kernel with absent required Skills
remains capability-blocked. This new opt-in Core Bundle is a distinct definition.

| Boundary | Current evidence | Unmet evidence |
|---|---|---|
| Mac Node preparation/replay | Actual model-free install/audit and synthetic tests | Native CLI/image/discovery/auth/termination |
| Linux Node preparation/replay | Planned CI synthetic lane | Actual native host comparison |
| Windows native / WSL | Deferred real-host lane under existing distribution design | Both native and WSL actual checks |
| MN original public evaluator | Pinned public source/input verification | Private bundle independence, fresh human admission and trusted execution |
| Engineering value | No scores, no new trials | Separately authorized screening; formal #291 remains 14 pairs / 28 trials |

Verification records: focused native preparation suite 13/13 after the independent
session-reuse finding was fixed; existing Core suite is retained. Repository checks,
final commit and exact-head CI are recorded in the Draft PR. O1–O6 concern this
model-free contract slice; actual native and engineering-value judgments stay Unknown.
