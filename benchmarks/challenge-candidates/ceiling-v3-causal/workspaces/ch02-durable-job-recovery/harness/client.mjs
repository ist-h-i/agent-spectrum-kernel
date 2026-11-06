export function submitReport(queue, { tenantId, requestId, payload }) { return queue.enqueue(tenantId, requestId, payload); }
export function workerTick(queue, worker) { const job = queue.claim(worker); return job ? queue.run(job.key, worker) : null; }
export function jobView(queue, key) { return queue.snapshot(key); }
