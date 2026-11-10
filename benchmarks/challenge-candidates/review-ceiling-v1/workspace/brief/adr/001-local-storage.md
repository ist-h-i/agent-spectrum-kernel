# ADR-001: local workspace ownership
Status: superseded for Shared Console by ADR-007. Still applicable to the standalone extension.

The initial product reads one developer-owned workspace. A local filesystem path and run directory identify its artifacts. A process-wide cache is reasonable only because this deployment contains a single owner. Provider writes remain drafts until the user explicitly confirms them.

This note is not a justification for sharing an unscoped cache or accepting another organization's path in Shared Console. The legacy consumer shape remains supported; the old deployment assumption does not.
