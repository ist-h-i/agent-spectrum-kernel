# Tool-free profile integration into the native Judge pipeline

Artifact: `SPEC-313-JUDGE-TOOL-FREE-INTEGRATION`, revision 1.
Upstream: Issue #291; PR #313 at `9f51a91b`; `SPEC-313-JUDGE-TOOL-FREE` /
`FVC-313-JUDGE-TOOL-FREE`, revision 1; `SPEC-313-NATIVE-TRANSPORT` /
`FVC-313-NATIVE-TRANSPORT`, revision 1.

## Behavior delta

The exact `0.157.1` native adapter now consumes the fixed tool-free catalog and
closed override builder instead of the earlier synthetic-only toggle list.
`nativeJudgeLaunchProfile("0.157.1")` identifies
`native-capture-tool-free-v1`. Its digest includes the catalog, target image,
requested model/provider and a path-independent argv/environment template.
Creation cannot select the old profile for this CLI version. Historical v1
captures retain their old protocol/profile binding for read-only reopening;
they are not upgraded to the new profile or to a tool-isolation claim.

`prepareToolFreeNativeJudgeLaunch({protocol, invocationRoot})` is read-only.
It returns the same paths, argv and environment consumed by the native adapter,
plus the unresolved live-host requirements. It is not an adapter capability,
authorization record or successful preflight. A caller cannot copy its fields
into an executable handle.

The new path writes the exact trusted text block from
`docs/prompt-successor-llm-judge.md`, the existing packet and its response schema.
`toolFreeNativeJudgeInstruction()` returns that text without the document's
status commentary. A protocol with different instruction bytes is rejected;
the TF3-only instruction that asks for `OK` is not accepted as a Judge protocol.
The fixed catalog remains byte-for-byte unchanged. Its legacy base-instruction
field is superseded by the explicit `model_instructions_file`, not used as the
Judge instruction. The exact-tag model manager's `with_config_overrides` applies
that instruction override to the model metadata.

The execution template differs from the original TF3 probe: it requests the
built-in `openai` provider, disables request/stream retries and WebSocket
transport, supplies output-schema/final-output paths, and retains a fresh local
session for evidence rather than using `--ephemeral`. Configuration/rules are
ignored explicitly and unknown settings fail under `--strict-config`.
These settings are not credential, egress or filesystem confinement proofs.
**The historical TF3 request does not validate this changed complete argv or an
authenticated request.** No additional exact-Codex capture is part of this work.

Each invocation snapshots the verified native image into a private mode-0500
file and saves the pinned catalog outside the repository and empty workspace.
The controller verifies the execution copy and catalog before launch and after
exit. Reopening checks the saved image/catalog, reconstructed argv/config,
protocol instructions, response schema, stdin, response, session and usage.
Updating the original executable later does not cause a replay or invalidate
the preserved execution copy. Changed saved evidence is rejected, not repaired
by a new call. A failure before a complete native capture leaves the existing
started claim ambiguous and non-retryable.

The once-only ledger, A/B resolution, token accounting, native failure handling,
qualification storage and #197 scorer are reused. No alternate scorer, approval
store, trial authority or measured-trial launch validator is introduced.

## Evidence boundary and remaining host work

The integration test compiles the existing native C fixture with a `0.157.1`
interface mode. It validates the production-shaped command, catalog and trusted
instruction inputs, then emits scripted responses through the same capture,
receipt, replay and qualification code. It contains no provider implementation
or credential loader. `gpt-6-sol` / `openai` identify the **requested template**;
its protocol and receipts remain **`synthetic_only` / `fake` / `scripted`**.
Null observed isolation fields remain null. Synthetic matching labels are not
real semantic qualification or an independently approved label corpus.

The synthetic adapter rejects the pinned target Codex image before even its
version/help probes. Live protocols remain rejected before a claim or credential
access. No booleans, copied preparation plan, TF3 result or synthetic report can
open a live capability. Preparation reports these missing host inputs:

- reviewed credential supply and authenticated tool-dispatch restriction;
- provider-only network and additional-file-access restriction;
- target-session capture origin and separate live invocation authorization.

An authenticated host adapter and its evidence/admission binding are still
required. This change does **not** implement credential supply or enable live
qualification. The target-side work must connect those reviewed controls to this
shared launch template and validate the actual session/response format. Only
then may separately authorized live qualification proceed; independent labels,
formal private admission and a new result-blind freeze remain separate gates.
No API-key fallback, auth-file copy, model request, trial, scoring, Ready or merge
is authorized by this integration.

## Formal verification contract

Selected path: `formal_verification_contract`,
`FVC-313-JUDGE-TOOL-FREE-INTEGRATION`, revision 1.
Triggers: cross-module contract, native process execution, persistent evidence
and security-sensitive launch controls. This supplements, not replaces or
downgrades, the existing TF/NT proof obligations.

| ID | Required observable evidence |
|---|---|
| JI1 | New-profile identity and closed argv bind fixed catalog, model, instruction and response schema; no capture-only prompt or caller-selected legacy settings. |
| JI2 | Existing ledger runs distinct native A/B processes, preserves packet/response/usage and reopens without invoking; private labels/bindings are absent from stdin. |
| JI3 | Binary/catalog/config/instruction/schema/argv/environment drift is rejected; pre-capture failure is non-retryable; concurrent controllers produce only one pair. |
| JI4 | Tool events, incomplete execution, runtime mismatch, invalid response and unknown usage remain unresolved; live metadata/target image/copying a handle cannot open execution. |
| JI5 | Bound synthetic qualification retains native evidence and rejects live admission; legacy native regressions and repository/runtime-bundle checks remain valid. |

Model-free integration command:

```sh
node --test scripts/test-ask-benchmark-judge-tool-free-integration.mjs \
  scripts/test-ask-benchmark-judge-native-transport.mjs \
  scripts/test-ask-benchmark-judge-tool-free-profile.mjs
```

The existing preparation workflow includes this suite. Its result is synthetic
pipeline evidence, never a substitute for a target-host invocation, real label
review, live qualification or measurement. Tested source/tree and exact results
belong in the PR/evidence record; CI is not an unconditional completion gate.
