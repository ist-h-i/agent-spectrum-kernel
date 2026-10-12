# Local schema alignment plan

The current route is already version 2. The exporter and importer return shape already use its spelling. Only the adjacent schema field declaration and its required-field list lag behind. Align both declarations in the existing flat schema; retain memberId/enabled constraints, required values and rejection of additional properties.

The schema is used only for this local import gate. This task has no stored records to rewrite and no deployment or migration command to execute. Historical version-1 migration policy belongs to its separate route and is not part of this change. Verify a current producer payload and rejection of the obsolete field, along with unchanged validation boundaries.
