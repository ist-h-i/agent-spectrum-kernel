# Atomic rule batches — prospective contract 2.0.0

Spec artifact `SPEC-RULE-BATCH`, revision 2; contract `ask.rule-batch@2.0.0`.
Upstream: the original ten requirements in
`benchmarks/fixtures/checkpoint-b2/impl-rule-batch-medium-hard/task.md` and its
workspace docs/schema/seed at source commit
`1a6227f6d9de37c9cee9b8d8fac88dc73b3d758c`. This is a **new prospective design**,
not a correction of historical scores or an admitted successor of the frozen
checkpoint portfolio. No saved implementation is changed.

## What is inherited, ambiguous, and newly selected

The original defines strict shape, scalar types, canonical duplicates, atomicity,
one increment, replay before version checking, isolation, receipt shape/order,
and compatibility. It does not define signed-zero payload equality. Its ASCII
canonicalization prose and Unicode-lowercasing single-rule seed disagree about
the input boundary. Those are historical specification unknowns, not historical
violations. This version chooses D1–D3 below without using candidate scores.

### D1: finite scalar identity, separately from integer version

For `set.value`, equality requires the same scalar type and `Object.is` equality.
In particular, -0 and +0 are **different values**. Preserve the input sign in the
store, `get`, `list`, original receipt, and replay receipt. No numeric-to-string
coercion, approximate equality, rounding, or nonzero normalization is permitted.
Reject non-finite numbers, undefined, bigint, symbols, arrays and objects as
batch/single-rule values; strings, booleans and null remain valid.

Reason: the seed uses structuredClone and returns the stored number unchanged.
The sign is observable with `Object.is` and reciprocals. Distinguishing values in
storage and replay gives one consistent contract. The alternative could equate
both zeros consistently by normalizing storage and results to +0; that changes
observable legacy storage/return behavior. Equating them only during replay
would return a value different from the resent value without a storage
normalization contract. Neither alternative is adopted. This is a design choice
for the next comparison; it was not explicit in the original requirement 7.

`expectedVersion` is an integer counter, not a stored scalar. Require a number
with `Number.isInteger(v) && v >= 0`; both zeros denote counter 0 and normalize
to +0. Do not add a safe-integer maximum absent from the original schema. Counter
behavior beyond exact JavaScript integer increments is a remaining test/runtime
limit; the fixtures exercise counters in the exact range.

The normalized payload consists of **expectedVersion and ordered operations**.
Each operation includes kind, canonical key, and, for set, typed scalar value
with signed-zero identity. Delete has no value. Do not sort operations, compare
only their effects, omit fields, or equate number/string/boolean values.
`requestId` selects the cache entry and is also returned unchanged; it is not a
second payload field. No timestamp/current version/current rules enter equality.
Full request validation precedes replay lookup; successful replay precedes the
current-version check and returns an isolated copy of the original receipt.
Changing expectedVersion under the same ID is a collision even if stale.

### D2: batch ASCII boundary; legacy Unicode compatibility

For batch keys, first require a string with **every raw code unit in U+0000–007F**.
Then remove only surrounding ASCII whitespace U+0009–000D and U+0020, lowercase
only A–Z, and validate `[a-z][a-z0-9._-]{0,31}`. Interior whitespace/control
characters fail the pattern. NBSP and other Unicode whitespace fail the raw
ASCII boundary; accepting their trim aliases is not part of this version.
This explicit trim domain is a new clarification of the former unspecified
whitespace wording. Reject raw Kelvin K, é and all other non-ASCII inputs for
both set and delete, regardless of existing keys. Validate before Unicode
lowercasing could turn K into ASCII k. Duplicate canonical keys reject the batch.

