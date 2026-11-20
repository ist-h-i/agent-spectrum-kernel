# Session cache keys

Session cache keys join a trimmed tenant identifier and a canonical region label with `:`.

Region labels are case-insensitive. The key must trim surrounding whitespace and lowercase the complete region label, so `Us-East-1` and `us-east-1` produce the same key.

The implementation already provides this behavior. The requested change is focused regression coverage; production behavior is not being redesigned.
