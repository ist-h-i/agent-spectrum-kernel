# Public source references (accessed 2026-10-12)
- https://react.dev/reference/react/useEffect — Cleanup prevents obsolete asynchronous effects from updating current UI state; responses can arrive in a different order than requests. This exercise abstracts that lifetime principle into a local controller instead of copying React code.
- https://developer.mozilla.org/en-US/docs/Web/API/AbortController — An AbortController exposes a signal and can request cancellation. The local mock can ignore that request, so caller state must remain correct independently of transport cancellation.

Original paraphrase, no source code copied. These references establish a documented pattern, not empirical incident frequency or impact.
