# Judge live-host authority binding

Artifact: `SPEC-313-JUDGE-LIVE-HOST-AUTHORITY`, revision 1.
Upstream: Issue #291, Draft PR #313, `SPEC-313-JUDGE-TOOL-FREE-INTEGRATION`,
and `FVC-313-JUDGE-TOOL-FREE-INTEGRATION`.

## Goal

Bind a separately produced target-host evidence candidate to the exact
 tool-free Judge launch plan without granting execution. The target-host
producer/reopener for the underlying observations is still required before
**live qualification** can be authorized.

This artifact does not execute Codex, read credentials, call a provider, seal
formal evaluator admission, authorize measured trials, or create a result-blind
measurement freeze.

## Boundary

`scripts/ask-benchmark-judge-live-host-authority.mjs` is intentionally
**reopen-only**. It exposes no writer or sealer for host evidence. A caller
cannot pass a JSON object or copy a returned handle to mint authority.

The external record must bind all of the following to the exact live protocol
and path-independent launch template:

- target CLI/model/catalog/profile identity;
- reviewed ChatGPT-subscription credential supply using a read-only existing
  auth link, with no copied or persisted secret material;
- an exact launch-template request observation with one request and zero
  model-visible tools;
- agent network disabled and provider network classified as provider-only;
- fresh HOME/CODEX_HOME, empty workspace, and reviewed additional-file access
  restriction;
- controller-spawn/private-store/session-origin evidence;
- a separate result-blind invocation authorization scoped only to live
  qualification, with the exact call budget and zero automatic retry.

Every evidence class carries an external evidence digest. These digests are
references, not claims that this module generated or independently reproduced
the underlying observation.

## Authorization result

`openJudgeLiveHostAuthority()` rereads the exact authority bytes and returns
an opaque in-process handle. `inspectJudgeLiveHostAuthority()` rereads and
revalidates the persisted record on every use.

`bindToolFreeNativeJudgeHostEvidence()` combines that handle with
`prepareToolFreeNativeJudgeLaunch()`, but deliberately keeps
`live_execution_authorized=false` and the six `missing_host_evidence` entries.
It records only that a candidate record is identity-bound, together with its
record digest and candidate qualification scope/budget/retry values.

This distinction is intentional: a structurally valid external JSON record is
not itself proof that the observations were produced by the required target-host
probes. The later target-host producer/reopener must rederive those observations
before any executable capability exists. This layer does not create directories,
spawn a process, load `auth.json`, invoke a model, or authorize measurement.

## Why this remains fail-closed

The current synthetic adapter continues to reject `live_native`. The new
authority layer does not remove that guard and therefore cannot turn synthetic
tests or copied metadata into a real provider call.

The next target-host task must produce the evidence record through a separately
reviewed workflow and then implement/verify the authenticated native adapter
that consumes this opaque authority. That task must preserve:

- exact `codex-cli 0.157.1` native-image identity;
- the fixed `gpt-6-sol` catalog and `medium` reasoning effort;
- zero model-visible tool inventory for the exact integrated launch template;
- no automatic retry;
- A/B once-only claims;
- private capture/reopen evidence;
- no measured-trial authority.

No prior TF3 request may be relabeled as evidence for the changed integrated
argv. If the target-host workflow needs a new exact request capture or a live
diagnostic model call, it requires its own explicit execution authorization.

## Formal verification contract

Selected path: `formal_verification_contract`,
`FVC-313-JUDGE-LIVE-HOST-AUTHORITY`, revision 1.

| ID | Required evidence |
|---|---|
| LH1 | The authority record exactly binds protocol, launch profile/template, native image, catalog, provider, model and host identity. |
| LH2 | All six live-host requirement classes are present with external evidence digests and required observed values. |
| LH3 | Credential evidence forbids copied/persisted secret material; qualification authorization is result-blind, bounded, and retry-free. |
| LH4 | Authority handles are opaque and persisted bytes are reread on every use; mutation or copied handles fail closed. |
| LH5 | Candidate binding never grants live execution or measurement authority; the six host requirements remain open until target-host evidence is rederived. |

Model-free verification:

```sh
node --test scripts/test-ask-benchmark-judge-live-host-authority.mjs
```

Passing this test establishes the authority-binding contract only. It is not
target-host evidence and does not make PR #313 Ready for merge or Issue #291
ready for trial 1.


## Bootstrap correction (revision-1 candidate records remain non-authorizing)

The `read_only_existing_codex_auth_link` field above is a historical **candidate
claim**, not enforced write protection. Symlinks can mutate their targets.
This validator still cannot establish a host observation or issue execution
permission. Its six-class qualification declaration is not required to start
a separately authorized, credential-free model-free diagnosis.

[Host bootstrap](prompt-successor-judge-host-bootstrap.md) separates prior
operator approval from later observations, exercises outer process controls on
public canaries, and captures the integrated request against a rejecting local
endpoint. It does not convert that result into this old all-true record or
an authenticated/qualification capability. Actual credential supply, refresh,
provider-only egress and live diagnosis remain separate, unimplemented gates.
