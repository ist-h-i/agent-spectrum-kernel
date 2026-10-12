# Source lineage — pagination behavior

Source type: `documented_external_pattern`. Source reference ID: `github-rest-pagination-docs-20261012`.

GitHub's official [pagination guide](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api), inspected 2026-10-12, describes following server-supplied next-page URLs, retaining page-size information, and handling responses with only some pagination relations. This supports a real documented engineering pattern. It does not provide a measured frequency or impact for any team.

The accompanying checked-in source summary is `source-references/github-rest-pagination-docs-20261012.md`. This fixture independently authors a fictional local catalog API. It uses body `links.next` instead of GitHub's Link header and has its own bounded local contract; it is not a GitHub API simulator or copied example.

Frequency band: `unknown`; frequency evidence: insufficient, no observed occurrence count. Impact band: `unknown`; impact evidence: insufficient, no observed business/incident impact. These judgments are separate. Under the frozen lineage policy both weights are null and the fixture is ineligible for the practice-weighted aggregate until approved evidence is available. The frozen catalog identity and base eligibility are preserved.

Historical source-stage status at reviewed HEAD40647e0a: pending independent source/frequency/impact review; no private evaluator had been authored. No customer/private work data, contaminated Issue #195 content, condition results or measured ASK outcomes were used.

Subsequent status: independent source, unknown-frequency and unknown-impact judgments approved on 2026-10-12 for source HEAD40647e0a. The authoritative frozen typed record is `lineage-record.json`; exact independent records and original source hashes are preserved under `source-references/review/`. This is source approval, not full private-grading admission.
