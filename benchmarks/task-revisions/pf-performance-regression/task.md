# Improve batched event retrieval for an operations timeline

The operations timeline retrieves event groups for many selectors in one batch. The team needs lower local processing time without changing which records appear, their order or the behavior of later calls after input data changes. Investigate the supplied implementation and evidence, then improve `src/event-lookup.mjs`.

Preserve the behavior in `docs/lookup-contract.md` and the reference: one group per request, strict selector equality, inclusive finite time windows, original event identities and occurrence order, unchanged inputs and fresh results across calls. Meet the local runtime target for both supplied workloads in `data/measurement-config.json`; a measurement declared inconclusive is not a measured pass. Retain raw measurement evidence tied to the submitted source.

Only `src/event-lookup.mjs` may change. Preserve reference, tests, generator, measurement script/config and package. Workloads are deterministic fictional data, not production latency or frequency evidence. No dependency installation, network service or external action is needed.

From the workspace, run `npm test` and `npm run measure`. Report the functional result, measured result or inconclusive state, and the limits of the evidence.

Record separate results for sparse and dense data, and for a second call after an input or selector changes. Tie observations to the submitted source and actual measurement output, including counts and raw samples. When equivalence fails before timing, identify any workload with no observation. For an inconclusive run, retain the affected workload, measured conditions and next measurement. Keep time spent solving the task separate from the lookup runtime.
