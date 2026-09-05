# Execution Envelope Contract

The Execution Envelope is the shared control record for one meaningful workflow boundary. It keeps routing, evidence state, stopping conditions, and the next action together so chained skills do not repeat the same control metadata in every skill-specific artifact.

This document is the human-readable source of truth. The control payload is mirrored by `schemas/execution-envelope.schema.json`; the runner-owned transport wrapper is mirrored by `schemas/execution-envelope-record.schema.json`. Neither schema replaces the workflow rules in this document. The core installer projects both as ASK-managed immutable contracts into adopting repositories. Adapter runtime copies are deterministic projections and do not become independent schema sources.

## Ownership and emission boundary

- One runner or explicit compatibility boundary owns the envelope for a meaningful workflow boundary. Chained skills provide domain artifacts and structured control inputs; they do not independently serialize or mutate another envelope.
- A managed runner derives fixed route fields from the validated profile. It accepts dynamic evidence, stop, and next-action fields only from its closed structured result or from runner-observed preflight/process state. Final prose is never an authority source.
- The runner validates one canonical payload, binds it to the exact adapter entry/profile/revision/fingerprint and response digest, then persists one immutable content-addressed record under runtime-owned storage.
- Inline JSON is a visibility projection of that same validated record, not a second mutable source of truth.
- The envelope is control metadata. Requirement Contracts, Specs, Verification Contracts, Implementation Summaries, Review Findings, and Handoffs remain skill-specific artifacts.
- For a non-review risk-gated action, the runner owns `risk_approval`. `requested` and pre-execution `rejected` pair with `not_executed` and a `risk_gate` stop. `approved` records the caller-trusted external approval digest; it becomes `executed` only when the runner actually spawns Codex and binds the final prompt bytes. `enforcement_status` and `promotion_status` separately record whether the process ran in the isolated workspace, whether its closed delta was accepted, and whether the trusted runner promoted that delta.
- A final review decision accepted by the review sensors is preserved under `review_decision`; `approve_with_comments` must not be collapsed to `approve`.
- `Metrics event candidate` is optional and must be omitted unless adoption metrics are explicitly enabled or requested and the boundary reached a meaningful durable state. It is never required for skill completion.

## Emission classes

| Class | Boundary | User-visible serialization |
|---|---|---|
| `sidecar` | Managed fixed implementation, investigation, review, or verification with `none` or `completed` stop state | Zero serialized Envelopes in ordinary prose; the validated record is persisted by the runner. |
| `inline_required` | Handoff/resume, `human_decision`, `insufficient_evidence`, `capability_missing`, `risk_gate`, or `blocked` | Exactly one fenced canonical payload rendered by the owner. |
| `diagnostic` | Explicit route/debug request only | Exactly one fenced canonical payload rendered from the same validated record. |

Missing or invalid structured authority fails closed. It must not be reconstructed from phrases such as “tests passed”, “approved”, “ready”, “safe”, or “no missing evidence”. A direct or copied prompt without a runner-owned structured channel uses explicit `inline_required` compatibility and must not claim sidecar support.

