if (process.env.DIAGNOSTICS_ENDPOINT !== "fixture-sink") {
  console.error("diagnostics endpoint unavailable");
  process.exitCode = 7;
}
