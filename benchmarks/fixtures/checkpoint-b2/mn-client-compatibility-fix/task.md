# Restore preference reads on older mobile clients

The saved-preference reader works in the current client but throws on supported older mobile clients. Restore compatibility using the checked-in support matrix and preference contract. Preserve existing behavior for current clients and keep the change focused on the reader and its regression tests.

Run the repository-provided checks and report the actual result. This is a local client change; no release or remote service operation is requested.
