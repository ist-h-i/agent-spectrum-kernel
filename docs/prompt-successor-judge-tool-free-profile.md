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
`39152b9649b5dd123030823fc5ffa5ba768ca1139af062be85859daff2b17e25`.
The CLI 0.157.1 catalog parser requires `base_instructions` or
`model_messages.instructions_template` for every model. This catalog now
includes the fixed nonempty capture instruction as `base_instructions`.
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
record containing method, path, header names, Host, loopback peer, local
destination address and port, and body digest.
The result binds each body and record by SHA-256. Run
`node scripts/ask-benchmark-judge-tool-free-reopen.mjs --evidence-root <absolute-root>`
to recompute the request inspection from saved bytes. A successful settings
parse or tool-free transcript alone is not a request capture. Reopening also
rejects a purported success when the saved CLI exit, signal, timeout, or
workspace state contradicts successful capture.
The first-request input inspector permits only text `message` items from
`developer` or `user` with `input_text` content and requires the exact
synthetic stdin text. Tool outputs, image content, unknown typed items, and
untyped extra fields fail closed.

Source basis: [Codex config](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/config/mod.rs),
[static model manager](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/model-provider/src/provider.rs),
[model metadata](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/protocol/src/openai_models.rs),
and [tool registration](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/tools/spec_plan.rs)
at tag `rust-v0.157.1` (peeled commit
`36650394c5b38c2990ccf2a3457165ca3e9d9726`). Source inspection alone
does not establish the effective tool inventory; the saved third capture
below records the actual outbound request.

## Formal verification contract

Selected path: `formal_verification_contract`,
`FVC-313-JUDGE-TOOL-FREE`, revision 1. Triggers: security-sensitive
permission behavior, native process launch, external request boundary,
and stable pre-measurement evidence.

| ID | Obligation |
|---|---|
| TF1 | Verify exact CLI version and native-image digest, fixed catalog bytes, closed overrides, fresh child environment and empty workspace before launch. |
| TF2 | Launch exactly one CLI process against a local capture endpoint, with no real-provider credential, no benchmark content, and no private evaluator path. Save precall, process streams, request bytes and terminal result outside the repository. |
| TF3 | Inspect the actual outbound `POST /v1/responses`: exactly one loopback request with matching Host and socket destination, model `gpt-6-sol`, `reasoning.effort=medium`, `tools` absent or empty, no additional tool input, and no Authorization header. A setting or tool-free transcript alone does not satisfy this obligation. |
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
admission, measured trial, or PR merge occurred. The subsequent one-shot
capture is recorded below.

## 2026-09-29 authorized second attempt

The separately authorized one-shot launch used local HEAD `bb37f2c5`, the
same pinned CLI image, a fresh private home/workspace, and only a loopback
capture provider. The CLI exited 1 while parsing the fixed catalog because
`gpt-6-sol` lacked both `base_instructions` and
`model_messages.instructions_template`. The capture endpoint again received
**zero requests**. Saved evidence is at the private root
`/private/tmp/ask-291-tool-free-capture-20260929-2`; the result reopens as a
failed capture. SHA-256: `precall.json`
`8974e48a6d12e5aa00c31a9ffb1a33a58eeb8271edda86d2804cf10b0741ab36`,
`stderr.bin`
`6b30064a9e76c366a82b6e0ddc253556758ee37f55d732cfe7c6068540377732`,
`result.json`
`838bd549a33320d5e0d2d1c9351f1e90feb5d9153b4dc54c6356b877c37f8af4`.
No outbound request body exists for this attempt, so model, reasoning effort,
destination, and tool inventory remain **unverified from a real request**.

The catalog now includes the required base instruction and has a new pinned
digest. The saved second attempt still reopens with its historical digest;
it is not promoted to success. The separately authorized third capture is
recorded below.

## 2026-09-29 authorized TF3 capture

The one-shot capture launched local source HEAD
`8150280c68c809e1b5981d87e35c8606303ca96b` with the pinned
`codex-cli 0.157.1` image and catalog digest above. The child had a fresh
`HOME`, `CODEX_HOME`, and empty workspace; its environment contained no
credential source. The configured provider was the loopback capture endpoint
only. The saved result is at the private evidence root
`/private/tmp/ask-291-tool-free-capture-20260929-3`.

The endpoint captured exactly **one** `POST /v1/responses` request. The
saved body has `model="gpt-6-sol"`, `reasoning.effort="medium"`, and
`tools=[]`; the two input items are text-only messages. The saved HTTP
metadata records Host `127.0.0.1:53422`, local destination
`127.0.0.1:53422`, loopback peer `127.0.0.1`, and no Authorization header.
The endpoint returned HTTP 400 without calling a model. The CLI exited 1,
which is expected for this capture and does not invalidate the saved request.

SHA-256 of the private evidence: `precall.json`
`ec26358ad81488d161c7e5046e66684e4aac3a1dc429205a3e6b75aa7ee5e4b4`,
`request-1.bin`
`aa8ea1f06db005de4486d2d44f6a66d699ad72a171d1c4bbb4e0a383a05e837f`,
`request-1.json`
`2a4ba61d8a5a9dd6f5fed48fe1b0b51d25d02015f50320bf779d46218ffb6c32`,
and `result.json`
`b4904830df20b5542e6dd25af7362feaebdfbccf7c055034e753017bdce75558`.
`ask-benchmark-judge-tool-free-reopen.mjs` independently reread the body
and HTTP metadata and returned `request_count=1`, `tool_count=0`,
`captured_request_verified=true`, and `failure=null`.

TF3 is **verified for this exact model-free local request**. No named
function/namespace tools, including shell, `apply_patch`, Web, MCP, apps,
plugins, multi-agent, image, request-user-input, or tool search, appear in
the model-visible `tools` array because that array is empty. This is not
live Judge qualification or formal admission. No actual Judge response,
private evaluator, result-blind freeze, measured trial, scoring, or merge
was run; those gates remain closed.

## Native Judge consumer

[The native integration](prompt-successor-judge-tool-free-integration.md) reuses
this catalog and override builder in the existing A/B capture/receipt path.
Its output-schema, provider, trusted instruction and session-retention settings
are different from the TF3 probe. Compiled-fake integration success does not
extend the historical one-request TF3 proof to that complete live launch.
