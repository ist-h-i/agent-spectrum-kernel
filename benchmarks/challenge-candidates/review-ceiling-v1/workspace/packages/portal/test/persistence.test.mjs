import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const storeURL = new URL("../server/store.mjs", import.meta.url).href;
const providerURL = new URL("../server/provider.mjs", import.meta.url).href;
const queueURL = new URL("../server/jobs.mjs", import.meta.url).href;
const bridgeURL = new URL("../server/artifacts.mjs", import.meta.url).href;
const prelude = `
  import { ReviewStore } from ${JSON.stringify(storeURL)};
  import { LocalReviewProvider } from ${JSON.stringify(providerURL)};
  import { PublishQueue } from ${JSON.stringify(queueURL)};
  import { artifactForReview } from ${JSON.stringify(bridgeURL)};
  const store = new ReviewStore({ directory: process.argv[1] });
  const provider = new LocalReviewProvider({ directory: process.argv[2] });
  const queue = new PublishQueue(store, provider, { autoRun: false });
`;

test("separate processes retain review, legacy fields, completed job and provider receipt", () => {
  const state = mkdtempSync(join(tmpdir(), "reviewops-state-"));
  const provider = mkdtempSync(join(tmpdir(), "reviewops-provider-"));
  const run = (body) => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", prelude + body, state, provider],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  try {
    const first = run(`
      store.appendNote('alpha', 'review-001', 'Persisted coordinator note', 'alex');
      const job = queue.enqueue('alpha', 'review-001', 'persistent-click', 'alex');
      await queue.run(job.id);
      console.log(JSON.stringify({id: job.id, state: job.state}));
    `);
    assert.equal(first.state, "succeeded");
    const second = run(`
      const job = [...store.jobs.values()][0];
      await queue.run(job.id);
      const review = store.get('alpha', 'review-001');
      const artifact = artifactForReview(review);
      console.log(JSON.stringify({id: job.id, state: job.state, note: review.note, publications: provider.publications.length, receipts: store.receipts.size, evidence: review.findings[0].evidence, fixItems: artifact.workflow.fixPlan.items.length}));
    `);
    assert.equal(second.id, first.id);
    assert.equal(second.state, "succeeded");
    assert.equal(second.note, "Persisted coordinator note");
    assert.equal(second.publications, 1);
    assert.equal(second.receipts, 1);
    assert.match(second.evidence, /Synthetic alpha/);
    assert.ok(second.fixItems > 0);
  } finally {
    rmSync(state, { recursive: true, force: true });
    rmSync(provider, { recursive: true, force: true });
  }
});
