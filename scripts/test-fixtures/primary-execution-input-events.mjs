// Public artificial provenance examples. Never native attestation or a launch.
export function artificialPrimaryVerificationEvents(contract, condition, change = 'normal') {
  const arm = contract.conditions[condition], check = arm.verification[0];
  const item = { id: 'artificial-primary-check', type: 'command_execution',
    command: check.rendered_event_command, cwd: arm.launch_cwd, status: 'in_progress', exit_code: null };
  const events = [{ type: 'item.started', item },
    { type: 'item.completed', item: { ...item, status: 'completed', exit_code: 0 } }];
  if (change === 'missing_cwd') for (const event of events) delete event.item.cwd;
  if (change === 'wrong_cwd') for (const event of events) event.item.cwd = contract.root;
  if (change === 'changed_command') for (const event of events) event.item.command += ' && unknown-tool';
  if (change === 'incomplete') events.pop();
  if (change === 'duplicate') events.push(structuredClone(events[1]));
  if (change === 'mismatched_pair') events[1].item.command += ' ';
  if (change === 'failed') { events[1].item.status = 'failed'; events[1].item.exit_code = 1; }
  if (change === 'host_read') events.unshift({ type: 'item.started', item: { ...item, id: 'artificial-host-read', command: "/bin/bash -lc 'cat /synthetic-host/private.md'" } });
  if (change === 'late_edit') events.push({ type: 'item.completed', item: { id: 'artificial-late-edit', type: 'file_change', status: 'completed', changes: [{ path: 'workspace/review.json', kind: 'add' }] } });
  return Buffer.from(events.map(event => JSON.stringify(event)).join('\n') + '\n');
}