## Canonical shape

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": {
    "work_mode": "実装",
    "operating_mode": "delivery_quality",
    "user_facing": "実装して検証する",
    "internal": {
      "primary": "controlled-implementation",
      "secondary": ["test-first-verification"],
      "next_if_resolved": "review-router"
    }
  },
  "evidence_status": {
    "checked": ["repository files", "focused test"],
    "missing": []
  },
  "stop_reason": {
    "status": "none",
    "details": [],
    "human_decision_required": [],
    "stop_if": ["required verification is unavailable"]
  },
  "next_action": "run the focused verification"
}
```

The JSON object inside the fenced block is the only accepted visible serialization. A heading or flat `- route: ...` list without a parseable JSON object is malformed. Ordinary managed `sidecar` output deliberately contains no visible serialization; its record must validate against `schemas/execution-envelope-record.schema.json` and bind the canonical payload plus response/profile provenance.

## Field rules

`route` explains where the work is going. User-facing route text uses work terms; skill names belong under `internal route` for traceability. `work mode` and `operating mode` are separate: the former describes the task intent, while the latter describes the operating layer.

`evidence status` distinguishes what was directly checked from what is still missing. This checked/missing control object is not the five-value claim truth taxonomy. Claims made about the Envelope use `ask.claim-evidence-status@1.0.0` in their owning artifact. Do not convert missing evidence into a positive claim or hide it in a skill artifact.

When `docs/lifecycle-traceability-contract.md` applies, `evidence_status.checked`, `evidence_status.missing`, and `stop_reason.details` may carry stable artifact or item refs. The Envelope reports control state only; it does not copy acceptance conditions, evidence records, blockers, approvals, or rollback content from the trace chain.

`stop reason` is explicit when work must pause. `human_decision` names the decision owner or decision needed, `insufficient_evidence` names the missing input or check, `capability_missing` names a selected route absent from the active adapter's `selected_skills`, and `risk_gate` identifies the action requiring approval. A `capability_missing` stop must name the missing Skill and the profile or explicit override that can provide it; it must not invent or continue the absent procedure. `none` is valid only when the workflow can proceed. `stop_reason.stop_if` is the sole location for stop conditions; route metadata must not define another stop condition.

`next action` is a concrete work action, not only a skill name. Examples include `run the focused validation`, `implement the scoped change`, `request domain clarification`, or `prepare the final merge decision`.

### Exact Codex risk approval

The risk action descriptor and approval are closed JSON documents. The action names the normalized credential-free `remote.origin.url` repository ID, exact operation, target scope, permitted/prohibited effects, and expected authority id, authority revision, and authority-evidence digest. The runner independently derives that logical repository ID, requires it to match the action, and also binds the checkout/Git-directory identity, HEAD/tree, installed prompt/profile provenance and fingerprints, composed base prompt, mode/sandbox, required gates, the complete Codex launcher/package/platform/native executor chain, the exact native source path and runner-owned verified-snapshot spawn method, output path, the closed child-environment identity, and canonical action/invocation/request digests. Every bound executor file is stable-read again at the spawn boundary; the approved native bytes are copied into a mode-0500 file below the random mode-0700 runner task root and that snapshot is executed. Candidate writes remain confined to the separate workspace, so replacing the original native path after verification cannot change the executable bytes. The JavaScript package launcher is never executed on the risk path. `--codex-bin` must resolve to the installed `@openai/codex` package launcher; direct native, script, shebang, and alternate launcher inputs fail closed. The authority fields in the embedded request prevent a different authority assertion from matching; the caller-supplied raw SHA256 of the approval file is the separate trust root for the external approval bytes.

The first invocation emits that deterministic request and stops before Codex. An approved rerun accepts only a regular non-symlink approval file outside the target repository whose raw bytes match the caller-supplied digest, whose embedded request self-digest is valid, and whose request is exactly equal to the current recomputed request. Plain booleans or prose, partial or superset documents, target-contained files, changed logical origin/check-out identity/head/tree/scope/prompt/profile/mode/sandbox/gates/executor/output/effects, or a modified request with a recomputed digest are rejected. The runner stable-reads both documents again immediately before spawn, adds the exact approved request to the Codex prompt, and records that final prompt digest. A missing capability still stops without execution. A managed read-only review that evaluates a risk surface is not the risk action and requires no approval.

Approved mutation execution supports only the closed filesystem effects `create`, `modify`, and `delete`, and requires the explicit prohibitions `external_side_effects`, `git_metadata_changes`, and `write_outside_target_scope`. Any other effect vocabulary, a non-`workspace-write` mutation mode, or scope overlapping Git metadata or runner-owned output/runtime paths stops before Codex. The request binds `candidate_network_access=disabled`, and the runner passes that setting explicitly to the Codex workspace sandbox. This denies network access to candidate tools; the Codex client's own model API control-plane transport is not an approved action effect and remains outside the candidate tool sandbox. The runner requires the repository to remain at the approved HEAD/tree with no non-runner worktree delta, materializes a regular-file-only snapshot directly from that commit into a new disposable workspace with no `.git`, and applies an outer OS filesystem policy to the bound Codex process group that permits writes only below that workspace. Absence of a supported isolation provider is a pre-execution rejection.

The risk-only Codex invocation is ephemeral and rejects saved ChatGPT authentication. It requires exactly one caller-supplied API-key environment variable, records only that value's digest, and derives empty `HOME` and `CODEX_HOME` directories below the random runner task root. This makes ChatGPT account cloud requirements unavailable to the risk child. The runner also rejects a host when any declared Unix system or macOS managed Codex configuration path exists, rechecks that state on the approved rerun, and retains OS-level read denial for those paths and for project/ancestor configuration. An empty `mcp_servers` override is not sufficient by itself because ordinary Codex configuration layers merge: it is paired with `--ignore-user-config`, rejection of every tracked project `.codex/config.toml`, empty runner-owned user roots, and strict configuration parsing. Hooks, plugins, apps, browser/computer/image access, multi-agent execution, MCP elicitation, Skill/tool discovery, workspace dependency discovery, update checks, telemetry, and the other declared external-tool feature surfaces are explicitly disabled. Apps and collaboration prompt injection are disabled as well. The process environment is not inherited: the request binds the runner-root path-derivation rule, a fixed system `PATH`, fixed locale/terminal/shell values, and exactly one API-key digest. Node, npm, dynamic-loader, proxy, shell-startup, Git, SSH, and all other ambient variables are absent from the child. Only the built-in `shell_tool` and `unified_exec` mutation paths remain because the approved filesystem action requires a mutation mechanism; their candidate network is disabled and their writes are still confined by the independent OS workspace boundary and subsequent closed delta audit. The complete ordered CLI policy arguments, disabled-feature inventory, config-layer boundary, executor chain, environment boundary, tool boundary, and their digests are part of the exact approval request. Changing any bound executable/package bytes, environment identity, managed-configuration state, or feature enumeration requires a new request and approval rather than inheriting prior authority.

After execution the runner removes its temporary structured-output file, rejects symbolic links, hard links, special files, reserved Git metadata, every out-of-scope path, and every create/modify/delete effect not explicitly approved, then binds the complete delta and observed effects. Structured-result validation occurs before promotion. Immediately before promotion the runner rechecks HEAD, tree, clean non-runner state, and every tracked base byte. Only then does runner-owned transactional promotion copy the accepted paths into the original checkout; a mixed allowed and unapproved delta promotes nothing. The Envelope reports the isolated base digest, delta digest, observed effects, and promoted paths. `executed` alone is not successful enforcement, and approved action success is not reported until `enforcement_status=accepted` and `promotion_status=promoted`.

## Skill-specific artifact boundary

The following belong in the skill artifact and should not be repeated in the envelope unless they directly change the control state:

| Skill | Primary artifact |
|---|---|
| `requirement-grill` | Requirement Contract |
| `spec-driven-development` | Spec behavior delta and acceptance criteria |
| `test-first-verification` | Verification Contract and evidence |
| `controlled-implementation` | Implementation Contract and evidence references |
| `review-router` / review gates | Mandatory baseline, exact-signal additional gates, missing evidence, or review findings |
| `review-final-merge-gate` | Final decision and merge evidence summary |
| `handoff-generation` | Next-task handoff and bounded resume state |

These artifacts may contain evidence, blockers, or next-step detail required by their own purpose. They should not reproduce `Selected work mode`, `User-facing route`, `Internal route`, `Route confidence`, `Evidence checked`, `Missing evidence`, and `Next action` as a second control contract when the shared envelope is already present.

## Compatibility

- Managed Codex runner paths use the runner-owned record policy. The runner passes `codex exec` a closed structured-result schema and does not reconstruct general control state from domain prose. The one narrow exception is a requested final review decision: the runner copies the exact closed-vocabulary value into the Envelope, and publishes it only after the review sensors accept the complete decision matrix.
- Direct/copied Codex prompts and current Claude project, plugin, and GitHub Action paths remain explicit inline compatibility because the repository has not verified an equivalent independent structured channel for them.
- Legacy inline payloads remain readable and schema-valid. They are not silently upgraded to sidecar records, and historical measured prompt fixtures remain unchanged.
- Adapters may keep entry-specific artifacts only when they do not duplicate lifecycle or control fields. Codex implementation and verification profiles use their canonical Contract plus Evidence record; investigation does not add `Verified`, `Unknown / not verified`, or `Next`; handoff does not add a separate `Stop condition`. `next_action` and `stop_reason.stop_if` remain owned by the Envelope.
