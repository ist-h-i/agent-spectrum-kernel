# Local schema alignment plan

The member interchange is already on the version-2 contract in `member-contract.md`. The local import gate must accept the current producer's payload while retaining that contract's validation boundaries. The existing exporter and importer APIs are fixed for this task.

The schema is used only for this local import gate. This task has no stored records to rewrite and no deployment or migration command to execute. Historical version-1 migration policy belongs to its separate route and is not part of this change. Verify a current producer payload and rejection of the obsolete field, along with unchanged validation boundaries.
