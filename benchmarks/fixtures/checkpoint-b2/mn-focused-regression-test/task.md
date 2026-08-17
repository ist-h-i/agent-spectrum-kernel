# Add focused session-key regression coverage

The session cache-key implementation already matches its documented behavior, but the existing tests do not protect the mixed-case region boundary described in `spec/session-key.md`.

Extend the existing focused test suite so that a future regression in that boundary is detected. Keep production behavior and unrelated files unchanged, run the repository test command, and report the result.
