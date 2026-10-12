# Local build investigation contract

All supplied history is fictional deterministic local data. Trace configuration, scenarios, model and history to investigate the strongest supported cause, test a competing explanation, and recommend the smallest intervention. Occurrence frequency and real service behavior are not supplied.

Create investigation.json conforming to investigation.schema.json, format_version2. The structured fields below are the complete report. Do not add freeform summaries or extra claims outside these fields. The validator establishes shape only, not a correct causal explanation. Reproducing the model in a report is not evidence that a command was executed. Use the final validation invocation from task.md separately.

Experiments: provide complete observation rows for every supplied run, uniquely identified as baseline, no_cache, key_with_lock and runtime_major. These correspond to the unchanged reproducer with no options, --no-cache, --include-lock and --node-major=25 respectively. Record the complete option tuple for each; omitted flags are false and the supplied runtime is24. Preserve row/run identities and every returned field. Additional experiments may be reported but unfamiliar strategies or meanings require review.

Causal witness: choose a baseline cold/restored pair and demonstrate comparability through fixed runtime, lock and required-artifact inputs. State the changed restoration/artifact factor and both outcomes. Link the same restored run to a controlled intervention experiment, with the resulting restoration, artifact and outcome. If the observations do not support such a comparison, state the uncertainty rather than inventing one. Tables alone do not establish this relation.

Competing explanation: assess runtime_alone against the runtime_major experiment and baseline. Status is supported, contradicted or unresolved; record whether the comparison changes cache selection, isolates runtime effect, or observes real runtime behavior. Multiple changing factors cannot establish isolated causality. Distinguish a local explanation from conclusions about actual service or runtime incidents.

Recommendation: choose disable_artifact_restore or key_dimensions, or document another strategy for manual review. For key_dimensions, list the proposed key inputs; retain existing inputs. For disable_artifact_restore, use an empty key_fields list and disable restoration in the option tuple. Provide complete predicted observations for every supplied run under the recommendation, and compare success and cache reuse separately. The available reproducer supports only runtime-major and lock-digest key inputs; new dimensions are outside its modeled domain. A cache-safe intervention need not retain every prior reuse.

Confidence is confirmed_for_fixture, supported or unknown. Scope limitations state the actual evidence domain, modeled cache selection, service observation and occurrence-frequency basis. Confidence labels or limitation labels without correct linked observations are insufficient. Do not claim measured external CI, restore-prefix service behavior or population frequency from these local scenarios.

Only investigation.json may be created. Preserve all supplied files. No production change, installation, service call or deployment is requested.
