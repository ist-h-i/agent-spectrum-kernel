# Personal Evolution: once-generation connector

`runPersonalEvolutionGeneration` in `scripts/ask-personal-evolution-generation-connector.mjs`
connects an existing verified generation request to one explicitly supplied
supervised provider, generated candidate files, an execution receipt and the
existing `importPersonalEvolutionGenerationResult`. It creates no provider
transport, Codex CLI process, evaluator, optimizer, adoption decision or installer.
Importing the module or verifying a saved receipt never calls the provider.

The development evidence uses a deterministic fake provider only. Actual model
execution, candidate quality, live comparison and completion of the personal Mac
loop remain **Unknown**. A future real invocation requires a fresh direct human
start and a separately reviewed provider. This API does not infer authorization
from a past invocation or a supplied confirmation string.

## Call and provider contract

Supply `storeRoot`, `requestObjectDigest`, the matching
`confirmedRequestObjectDigest`, a fresh `workspaceRoot` whose parent exists,
`provider: { identity, generate }` and the existing optional independent Asset,
Portfolio and high-impact trust arrays. Store and workspace roots must be separate
and non-nested, with no symlink traversal. Unknown options, including evaluator
roots or raw task histories, are rejected before provider dispatch.

The provider identity has exactly:

```text
provider_id
version
source_revision         # full declared source Git revision
implementation_digest  # pinned declared provider implementation hash
execution_kind         # fake | supervised_model
```

The connector captures the function, identity, trust and path values before the
call. `generate({ input, outputRoot })` receives a deeply frozen public input:
the verified public observation, exact parent Asset reference and instruction
files from its verified CAS content package, distinct requested version, request
object/content digests, generator identity and
`requested_action: "produce_candidate_files_only"`. It receives no CAS path,
holdout inventory, trust factories, private scoring data, answers, old task
outputs, evaluation action or adoption authority. Parent files are instruction
Assets; they are not prior task answers. The provider may use a separately
reviewed public descriptor template in its implementation.

Only `workspaceRoot/candidate` is designated for candidate files. The provider
returns a detached JSON object with exactly:

```text
request_digest
input_digest            # canonicalDigest(input)
generator               # exact captured identity
status                  # completed | partial | failed
files                   # exact [{path, raw_digest}] inventory
candidate_descriptor    # existing Asset descriptor; null for partial/failed
privacy: {
  classification: "caller_reviewed_asset_source",
  private_answers_included: false,
  raw_task_history_included: false
}
```

Completed results need nonempty real files. The connector measures the entire
candidate directory independently, rejects undeclared/missing files, symlinks,
non-regular files, traversal and hash mismatches, and bounds the output to 256
files, 512 directory entries and 512 KiB total file bytes. The descriptor inventory
must match those bytes and its source revision must match the pinned generator
source revision. The existing import additionally verifies requested version,
parent lineage, rollback, source repository, unearned evaluation claims and
Registry/Portfolio identity. There is no default or fallback provider.

## Once start, held results and receipt inspection

An atomic directory claim under
`storeRoot/personal-generation-invocations/<request-object-sha256>/` precedes
provider dispatch. It persists `request.json` and, when finalization succeeds,
`receipt.json`. The same request in that store cannot be restarted with a different
workspace or provider. Concurrent starts, completed requests, held requests and
an unknown/crashed invocation are all consumed. Do not delete a claim to retry.

Partial/failed results and exceptions return `status: "held"`, with no accepted
import/preparation references. The receipt retains measured partial file hashes
when their inventory can be verified, otherwise marks it `unverified`. Raw
provider exceptions and invalid response bodies are not persisted. Failure codes
are bounded; a provider's success declaration cannot make a held result usable.
Invalid metadata cannot become source/evaluation/human trust.

The immutable execution receipt binds request, public input, observation, exact
parent/requested version, pinned generator identity, provider outcome, measured
file hashes and accepted response/import/preparation objects when available.
`verifyPersonalEvolutionGenerationExecution` checks the durable start and terminal
records, recomputes the public input, revalidates the saved provider result, and
uses existing Evolution/Registry verification plus imported CAS bytes to verify a
`candidate_ready` receipt. It is read-only and never dispatches or retries work.
Existing driver alignment can use the accepted import's preparation digest, or
idempotently use the existing supplied-import entry point with the verified saved
provider result. Independent source review and fresh evaluation pinning remain
required downstream.

## Evidence limits and failure boundaries

The provider callback is trusted code, not an operating-system sandbox. Its owner
must confine reads to approved public inputs and writes to the dedicated output,
and supervise process lifetime/cancellation. This connector owns no child process,
timer, automatic retry or resume. If a provider never settles or the host exits,
the durable invocation remains unknown and consumed. Filesystem finalization
failure can likewise leave a consumed request without a terminal receipt.

Privacy declarations are attestations, not secrecy proof. File hashes prove
imported bytes, not authorship or truth of the declared Git revision/provider
implementation. `model_execution: "not_applicable"` describes a declared fake;
for a declared supervised model it remains `"Unknown"` rather than claiming
actual model execution from the callback's success. Source review is separate.

Import/CAS/preparation publication is not one transaction. As in the existing
import, a later failure may leave immutable orphan candidate objects. A held
receipt supplies no usable import capability and never promotes or installs them.
Caller-owned stores are the once-start scope; copying a store does not provide a
global uniqueness or fresh-head guarantee.

Run the focused non-model acceptance checks with:

```sh
node --test scripts/test-ask-personal-evolution-generation-connector.mjs
```

The model-free personal-contract CI step also runs these tests alongside the
existing import, observation, saved-results, pair, source-install and driver-mode
regressions. No private fixed evaluation assets or runtime bundles are changed.
