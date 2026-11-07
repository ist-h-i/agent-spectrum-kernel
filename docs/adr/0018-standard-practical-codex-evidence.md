# ADR-0018: Capture standard practical Codex evidence outside the task workspace

- Status: Proposed
- Date: 2026-11-07
- Upstream: ADR-0016, ADR-0017
- Contract: `docs/instruction-loop-standard-execution.md`
- Supersedes: None

The practical lane accepted caller-owned pinned commands, leaving each consumer
to write model dispatch, closure and usage translation. Its optional workspace
counter file is editable task output. It cannot stand in for provider closure,
and optional malformed data must not erase useful execution or grading evidence.

Add an optional standard Codex condition alongside existing commands. Bind its
task path to every frozen public case inventory and its model/reasoning to the
declared condition. Reuse the existing session transport and root-turn parser.
Reserve one dispatch, then keep raw evidence and job/command/invocation-bound
receipts in the owned attempt control directory. This is a trusted runtime port,
not authentication of a remote provider or isolation of ambient user settings.

Separate provider termination from optional measurements. Confirmed terminal
receipts retain closure if measurement artifacts are unavailable; missing or
invalid closure cannot authorize retry. Valid provider measurements take priority
over workspace claims; invalid provider evidence never falls back to those
claims. Incomplete counters stay null, and incomplete attempts preserve known
usage lower bounds separately. CLI success does not supply task quality.

Alternatives rejected: consumer-specific wrappers for the standard Codex lane
(duplicated evidence handling); transplanting frozen primary grading (different
admission contract); trusting task-written counters as provider totals (wrong
provenance); treating optional missing counters as execution failure (loses usable
evidence). Custom trusted commands remain supported.

Fresh profiles can remove the additive port. Existing jobs retain exact runtime
pins and are never migrated or replayed automatically. No new dependency, global
telemetry, account, auth, primary-batch policy or approval type is introduced.
Review before child/cost totals, ambient isolation claims, remote closure claims,
new provider ports, or automatic repair/replay of consumed attempts.
