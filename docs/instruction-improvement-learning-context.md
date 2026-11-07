# Bounded context for the next improvement

Artifact `instruction-improvement-learning-context-spec@1`, supplementing
`instruction-improvement-continuity-spec@2`. The extra independent review found
two gaps in the original connected implementation: authoring saw only editable
Markdown and helper inventories, and continuation did not supply case-level
evaluation results. These gaps can hide an interaction with a fixed instruction
or an earlier regression from the next candidate generator. A local mechanical
cycle alone did not establish useful learning from the complete environment.

## Authoring reference context

`prepareInstructionEnvironmentAuthoring` includes `read_only_environment` in the
actual provider input. It comes from the verified declared environment and exact
Registry content, and includes component identities, source/target mappings,
fixed helper names/digests, known constraints and support-file identities. When
the component loop supplies its composition digest, the existing canonical
composition verifier rebuilds the lock at its original Registry snapshot before
the components are matched to the authoring environment. Layer labels do not
grant edit or override authority. Older authoring requests without a composition
digest remain importable; their layer labels are unavailable rather than guessed.

Fixed Markdown bodies and Markdown support such as `AGENTS.md` share a 32 KiB
UTF-8 text budget, with a 4 KiB maximum per file and an equal share across the
files. Small files are complete; large files have explicit `text_truncated` flags,
byte counts and exact full-content digests. Empty or truncated excerpts do not
mean the remainder is absent. The generator must narrow the edit or return a
no-op when the available context is insufficient. Editable text is already sent
in `editable` and is not duplicated in the read-only reference. Fixed helpers are
inventory only: their source is not inserted in the prompt or made editable.
Existing bounded component/file inventories still apply; the text budget is not
a claim that metadata consumes no tokens or that every large body is complete.

The complete serialized read-only context also has a 128 KiB budget. Safety,
permission and effect declarations use public bounded lists (16 values per list,
256 bytes per value, sharing 8 KiB), retaining total/redacted/omitted counts and
full inventory digests. Evidence/constraint reference arrays are counts and
digests only; they are not extra paths or evidence bodies sent to the model.
When the complete context is too large, it drops declaration display values,
then snippets, then file/mapping details, and finally layer/support/asset details
as needed. Exact environment/projection/composition and inventory digests and
total/omitted counts remain, with `context_incomplete`. This bounded projection
does not fail a consumed generation merely for having a large environment. It
does not certify that arbitrary instruction text is free of sensitive data.

These are local generation inputs under the existing model-call grant, not a
public export or a raw business-log collector. They never expand the declared
revision/addition/exclusion inventory. A response attempting to revise a fixed
component or helper is rejected by the existing import boundary.

## Case-level learning from the last completed cycle

The shared supervisor derives optional `previous.evaluation_summary` directly
from its completed report, binding it to `previous.report_digest`. Component,
Full practical and retained-reference/native continuations all use this boundary.
Old continuations without the new field remain valid. No earlier history or
approval becomes authorization for the fresh cycle.

Case labels retain the existing supervisor/native catalog character grammar
without a new per-label 100-character cap. Run IDs and practical-plan admission
keep their own existing contracts. A valid long case label remains unchanged if
it fits the aggregate summary budget; an oversized group is omitted with its
count and original report digest, rather than truncating an identity or blocking
preparation of the next cycle.

The projection contains case/repetition identifiers and condition-level selected
outcomes, attempt/exclusion/execution-failure counts, selected result digests and
known duration/input/output metrics. Missing metrics stay null. Retained reference
reports also retain per-case confirmed/unknown/unmet/maximum reference points;
their outcome is a conservative reference summary, never a formal score. Paired
outcome changes and duration differences remain per case. A changed outcome does
not establish causation or practical superiority. No quality pooling is added.

At most 32 case/repetition groups and 32 KiB of serialized summary are included.
Failures come first, then unknown/unselected cases, recovered or excluded cases,
and uneventful passes. Total and omitted case counts remain explicit. Up to 16
comparison limitations carry their digest and a bounded public summary; a private
or oversized value has a null summary and remains accessible only through the
original report evidence. Raw answers, transcripts, evidence payloads and arbitrary
recovery reason objects are not copied. All original attempts, decisions and
complete limits remain in the report; truncation never deletes them or changes
comparison selection. The projection is guidance for the AI's next proposal,
not an automatic score optimizer or a new human approval.

## Formal verification contract

Artifact `instruction-improvement-learning-context-verification@1`. Proof policy:
`ask.verification-proof-policy@1.0.0`, retaining the formal path for the existing
persisted cross-cycle flow and its independent-review findings.

| Obligation | Observable check |
| --- | --- |
| LCTX-01 | Both adapters expose verified fixed instruction/support text and exact layer metadata; forged canonical layers and revisions outside the editable inventory refuse. |
| LCTX-02 | Practical selected pass/fail, unknown/excluded attempts, per-case metrics and reference points survive the projection into the real next-cycle policy/generation observation. |
| LCTX-03 | Oversized UTF-8 text and many cases stay bounded with explicit truncation; private limits/raw answers are absent; nulls and report-digest binding survive; arbitrary fields refuse. |
| LCTX-04 | Existing requests/continuations, two fresh approval judgments, prepared-runtime pins, receiving flow, normal-owner apply/restore and uncertain-completion inspection retain their boundaries. |
| LCTX-05 | 99/100/101/256/1024-character case labels preserve identity; oversized groups respect the summary byte budget; a completed cycle with a 101-character label prepares a fresh cycle and still requires new case approval. |

Focused checks: `scripts/test-instruction-environment-authoring.mjs`,
`scripts/test-instruction-loop-feedback.mjs`, and the real two-cycle assertion in
`scripts/test-instruction-loop-operation.mjs`. Broader checks are the existing
focused feedback/practical/supervised/native suites, connected component/receiving/
operation/resume/normal-owner/CLI suites, composition regressions, repository
validation and independent review. Actual results, failed attempts and source
revision accompany the handoff. Neither these tests nor a successful CI run prove
real-model quality, real-user adoption, or authenticated Claude-app dispatch.

Implementation Contract:
- Artifact ID: `instruction-improvement-learning-context-implementation@1`.
- Upstream refs: this spec, the continuity spec, the two independent-review gaps.
- Change boundary: authoring input, shared continuation projection/validation,
  component provider guidance, corresponding regressions and documentation.
- Verification attempted: the commands above; exact observed outcomes are retained
  in the source-bound handoff and PR description.
- Evidence refs: test logs, commits and independent-review follow-up.
- Formal Verification Contract: `instruction-improvement-learning-context-verification@1`.
- Handoff: no merge until remaining CI and the parent independent review are
  complete; no live-model/real-owner acceptance claim.
