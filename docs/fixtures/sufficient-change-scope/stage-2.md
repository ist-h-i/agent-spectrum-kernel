# Continue from the completed reservation and reminder change

Apply this request to the same candidate produced for stage 1. Do not restart
from the seed or replace the candidate with another implementation. This is a
new requirement, not a missing stage-1 obligation.

Some events now limit the size of each party. Both reservation entry points must
honor an optional `request.maxPartySize`, supplied as a trusted positive safe
integer. With this field absent, all stage-1 behavior remains unchanged.

The rejection order is now explicit:

1. Invalid `partySize`: `invalid_party_size`, unchanged from stage 1.
2. A valid party exceeds a present `maxPartySize`: `party_limit_exceeded`.
3. A valid party exceeds `availableSeats`: `insufficient_capacity`.
4. Otherwise accept with the same response shape as stage 1.

The party limit applies identically to online reservations and batch imports.
Neither entry point mutates its input. Do not invent handling for invalid
trusted capacity or party-limit values; that input domain is outside this
exercise.

Separately, the records owner changes draft deletion from day 30 to day 45,
including day 45. Invoice reminders remain due from day 14. Preserve the public
exports and all other behavior.

Use the stage-1 working boundary. Briefly record which existing policy locations
had to be understood and changed, whether the stage-1 organization helped or
hindered this update, and the checks actually run. Do not use changed-line or
file counts as a quality score.
