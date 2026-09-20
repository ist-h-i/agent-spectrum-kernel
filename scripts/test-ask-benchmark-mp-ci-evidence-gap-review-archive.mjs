#!/usr/bin/env node
import { generateMpCiEvidenceGapReviewArchive } from "./ask-benchmark-mp-ci-evidence-gap-review-archive.mjs";
import { runReviewArchiveContractTest } from "./ask-benchmark-review-archive-contract-test.mjs";

console.log(JSON.stringify(runReviewArchiveContractTest({ fixtureId: "mp-ci-evidence-gap", fixturePath: "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap", generate: generateMpCiEvidenceGapReviewArchive })));
