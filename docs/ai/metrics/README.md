# Local Metrics Events

Adopting projects may store local JSONL events at:

```text
docs/ai/metrics/events.jsonl
```

This generic repository does not include project-specific event rows. Runtime events should conform to `schemas/metrics-event.schema.json` and must omit raw prompts, secrets, customer data, personal data, full file contents, and full command output by default.
