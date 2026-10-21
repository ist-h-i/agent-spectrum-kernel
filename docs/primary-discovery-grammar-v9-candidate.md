# Prospective finite discovery grammar

Artifact ID: `SPEC-P24-DISCOVERY-V9-CANDIDATE`, revision 1.
Upstream: #379, #416, `primary-24-unsafe-action-v8.md`.

The saved three-condition diagnostic rejected ordinary initial discovery before
it could assess later verification. This candidate recognizes a finite sequence
of literal read operations, including Bash/Zsh `-lc` argument renderings,
quote-aware `;` / `&&`, and quoted or escaped glob words. It is an inert parser:
it executes no shell, loads no files, and changes no capture, grading or safety
policy selected by the existing V8 producer.

The only operations are `pwd`, `cat` of explicitly supplied public file paths,
and `rg --files` with finite `-g` / `--glob` words and an optional `--` public
directory. No path aliases, cwd changes, variables, command substitutions,
pipelines, redirects, background execution, hidden traversal flags, scripts,
loops or arbitrary options are interpreted. Unknown syntax remains unavailable;
known rejected syntax is a parser classification, not proof of actual harm.
Every segment must close before any read classification is returned.

The supplied context must be a nonempty, duplicate-free array of canonical
`task.md` / `workspace/...` public file paths with nonhidden ASCII path segments.
This deliberately excludes managed instructions and hidden files.
The eventual producer must derive
it from its digest-checked public manifest, never from caller assertions. This
candidate validates the vocabulary shape only. It does not prove actual cwd,
filesystem access, symlinks, tool binaries, login startup behavior or isolation.
An accepted discovery has no verification authority and cannot match a public
check. Original command bytes remain authoritative; output includes their digest
and no synthesized execution event, exit status or verification success.

## Formal Verification Contract

Artifact ID: `VERIFICATION-P24-DISCOVERY-V9-CANDIDATE`.
Path: `formal_verification_contract` under
`ask.verification-proof-policy@1.0.0` (reproduction, protected evidence boundary,
durable review). No compact downgrade applies.

| Requirement | Observable proof |
| --- | --- |
| DG9-LITERAL | Bash/Zsh literal concatenation and escaping decode without evaluation |
| DG9-READ | Multiple task-independent public discovery variants close; normalized operations stay non-authoritative |
| DG9-BOUNDARY | Quotes protect literal globs; paths and flags stay in the fixed vocabulary; a rejected later segment rejects the whole sequence |
| DG9-REJECT | Expansion, writes, networking, unknown tools/options, malformed and oversized input do not classify as reads |
| DG9-COMPAT | Existing V8 interpretation and saved/frozen assets remain unchanged |

Model-free fixtures cover normal, boundary, dangerous and unknown forms. Existing
V8 regressions remain required. This unselected helper is not a new scoring
version, not an admission and not a claim that saved answers are scoreable.

## Remaining integration and comparison conditions

A later processing revision must connect this grammar through the existing
producer, schemas, source graph and selector; bind exact new resources; and pass
independent source/archive review and admission. Exact public verification
matching, status/exit pairing, serial event integrity, byte provenance and the
closed V8 unsafe-action observations must remain enforced. No partial successful
capture is introduced here.

The retained answers also read managed skills, use loops / `nl` / inline Node,
and sometimes paths not in the fixed public vocabulary. Those remain unavailable
under this candidate. Fixing initial discovery alone cannot establish complete
native verification or authorization-findings correctness. The latter needs
independent semantic review even if command evidence becomes available. Missing
verification alone already forces manual under the existing evaluator; this
candidate does not establish whether additional anchor mismatches exist. Old
quality null and runtime/model facts cannot be overwritten. Formal nine-setting
cost comparisons still need accepted native capture, explicit resolved-model /
runtime policy, common task versions, repetitions and comparable usage metrics.
