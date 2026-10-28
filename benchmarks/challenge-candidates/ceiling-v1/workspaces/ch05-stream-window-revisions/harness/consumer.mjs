export function consume(processor, input) {
  return input.kind === 'watermark'
    ? processor.advanceWatermark(input.tenantId, input.value)
    : processor.ingest(input);
}
