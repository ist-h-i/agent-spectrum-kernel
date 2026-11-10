import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { ReviewStore } from "./store.mjs";
import {
  artifactForReview,
  ArtifactCache,
  ExportService,
} from "./artifacts.mjs";
import { LocalReviewProvider } from "./provider.mjs";
import { PublishQueue } from "./jobs.mjs";
import { ReviewQueries } from "./reviews.mjs";
import { teamAccess, visibleTeams } from "./access.mjs";
import { HttpError, requireValue } from "./errors.mjs";
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const json = (res, status, data) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    requireValue(Buffer.byteLength(raw) < 65536, 413, "Request too large");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export function createPortal(options = {}) {
  const store =
    options.store ?? new ReviewStore({ directory: options.stateDirectory });
  const provider =
    options.provider ??
    new LocalReviewProvider({
      directory: options.providerDirectory ?? options.stateDirectory,
    });
  const cache = options.cache ?? new ArtifactCache();
  const exports = new ExportService(store, cache);
  const queue = new PublishQueue(store, provider, {
    autoRun: options.autoRun ?? true,
  });
  const queries = new ReviewQueries(store);
  const settings = new Map();
  const personalOrders = new Map();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (!url.pathname.startsWith("/api/")) {
        requireValue(req.method === "GET", 405, "Method not allowed");
        const path = resolve(
          publicRoot,
          "." +
            decodeURIComponent(
              url.pathname === "/" ? "/index.html" : url.pathname,
            ),
        );
        requireValue(
          path.startsWith(publicRoot + sep) || path.startsWith(publicRoot),
          403,
          "Invalid asset path",
        );
        const data = await readFile(path).catch(() => {
          throw new HttpError(404, "Asset not found");
        });
        const mime = {
          ".html": "text/html",
          ".mjs": "text/javascript",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        };
        res.writeHead(200, {
          "content-type": `${mime[extname(path)] ?? "application/octet-stream"}; charset=utf-8`,
          "x-content-type-options": "nosniff",
        });
        res.end(data);
        return;
      }
      // This local fixture has no session service. Only allow the synthetic identities.
      const user = req.headers["x-user-id"] ?? "alex";
      if (url.pathname === "/api/teams" && req.method === "GET")
        return json(res, 200, { teams: visibleTeams(user) });
      const match =
        /^\/api\/teams\/([a-z]+)\/(reviews|jobs|metrics|settings)(?:\/([^/]+))?(?:\/(artifact|export|publish|retry|notes|verification))?$/.exec(
          url.pathname,
        );
      requireValue(match, 404, "Route not found");
      const [, team, resource, id, action] = match;
      teamAccess(user, team, req.method !== "GET");
      if (resource === "settings") {
        if (req.method === "POST" || req.method === "PATCH") {
          const value = await body(req);
          if (value.pinnedOrder !== undefined) {
            requireValue(
              Array.isArray(value.pinnedOrder) &&
                value.pinnedOrder.length <= 500 &&
                value.pinnedOrder.every((id) => typeof id === "string") &&
                new Set(value.pinnedOrder).size === value.pinnedOrder.length,
              400,
              "Invalid pinned order",
            );
            for (const key of value.pinnedOrder) {
              const parts = key.split("/");
              requireValue(parts.length <= 2, 400, "Invalid pinned review key");
              const [targetTeam, targetId] =
                parts.length === 2 ? parts : [team, key];
              teamAccess(user, targetTeam);
              store.get(targetTeam, targetId);
            }
            personalOrders.set(`${user}/${team}`, [...value.pinnedOrder]);
            delete value.pinnedOrder;
          }
          settings.set(team, { ...settings.get(team), ...value });
        } else requireValue(req.method === "GET", 405, "Method not allowed");
        return json(res, 200, {
          publishEnabled: true,
          retentionDays: 30,
          workspaceName: team,
          digestEmail: "",
          requireApproval: true,
          compactRows: false,
          reminderHours: 24,
          ...settings.get(team),
          pinnedOrder: personalOrders.get(`${user}/${team}`) ?? [],
        });
      }
      if (resource === "metrics" && req.method === "GET")
        return json(
          res,
          200,
          queries.metrics(team, {
            partial: url.searchParams.get("partial") === "1",
          }),
        );
      if (resource === "jobs" && id) {
        const job = store.jobs.get(id);
        requireValue(job?.teamId === team, 404, "Job not found");
        if (action === "retry" && req.method === "POST")
          return json(res, 202, { job: queue.retry(team, id) });
        requireValue(
          req.method === "GET" && !action,
          405,
          "Method not allowed",
        );
        return json(res, 200, { job });
      }
      requireValue(resource === "reviews", 404, "Route not found");
      if (!id && req.method === "GET")
        return json(
          res,
          200,
          await queries.list(team, Object.fromEntries(url.searchParams)),
        );
      const review = store.get(team, id);
      if (action === "verification" && req.method === "POST") {
        const payload = await body(req);
        requireValue(
          Number.isInteger(payload.version),
          400,
          "version is required",
        );
        requireValue(
          Array.isArray(payload.results) && payload.results.length <= 100,
          400,
          "results must be an array of at most 100 entries",
        );
        for (const result of payload.results) {
          requireValue(
            typeof result.fixPlanItemId === "string" &&
              typeof result.status === "string" &&
              typeof result.evidence === "string" &&
              Array.isArray(result.commands) &&
              result.commands.every((c) => typeof c === "string"),
            400,
            "Invalid verification result",
          );
        }
        let artifact;
        try {
          artifact = artifactForReview({
            ...review,
            verificationResults: payload.results,
          });
        } catch (error) {
          throw new HttpError(400, error.message);
        }
        const updated = await store.update(
          team,
          id,
          payload.version,
          { verificationResults: payload.results },
          user,
        );
        return json(res, 200, {
          review: updated,
          verification: artifact.workflow.verification,
        });
      }
      if (action === "notes" && req.method === "POST") {
        const payload = await body(req);
        requireValue(
          typeof payload.body === "string" &&
            payload.body.trim().length > 0 &&
            payload.body.length <= 4000,
          400,
          "Note must contain 1 to 4000 characters",
        );
        return json(res, 201, store.appendNote(team, id, payload.body, user));
      }
      if (action === "publish" && req.method === "POST") {
        const payload = await body(req);
        if (payload.version !== undefined)
          requireValue(
            payload.version === review.version,
            409,
            "Review changed",
          );
        const requestKey = req.headers["idempotency-key"];
        requireValue(
          typeof requestKey === "string" &&
            requestKey.length > 0 &&
            requestKey.length < 200,
          400,
          "Idempotency-Key is required",
        );
        return json(res, 202, {
          job: queue.enqueue(team, id, requestKey, user),
        });
      }
      if (
        (action === "artifact" || action === "export") &&
        req.method === "GET"
      ) {
        const bundle = await exports.build(team, id, {
          compact: url.searchParams.get("compact") === "1",
        });
        return json(res, 200, action === "artifact" ? bundle.artifact : bundle);
      }
      if (req.method === "PATCH" && !action) {
        const payload = await body(req);
        requireValue(
          Number.isInteger(payload.version),
          400,
          "version is required",
        );
        const patch = {};
        if (payload.status !== undefined) {
          requireValue(
            ["open", "approved", "archived"].includes(payload.status) ||
              (payload.status === "published" &&
                review.status === "archived" &&
                review.archivedFrom === "published"),
            400,
            "Invalid review status",
          );
          patch.status = payload.status;
          if (payload.status === "archived" && review.status !== "archived")
            patch.archivedFrom = review.status;
          if (payload.status !== "archived") patch.archivedFrom = null;
        }
        if (payload.title !== undefined) {
          requireValue(
            typeof payload.title === "string" &&
              payload.title.length > 0 &&
              payload.title.length < 240,
            400,
            "Invalid title",
          );
          patch.title = payload.title;
        }
        if (payload.note !== undefined) {
          requireValue(
            typeof payload.note === "string" && payload.note.length <= 4000,
            400,
            "Invalid note",
          );
          patch.note = payload.note;
        }
        return json(
          res,
          200,
          await store.update(team, id, payload.version, patch, user),
        );
      }
      requireValue(req.method === "GET" && !action, 405, "Method not allowed");
      return json(res, 200, review);
    } catch (error) {
      json(res, error.status ?? 500, {
        error: error.status ? error.message : "Local operation failed",
      });
    }
  });
  return {
    server,
    store,
    provider,
    cache,
    exports,
    queue,
    queries,
    async listen(port = 0) {
      await new Promise((r, j) =>
        server.once("error", j).listen(port, "127.0.0.1", r),
      );
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}
