# Build review archive V2

SPEC-P24-BUILD-ARCHIVE-V2-1; upstream #427 and the V10 24-resource archive
audit (23 embedded generator closures, build legacy format missing that closure).
Formal Verification Contract VERIFICATION-P24-BUILD-ARCHIVE-V2-1 is selected for
the public archive contract, regression, protected source boundary and durable
independent review. Implementation scope is the build archive module, its new
focused test and CI registration. Shared identity/scoring modules stay unchanged.

The existing generateMnBuildOptionUpdateReviewArchive API and default CLI retain
their legacy format. The explicit generateMnBuildOptionUpdateReviewArchiveV2 API
and CLI --format v2 require root, privateRoot, caseRoot, outputPath, reviewedHead
and sourceRevision. The new archive format is mn-build-closed-source-store-zip.v2.

V2 uses the existing static public authority validator and shared review archive
identity functions. The evaluator revision must equal sourceRevision; reviewedHead
must be its clean direct single-parent successor in the canonical repository.
The executing generator graph must equal the source graph and every generator
node's source, candidate and executing bytes must agree. The archive includes
that independent generator graph/inventory and its exact source files, separate
from the evaluator graph. Public fixture bytes come from the reviewed commit.
Private assets and cases use disjoint external non-symlink directories, exact
closed inventories and byte identities. Output must be outside all three roots,
use exclusive creation and be reproducible STORE ZIP with a fixed timestamp.

The archive records pending independent review/admission and false self-approval,
runtime measurement, scoring readiness and publication. It grants no admission,
execution, runtime receipt or scoring authority, and never imports a private
evaluator. Existing frozen sources, ZIPs, assets and results remain unchanged.

Verification IDs: B2-GENERATOR (embedded graph and exact source/node bytes),
B2-IDENTITY (wrong/collapsed/source/candidate/runtime/remote/dirty rejection),
B2-ASSETS (public/private source and inventory tampering, symlink and case
closure rejection), B2-OUTPUT (exclusive, deterministic and source-root-safe),
B2-PENDING (no authority escalation), B2-LEGACY (legacy API/format preserved).
Focused command: node --experimental-test-module-mocks --test
scripts/test-ask-primary-build-review-archive-v2.mjs. Artificial authority stubs
in this test cannot prove real resource admission. Run the real asset-only build
binding/finalizer and V2 generator against a fresh source/candidate separately,
then independently inspect the exact ZIP and graph before any formal review.

Only build needs a successor asset binding for this change: this module is not
in the old 24 evaluator graphs or the common V10 selected processing inventory.
Do not repin an old build bundle to a new generator. Keep the existing 23 roots
and use a fresh selector ID only after each resource's exact V10 archive/context
has genuine independent decisions. readPrimaryScoringVersion static success
does not replace verifyPrimaryScoringVersionResource or execution admission.
V10 runtime qualification remains a separate unmet condition.
