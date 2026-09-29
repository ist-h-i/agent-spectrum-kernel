# Issue #291 Judge tool-free candidate for Codex CLI 0.157.1

Artifact: `SPEC-313-JUDGE-TOOL-FREE`, revision 1. Upstream: Issue #291,
`SPEC-313-NATIVE-TRANSPORT`, and the fixed A/B Judge instruction in
`docs/prompt-successor-llm-judge.md`. This profile applies to the Judge
processes only. The 28 measured implementation/review trials have a separate
launch contract and may need tools. Their `assertSuccessorProfileCommand()`
validator is not part of this Judge call path.

## Fixed launch inputs

The checked-in `benchmarks/prompt-successor-judge-tool-free-catalog.json`
is the complete static catalog for `gpt-6-sol` under `codex-cli 0.157.1`.
Its raw SHA-256 is
`7550345ec820ed7dbd27ad017f53e691828c28b857152c35b064952a7c349e1b`.
It sets `shell_type=disabled`, `apply_patch_tool_type=null`,
`supports_search_tool=false`, no experimental tools, direct tool mode,
disabled multi-agent metadata, text-only input, and normal Responses (not
Responses Lite). The fixed launch overrides disable Web, MCP catalog entries,
apps, plugins, multi-agent, image, request-user-input, plan, shell, and the
other version-known tool sources. A fresh `CODEX_HOME`, an empty working
directory, `--ignore-user-config`, and `--ignore-rules` exclude persisted
host tool configuration and repository instructions from this probe.

This target-host candidate pins the observed macOS arm64 native image digest
`27ceb5f9b957b43a519efe4eaa3816a0bffb0a531a2c89af18840c0a3c016a7d`
in source. A caller-supplied digest cannot substitute a different CLI image
while still labeling the capture as `0.157.1`. Another platform or CLI image
requires its own reviewed identity binding.
The probe executes a verified private copy of that native image inside its
evidence root and verifies the copy again after the process exits. The saved
precall names both the source and executed image.

The profile builder is
`scripts/ask-benchmark-judge-tool-free-profile.mjs`. The model-free
capture command is `scripts/ask-benchmark-judge-tool-free-capture.mjs`.
It requires that fixed native-image SHA-256, creates a new evidence directory,
passes no credentials, configures a custom Responses provider only at
`127.0.0.1`, and returns HTTP 400 after saving the outbound request. The
probe has no benchmark
input or private evaluator path and runs from an empty disposable workspace.
These conditions do not constitute syscall-level proof that the CLI never
read another host path.

The capture saves each bounded request body and a separate non-secret HTTP
record containing method, path, header names, loopback peer, and body digest.
The result binds each body and record by SHA-256. Run
`node scripts/ask-benchmark-judge-tool-free-reopen.mjs --evidence-root <absolute-root>`
to recompute the request inspection from saved bytes. A successful settings
parse or tool-free transcript alone is not a request capture. Reopening also
rejects a purported success when the saved CLI exit, signal, timeout, or
workspace state contradicts successful capture.

Source basis: [Codex config](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/config/mod.rs),
[static model manager](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/model-provider/src/provider.rs),
[model metadata](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/protocol/src/openai_models.rs),
and [tool registration](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/tools/spec_plan.rs)
at tag `rust-v0.157.1` (peeled commit
`36650394c5b38c2990ccf2a3457165ca3e9d9726`). Source inspection is a
candidate mechanism; the actual outbound request decides whether this exact
CLI/profile exposed zero tools.

## Formal verification contract

Selected path: `formal_verification_contract`,
`FVC-313-JUDGE-TOOL-FREE`, revision 1. Triggers: security-sensitive
permission behavior, native process launch, external request boundary,
and stable pre-measurement evidence.

| ID | Obligation |
|---|---|
| TF1 | Verify exact CLI version and native-image digest, fixed catalog bytes, closed overrides, fresh child environment and empty workspace before launch. |
| TF2 | Launch exactly one CLI process against a local capture endpoint, with no real-provider credential, no benchmark content, and no private evaluator path. Save precall, process streams, request bytes and terminal result outside the repository. |
| TF3 | Inspect the actual outbound `POST /v1/responses`: exactly one loopback request, model `gpt-6-sol`, `tools` absent or empty, no additional tool input, and no Authorization header. A setting or tool-free transcript alone does not satisfy this obligation. |
| TF4 | Preserve failure as failure. Do not convert the candidate profile into live Judge authority, qualification, formal admission, a result-blind freeze or trial 1 from this probe alone. |

Focused source check:
`node --test scripts/test-ask-benchmark-judge-tool-free-profile.mjs`.
A target-host capture additionally requires the pinned native binary and
an external new evidence root. The capture deliberately ends with a nonzero
CLI status because its local endpoint rejects inference; the probe succeeds
only if the saved request passes TF3 and the saved evidence reopens.

## 2026-09-29 observed attempt

One exact `codex-cli 0.157.1` native image (SHA-256
`27ceb5f9b957b43a519efe4eaa3816a0bffb0a531a2c89af18840c0a3c016a7d`)
was started with a fresh `CODEX_HOME` and the loopback provider. The CLI
exited 1 during configuration loading: `unknown configuration field
tools.view_image in -c/--config override`. The capture endpoint received
**zero requests**; the saved result reopens as a failed capture with request
count zero, so TF3 is **not verified**. The exact-tag config schema
has `features.view_image` but no `tools.view_image`; the invalid override
was removed and the source check passes. There has been **no second native
exec** after this correction. The observed failure does not establish that
tool inventory can or cannot be zero.

The local precall, stdout, stderr, and result are saved under the operator's
private evidence root. No Judge model request, qualification, evaluator
admission, measured trial, or PR merge occurred. Keep PR #313 Draft. A new,
separately authorized one-shot capture on the corrected profile, followed by
independent review, is the next evidence needed for this candidate route.
