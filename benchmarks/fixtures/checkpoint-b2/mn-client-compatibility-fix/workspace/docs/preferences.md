# Preference reader contract

`readPreference(record, key, fallback)` accepts an object record and a string key. Persisted records can be ordinary objects, objects with no prototype, or objects carrying a user-defined field with the same name as a built-in method.

Return an own field's value unchanged, including `false`, `0`, the empty string, `null`, and `undefined`. Return the supplied fallback when the field is absent or inherited. Do not mutate the record, its prototype, or runtime globals. Getter fields are read once when selected. Keep the exported function and its arguments compatible with existing callers.
