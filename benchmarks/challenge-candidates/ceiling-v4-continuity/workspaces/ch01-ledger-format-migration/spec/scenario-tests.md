# Submitted tests

Import `scenarioTest` from `harness/scenario.mjs`. A test supplies a JSON public-operation program and an assertion callback over returned observations. The same submitted assertion is replayed against the candidate, two conforming designs and relevant semantic mutants. No reference source is placed in the test workspace. Public capability names describe ordinary API operations; they are not defect probes. Programs may construct LedgerJournal/Ledger, construct protected consumers, call their allowed methods, and use the generic export/reimport and finite callback operations.

An opaque journal/ledger object can only be injected at the declared constructor/function positions. Journal `boundary` is reserved to Ledger; tests install `once` but cannot manually fire it. Existing scenario-protocol bounds, JSON-only arguments and instruction budgets apply. Keep submitted scenario names/assertions descriptive of public outcomes rather than private implementation assumptions.

At most 16 distinct submitted programs are accepted for this pilot. Extra declarations of an identical canonical program do not create additional credit.
