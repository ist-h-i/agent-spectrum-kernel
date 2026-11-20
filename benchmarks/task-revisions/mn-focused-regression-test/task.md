# Add focused session-key regression coverage

The session cache should give equivalent region labels the same key. The exported function already implements `spec/session-key.md`. Extend only `test/session-key.test.mjs` to protect the mixed-case boundary through that public function. Preserve existing tenant, whitespace and invalid-input coverage and keep the implementation and configuration intact.

Your test should accept compliant implementations and fail when mixed-case regions yield the wrong key. Run `npm test` and report which new observation protects the contract and the result you obtained.
