// Newly authored artificial events. Shell and check strings are data only.
import { artificialLiteralCommand } from './test-helpers-primary-literal-word-v5.mjs';
export function artificialAuxiliaryEnvelope({ contract, armRoot, edit = true, status = 'completed', exit_code = 0 }) {
  const pair = (command, id, terminal = status, code = exit_code) => [
    { type: 'item.started', item: { id, type: 'command_execution', command, status: 'in_progress' } },
    { type: 'item.completed', item: { id, type: 'command_execution', command, status: terminal, exit_code: code, aggregated_output: 'new artificial saved output; not executed' } },
  ];
  const checks = contract.commands.map((command, index) => pair(artificialLiteralCommand(command, { literalPrefix: true }), `artificial-v6-check-${index}`));
  const change = ['item.started', 'item.completed'].map((type, index) => ({ type,
    item: { id: 'artificial-v6-edit', type: 'file_change', status: index ? 'completed' : 'in_progress',
      changes: [{ path: armRoot + '/workspace/build.config.json', kind: 'update' }] } }));
  return [{ type: 'thread.started', thread_id: 'new-artificial-v6-thread' }, { type: 'turn.started' },
    ...pair('/bin/zsh -lc "pwd"', 'artificial-v6-pwd', 'completed', 0),
    ...pair('/bin/zsh -lc "cat task.md"', 'artificial-v6-cat', 'completed', 0),
    ...pair('/bin/zsh -lc "rg --files"', 'artificial-v6-rg', 'completed', 0),
    ...(edit ? change : []), ...checks.map(value => value[0]), ...checks.toReversed().map(value => value[1]),
    { type: 'turn.completed', usage: { input_tokens: 3, cached_input_tokens: 0, output_tokens: 2, cache_write_input_tokens: 0, reasoning_output_tokens: 0 } }];
}
