# Client compatibility fixture candidate (#207)

This slice adds only `mn-client-compatibility-fix`, from the frozen #205 catalog.
The existing nine primary fixtures, catalog, policies, common scorer/runner,
old admission decisions and evaluation snapshots are unchanged. The dedicated
config is for this candidate; it does not select the fixture in an existing
comparison plan.

The public task and workspace supply an ordinary local engineering request.
`input-manifest.json` pins exactly `task.md` and `workspace/**`. Only those paths
are agent-visible. Metadata, evidence/requirement records, evaluator references,
source/freeze records and admission artifacts are controller-side authority.
Private evaluator code, answer cases and review archives stay outside the
repository and every task/evaluation workspace.

The existing `binary_scope_verification_v1` profile separates one complete
behavioral requirement from scope and recorded verification. Opaque probe IDs
and typed requirement observations allow later per-task review of the grading
basis. A passing example suite alone does not prove general grading validity.

The candidate uses the existing sealed private runner and isolation validators.
Its private scoring-contract projection preserves the existing pure contract
source, replacing only the import of canonical primitives with the same bound
primitive operations. This avoids importing unrelated runtime dependencies into
the private evaluator and adds no common builtin permission or scorer change.
Exact projection and result parity require independent inspection.
Changes to existing test coverage retain a separate semantic review requirement;
empty or weakened tests cannot establish scope completeness from a command exit
code alone. Equivalent focused regression changes are not automatically rejected.

Private development probes exercise equivalent correct candidates, incorrect
candidates, missing/failed verification and scope controls. Their normalized
command evidence is synthetic and never represents measured agent verification.
Behavior probes run separately and do not earn the verification requirement.
The public seed intentionally contains the reported defect: its compatibility
check should fail until a candidate fixes it.

Limits: the runtime capability model is not a physical mobile-device test;
finite behavioral probes do not prove every JavaScript implementation; source,
isolation and observation assumptions need independent review. A missing or
unqualified execution environment retains `manual_review_required`, not a
semantic pass. A later discovered grading defect requires a new version while
original records remain intact.

Lifecycle is tracked separately: task implementation, non-model checks,
independent admission review, main integration, and real-model evaluation.
The frozen pre-review admission remains pending. Later authorization belongs
in an append-only decision and external review authority, not rewritten freeze
bytes. Main integration and real-model evaluation are not performed here.

Focused public verification:

```sh
node --test scripts/test-ask-benchmark-mn-client-compatibility-fix.mjs
node scripts/validate-repo.mjs
```

The fixture-specific authority writer and private review archive generator reuse
existing authority publication, source closure and archive identity helpers.
Private commands and source paths are not public run instructions.
