import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMpPerformanceInvestigationReviewArchiveFromShared } from "./ask-benchmark-mp-iac-rollback-design-review-archive.mjs";

export function generateMpPerformanceInvestigationReviewArchive(options) {
  return generateMpPerformanceInvestigationReviewArchiveFromShared(options);
}

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = { "--private-root": "privateRoot", "--private-case-root": "caseRoot", "--output": "outputPath", "--reviewed-head": "reviewedHead", "--source-revision": "sourceRevision", "--root": "root" }[argv[index]];
    if (!key || argv[index + 1] === undefined) throw new Error(`unknown or incomplete argument: ${argv[index]}`);
    args[key] = argv[index + 1];
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(generateMpPerformanceInvestigationReviewArchive(parse(process.argv.slice(2))))}\n`);
