# ADR0020: Host-owned reference scoring over the existing worker protocol

Status: Proposed

Context: the native loop can import pinned fixed source judgments and invoke a
custom grading command. Requiring every adopter to implement that command leaves
the routine AI grading workflow unconnected. Mixed primary/business cases also
need dynamic binary judgments alongside fixed partial credit.

Decision: add a thin shipped external-host adapter selected in native report
configuration. Reuse request/result/inspect, atomic artifacts and journals.
Official configure derives pinned worker/settings without custom argv; read-only
readiness stays pure. Host CLI derives the exact pending nested grading job from
root/profile/config, and checkpointed claims/completions bind it to the parent.
The bridge does not dispatch a model, execute a candidate or bundle a grader.
Optional binary output has its own incident/Unknown path; static strict inputs
retain compatibility. Both normal human judgment types remain.

Alternatives: requiring a per-host custom worker keeps the observed gap. An
in-process provider dispatcher would add authentication and process-lifetime
obligations without an available authenticated Claude environment. A generic
queue/workflow engine duplicates the current transport and reservation owner.

Consequences: host AI must prepare anonymous private judge packets and supply
reviewed references and positive closure. Host-reported records do not prove
provider authentication, independent review or evidence truth. Unknown claimed
work is inspected; takeover/replay is refused. The first adapter is native-only;
practical/component profiles reject this option rather than silently ignore it.

Review when authenticated application/provider execution is available or another
consumer needs this handoff. Any extension must preserve exact case/grant/job
binding, once-only claims, source pins and the two human judgment types.
