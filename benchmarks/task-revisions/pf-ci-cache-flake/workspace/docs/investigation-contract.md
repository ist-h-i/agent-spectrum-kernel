# Local build investigation contract

The release coordinator needs an evidence-backed CI recommendation, including its effect on successful builds and cache reuse. All supplied history is fictional deterministic local data. Configuration, scenarios, model and history are available for inspection; actual CI service behavior and occurrence frequency are not supplied.

Create investigation.json conforming to investigation.schema.json, format_version2. Its structured fields are the complete report; do not add freeform claims outside them. The validator establishes shape only, not causal correctness or whether a command was executed. Keep evidence and confidence within what the local observations support.

The reproducer is `node scripts/reproduce-cache.mjs`. Its optional CLI inputs are `--no-cache`, `--include-lock`, and `--node-major=24` or `--node-major=25`; the source defines their modeled effects. Without flags, noCache/includeLock are false and nodeMajor is24. The available key inputs are node_major and lock_digest. This is a tool interface, not a required experiment sequence or a conclusion about which change is appropriate.

Experiments: select enough comparisons to support the causal claim and assess a plausible alternative. Give each executed experiment a unique ID, its complete option tuple and all observation rows returned for the supplied runs, preserving run identity and every returned field. Additional experiments can be reported within the schema bounds. Report commands actually run; copying a model's predicted output is not an execution observation.

Causal witness: use the existing cold_run_id/restored_run_id report fields to identify a comparable pair in your observations. Record their actual fixed inputs, changed factors and outcomes, then link a controlled intervention by experiment/run ID. The field names describe this report's comparison interface; neither a cache restoration nor a changed outcome is itself proof of cause. Explain uncertainty through confidence and limitations if the available comparison cannot support a stronger conclusion.

Competing explanation: state a plausible alternative in claim, assess it against linked experiments as supported, contradicted or unresolved, and accurately record the comparison limits. Multiple changing factors do not isolate causality. Distinguish changed modeled selection from observed execution of a real runtime or service.

Recommendation: name and justify a bounded strategy using strategy, key_fields, options and complete predicted observations for the supplied runs. Compare success and cache reuse separately; do not count a successful build as proof of preserved reuse. Keep existing key inputs when proposing additions. For an intervention beyond the reproducer's modeled inputs, state what remains unsupported rather than inventing modeled results. The report format accepts a strategy name; it does not select an intervention for you.

Confidence is confirmed_for_fixture, supported or unknown. State the actual evidence domain, modeled cache-selection boundary, service observation and frequency-estimate basis in limitations. Labels without linked observations are insufficient. Do not claim measured external CI, restore-prefix service behavior or population frequency from local scenarios.

Only investigation.json may be created. Preserve every supplied file. No production change, installation, service call or deployment is requested. From the workspace, use npm test for tool checks and npm run validate-report for the completed report's structure.
