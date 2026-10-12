# Display preference state

`initializeDisplayPreferences(saved)` receives a preferences object decoded from local JSON storage. It returns a fresh object containing exactly `compactRows` and `showDetails`, both booleans.

| Setting | Default |
|---|---|
| compactRows | true |
| showDetails | false |

For either setting, an explicitly saved boolean wins over its default, including `false`. An absent, `undefined`, `null` or non-boolean value uses that setting's default. Unrecognized saved keys do not become state. The initializer must not change the saved object or shared defaults. No argument means no saved preferences. Storage decoding happens elsewhere; inputs here are objects.

`updateDisplayPreference(state, key, value)` changes a recognized setting to a boolean in a fresh object. It rejects unknown keys and non-boolean values. It must not change the previous state. `resetDisplayPreferences()` returns a fresh object with the defaults.

`displayControls(state)` returns the two checkbox descriptors in the established order and with boolean `checked` values matching the state. First-load state, subsequent updates and reset use the same setting meanings. This fix concerns initialization; update/reset and checkbox descriptor shape remain as they are.