Keep the single-rule seed's **exact** string trim().toLowerCase() then regex
behavior. Thus `put/get/delete('K')` operate on canonical `k`; NBSP padding is
trimmed there. This is an input alias, not access to a raw stored `K` entry.
Constructor and direct RuleStore operations keep their raw keys and cloneable
values, including non-ASCII keys and strings/objects. Unrelated batches must
copy existing entries without recanonicalization, scalar revalidation, deletion,
or value rewriting. `list` retains seed insertion order and defensive cloning;
receipts include raw existing entries and defensive cloning.

### D3: receipt order and ordinary object enumeration

Return `{requestId, version, rules}` with an ordinary rules object constructed
from entries sorted by JavaScript UTF-16 code-unit lexical order (no locale
collation). Canonical batch keys and letter-based Unicode legacy keys enumerate
in that order. Raw legacy array-index keys enumerate first in ascending numeric
order under ECMAScript ordinary-object rules, just as seed `list` does. This
necessary clarification preserves the object return type and raw store keys;
it does not demand impossible lexical Object.keys order for integer indices.
Do not change `list` to receipt sorting. No Map/Proxy/new receipt type is added.

## Shared state and errors

The schema's string requestId, exact own enumerable string fields, operation
count 1–20, kinds set/delete and required fields remain strict with no coercion.
This verifier targets ordinary JSON-style records and finite JS scalar values;
accessor side effects, proxies, symbol/non-enumerable properties and hostile
prototypes are outside the evaluated domain. Invalid shape/value/key/duplicates
throw exported RuleValidationError (`RULE_VALIDATION`). A well-formed collision
throws exported IdempotencyConflictError (`IDEMPOTENCY_CONFLICT`). A new ID with
the wrong version throws exported VersionConflictError (`VERSION_CONFLICT`).
Validation occurs before cache/version checks. Every rejection preserves rules,
counter and prior replay receipts; it does not consume a new request ID.

Every newly accepted batch, including missing-key deletes, increments once.
Legacy put and delete keep their seed increments and return shapes. Replay
returns the old snapshot even after new batches/single/direct store changes;
returned objects and caller input never alias internal rules or replay records.
Idempotency lifetime across multiple service wrappers/restarts is not newly
defined here; the tested lifecycle is one service/store pair in one process.

## Ten-requirement trace

`requirements.json` retains each exact requirement sentence and maps its
criterion, inputs, expected results/errors, state invariant, stable verifier case
IDs and limits. Historical 114 cases are retained separately with their origin
and hash. New boundary cases supplement them, rather than silently replacing
their rules. The fixed verifier and positive/negative qualification demonstrate
bounded test sensitivity, not mathematical completeness. Historical unknowns
and remaining finite coverage limits must be reported separately.

## Freeze and next comparison

`bundle.json` binds this specification, original task/schema/seed, prospective
task/seed, requirement definitions, fixed tests and verifier identifiers by
SHA-256. Hash the manifest itself externally after review and merge; its bytes
cannot contain their own hash. `scripts/ask-rule-batch-bundle.mjs` verifies the
inventory before materializing a **new** standalone source directory. It never
launches a model or overwrites an existing directory. Commit that seed, freeze
its commit plus external task/recipe and bundle digest before preparing P/K/F.

Fixed tests are public and committed under `test/fixed/`. Allow only `src/` and
`test/generated/`; fixed tests, package, docs and task are immutable. Model-added
tests live separately and do not replace fixed verdicts. Existing comparison
preparation checks overlap, binds the common committed input inventory and
detects changed protected bytes. This is a write-scope/drift boundary, not OS
read isolation or a claim that an implementation cannot game known examples.

Same source/task/recipe/verifier/version/hash apply to every P/K/F slot. Unknown,
not-started, failed launch and completed artifacts are distinct. K not started
has no artifact-quality score. No general ASK advantage follows from one task.
Any optional retrospective evaluation of saved P/F needs a new derived ID,
parent ID, contract digest, and `post_hoc` label; it cannot rewrite original
results or turn new design failures into original violations. No such evaluation
or additional comparison is performed by this work. After freeze, new semantic
issues require a successor version, not endless rescoring under this identity.
