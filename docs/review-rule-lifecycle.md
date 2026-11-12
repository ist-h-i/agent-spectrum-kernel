# Project-local review rule lifecycle

A useful review finding can become a bounded prevention rule. This workflow
prepares that proposal for the existing supervised instruction loop; it does
not create a second approval, application, or version-management engine.
Ordinary reviews do not automatically write durable rules.

## Choose the smallest prevention mechanism

Keep current blockers in the current review. A one-off fix belongs in its task.
Mechanically detectable failures should normally become tests, lint, or checks,
not another instruction. Domain facts belong in the domain-rule workflow.
Use this helper for reusable **review guidance** that belongs in a selected
Skill's `SKILL.md` or `references/*.md` file. Prefer `SKILL.md` or an already
linked reference so the guidance is actually discoverable. It does not authorize arbitrary ledger edits,
project-wide activation, export, or changes to another team's instructions.

Reuse the fields in [review-rule-ledger-entry.schema.json](../schemas/review-rule-ledger-entry.schema.json).
Keep evidence strength, human authority, and lifecycle state separate. Human
approval does not turn `Supported` evidence into `Verified` evidence.

## Prepare a proposal

```sh
ask rules prepare --spec rule-spec.json --output rule-request.json
```

The specification contains:

| Field | Meaning |
| --- | --- |
| `action` | `add`, `update`, or `retire`. |
| `entry` | Existing review-rule ledger entry shape, with `authority_status: "not_asserted"`. Include stable ID, bounded trigger, rationale, blocker policy, suppression, false-positive risk, evidence, refresh trigger, and a responsible owner. |
| `target_root` | Absolute intended application root. It must match the loop's eventual `normal_target`. |
| `target_path` | Selected Skill entrypoint `skills/<name>/SKILL.md` or reference `skills/<name>/references/<file>.md`. |
| `promotion_basis` | `repeated`, `high_impact_single_case`, `owner_requested`, or `missing_invariant`. Explain the basis in the evidence, rather than treating the label as proof. |
| `validation` | `positive` and `negative` arrays. Each evidence item contains `evidence_digest`, a public `summary`, and `outcome: "pass"`. Positive cases exercise the intended trigger; negative cases verify suppression or non-applicability. |
| `reason` | Public explanation of the proposed action and why this is the narrowest useful prevention mechanism. |
| `previous_request` | Full prior request object for an update or retirement; not a substitute for a new human decision. |

Use reviewed, bounded public summaries and evidence digests. Do not embed raw
review transcripts, prompts, source dumps, customer information, credentials,
or personal data. Evidence declarations are host-supplied assertions: retaining
a digest does not itself prove the underlying test was executed successfully.

Preparation reads the target, computes an exact marked rule block and the
original/desired file hashes, and emits a request. It does not modify the target,
run a model, start evaluation, or record approval. Review the generated request
before using it.

### Complete specification example

Save the following as `rule-spec.json`. Before running it, replace the absolute
root with the intended application root and both example digests with digests
of your **actual, distinct** positive and negative evidence. The example values
illustrate the format; they are not evidence that these checks ran. Select
`review-code-health` in the loop configuration for this example.

```json
{
  "action": "add",
  "entry": {
    "id": "RR-0001",
    "finding_pattern": "Permission changes omit denial-case verification",
    "review_layer": "verification",
    "trigger_signal": "A role check or access-control branch changes",
    "why_it_matters": "Happy-path checks can miss unauthorized access",
    "current_pr_blocker_policy": "Require denial evidence when access semantics change",
    "suggested_prevention_target": "review checklist",
    "evidence_source": "Reviewed permission regression and contrasting documentation-only change",
    "evidence_status": "Supported",
    "authority_status": "not_asserted",
    "record_state": "active",
    "repeat_pattern": "high_impact_single_case",
    "false_positive_risk": "Flagging edits that do not change permission semantics",
    "suppression_rule": "Suppress for documentation-only changes without permission changes",
    "staleness_trigger": "Access model changes or an executable check covers the failure",
    "owner": "platform-team"
  },
  "target_root": "/absolute/path/application",
  "target_path": "skills/review-code-health/SKILL.md",
  "promotion_basis": "high_impact_single_case",
  "validation": {
    "positive": [{
      "evidence_digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      "summary": "Review detects omitted denial verification in a permission change",
      "outcome": "pass"
    }],
    "negative": [{
      "evidence_digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      "summary": "Review suppresses this guidance for a documentation-only change",
      "outcome": "pass"
    }]
  },
  "reason": "Preserve the verified review distinction until an executable permission check covers it"
}
```

