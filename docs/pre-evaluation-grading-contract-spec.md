# Pre-evaluation grading contract refresh

The next candidate must survive a trusted grader/configuration repair without
replaying its closed authoring call, importing historical approval, editing its
request or admitting after-case effects. A practical profile can be reconfigured
only at its first evaluation gate, with no pending work or evaluation decision,
no trials, and exactly generate/register/select outputs. The old journal remains
immutable. A new v2 retained origin names the successful source status, exact job,
candidate, request, response and local provider completion. Only task command
definitions and per-case graders may change; public inputs/criteria references,
policy, baseline, generator goal/source and eventual owner remain fixed.

The CLI `reconfigure-evaluation` allocates fresh source/state/Eval destinations
and performs no model dispatch. Normal `advance` validates and registers the
same retained response then selects a fresh packet. Every new case approval is
required; the source gate must remain unchanged while its retained origin is used.

The shared fixed grading response helper projects a full assessment schema onto
the five model-owned judgment fields. Host identity/weights/coverage are not model
outputs. The only compatibility repair is removal of coverage that is exactly
equal to host-fixed coverage. Raw replies and both digests/repair reasons remain;
all judgments, including corrections that lower score, are preserved. Unknown
metadata, conflicting coverage or malformed judgments remain failed/Unknown.
Agree and abstain carry null judgments; correct requires all five fields.

Verification: pre-case reuse; changed grader; no model/approval/old-journal write;
refuse after approval/trial/owner/pending work; refuse altered public input or
request; old v1 recovery compatibility; unchanged valid/partial/defect judgments;
exact coverage repair; wrong metadata; abstention; incomplete correction.
Host integration must additionally test source capture, root command evidence,
closure-Unknown/no-second-dispatch and bounded grading-only recovery. Do not run
new real-model trials or owner application to verify these mechanisms.

## Case reselection before the first evaluation

`reselect-evaluation` is a distinct, explicit preparation command. It accepts the
same root/profile/config/replacement-profile/output-root/id arguments as
`reconfigure-evaluation`. Only at an unapproved first evaluation gate may the
replacement additionally change `policy.catalog`, `selection`, and
`practical.cases`. Trial count/repetitions, authoring request, baseline, owner and
all other policy stay fixed. Commands/graders can be aligned with the new cases.
The old journal, packet, profile and candidate are never edited.

A v3 retained origin binds the original closed answer and both candidate source
and installed Full inventories. Normal advance rematerializes the exact retained
answer without a model call and refuses differing source or Full contents before
registration. The materialized Git tree must equal the original candidate tree;
only then is its original commit retained in the fresh checkout. This preserves
installer provenance as well as all source and Full bytes. The fresh selection packet needs a new human approval. Case selection
is not an approval to execute Eval or to apply the candidate. Existing v1/v2
recovery and command-only refresh remain unchanged.
