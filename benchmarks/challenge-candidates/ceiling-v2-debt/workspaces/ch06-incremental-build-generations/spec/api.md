# Build API debt-v2

## A: legacy and modern callers

`src/workspace.mjs:createWorkspaceBuilder({compiler,publisher,concurrency})` returns build(snapshot), buildLegacy(legacy), cancel(projectId,generation). concurrency is a positive integer. Modern snapshot is `{projectId,generation,compilerVersion,config,files}`; files maps normalized relative POSIX paths to `{text,imports?,discover?,globs?,fail?}`. All file keys are targets. Arrays absent mean empty. Globs have at most one* matching a filename segment, never slash. Values are immutable caller-owned JSON; capture before asynchronous work.

Legacy wire is `{project,revision,compiler,settings,sources:[{path,body,requires?,discover?,globs?,fail?}]}`. settings is a JSON object or JSON object string. A duplicate source path returns `{projectId,generation,status:'rejected',reason:'duplicate_path',results:{}}` without compiler/publisher effects. Legacy fields map to modern equivalents. Config object key order recursively does not change meaning; arrays remain ordered. `src/builder.mjs:createBuildSystem(options)` retains build(oldSnapshot) and returns `{generation,results}` for project default, equivalent to modern default with status/project fields omitted.

Each project accepts strictly increasing positive safe generation, or an identical normalized snapshot at its current generation. Older requests return status rejected/reason stale_generation; changed inputs at the same generation return generation_conflict. Neither rejection supersedes a running request, changes cache or publishes. A valid build returns `{projectId,generation,status:'completed',results}` even when some targets failed. No source/config mutation or process-global cross-instance state.

## B: shared scheduler, cancellation and publication

Within one createWorkspaceBuilder instance, compiler active calls across all projects and overlapping requests never exceed concurrency. Protected manual compiler resolves only when complete(id) is invoked; scheduler exposes finite deterministic completion ordering. Independent ready targets progress when calls are fairly completed. Cancellation cannot stop already started provider calls: cancel(project,generation) marks every still-running attempt at that generation and returns true iff any was marked. Queued provider calls for those attempts must not start afterwards. A canceled build resolves after started provider calls settle with `{projectId,generation,status:'cancelled',results:{}}`. It publishes nothing and contributes no new artifact cache entries. Previously valid cache entries may remain. Other projects and later reruns are unaffected.

Publisher.publish records a detached `{projectId,generation,results}`. Exactly one coherent result is published for each completed latest noncancelled request of its project. Never publish superseded or canceled completions, even while a newer request is pending. Rerunning identical current input is a new request and may publish once. Other projects' generation numbers do not supersede this project. A prior visible result may remain; its project/generation identify it. No partial publication. Public publisher.latest(projectId='default') and history(projectId?) expose copies.

## C: graph and transactional artifact cache

compiler.inspect yields sorted imports/glob matches for this snapshot; compile can return status dependencies with the complete required set discovered so far, status ok with output/dependencies, or status failed with reason/path. Dependencies must be reconciled before success. Missing source/compiler failure fails the target and transitive importers; independent targets still finish. Cycle uses reason cycle and a closed dependency walk; affected importers may use dependency_failed. Direct compile failure preserves compiler reason; dependency failure identifies dependency.

Output is deterministic in project, path, source, compilerVersion, canonical config and sorted dependency path/artifact pairs. Cache requires that complete identity. Project default retains the old output namespace. After one completed successful latest noncancelled warm build, identical input must cause zero provider calls; a local edit must reuse unaffected targets. Globs must notice additions/deletions; discovered dependencies must not outlive their source identity. A failed output is never reused as success. Stage new artifacts privately while a request runs, merge only at completion if still the latest noncancelled request, and retain only entries needed by its current targets; canceled/superseded requests cannot overwrite current cache. Other equivalent implementations with the same public behavior are valid.

The compiler accepts implementation-private snapshot metadata but ignores it for compilation identity; clients must not depend on its format. Compiler observations include projectId/generation/path and global active/peak counts. Original producer inputs are valid except the explicit generation and duplicate-legacy rejection cases above. Rejection reason values are stable enums; human explanations and opaque request IDs are not graded.

Run npm test, add tests under test/added and scoring scenarios under test/added/scenarios. Only src/**, test/added/**, RESULT.md are mutable. Fixed harness/spec/data/package/original tests are not submitted code.

## Non-goals

No disk cache, cross-process sharing, network compiler, provider abort API, background watch loop, or retry policy is required. Generation and source inputs satisfy the declared valid-producer contract except for explicitly tested stale/conflicting generations and duplicate legacy paths. Fair completion is supplied by the protected scheduler; cancellation cannot force an active compiler to settle.
