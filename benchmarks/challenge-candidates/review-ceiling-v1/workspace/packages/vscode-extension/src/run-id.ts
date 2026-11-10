export function createRunId(now: Date): string {
  return `run_${now.toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'z')}`;
}
