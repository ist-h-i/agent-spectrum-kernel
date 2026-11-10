import { describe, expect, it } from 'vitest';

import { FlowRunTransitionError, createFlowRun, transitionFlowRun } from '../index.js';

describe('flow run transitions', () => {
  it('creates runs and records valid transitions', () => {
    const run = createFlowRun({
      id: 'run-1',
      flowId: 'project/init',
      at: '2026-05-05T00:00:00.000Z'
    });

    const result = transitionFlowRun(run, {
      to: 'prepared',
      reason: 'workspace selected',
      at: '2026-05-05T00:01:00.000Z'
    });

    expect(result.run.status).toBe('prepared');
    expect(result.run.updatedAt).toBe('2026-05-05T00:01:00.000Z');
    expect(result.transition).toEqual({
      from: 'created',
      to: 'prepared',
      reason: 'workspace selected',
      at: '2026-05-05T00:01:00.000Z'
    });
  });

  it('rejects undefined state transitions', () => {
    const run = createFlowRun({
      id: 'run-1',
      flowId: 'project/init',
      at: '2026-05-05T00:00:00.000Z'
    });

    expect(() =>
      transitionFlowRun(run, {
        to: 'published',
        reason: 'skip preview',
        at: '2026-05-05T00:01:00.000Z'
      })
    ).toThrow(FlowRunTransitionError);
  });
});
