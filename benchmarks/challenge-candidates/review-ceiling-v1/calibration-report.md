# RC01 calibration record

Two independently scored trials of the frozen problem were completed: GPT-6.1 Sol low (83.5/100) and Sol max (89/100). Each consists of an initial review and same-session reassessment after the identical fixed operational update. ASK full projection, public problem and prompting were identical; reasoning level differed. The machine-readable metrics and answer hashes are in `calibration-summary.json`.

The trials support using RC01 as a difficult review problem: neither reached the ceiling, and important omissions remained. They do not establish statistical significance, future-model lifetime, or ASK-versus-no-ASK effectiveness. No score band was imposed by editing the rubric after a run.

Generation elapsed time was 20m12.561s and 65m44.999s respectively. The latter includes observed websocket reconnection, so the entire time difference must not be attributed to reasoning efficiency. New input tokens were 241,950 and 448,104; output tokens were 33,789 and 119,529. Cache input is recorded separately and included in total input, not added twice. Descendant usage is included.

Neither trial executed real HTTP/browser verification. Correctly scoped module/VM/process evidence and honest source-only claims were evaluated without crediting author-side tests to the solver. One low child was interrupted; its saved evidence and observed usage were retained. Max parent and all children completed. Standard runner registration is validated separately with model-free contract tests; these calibration runs predate that integration and do not prove it ran end-to-end with a model.

Private reference answers, defects, scoring and evaluator reproduction assets are not part of reviewer input or this calibration record. They are separately bound by hash at evaluation time. No further model trial is required merely to publish the registered problem.
