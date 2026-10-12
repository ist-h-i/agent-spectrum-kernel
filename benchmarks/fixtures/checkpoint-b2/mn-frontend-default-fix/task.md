# Preserve the saved display preferences on first load

A user turns off compact rows, but after reloading the display preferences panel the checkbox is on again. Turning it off during the current session works. Please fix this local default-state problem and add focused regression coverage.

Read `spec/default-state.md` and the nearby implementation/tests. Keep the existing update/reset behavior and control output shape. Make a small change to the preference initializer and its tests, then run `npm test` from this workspace. No dependencies, service changes or release steps are needed.
