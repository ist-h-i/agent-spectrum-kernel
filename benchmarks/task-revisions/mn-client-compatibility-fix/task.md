# Restore preference reads on older mobile clients

The same preference reader runs on desktop and supported older mobile clients. Restore correct preference reads across the supported environments and preserve the documented behavior of stored and absent settings.

Use `docs/preferences.md` and `docs/client-support.md`. Change only `src/preferences.mjs` and `test/preferences.test.mjs`. Add focused regression coverage and report the environment, checks and outcomes. Run `npm test`.
