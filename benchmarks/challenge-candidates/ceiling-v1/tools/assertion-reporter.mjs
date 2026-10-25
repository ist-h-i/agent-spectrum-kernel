// Trusted node:test parent reporter; child stdout is a test:stdout event, never a result.
export default async function* report(source) {
  const failures = []; let passed = 0, failed = 0;
  for await (const event of source) {
    const fileWrapper = event.data?.file && (event.data.name === event.data.file || event.data.file.endsWith('/' + event.data.name));
    if (event.type === 'test:pass' && event.data.details?.type !== 'suite' && !fileWrapper) passed++;
    if (event.type === 'test:fail') {
      failed++;
      const error = event.data.details?.error;
      failures.push({ name: event.data.name, type: error?.failureType ?? null,
        code: error?.cause?.code ?? error?.code ?? null });
    }
  }
  yield JSON.stringify({ passed, failed, failures }) + '\n';
}
