# Source-isolated scenario protocol

This public runtime adds a bounded test format for the separate ten-point test-effectiveness dimension. Ordinary Node tests remain usable locally. Tests submitted for that dimension go in `test/added/scenarios/*.test.mjs` and register `scenarioTest(name, {program, check})` from `harness/scenario.mjs`. The provided protected `test/scenario-public.test.mjs` demonstrates each task's API. Test helpers/data may be elsewhere under `test/added/`; the entire tree is digest-bound.

The same program and check execute locally and during grading. Grading has three separate phases:

1. In the submission-only workspace, extraction records scenario data without loading a reference implementation or running its check.
2. A separate trusted workspace receives only validated JSON operations. It runs the correct or intentionally defective implementation and returns public API observations. Submitted JavaScript, tests and helpers are absent. Private assertion/oracle code stays with the host controller.
3. The original submitted test tree runs with the resulting JSON observations and public harness/data. No `src/` implementation is present, including the original submission's source. The same checks must pass both correct structures and assertion-fail corresponding semantic defects; independent failure-provenance review remains required.

This changes data transport, not the 30/30/25/10/5 allocation. It is not proof of container isolation: the actual Docker boundary, negative read probes and full grader matrix still require separate authorization and verification. No model measurements are admitted by these files.

The per-task capability table is a closed list of public module exports, opaque interface kinds, callable methods and observable fields. Opaque references may be passed only at listed constructor/client injection points. Function references are never data: unsubscribe handles support only `release`. There are no native filesystem, Function, prototype or arbitrary-method capabilities. Public dataset reads are exact allowlisted `data/*.json` paths. Map observations become `{size, entries}`; methods and functions are not exposed. JSON result objects carry no executable references.

Programs support `construct`, `invoke`, `call`, `get`, `record`, `dataset`, `await`, `release`. Finite `$callback` instruction arrays support `$arg`, `return`, and typed `raise` with RETRYABLE/PERMANENT/PROCESS_CRASH. Async calls can use `await:false` followed by `await`. The bounds are 512 KiB JSON, depth 32, 1024 declared instructions and 4096 executed instructions including callbacks. Unbounded/random scenario registration is not supported; inputs must reproduce across extraction/replay. Business values are JSON, with `$literal` available when data contains protocol marker keys.

The canonical files here are projected into each standalone workspace by `tools/seal-public-inputs.mjs --write`. Its check mode rejects stale projections. Protected input manifests bind the projected runtime and capabilities along with each task's original inputs.
