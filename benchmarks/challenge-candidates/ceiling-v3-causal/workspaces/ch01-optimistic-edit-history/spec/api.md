# Editing contract index

- behavior.md: values, edit/undo and view observations.
- continuity.md: durable session and legacy migration.
- adapters.md: server, transport and session store atomicity, errors and resource domain.
- scenario-tests.md: source-isolated additional test format.

Public exports: createEditor(options) in src/editor.mjs; createLegacyAdapter(editor) in src/legacy.mjs; decodeDrafts/encodeDrafts in src/session.mjs. Existing fixed consumers and public method names are retained. Inputs and returned JSON are caller-owned copies; no API exposes implementation-private structures.
