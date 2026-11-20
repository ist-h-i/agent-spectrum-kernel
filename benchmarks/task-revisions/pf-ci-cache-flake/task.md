# Investigate inconsistent storefront build results

A release coordinator needs a defensible explanation for inconsistent cached build outcomes before choosing a CI change. The supplied configuration, history and local model describe the storefront's artifact-build boundary. Determine what these observations establish, compare a plausible competing explanation, and recommend a bounded intervention that accounts for both build correctness and useful cache reuse.

Create only `investigation.json`, following `investigation.schema.json` and `docs/investigation-contract.md`. Include executed experiment options and complete observations, an evidence-linked causal comparison, a competing explanation with its limits, predicted observations for the recommendation, and justified confidence. Distinguish a modeled result from an observation of a real CI service; do not infer incident frequency from these cases.

Preserve every supplied workspace file. The history and model are fictional deterministic local fixtures. No CI configuration change, deployment, installation or service call is requested. The reproducer's supported options are documented in the investigation contract; select experiments that support your claims.

From the workspace, run `npm test`, the local reproducer as needed, and `npm run validate-report` after writing the report. Record what was actually run. Public checks validate tool/report structure; they do not certify the causal explanation.

In one report, link the selected history and experiment rows to the inputs held fixed and the rival explanation they separate. Record what the recommended change predicts for build success and cache reuse on the same run IDs. Identify any question the model cannot settle. A different experiment order or a bounded unresolved conclusion is acceptable when supported by the observations.
