import { replaySummaryRequests, repeatedTenantWindowRequests } from "../src/summary-replay.mjs";

console.log(JSON.stringify(replaySummaryRequests(repeatedTenantWindowRequests)));
