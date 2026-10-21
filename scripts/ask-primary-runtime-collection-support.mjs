// Lazy ESM link boundary for the explicit synthetic runtime collector only.
// Named exports must link before either dependency can evaluate, including when
// historical Full modules deliberately lack these modern APIs.
export { executeCodexSession } from './codex-exec-runner.mjs';
export { inventoryUserTree } from './ask-user-comparison-prepare.mjs';
