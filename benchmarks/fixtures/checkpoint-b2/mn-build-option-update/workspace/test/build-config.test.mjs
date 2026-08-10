import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../build.config.json", import.meta.url), "utf8"));

test("the checked-in profiles retain their established build settings", () => {
  assert.deepEqual(config.profiles.debug, {
    target: "node20",
    minify: false,
    sourceMap: true,
  });
  assert.equal(config.profiles.release.target, "node20");
  assert.equal(config.profiles.release.minify, true);
});
