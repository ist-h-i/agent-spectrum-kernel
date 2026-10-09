# Model-free Full preparation

Implementation Contract `IMP-318-FULL-1`, revision 1, feature slice A.
Upstream: Issue #318 and `DES-MAC-ASK-VALUE-1` revision 2 in
[the value design](mac-kernel-value-screening.md). Source candidate remains
the immutable `f65a24c9` inventory; integrated starting source is `f197f14b`.
The implementation context is a template; nearby installer/lifecycle and local
eval code supply the observed implementation patterns.

This slice materializes the actual core/default plus Codex `full` distribution
in a new private preparation root, alongside plain and Kernel-only copies of
one manifest-bound public task. It never launches Codex, a model, task scripts,
or the packaged runner. It creates no grant or execution plan. Existing
installers run as bounded Node subprocesses only against the new Full target.
The Kernel installer is not imported: its module evaluation runs its main.

The root must be new, absolute and below a canonical existing parent outside
the source checkout. It contains `conditions/plain`, `conditions/kernel_only`,
`conditions/full_ask` and sibling `controller` evidence. Only input-manifest
files (`task.md` and `workspace/**`) are copied, equally into all conditions.
Evaluator/oracle/admission/result files are not loaded or copied. This is
layout separation; actual process enforcement is **unknown**, not verified.
The public fixture intentionally includes an output schema and structural
validator as task constraints. Those are not its private semantic evaluator;
neither validator nor evaluator is executed here.
Preparation requires Node 24 and POSIX ownership APIs. The new outer root,
conditions roots and controller use owner-only 0700; the record uses 0600.
Audit checks those names, modes, ownership and regular/link boundaries before
accepting evidence. Installer-owned nested asset modes remain its defaults,
contained by the outer root. ACL enforcement is unknown. This helper does not
admit Windows native or claim a new real-OS evaluation route.

Proof selection: `ask.verification-proof-policy@1.0.0`,
`formal_verification_contract`; triggers
`state_concurrency_persistence_lifecycle_or_cross_module` and
`merge_release_or_stable_trace`.
Verification Contract `FVC-318-FULL-1`, revision 1:

| Obligation | Change / required evidence |
| --- | --- |
| O1 / C1 | Source-candidate digests, 47 Skills / 5 prompts / 1 command and complete generated inventory bind preparation. |
| O2 / C1 | Real installer materialization into a new root; no replacing or deleting existing roots. |
| O3 / C2 | Identical public input hashes in P/K/F; no ASK in P, exact canonical Kernel in K, actual package in F. |
| O4 / C2 | Required asset and literal relative ESM import closure; escaped/missing/unsupported dependencies block. |
| O5 / C2 | Conservative literal instruction references surface unresolved paths; no silently invented assets or reduced Full. |
| O6 / C3 | Missing/mutated/extra files, links and stale evidence block; audit is read-only and does not launch installers. |
| O7 / C3 | Static package evidence never enables live readiness or evaluator/Kernel-workflow admission. |
| O8 / C3 | Focused integration and negative tests, existing local eval regressions, repository validation and exact-head CI. |

Static import scanning is a bounded check of literal ESM declarations, not a
JavaScript evaluator or proof of arbitrary runtime I/O. Dynamic imports and
CommonJS require are unsupported and fail closed. Literal instruction-path
references are conservative: a missing optional/example reference requires
classification and stays blocked, rather than being called a proven runtime
failure. Paths assembled at runtime and semantic instruction completeness
remain unknown. No package/module/task code is evaluated by the closure scan.

`mp-ci-evidence-gap` public inputs can be hash-verified independently of its
evaluator. Its catalog evaluator binding is still pending. Kernel's fair
zero-Skill workflow, Full CLI discovery/read/use and real sandbox behavior are
not established by this preparation. Missing closure yields a typed blocked
report and preserves generated evidence without retry.

Audit requires the caller-retained `record_digest` returned by preparation,
not a digest read from a mutable file beside the record. Without that digest,
or after record mutation, audit blocks before accepting its claims. The saved
inventory is local integrity evidence, not signed authority or a model
execution grant. Future three-slot execution requires the existing
separate task/evaluator authority, deny enforcement, budgets and sealed replay;
this helper does not replace those systems or formal #291 machinery.

Completion evidence and exact commands will be recorded after verification.

## Use and observed boundary

Run from this source checkout, choosing a new absolute path under an existing
canonical parent outside the checkout:

```sh
node scripts/ask-local-full-package.mjs prepare /canonical/work-area/new-preparation
node scripts/ask-local-full-package.mjs audit /canonical/work-area/new-preparation sha256:RETURNED_RECORD_DIGEST
```

Retain the returned `record_digest` independently of the stored record. Prepare
refuses existing roots; audit writes nothing and starts no subprocess. Exit 2
means typed static blockage, not permission to retry, add assets or run a model.
An invalid target/source or failed installer exits 1 and preserves partial
evidence; there is no automatic cleanup or retry of a preparation root.

At the pinned candidate, real model-free materialization produces 159 ASK
files including generated states, plus the 13 common task files (172 in Full).
All 111 distinct source paths match the existing inventory. Required renderer
assets and literal ESM imports are present. The conservative instruction check
finds 103 unresolved occurrences across 22 distinct paths, including optional
knowledge/context templates and references needing classification. These are
duplicated in canonical/projected Skills where appropriate. For example,
`docs/ai/implementation-context.md` and `scripts/verification-proof-policy.mjs`
are referenced but not in this installed candidate. This is public static
source/package evidence, not a host trial or proof of runtime failure.

The report therefore remains `blocked`, `static_package_eligible=false`,
`live_ready=false`. We do not expand the installer inventory, discard references,
or call the smaller closure Full. Next work is an explicit optional/example/
required classification and dependency disposition, before re-evaluating the
package. The fixture's private evaluator and fair Kernel workflow remain
unknown, even though its public input digests match in all three conditions.

Verification evidence mapping: E1 = focused test-first failure (missing helper)
and independently reproduced private-layout regression before its correction;
E2 = `node --test scripts/test-ask-local-full-package.mjs` (O1–O7), including
deterministic independent targets, no-call audit, source/input identity,
missing/escaped/unsupported imports, unresolved references, links, extra paths,
mode drift and record/input mutation; E3 = existing local-eval/Codex/time-budget/
JSON-pilot regressions (O8); E4 = repository validation, unchanged runtime-bundle
check and whitespace check (O8). Exact final HEAD, independent review and
Mac/Ubuntu model-free CI receipts are recorded on the Draft PR. They do not
replace any real CLI/model/sandbox/WSL/Linux-host measurement or formal #291 AC.


The explicit `prepare-complete` follow-on retains this immutable base candidate
and adds a separately classified, digest-bound reference supplement. See
[three-condition comparison](local-three-arm-comparison.md) for its additional
40 assets, bounded closure result and unresolved evaluator/runtime admission.
The original `prepare` and its historical blocked observation remain unchanged.


## Historical compatibility in CI

The immutable candidate and reference supplement are checked in an isolated
checkout by `scripts/prepare-historical-full-test-root.mjs`. Their declared
source revisions and digests remain unchanged. Current test/helper bytes are
retained, while the sealed source/Skill asset inventory is reconstructed only
in that new checkout. New reference assets are excluded from that historical
inventory, not ignored in current delivery. Current-HEAD UI distribution and
repository consistency checks still run separately. These historical checks
do not admit current-HEAD Full execution, reseal authority, or measure ASK
effectiveness. The preparation utility itself makes no model/native calls.
