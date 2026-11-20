# Archive interchange, rev 3

Checkpoint rows occur in two encodings. Restore both generations to the same statement.

| Encoding | Meaning |
|---|---|
| `[key, minute, major]` | Original CSV export. The minute is signed integer minutes since the epoch. `major` is a signed decimal string with zero, one or two fractional digits in major currency units. |
| `{key,time,cents}` | Service export. Time is integer epoch seconds. Cents is a signed integer decimal string. |

Within a tenant a key identifies one entry, independent of checkpoint, pack and format. Each journal row has integer `rev` and `seq`, a string `key` and an `op` string. Apply rows in (rev, seq) order after the chosen checkpoint through the requested revision inclusive. A change can be repeated by a mirrored journal at the same position. Copies at a position agree. Physical file, block and read order convey no business ordering.

A `put` creates or replaces the whole entry from `time` and `cents`. A `delta` adds the signed `cents` to an existing entry and retains its timestamp unless a new `time` is supplied. A `drop` removes it. A delta or drop on an absent key leaves it absent. An entry can later reappear under its original key. Corrected timestamps can move a historical entry into or out of a previously issued statement. Amounts can exceed the range of exact JavaScript numbers.
