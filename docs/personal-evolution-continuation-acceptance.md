# Personal evolution continuation and recovery acceptance

Verification Contract: FVC-A54-CONTINUATION@1.
Upstream: personal-evolution-cli-spec-v1@3, PECLI-3/4/6;
personal-evolution-cli-verification-v1@3 in
[the command contract](personal-evolution-cli.md); #379 PV1-7 and #385.
The A5.4 work boundary is next-request handoff, saved-result reload and
stop/recovery. PR408's prospective grading/classification fixes remain the
baseline. New catalog24 grading/admission is A4.6, not this acceptance.

Use the formal verification path because persisted lifecycle state,
cross-process consumption and a PR handoff are involved. These obligations
verify existing behavior; they introduce no new execution, approval, retry or
recovery permission.

| Obligation | Observable check | Existing test path |
| --- | --- | --- |
| A54-RELOAD | Fresh Node status/result rebuild completion, receipt, human reason and Unknown cost from saved records. Valid, missing, malformed and forged presentation caches cannot grant authority. Reads do not write cycle records. | Named subtest in test-helpers-personal-evolution-cli-roundtrip.mjs, executed by test-ask-personal-evolution-cli.mjs. |
| A54-STOP | A consumed comparison with its saved connection unavailable remains needs_action in cold readout and same-cycle advance. No provider, comparison, session or grader repeats; the missing connection is not manufactured. | Named roundtrip subtest; existing consumed-incomplete and invalid-evidence consumer tests. |
| A54-NEXT | A completed hold prepares a new unstarted request with a new public observation and cycle/request identity, retaining the exact predecessor receipt. An existing lock blocks mutation and is retained. A separately requested fake start advances only the new generation and pauses for its own source approval; repeated resume repeats no dispatch. | Named roundtrip subtest; existing unattended two-cycle tests cover complete synthetic cycles and predecessor reuse. |
| A54-RECOVER | Only wholly unstarted partial preparation can recover through the fixed source's existing seal/inspect APIs into fresh output. Original partial files and approval remain; started/unknown work, drift, locks and collisions refuse recovery. | test-ask-personal-evolution-cli-recovery.mjs, PECLI-6. |

The roundtrip's child CLI processes execute only status/result over artificial
temporary records. Their production imports have no test-module substitutions;
generation, comparison and grading remain in the parent test's existing fake
adapters. Cache and connection faults rename the original test-owned file aside,
then restore its exact bytes. The only released lock was created by that test
and never belonged to a child. This is not automatic repair of real consumed
work, an instruction to remove a live lock, or proof of arbitrary host-crash
recovery.

## Reusable evidence for A3.1

A3.1's final scope depends on A5.5. Reuse these layers without turning one
layer's result into another's acceptance:

| Layer | Existing evidence to retain | What this regression adds / leaves open |
| --- | --- | --- |
| Installation and recovery procedure | AH07 / PR331: historical model-free installation/recovery checks. | No installer change or new installation claim. Installed evidence does not establish Activated/Operational. |
| First-workflow preparation and reporting | AH08 / PR332 and333: artificial task preparation and truthful limitations. | Cold readout verifies saved records rather than trusting the display cache. Real-agent operational acceptance remains separate. |
| Historical P/K/F calibration | AH14 / PR339: the recorded calibration, fixed identities and limits. | No calibration rerun or transfer of historical execution grants; no current quality/native claim. |
| Personal command and bounded loop | PR402-406 and PECLI-3/4/6: immutable inputs, explicit review, saved decision/receipt, next request, preparation-only recovery. | The named fake checks above supply reusable continuation/reload/stop evidence. Original run-main-1 and its old results are not rewritten or regraded. |
| Actual subsequent cycle / Mac operation | A5.3's retained first-cycle evidence is historical and separate. | A new actual-model/native comparison and actual Mac application/recovery were not run here. Their separately owned acceptance and A5.5 decisions remain open. |

The commands below exercise local artificial data and fake dispatch only:

~~~sh
node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs scripts/test-ask-personal-evolution-cli-recovery.mjs
node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-unattended-policy.mjs scripts/test-ask-personal-evolution-unattended.mjs
~~~

Recovery deliberately requires a clean checkout at the configured source
revision. Run its final verification on the clean committed test subject;
do not disable that check to test an uncommitted checkout. Exact commands,
exit codes, selected/skipped cases and reviewed source identity belong to the
PR evidence. Test counts alone do not close all A5.4, A3.1 or #379 acceptance.

## Bounded PR313 decision

The named current consumers are the personal command's saved-input/status/next
paths and the preparation-recovery adapter. They already use strict stable
file/JSON reads, content-addressed records, atomic no-replace publication and
existing once-only generation/pair consumption. No missing runtime behavior
requiring an old judge capture/transport/reopen module was identified here.

At baseline main4ac4903a the CAS, stable-file, command, recovery and generation
connector sources are unchanged from the earlier main4c0b9d34 preservation
review. Fresh current CAS and bounded primitive controls supplement that source
identity; they are not strict-host or full compatibility proof. The ten absent
formal/judge modules from the earlier static closure are still absent. An old
formal module's name is not evidence that it is needed by these consumers.

Keep PR313 and its original branch/head6d221120 intact. Retain the historical
classification:91 files in the291 formal scope,12 optional315 reuse candidates
and15 deferred host files. No wholesale import, new strict-host prerequisite,
old experiment restart or authentication/security change is selected. A later
extraction needs a named missing consumer behavior and its minimal dependency
closure, not this regression's existence.

Implementation Contract: personal-evolution-continuation-regression-v1.
Change class: test and documentation. Actual boundary: the existing legacy
one-fixture roundtrip helper and this evidence map; catalog24 branches of that
helper retain their existing early return. Production APIs, state formats,
providers, graders, historical results and PR313 are unchanged. Local execution
and independent review results are recorded in the Draft PR; this document is
not a Ready/merge or live-execution authorization.
