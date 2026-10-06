// Shared policy has no execution or grading dependencies.
export const CODEX_TIME_POLICY = Object.freeze({kind:"codex_turn_received_budget_v1",
  startup_ms:120000, task_ms:120000, absolute_ms:240000,
  start_event:"single_thread_then_turn_started_received", clock:"controller_monotonic", retry:0});
