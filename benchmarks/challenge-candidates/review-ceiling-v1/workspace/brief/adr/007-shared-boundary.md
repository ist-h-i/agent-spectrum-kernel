# ADR-007: shared ownership and provider lifecycle
Status: active for Shared Console.
Supersedes ADR-001's single-owner process assumption, not the old artifact wire contract.

Each team is an ownership boundary. The application must preserve it through cache, export, background queue and old format translation. State verification and provider delivery are separate observations. A transport acceptance cannot be relabeled a completed publication. Recovery needs a stable operation identity and evidence of the effect.

A local fake provider is used for deterministic development verification. Production storage, identity and provider adapters require separate deployment validation. Splitting the application into multiple services is not required by this ADR; ownership and lifecycle correctness are.

An adoption review must show how affected consumers preserve meaning, which records are authoritative, and how an operator resolves uncertainty without publishing twice.
