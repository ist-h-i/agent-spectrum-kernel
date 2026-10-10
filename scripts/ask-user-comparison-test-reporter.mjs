// Controller-owned Node reporter. File execution alone is not a test evaluation.
import { relative } from "node:path";

// The JSON line is constructed here, never copied from repository stdout,
// diagnostics or test names. Those strings are escaped inside other records.
// Parsing TAP comments cannot establish this distinction.
export default async function* report(events) {
  for await (const event of events) {
    let record;
    if (event.type === "test:summary") {
      const counts = Object.fromEntries(["tests", "passed", "failed", "cancelled", "skipped", "todo"]
        .map(name => [name, event.data.counts[name]]));
      record = typeof event.data.file === "string"
        ? { format: "ask_node_file_summary_v1", file: relative(process.cwd(), event.data.file), success: event.data.success, counts }
        : { format: "ask_node_run_summary_v1", success: event.data.success, counts };
    } else record = { format: "ask_node_event_v1", type: event.type, data: event.data };
    yield `${JSON.stringify(record, (_key, value) => value instanceof Error
      ? { name: value.name, message: value.message, code: value.code, stack: value.stack } : value)}\n`;
  }
}

// https://nodejs.org/docs/latest-v24.x/api/test.html#custom-reporters
