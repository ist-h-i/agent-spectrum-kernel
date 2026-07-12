# Session contract

A refresh token is single-use. A successful refresh replaces it with exactly one new refresh token.
The refresh is valid only while `now < expiresAt`.

On every refresh, the service must reload the account record. Disabled accounts are rejected. The account
must still belong to the session tenant, and the new access token must use the account's current role rather
than claims cached in the session.

Concurrent refresh attempts using the same token are a compare-and-swap operation: at most one may
succeed. If no new token pair is returned because token signing or persistence fails, the original refresh
token must remain usable so the caller can retry.

Refresh responses are sensitive and must include `Cache-Control: no-store`.
