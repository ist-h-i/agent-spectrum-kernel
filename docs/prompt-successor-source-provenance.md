# Prompt successor source and provenance repair candidate

Status: authored, not published, not executed in the full repository.
Target: PR #290 at b2606073ff4934aafc619201f47c0195c8fc00ad; Issue #289.

## Decisions

A pre-result source scope must identify the planned native cases, runtime,
materialization, effective command and environment. It must not require the hash
of a future request containing a newly generated claim, workspace token or time.
The request hash is instead checked against the existing runner's actual
request/result/terminal-commit closure after the attempt. This changes only the
unmerged successor candidate contract; the historical #234 experiment is untouched.

Prompt delivery has one explicit transport rule: replace exactly one literal
`$ARGUMENTS` marker with the unchanged UTF-8 materialized task. Do not normalize
line endings, expand replacement-string metacharacters or select another template
after results. Read the current Prompt or Prompt v2 from the exact historical Git
source and check its registered source metadata; do not infer delivery from an
arbitrary matching digest supplied by a caller.

The opaque Prompt-input handle is consumed once. The optional native runner seam
passes its exact Buffer to the existing contained Codex process. Request projection
metadata binds preparation, input and template digests without publishing the raw
Prompt. Common workspace files are not overwritten. Calls without the optional
handle preserve the ordinary native execution path. The successor-only command
adds an explicit network_access=false setting. Declared model, CLI version,
binary/config identity, reasoning, sandbox, approval, timeout and local Node/OS/arch
are checked against native runtime facts. configuration_digest is the exact
native runtime-config file digest. These checks do not establish effective OS
isolation, authentication/backend availability or dependency attestation.

`prepareSuccessorPortfolioSource` prepares native run identity and performs bounded
version/help probes without starting a case. It is a target-host operation, not a
pure inspection or an execution authorization. It has not been invoked here.
Version/help probes gain a 10-second direct-process bound. That does not establish
that every possible subprocess tree is terminated; target-host checks remain
necessary. The existing contained execution/cleanup path is reused for model runs.

## Source verification

The new provenance reader first uses PR #290's scoped saved-source reader. It then
calls the real `inspectVerifiedPortfolioExecution`, `verifyEvaluatorAuthority`,
existing admission resolvers, and `buildPortfolioEngineeringResult`. It compares
actual request/result/workspace evidence with normalization, recomputes the stdin
binding, and compares the complete reconstructed engineering result. There is no
injected success callback or second quality scorer.

The exported preparation reader only accepts `synthetic_only`. This is an intended
use restriction, not proof that arbitrary supplied files are synthetic. Tests must
use disposable test artifacts, never measured outputs or protected evaluators.
No measured-data permission, backend receipt attestation or Portfolio mutation is
implied by a successfully reconstructed local provenance record.

## Verification contract

Not run: any product tests, Node24 integration, Codex binary, model call, private
evaluator, scoring of measured outputs, independent review or GitHub Actions.
Performed: syntax-only checking of the three added `.mjs` files and Python AST
parsing of the read-only patch compiler. The edited native runner has not been
reconstructed or syntax-checked in a complete checkout in this environment.

The new test entry specifies eleven named cases: literal stdin rendering, malformed/oversized input,
forged capability rejection, pre-result scope independence, observed request hash
binding, result/workspace transplantation, runtime substitution, explicit network
argument construction and measured-access refusal. Tests were
written, not run. Existing successor and native runner suites remain required.

## Remaining gates — do not equate them with a test pass

1. Compile/apply the edits to the exact complete repository, inspect the whole
   resultant diff and record the resulting HEAD. Current update is unpublished.
2. Exercise the new optional native runner seam with a harmless fake Codex process
   in a disposable native execution context. Check actual stdin bytes, request
   projection, terminal evidence, failure, interruption and no-duplicate behavior.
3. Run real-library source/evaluator/admission reconstruction and historical
   compatibility regressions. The source fixture already in PR #290 proves stored
   artifact validation, not a real execution/evaluator authority chain by itself.
4. Finish the measured orchestration, exact new #277/#278 runtime-bound authority
   and report metric projection before any #235 launch. The old eleven count fields
   are not all derivable from #197's categorical observations. Do not map a `pass`
   flag to an invented zero count, silently drop a guardrail or approve a new
   projection rule after seeing results.
5. Obtain separate permission for live backend checks, measured result access,
   budget, publication/application and merge at their respective boundaries.

Codex remains limited to separately authorized test execution and host-specific
inspection. Product fixes, policy decisions and GitHub updates remain ChatGPT's
responsibility. No Codex task is launched by this candidate.
