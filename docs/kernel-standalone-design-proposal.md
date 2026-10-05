# Standalone Kernel: separate design proposal

Design `DES-KERNEL-STANDALONE-1`, revision 1, 2026-10-05.
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

## Proposed product responsibilities, not agent instruction text

The new canonical Kernel must be self-contained for ordinary task execution and
review: repository/context inspection, bounded changes, evidence/unknown truth,
relevant verification, scope control, explicit authorization boundaries and
honest review output. Preserve the substance of every mandatory baseline rule.
A requirement-to-rule mapping must make every retained, re-expressed and moved
rule reviewable; removing a rule is a separate explicit product decision.

Do not add fixture-specific workflow, CI finding hints, expected review labels,
answer patterns, grader concepts, task class shortcuts or special prompt text.
Use a generic procedure for evidence inspection and review when no optional
Skills are selected. Its review must still distinguish missing evidence from
success and identify supported risks; it must not fabricate heavy-gate results.

Optional Skills add declared workflows only when available. Required specialized
capability stays an explicit blocker where the core cannot satisfy it; missing
capability never licenses procedure imitation or implicit fallback. Precisely
which responsibilities belong to the self-contained base versus a required
extension must be settled before writing final canonical instruction bytes.

The standalone base should be one versioned canonical product asset. Future K
uses its exact bytes with zero Skills. Future Full is the actual installer
projection of that same product revision plus its normal full package and
truthful install state. It must not receive an ad hoc evaluation-only Kernel.
Existing source candidate, old protocols, private results and original product
instructions remain historical identities; do not rewrite or reinterpret them.

## Admission and comparison impact

Before adoption: define the base/extension boundary, produce the rule mapping
and exact instruction draft, independently review zero-Skill routing across
ordinary review/implementation/investigation/handoff tasks, then obtain explicit
adoption approval. No special treatment of this benchmark task is allowed.

After approved implementation: freeze exact canonical bytes, installer assets,
K/Full inventories and capability contracts; prove common Kernel identity,
zero Skill inventory in K and full distribution closure. Obtain a new protocol
revision and fresh evaluator/human/runtime/budget admission. Task inputs, grader,
model, prompt and other common factors remain unchanged unless separately
approved. Native/model execution still requires fresh separate authorization.

K−P then estimates the new shared Kernel contribution; F−K estimates the added
package contribution for those conditions. It cannot be pooled with old
canonical-only K results as if the treatment were identical. A shared Kernel
revision also changes Full's product candidate, so the comparison must clearly
identify that new candidate rather than claim the old frozen Full was measured.

## Required adoption decision

Approve or revise the proposed **shared, task-independent, self-contained
canonical Kernel with optional declared extensions**, including the requirement
for a rule mapping and new shared K/Full product freeze. This design decision
would authorize the next detailed definition proposal only; final instruction
bytes, implementation, product adoption and real evaluation remain separate
review/approval boundaries. This document does not apply any definition.
