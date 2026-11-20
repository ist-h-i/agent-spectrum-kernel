import { readFileSync } from "node:fs";
import { replaySummaryRequests, repeatedTenantWindowRequests } from "../src/summary-replay.mjs";

const requests = repeatedTenantWindowRequests;
const input = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : {
  requests,
  events: [
    ...requests.map((_, index) => ({ type: "start", index })),
    ...requests.map((_, index) => ({ type: "finish", index })),
  ],
};
console.log(JSON.stringify(await replaySummaryRequests(input.requests, input.events)));
