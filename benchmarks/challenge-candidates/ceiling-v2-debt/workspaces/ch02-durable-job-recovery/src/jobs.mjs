import { payloadDigest } from '../harness/renderer.mjs';
import { jobKey } from '../harness/store.mjs';
export function enqueueJob(store, tenantId, requestId, payload) {
  const key = jobKey(tenantId, requestId), digest = payloadDigest(payload);
  const result = store.putIfAbsent(key, { tenantId, requestId, payload: structuredClone(payload), digest, state: 'queued', lease: null, receipt: null, reason: null });
  if (result.job.digest !== digest) throw new Error('payload conflict');
  return result.job;
}
