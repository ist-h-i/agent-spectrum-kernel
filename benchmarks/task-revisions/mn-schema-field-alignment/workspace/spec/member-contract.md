# Member payload contract, version 2

The current producer and consumer exchange a JSON object containing these fields:

| Field | Type | Required | Constraint |
|---|---|---|---|
| memberId | string | yes | at least one character |
| displayName | string | yes | at least one character |
| enabled | boolean | no | absence means true at import |

Unknown fields are rejected. The historical `display_name` spelling is not accepted on the v2 route, including when supplied alongside `displayName`. Field values retain their contents; name trimming, ID normalization and compatibility aliases are outside this change.

`exportMember(member)` produces the v2 payload. `importMember(payload)` validates it against `schemas/member.schema.json`, then returns a member with these same current field names. Invalid payloads throw `TypeError`. Both operate on local objects; there is no network or database in this workspace.
