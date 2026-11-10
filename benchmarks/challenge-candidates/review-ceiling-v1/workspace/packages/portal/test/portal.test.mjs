import test from "node:test";
import assert from "node:assert/strict";
import { createPortal } from "../server/app.mjs";
import { normalizeArtifact } from "../server/artifacts.mjs";
async function withPortal(fn) {
  const app = createPortal({ autoRun: false });
  const base = await app.listen();
  try {
    await fn(app, base);
  } finally {
    await app.close();
  }
}
async function request(base, path, options = {}) {
  const response = await fetch(base + path, options);
  return { status: response.status, body: await response.json() };
}
test("queue, team-scoped cursor, detail and metrics are available", () =>
  withPortal(async (app, base) => {
    const first = await request(base, "/api/teams/alpha/reviews?limit=2");
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 2);
    assert.ok(first.body.nextCursor);
    const second = await request(
      base,
      `/api/teams/alpha/reviews?limit=2&cursor=${first.body.nextCursor}`,
    );
    assert.equal(second.body.items.length, 2);
    assert.notEqual(first.body.items[0].id, second.body.items[0].id);
    assert.equal(
      (
        await request(
          base,
          `/api/teams/beta/reviews?cursor=${first.body.nextCursor}`,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request(base, "/api/teams/alpha/reviews/review-001")).body
        .repository,
      "synthetic/alpha-console",
    );
    assert.equal(
      (await request(base, "/api/teams/alpha/metrics")).body.total,
      18,
    );
  }));
