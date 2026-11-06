export default async function* report(source) {
  const scenarios = [], failures = []; let passed = 0, failed = 0;
  for await (const event of source) {
    if (event.type === 'test:diagnostic' && event.data.message?.startsWith('CEILING_SCENARIO ')) {
      try { scenarios.push(JSON.parse(event.data.message.slice(17))); } catch {}
    }
    const fileWrapper = event.data?.file && (event.data.name === event.data.file || event.data.file.endsWith('/' + event.data.name));
    if (event.type === 'test:pass' && event.data.details?.type !== 'suite' && !fileWrapper) passed++;
    if (event.type === 'test:fail') {
      const error = event.data.details?.error;
      if (error?.failureType === 'subtestsFailed') continue;
      failed++;
      failures.push({ name: event.data.name, type: error?.failureType ?? null, code: error?.cause?.code ?? error?.code ?? null,
        operator: error?.cause?.operator ?? error?.operator ?? null, file: event.data.file ?? null, line: event.data.line ?? null });
    }
  }
  yield JSON.stringify({ version: 'ceiling-scenario-report-v1', passed, failed, scenarios, failures }) + '\n';
}
