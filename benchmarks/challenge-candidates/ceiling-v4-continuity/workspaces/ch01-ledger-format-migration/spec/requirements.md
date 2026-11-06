# Requirement groups and quantitative profile

Each group has a fixed weight; extra cases in that group do not dilute earlier obligations. All checks assigned to a group must pass for its points. Normal behavior totals 85, scope preservation 5, and valid meaningful submitted tests 10. Submitted tests must pass on both conforming designs and fail on a relevant semantic fault; always-failing tests and import/setup failures do not earn detection credit. A conforming-reference defect or unexplained failure is unresolved, not an automatic submission failure. Critical violations (tenant leakage, lost or duplicated accepted durable transactions, false activation) are reported separately from points.

<a id="r1"></a>

- R1 (10): exact input/value contract and all-or-nothing accepted batches.
<a id="r2"></a>

- R2 (12): both deployed consumers remain compatible through concurrent migration.
<a id="r3"></a>

- R3 (12): durable request identity, duplicate receipts, conflict ordering and append CAS.
<a id="r4"></a>

- R4 (10): tenant isolation, monotone history and deletion/recreation semantics.
<a id="r5"></a>

- R5 (10): bounded page processing, prefix-complete rows/cursor and publication conflict.
<a id="r6"></a>

- R6 (12): restart, lost reply and interrupted migration preserve accepted state.
<a id="r7"></a>

- R7 (12): readiness and activation have the stated version/head linearization.
<a id="r8"></a>

- R8 (7): read and migration work satisfies the fixed counts below.

Fixed profile: at most 4 tenants, 128 transactions/tenant and 64 distinct row IDs/tenant, each transaction 1–8 changes; at most 8 finite hook callbacks per scenario. Journal retention is allowed to grow with accepted history and snapshot storage with distinct IDs (including tombstones). No constant-memory claim is made for growing IDs or history. Process temporary storage may scale with that fixed profile; candidate may not store durable authority outside journal image.

In a quiescent read, let T be current head minus snapshot cursor. eventsRead delta <= T, rowReads delta <= 1, snapshotRows delta = 0. After a fully caught-up snapshot, reading a row must not replay old journal entries. One quiescent migration page returns at most limit raw transactions, and eventsRead delta <= limit. No wall-clock-only score is used. These logical counts include copies performed by export inside the measured Ledger call, using the same event/row units as scan/snapshot. Externally requested inspection or export is excluded by the measurement boundary. These logical counts exclude immutable consumer work; callbacks/resource stress are tested separately. Existing tests illustrate the API, not the full validation set.
