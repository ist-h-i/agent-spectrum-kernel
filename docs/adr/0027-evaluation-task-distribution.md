# ADR 0027: Common evaluation catalog and protected reveal assets

Date: 2026-11-20

Status: accepted

The current evaluation set uses one task registration and an input manifest per task. The operator prepares one workspace from that manifest. Public source and npm distribution carry the list, runtime and public initial inputs. The operator-only repository carries the logistics input, protected assessment assets and additional prompts. Both repositories are located from the catalog. The two prior private repositories have the same current GitHub access list, and the operator can distribute the selected logistics files without granting the solver repository access.

Keeping a registry per task family would retain parallel identifiers and selection rules. Placing protected content beside the public package would make a later reveal readable before submission. Combining the private assets under the existing assessor access boundary avoids another repository and one-off archive path. The manual follow-ups require an initial submission receipt and use a separate work copy. The automated stages retain the runner's same-session freeze and reveal.

Current selection and npm distribution exclude old benchmark assets, registration aliases and retired challenges. Developer workflows that explicitly verify earlier registered evidence still identify their corresponding frozen assets. An earlier receipt remains specific to its input, assessment and execution conditions.

Verify the new boundary at the actual npm archive, each prepared workspace, and the protected archive identified by the catalog. A staging/runtime change warrants rechecking that the initial workspace omits the update and that a stale or substituted file is rejected. Prior published scenarios can remain accessible in Git history, so use new cases or new protected reveals for decisions that require a first view.
