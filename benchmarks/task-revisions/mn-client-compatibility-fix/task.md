# Restore preference reads on older mobile clients

Current desktop and supported older mobile clients share a preference reader. Restore a user's saved choices when their runtime lacks a newer built-in. An explicit off setting must remain off on the next read, while a missing preference must use its fallback.

Use the full input, API and side-effect contracts in `docs/preferences.md` and `docs/client-support.md`. Change only `src/preferences.mjs` and `test/preferences.test.mjs`. Preserve the behavior of current callers and add regression coverage for the interaction between an older runtime and a stored value. Run `npm test`. Report the observed local capability simulation, what the original tests already detect and what your own test adds.
