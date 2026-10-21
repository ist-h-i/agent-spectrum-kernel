# Bounded streaming target observation

SPEC-SNAPSHOT-SCALE-1@1 / IMP-SNAPSHOT-SCALE-1@1 / FVC-SNAPSHOT-SCALE-1@1.
Upstream: full-target protection in docs/adoption-apply.md; SPEC-PERSONAL-TARGET-1;
PV1-1/6/7; 2026-10-21 owner delegation for general large-repository support.

## Problem and existing contract

`captureApplyTree` in scripts/ask-setup-apply-state.mjs originally bounded
100,000 entries, 64 MiB per ordinary file and 512 MiB aggregate ordinary bytes.
It hashed each ordinary file through a full-file Buffer. Commit887257fd introduced
that setup observation contract; docs/adoption-apply.md recorded all three limits.
This is a closed observation/workload policy, not an adoption authority, write
scope, OS security setting, or permission configuration. Do not remove it through
an operator override, ignore pattern, deletion, relocation, or fallback snapshot.

An authorized target exceeded the aggregate ceiling because unrelated ignored
artifacts were included. Those bytes must still be observed: ignored/untracked
content drift invalidates an exact plan. A newly owned540-MiB artificial tree
provides the public reproducible scale case; private target inventory stays in
operator evidence, outside this generic repository. This change is general
product support, not completed actual-target acceptance.

## Behavior delta and non-goals

S1: retain exact full-tree inventory/digests, including node_modules, output,
reports, ignored and untracked files. Keep .git HEAD/ref/index binding separate;
keep known secrets metadata-only and unrelated links/special files unfollowed.
No entry/hash/binding schema changes. Identical supported trees retain their
previous digests; source identity changes normally and old plans must be replanned.

S2: scan metadata first with bounded directory iteration. Retain the100,000-entry
and64-MiB ordinary-file limits. Replace only the aggregate512-MiB workload bound
with a documented fixed8-GiB hash-work budget. This intentionally reviewed policy
revision permits many medium/small files, not unlimited input. No CLI/env/caller
knob changes it and no partial result is returned on any limit violation.
8GiB is a finite16x workload tier; it is not a measured latency promise or a
permission to alter a real target. Files over64MiB remain unsupported in this slice. Existing private JSON/journal
limits (including the personal operation journal32MiB bound) are unchanged;
meeting the hash-work budget alone does not guarantee every downstream operation
is representable. Journal snapshots retain entry metadata/digests, not the
aggregate ordinary file bytes.

S3: hash ordinary files through one reused64-KiB buffer, not a file-sized Buffer.
Memory is bounded by at most100,000 inventory/metadata records plus the fixed
buffer and bounded directory iterator, independent of aggregate file bytes.
Reject an over-budget tree during metadata scan before hashing its ordinary data.
Existing small Git/JSON/managed-byte readers retain their own original limits.

S4: before reading, compare opened descriptor with scanned regular-file metadata
(device/inode,size,mode,mtime,ctime). Require an exact complete read, EOF, unchanged
open descriptor and named path after reading. Re-lstat immediately before open;
use O_NOFOLLOW and, where available, O_NONBLOCK so a racing FIFO replacement
cannot wait for a writer before descriptor validation. Truncation/growth/replacement/mode
or timestamp drift refuses. Close every descriptor/iterator on failure. Existing
phase rechecks remain required; this is not an atomic snapshot against hostile
concurrent writers, power loss, or OS isolation. No new trust/rollback authority.

S5: all existing setup/personal callers consume the same unchanged return shape.
No target write, model invocation, synthetic-to-real authority transfer, uninstall
API, or owner-pair repair is introduced. Actual-target mutation remains on hold.

## Formal verification obligations

- V1: an artificial >512-MiB tree of <=64-MiB files succeeds; every selected SHA256
  equals an independently chunk-generated expected digest. Ignored node_modules/
  output/reports entries are present; their content drift changes the binding.
- V2: instrument only an isolated test process to refuse buffered ordinary reads
  and observe read request sizes <=64KiB. No production test seam/override.
- V3: >8GiB aggregate, >64MiB file, >100,000 entries refuse without ordinary-byte
  reads or a partial result; secret values are not read/emitted; symlinks unfollowed.
- V4: injected shrink/growth/replacement/mode/timestamp drift, including before-open FIFO substitution, between observation
  and reads refuses; empty, chunk-boundary and multichunk SHA256 match; descriptors
  are closed. No broad hostile-filesystem or constant-RSS claim follows.
- V5: unchanged setup unit contracts, focused personal target lifecycle regression,
  repository validation, adapter runtime freshness and whitespace/syntax checks.
- V6: independent review of the final source/diff/raw evidence; actual user target
  acceptance, new-model/native comparison and global/security changes remain absent.

Files: shared apply-state module, focused artificial tests, validation CI step,
this contract and the existing adoption-apply resource paragraph. Tests may create
sparse owned temporary files; remove only those newly owned artificial resources.
No dependencies. ADR assessment: no new ADR needed; reversible workload policy
and unchanged persistence/authority/data shape are recorded here and in adoption
contract. Revisit ADR0014 if protection/ownership/authority semantics change.

Ordered work: retain failing pre-change scale check; implement streaming metadata
preflight and unchanged semantic binding; run focused/adversarial + existing unit
and target regression; inspect generators; independent review; publish only the
reviewed bounded subject with honest model-free/actual-target-not-run limitations.