For `update` or `retire`, include the previous request JSON as the value of
`previous_request`, not its filename. Keep the same rule identity and target.
For retirement the entry still describes the proposed rule with
`record_state: "active"`; the `retire` action requests its removal, and status
reports `deprecated` only after the matching approved application.

## Run the ordinary supervised loop

Use `request.observation` as the loop specification's `policy.observation`.
Select the Skill owning `target_path`, keep `normal_target` equal to
`target_root`, and retain the usual runtime, evaluation, and application
configuration. For npm workspace preparation, see
[npm distribution](npm-distribution.md#improvement-sharing-and-recovery).

The loop still pauses for two human decisions:

1. Approve or reject the selected evaluation cases.
2. Review the results and exact proposed change, then approve or reject adoption.

Generation, evaluation, reporting, approved application, version transitions,
and cleanup use the existing loop. Preparation is not permission to skip either
gate. Updating or retiring a rule is a new change with fresh decisions, not a
reuse of its original approval. The rejected candidate follows normal loop
cleanup; rejection is not permission to remove the currently active rule.

## Inspect the result

```sh
ask rules status --request rule-request.json --root /absolute/path/loop-root
```

Status reconciles the exact observation, target, completed human-approved
application, and the exact marked rule block in the target. Retirement checks
that this rule block is absent. Unrelated independently approved rules may
change in the same file without invalidating this rule;
`whole_file_matches_proposal` reports whole-file equality separately. A prepared request alone is not an
active rule. An unrelated loop, a changed rule block, an incomplete application, or
restoration must not be reported as successful activation. Successful retirement
means the requested rule block is removed through an approved application, not
merely marked retired in a registry while still present in the live file.

This is a point-in-time check. Recheck after target changes. Even an applied
rule has **unknown long-term effectiveness** until observations support a
claim. Track useful catches, repeat incidents, false positives, suppression,
and maintenance cost when relevant; no minimum observation period blocks
completion of the implementation itself. Revisit or retire guidance when its
refresh trigger fires, its assumptions change, or an executable check replaces
it.

## Review observed usefulness without changing the rule

```sh
ask rules review --request rule-request.json --observations rule-observations.json
```

Provide a host-reviewed observation object with these exact fields:

```json
{
  "request_digest": "sha256:<copy the request_digest from rule-request.json>",
  "evidence_digest": "sha256:<64 hexadecimal characters for the reviewed evidence>",
  "window": "2026-11-01 through 2026-11-30",
  "rule_firings": 8,
  "useful_catches": 2,
  "false_positives": 3,
  "suppressions": 1,
  "recurrences": 1,
  "maintenance_minutes": 15,
  "assumptions_changed": false,
  "executable_replacement": false
}
```

Replace the digest placeholders before use. All six counters accept a
nonnegative integer or `null` for unknown. Useful catches and false positives
cannot individually exceed known rule firings. Both flags must be booleans;
`window` is a bounded public summary. Observations belong to the exact request
version, not just its stable rule ID.

The read-only result recommends `consider_retirement` when an executable
replacement is reported, `refresh` when assumptions changed, false positives
outnumber useful catches, or a failure recurred, and `no_refresh_signal` when
none of these signals is present. Unknown counts do not mean zero, and
`no_refresh_signal` is not a claim of effectiveness. This command neither
scrapes telemetry nor mutates instructions, grants approval, or establishes
causal benefit. A refresh or retirement proceeds through a new proposal and the
ordinary human decision gates.

## Verification contract

- **Behavior:** prepare a bounded rule proposal without target mutation; derive
  adoption status only from the matching approved loop and exact applied rule block, with whole-file equality reported separately.
- **Implementation boundary:** `scripts/review-rule-lifecycle.mjs` and the npm
  CLI dispatch, reusing the supervised loop and existing ledger vocabulary.
- **Obligations:** positive/negative evidence and promotion prerequisites;
  initial adoption, update, and retirement; no approval inheritance; rejection,
  incomplete execution, unrelated observations, target drift, and restoration
  must not masquerade as successful application.
- **Verification:** focused lifecycle tests plus existing supervised-loop
  approval/restore tests and an assembled npm command smoke test. Test results
  must be recorded from the actual implementation; this contract does not claim
  they have passed.
- **Excluded claims:** long-term recurrence reduction, business impact, arbitrary
  prevention-target support, cross-project approval, and evidence authenticity
  inferred solely from a caller-supplied digest.
