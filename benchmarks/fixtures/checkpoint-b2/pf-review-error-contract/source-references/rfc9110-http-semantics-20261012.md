# Public source reference: RFC9110 HTTP Semantics
source_reference_id: rfc9110-http-semantics-20261012
source_type: documented_external_pattern
Publisher: RFC Editor / IETF; RFC9110 June2022, checked2026-10-12.
Links: https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after ; https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods .

Short original paraphrase: Retry-After can convey a date or a nonnegative integer delay in seconds. Automatic retries of methods without idempotence need a justified basis about request semantics or whether the original operation was applied. These are published transport/API design patterns relevant to caller-visible error contracts. This fixture supports only its expressly documented integer-delay application subset, not all HTTP behavior.

Adaptation boundary: The application, adapter PR, client labels/policy, fault kinds, fixtures and code are original fictional examples. This reference supports the type of contract interaction; it supplies no actual practice-frequency or impact measurements, application finding key or private review answer. No copied prose, RFC code examples, private business artifacts or empirical incidence estimates are included. No external server/network traffic is used by the fixture. The frozen medium_hard label is retained without empirical difficulty calibration.
