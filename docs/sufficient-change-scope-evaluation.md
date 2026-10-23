# Sufficient change scope: a two-stage exercise

This optional artificial exercise tests a small decision boundary: completing a
shared business correction, preserving independently owned policies, and then
maintaining the resulting code when a new requirement arrives. It complements
the existing Skill effectiveness workflow. It does not add a benchmark task to
the admitted 24-task catalog, change historical results, or define a new score.

## Inputs and evidence boundaries

| Asset | Use |
| --- | --- |
| [Stage 1 request](fixtures/sufficient-change-scope/stage-1.md) | Initial agent task; includes business requirements and working boundaries |
| [Seed modules](fixtures/sufficient-change-scope/seed/) | Only the two initial JavaScript modules enter the candidate workspace |
| [Stage 2 request](fixtures/sufficient-change-scope/stage-2.md) | Withheld until Stage 1 completes; applied to that same candidate |
| `scripts/test-sufficient-change-scope.mjs` | External behavioral checks against the public API |
| `scripts/test-sufficient-change-scope-fixtures.mjs` | External positive and negative controls that calibrate those checks |
| This guide | Operator instructions and human review rubric; kept outside the candidate |

The requests deliberately state which entrances share a business invariant and
which policies have independent owners. This is a focused implementation and
maintenance exercise, not a test of discovering undocumented domain knowledge.
There is no prescribed helper, class, module layout, or number of files. Shared
mechanics are acceptable when they preserve each policy's independent meaning.

## Run the two stages

1. Create an isolated candidate directory and copy only the seed modules into
   it. Give the agent the Stage 1 request and the instruction set being
   evaluated. Keep Stage 2, this rubric, the external test code, and its control
   variants outside the candidate workspace and the agent's initial context.
2. Let the agent finish Stage 1. Before delivering Stage 2, retain the candidate
   artifact, its patch from the seed, the brief rationale, actual commands and
   results, and the external initial-stage check result. Store this evidence
   outside the candidate workspace. Record any failure at this point; later
   repairs do not turn it into an initial-stage success.
3. Deliver the Stage 2 request to the same candidate directory. Continue from
   the actual Stage 1 artifact, without resetting to the seed, replacing it with
   a reference answer, or revealing Stage 2 retroactively. The new party limit
   and retention change are new requirements, not missing Stage 1 obligations.
4. Retain the follow-up artifact, patch from Stage 1, reasoning, and actual
   checks. Run the follow-up checks and review both transitions using the rubric
   below. Record any operator intervention or departure from this sequence.

From the ASK repository root, check an operator-selected candidate with:

```sh
ASK_SCOPE_CANDIDATE_DIR=/absolute/path/to/artificial-candidate \
ASK_SCOPE_STAGE=initial \
node --test scripts/test-sufficient-change-scope.mjs
```

After Stage 2, use the same directory and `ASK_SCOPE_STAGE=follow-up`.
Both modes check public exports, exact results, rejection precedence, integer
boundaries, and input ownership. The follow-up also checks the new party limit
at both entrances, preserves the unlimited behavior when the limit is absent,
and checks the independently changed deletion policy while reminders stay the
same. These are sampled behavioral checks, not exhaustive correctness proofs.

The command imports and executes the selected candidate's JavaScript in the
invoking test process. The directory is a selector, not a security boundary.
Use it for operator-controlled code from this artificial exercise in an
appropriate execution environment. It is not a sandbox or a validator for
arbitrary repositories. The scripts do not certify the provenance of snapshots
or enforce that the operator withheld Stage 2.

## Human structural review

Keep this rubric outside the candidate workspace. For each area, record the
finding, code or execution evidence, and one of **acceptable**, **issue**, or
**insufficient evidence**. These are local review judgments, not new metrics or
classifications in the Skill effectiveness contract. Do not aggregate them into
a quality score.

| Area | Evidence to examine |
| --- | --- |
| Meaning and complete scope | Both reservation entrances enforce the same rule and preserve result meanings and precedence. Check the original cause, not only the reported online symptom. Use execution evidence for behavior and source evidence for the policy owner. |
| Same invariant and separate policies | Explain where reservation policy is owned and why the entrances will stay aligned. Verify that reminder and deletion policy can change independently. Similar syntax alone does not justify tying their business decisions together. |
| Necessary implementation | Each new abstraction, dependency, configuration option, state, or fallback has a present requirement or an observed maintenance reason. Flag speculative features and unnecessary indirection. Passing public behavior checks alone cannot establish this. |
| Burden removed or retained | Compare the seed with Stage 1. Identify concrete duplicate decisions, drift paths, or needless branching that disappeared, and new coordination or concepts introduced. State remaining debt honestly. A smaller diff or fewer lines, files, or helpers is not evidence of lower maintenance burden. |
| Follow-up maintenance | Examine the actual Stage 1 to Stage 2 patch and investigation record. Did the author find the business owner, update all affected entrances, preserve independent policy changes, and avoid new unnecessary machinery? Record actual observed correction or investigation effort; do not infer it from patch size. |

The automated checker intentionally does not inspect internal helper names,
imports, file counts, or design patterns. A duplicated implementation can pass
its behavior checks while still leaving a structural issue for human review.
Conversely, moving the policy to a small module can be appropriate without
receiving an automatic penalty for adding a file. Review the responsibilities
and the concrete maintenance evidence, rather than matching a reference design.

## Calibrate the checks and interpret results

Run the controls from the repository root:

```sh
node --test scripts/test-sufficient-change-scope-fixtures.mjs
```

The controls prove that the checker accepts two different internal arrangements
and detects the seed defects, a correction confined to one entrance, an invalid
merger of reminder and deletion policies, a follow-up entrance left behind, a
rejection-priority regression, and a reminder regression. A control also checks
one temporary candidate before and after an artificial follow-up update. The
controls are authored code, not agent-generated outputs or live model runs.

Passing this calibration establishes that these positive and negative controls
behave as expected. It does not establish that an instruction change improves
agent behavior, reduces real maintenance costs, or prevents every form of
overimplementation. An observed agent run adds evidence for that run; it is not
by itself a causal effectiveness result.

For an instruction comparison, use independent runs from the same seed with
the same model, tools, budget, and task wording; vary the instruction condition
explicitly. Apply the same withheld follow-up to each run's own first artifact,
and retain each initial result before the reveal. Repeat enough runs to expose
variation before making a comparative claim. Keep measured behavior and human
structural findings separate, with unknown effort or effect left unknown. Any
formal outcome record must use the existing
[Skill effectiveness contract](skill-effectiveness-evaluation-contract.md) and
its existing metric catalog; this exercise grants no benchmark admission or
new evaluation authority.
