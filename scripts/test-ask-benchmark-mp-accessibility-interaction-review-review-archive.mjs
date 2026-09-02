#!/usr/bin/env node
import { generateMpAccessibilityInteractionReviewReviewArchive } from "./ask-benchmark-mp-accessibility-interaction-review-review-archive.mjs";
import { runReviewArchiveContractTest } from "./ask-benchmark-review-archive-contract-test.mjs";

console.log(JSON.stringify(runReviewArchiveContractTest({ fixtureId: "mp-accessibility-interaction-review", fixturePath: "benchmarks/fixtures/checkpoint-b2/mp-accessibility-interaction-review", generate: generateMpAccessibilityInteractionReviewReviewArchive })));
