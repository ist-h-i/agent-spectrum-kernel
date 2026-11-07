# ADR-0021: Separate Full environment refs from owned revisions

- Status: Proposed
- Date: 2026-11-07
- Upstream: ADR-0016; full-partial-assets@1; component candidate lifecycle.
- Supersedes: None.

Registering all selected Full Skill parents fails when any selected Skill is
unchanged. Requiring unrelated edits or weakening full-content revision checks
would change the intended asset semantics. Reuse exact unchanged refs. Keep the
complete environment refs distinct from newly owned revisions and their replaced
parents. Version/cleanup use the owned delta, continuation uses the complete refs,
and restore anchors exact baseline states to the pre-activation snapshot.

This follows the existing component loop boundary. New fields are additive;
old retained outputs use the existing fallback, with runtime/source pins preventing
mixed execution. No-op cleans only owned materializations without owner dispatch.
Review before changing shared ownership, imported asset lifecycle, no-change
admission, source equality, cleanup proof or retained-output compatibility.

Fresh native roots may need missing parent directories; allocate canonical parents
without reusing a reserved root. Keep bounded private child diagnostics on a
preparation failure so the host AI can inspect and prepare a fresh run through
the existing closed-failure port. No raw diagnostics are put into public model
feedback, and no new dispatch or human judgment is introduced.