test("readers cannot mutate, and other-team members cannot read", () =>
  withPortal(async (app, base) => {
    assert.equal(
      (
        await request(base, "/api/teams/beta/reviews", {
          headers: { "x-user-id": "blair" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(base, "/api/teams/alpha/reviews/review-001", {
          method: "PATCH",
          headers: { "x-user-id": "blair" },
          body: JSON.stringify({ version: 1, title: "Replacement" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(base, "/api/teams/alpha/reviews/review-missing")).status,
      404,
    );
  }));
test("serial optimistic updates reject stale versions and keep notes", () =>
  withPortal(async (app, base) => {
    const path = "/api/teams/alpha/reviews/review-001";
    const options = {
      method: "PATCH",
      body: JSON.stringify({ version: 1, note: "Checked synthetic fixture" }),
    };
    assert.equal((await request(base, path, options)).body.version, 2);
    assert.equal((await request(base, path, options)).status, 409);
    assert.equal(
      (await request(base, path)).body.note,
      "Checked synthetic fixture",
    );
  }));
test("approved review publishes through local queue and repeated request returns same job", () =>
  withPortal(async (app, base) => {
    const path = "/api/teams/alpha/reviews/review-001/publish";
    const options = {
      method: "POST",
      headers: { "idempotency-key": "one-click" },
      body: "{}",
    };
    const first = await request(base, path, options);
    assert.equal(first.status, 202);
    await app.queue.run(first.body.job.id);
    const again = await request(base, path, options);
    assert.equal(again.body.job.id, first.body.job.id);
    assert.equal(again.body.job.state, "succeeded");
    assert.equal(app.provider.publications.length, 1);
    assert.equal(
      (
        await request(
          base,
          "/api/teams/alpha/reviews/review-002/publish",
          options,
        )
      ).status,
      409,
    );
    assert.equal(
      (await request(base, `/api/teams/beta/jobs/${first.body.job.id}`)).status,
      404,
    );
  }));
test("artifact preserves finding identity and current category/severity", () => {
  const converted = normalizeArtifact({
    reviewFindings: [
      {
        id: "f1",
        title: "Inspect parser",
        category: "test",
        severity: "minor",
        summary: "Round trip",
      },
    ],
  });
  assert.equal(converted.reviewFindings[0].id, "f1");
  assert.equal(converted.reviewFindings[0].severity, "minor");
  assert.equal(converted.reviewFindings[0].category, "test");
});
test("settings are team-scoped and inputs reject invalid status/body", () =>
  withPortal(async (app, base) => {
    await request(base, "/api/teams/alpha/settings", {
      method: "POST",
      body: JSON.stringify({ workspaceName: "Atlas" }),
    });
    assert.equal(
      (await request(base, "/api/teams/alpha/settings")).body.workspaceName,
      "Atlas",
    );
    assert.equal(
      (await request(base, "/api/teams/beta/settings")).body.workspaceName,
      "beta",
    );
    assert.equal(
      (
        await request(base, "/api/teams/alpha/reviews/review-001", {
          method: "PATCH",
          body: JSON.stringify({ version: 1, status: "published" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(base, "/api/teams/alpha/reviews/review-001", {
          method: "PATCH",
          body: "not json",
        })
      ).status,
      400,
    );
  }));

test("core workflow runs from normalized findings through saved verification", () =>
  withPortal(async (app, base) => {
    const path = "/api/teams/alpha/reviews/review-001";
    const artifact = (await request(base, path + "/artifact")).body;
    assert.ok(artifact.workflow.actionPlan.length > 0);
    const fix = artifact.workflow.fixPlan.items[0];
    assert.ok(artifact.workflow.checklist.items.length > 0);
    const saved = await request(base, path + "/verification", {
      method: "POST",
      body: JSON.stringify({
        version: 1,
        results: [
          {
            fixPlanItemId: fix.id,
            status: "passed",
            evidence: "Synthetic focused test passed",
            commands: ["node --test"],
          },
        ],
      }),
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.verification.summary.resolvedCount, 1);
    const next = (await request(base, path + "/artifact")).body;
    assert.equal(
      next.workflow.verification.results[0].evidence,
      "Synthetic focused test passed",
    );
    assert.ok(
      next.workflow.explanation.body.includes("Synthetic focused test passed"),
    );
    assert.equal(
      (
        await request(base, path + "/verification", {
          method: "POST",
          body: JSON.stringify({
            version: 2,
            results: [
              {
                fixPlanItemId: "not-real",
                status: "passed",
                evidence: "x",
                commands: [],
              },
            ],
          }),
        })
      ).status,
      400,
    );
  }));

test("coordinator notes append a team-scoped history entry", () =>
  withPortal(async (app, base) => {
    const result = await request(
      base,
      "/api/teams/alpha/reviews/review-001/notes",
      {
        method: "POST",
        body: JSON.stringify({ body: "Follow the focused verification plan" }),
      },
    );
    assert.equal(result.status, 201);
    assert.equal(result.body.history.at(-1).type, "note_created");
    assert.equal(result.body.note, "Follow the focused verification plan");
  }));

test("archive and undo preserve optimistic versions, including already published reviews", () =>
  withPortal(async (app, base) => {
    const path = "/api/teams/alpha/reviews/review-008";
    const initial = (await request(base, path)).body;
    assert.equal(initial.status, "published");
    const archived = await request(base, path, {
      method: "PATCH",
      body: JSON.stringify({ version: initial.version, status: "archived" }),
    });
    assert.equal(archived.body.archivedFrom, "published");
    const undo = await request(base, path, {
      method: "PATCH",
      body: JSON.stringify({
        version: archived.body.version,
        status: initial.status,
      }),
    });
    assert.equal(undo.status, 200);
    assert.equal(undo.body.status, "published");
    assert.equal(undo.body.version, 3);
    assert.equal(
      (
        await request(base, path, {
          method: "PATCH",
          body: JSON.stringify({
            version: archived.body.version,
            status: "archived",
          }),
        })
      ).status,
      409,
    );
  }));

test("pinned order persists per team and rejects duplicates or unknown records", () =>
  withPortal(async (app, base) => {
    const path = "/api/teams/alpha/settings";
    assert.equal(
      (
        await request(base, path, {
          method: "PATCH",
          body: JSON.stringify({ pinnedOrder: ["review-002", "review-001"] }),
        })
      ).status,
      200,
    );
    assert.deepEqual((await request(base, path)).body.pinnedOrder, [
      "review-002",
      "review-001",
    ]);
    assert.deepEqual(
      (await request(base, "/api/teams/beta/settings")).body.pinnedOrder,
      [],
    );
    assert.equal(
      (
        await request(base, path, {
          method: "PATCH",
          body: JSON.stringify({ pinnedOrder: ["review-001", "review-001"] }),
        })
      ).status,
      400,
    );
  }));

test("export response envelope is ready for portal consumption", () => {
  const result = normalizeArtifact({
    requiresUserEdit: true,
    structured: false,
    warnings: ["Manual reconciliation needed"],
    findings: [
      { id: "f1", title: "Inspect boundary", summary: "Check parser" },
    ],
  });
  assert.equal(result.requiresUserEdit, false);
  assert.equal(result.structured, true);
});

test("large requested page size still produces queue rows", () =>
  withPortal(async (app, base) => {
    const page = await request(base, "/api/teams/alpha/reviews?limit=100000");
    assert.equal(page.status, 200);
    assert.ok(page.body.items.length > 0);
  }));

test("persisted row fixture updates from its canonical first revision", async () => {
  const { reviewFixture } = await import("./helpers/review-fixture.mjs");
  const { ReviewStore } = await import("../server/store.mjs");
  const fixture = reviewFixture({ version: -3 });
  const store = new ReviewStore({ reviews: [fixture] });
  const result = await store.update(
    "alpha",
    fixture.id,
    1,
    { note: "Fixture note" },
    "alex",
  );
  assert.equal(result.version, 2);
});

test("cross-team personal order permits only accessible targets and is not shared with readers", () =>
  withPortal(async (app, base) => {
    const path = "/api/teams/alpha/settings";
    const order = ["alpha/review-001", "beta/review-001"];
    assert.equal(
      (
        await request(base, path, {
          method: "PATCH",
          body: JSON.stringify({ pinnedOrder: order }),
        })
      ).status,
      200,
    );
    assert.deepEqual((await request(base, path)).body.pinnedOrder, order);
    assert.deepEqual(
      (await request(base, path, { headers: { "x-user-id": "blair" } })).body
        .pinnedOrder,
      [],
    );
    assert.equal(
      (
        await request(base, "/api/teams/beta/settings", {
          method: "PATCH",
          headers: { "x-user-id": "casey" },
          body: JSON.stringify({ pinnedOrder: ["alpha/review-001"] }),
        })
      ).status,
      403,
    );
  }));
