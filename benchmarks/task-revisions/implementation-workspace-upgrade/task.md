# Keep the route desk operating through the kiosk upgrade

A field office keeps years of route cards in one workspace. Each depot upgrades at its own pace. A disconnected team can bring yesterday’s edits back while the kiosk is in use, and a printed dispatch slip can be expensive to issue twice. Offices have reported missing edits and duplicate slips after a desk restart. The relief crew now exchanges partial loads against printed waybills. A supervisor returning at the end of the next shift must still be able to account for both cards and the original paper.

Deliver the repair in `src/workspace.mjs`, `src/reconcile.mjs`, and `src/delivery.mjs`. The released kiosk, desk shell and printer adapter must keep working throughout the rollout. The operational contracts and entry points are in `docs/`. Run the supplied checks with `node --test` on Node 24. No package installation is needed.
