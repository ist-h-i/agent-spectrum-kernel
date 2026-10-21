# Prospective performance probe

Artifact ID: `SPEC-PERFORMANCE-PROBE-20261021`, revision 1, status provisional.
Upstream: #355, #379, `primary-24-private-v2.md` and the fixed
`pf-performance-regression/workspace/docs/lookup-contract.md`.

The current private body admits only prequalified AST signatures before reading
sealed timing stdout. The prospective probe uses the same execution path for
every submitted standalone implementation. It has no signature list.

This is a new candidate-correctness evidence source, not a reinterpretation of
old results. Neither the frozen fixture nor its private bundles are modified.
It is not selected by any production evaluator or resource map yet.

## Verification Contract

Formal proof: `VERIFICATION-PERFORMANCE-PROBE-20261021`. Performance, regression,
cross-process boundaries and independent review require the formal path under
`ask.verification-proof-policy@1.0.0`; this document is its reference.

| Item | Observable behavior | Check |
|---|---|---|
| PFP-SAME | Source recognition never selects a pass/fail path | Normal, wrong, distinct implementation and unsupported module controls |
| PFP-HOST | Candidate gets only realm-created ordinary data, no host callable, clock, loader or reference function | Imports/code generation and intrinsic mutation controls |
| PFP-CONTRACT | Identity, occurrence order, holes and mutable/repeated inputs follow the public contract | Fixed contract vectors and independent reference comparison |
| PFP-TIME | Trusted host times calls, retains every sample, recomputes existing thresholds and binds exact source bytes | Small synthetic workload/protocol checks; qualified full measurement remains separate |
| PFP-UNKNOWN | Unsupported platform/runtime, process/timeout/protocol failure and inconclusive timing stay unscored | Unavailable and malformed output controls |
| PFP-ISOLATION | Production path always uses the existing client-style deny-default OS policy plus Node permissions | Inspect exact argv/policy and real native admission before use; no unsandboxed fallback |
| PFP-SEPARATE | Private rerun never supplies the agent's verification evidence or execution permission | No producer/normalizer/score/registry calls or fabricated native events |

The production launcher uses a fresh scratch cwd, sanitized environment, source
via stdin, bounded output and a five-minute timeout. VM isolation supplements
the OS and Node boundary; VM alone is not a security claim. Node 24.19.0 on
Darwin is the prospective qualified runtime. There is no permission relaxation,
credential handling, network allowance or alternative execution environment.
The conservative unsupported-module check rejects the literal word `import`
even in a comment/string, and rejects re-exports. That case remains unavailable;
it is not a correctness failure. This intentionally bounded first probe does
not claim to support every lawful JavaScript module.

The unit tests run trusted synthetic controls through the probe protocol. They
do not qualify `sandbox-exec`, a private evaluator, the full-size timing, a
sealed producer or any adoption gate. The production launcher is not invoked
by these tests. Failed isolation is unavailable, not a zero or retry trigger.

Before integration, independently review normal, bad, unknown and a distinct
algorithm; run the unchanged full workload configuration under the production
isolation; retain raw probe JSON in the existing per-condition private audit
artifacts; pin a new private body/source/reference/archive and admission. The
private worker currently returns only its fragment, so raw timing retention
must be connected and verified before selecting this probe. Do not discard raw
samples into a digest-only fragment. Genuine sealed canonical command evidence
remains required separately for `verification-evidence`; candidate stdout is
not the private timing oracle. Until those obligations close, performance
remains blocked and the existing 21-ready/3-blocked status is unchanged.
