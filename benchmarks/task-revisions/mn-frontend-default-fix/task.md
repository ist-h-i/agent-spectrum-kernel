# Preserve saved display choices on first load

A user turns off compact rows, but the checkbox is on again after reload. Initialize both display settings from the decoded saved object so the first checkbox descriptors reflect explicit choices and unset or invalid values use their documented defaults.

Use `spec/default-state.md` and the fixed `displayControls` adapter. Change only `src/display-preferences.mjs` and `test/display-preferences.test.mjs`. Keep saved input and shared defaults intact and preserve update/reset behavior. Use `npm test` and report what the adapter returned for a reload and subsequent operations, with the actual test result.
