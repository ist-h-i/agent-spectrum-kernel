// Controller-owned Node reporter. File execution alone is not a test evaluation.
import { relative } from "node:path";
import { tap } from "node:test/reporters";

async function* withFileSummaries(events) {
  for await (const event of events) {
    yield event;
    if (event.type !== "test:summary" || typeof event.data.file !== "string") continue;
    const counts = Object.fromEntries(["tests", "passed", "failed", "cancelled", "skipped", "todo"]
      .map(name => [name, event.data.counts[name]]));
    yield { type: "test:diagnostic", data: { nesting: 0,
      message: `ASK_NODE_FILE_SUMMARY ${JSON.stringify({ format: "ask_node_file_summary_v1",
        file: relative(process.cwd(), event.data.file), success: event.data.success, counts })}` } };
  }
}

// https://nodejs.org/docs/latest-v24.x/api/test.html#custom-reporters
export default events => tap(withFileSummaries(events));
