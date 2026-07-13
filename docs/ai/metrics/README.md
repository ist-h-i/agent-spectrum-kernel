# Local Metrics Events

Adopting projects may store local JSONL events at the runtime-owned logical path:

```text
ask-runtime/metrics/events.jsonl
```

In a Git repository this resolves under Git metadata, so read-only workflows do not dirty the engineering working tree. This generic repository does not include project-specific event rows. Runtime events should conform to `schemas/metrics-event.schema.json` and must omit raw prompts, secrets, customer data, personal data, full file contents, and full command output by default.
