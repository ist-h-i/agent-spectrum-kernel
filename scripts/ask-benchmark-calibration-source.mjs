// Existing B2 input identities and their catalog identities. This mapping is not
// evaluator admission or permission to execute. Only explicit calibration aliases
// may reuse a source directory; native plan/result IDs are never rewritten.
export const CALIBRATION_SOURCE_BINDINGS = Object.freeze([
  Object.freeze(["cal-session-refresh", "pr-session-refresh-medium-hard", "review", 3]),
  Object.freeze(["cal-export-lease", "pr-export-lease-hard", "review", 3]),
  Object.freeze(["cal-atomic-rule-batch", "impl-rule-batch-medium-hard", "implementation", 3]),
  Object.freeze(["cal-concurrent-transfer", "impl-transfer-hard", "implementation", 5]),
]);
export const CALIBRATION_INPUT_MANIFEST_PATH = "benchmarks/fixtures/checkpoint-b2/input-manifest.json";
export const CALIBRATION_INPUT_MANIFEST_SHA256 = "e90d3e32db60d372ecf0437a53e00dd3c9ddaf23298c25f37609e92effeb2b6d";

export function calibrationSourceIdForFixture(fixtureId) {
  return CALIBRATION_SOURCE_BINDINGS.find(([id]) => id === fixtureId)?.[1] ?? null;
}

export function resolvePortfolioFixtureSource(fixture) {
  if (!Object.hasOwn(fixture, "source_fixture_id")) return fixture.id;
  const binding = CALIBRATION_SOURCE_BINDINGS.find(([id]) => id === fixture.id);
  if (!binding || fixture.source_fixture_id !== binding[1]
      || fixture.task_class !== binding[2] || fixture.repetitions !== binding[3]
      || fixture.suite !== "calibration" || fixture.aggregate_eligible !== false) {
    throw new Error("calibration source binding is not the declared catalog/source pair");
  }
  return binding[1];
}

export function assertSuccessorCalibrationConfig(config, { inputManifestDigest } = {}) {
  if (!Array.isArray(config?.fixtures) || config.fixtures.length !== 4) {
    throw new Error("successor execution requires all four calibration fixtures");
  }
  for (const [index, [id, source, task, repetitions]] of CALIBRATION_SOURCE_BINDINGS.entries()) {
    const fixture = config.fixtures[index];
    if (fixture.id !== id || fixture.source_fixture_id !== source
        || fixture.task_class !== task || fixture.repetitions !== repetitions) {
      throw new Error("successor calibration inventory or ordering changed");
    }
    resolvePortfolioFixtureSource(fixture);
    if (fixture.input_manifest_sha256 !== CALIBRATION_INPUT_MANIFEST_SHA256
        || (inputManifestDigest !== undefined && fixture.input_manifest_sha256 !== inputManifestDigest)) {
      throw new Error("successor calibration input manifest changed");
    }
    if (fixture.input_manifest_path !== CALIBRATION_INPUT_MANIFEST_PATH
        || config.fixture_root !== "benchmarks/fixtures/checkpoint-b2") {
      throw new Error("successor calibration source is outside the registered input set");
    }
  }
  return config;
}
