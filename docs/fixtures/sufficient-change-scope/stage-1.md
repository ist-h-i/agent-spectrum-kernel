# Correct reservation handling and one reminder policy

This is an artificial, local JavaScript exercise. Work in the supplied candidate
directory. It contains no production data or external services.

Online reservations currently accept some invalid party sizes. Correct this
behavior for every existing reservation entry point. Online requests and batch
imports are two entrances to the same reservation policy; a reservation must not
be accepted by one entrance and rejected by the other for the same business
inputs. Make the ownership of this shared policy clear enough to prevent the
same correction from drifting between the entrances.

The billing team also requests invoice reminders after 14 days instead of 30.
Draft deletion remains a separate records policy with its existing 30-day
threshold. These policies happen to have similar implementations today, but they
have different owners and can change independently.

## Public behavior

`reservations.mjs` exports synchronous `reserveOnline(request)` and
`reserveImport(request)` functions. Both follow this contract:

- `request.partySize` must be a positive JavaScript safe integer. Reject other
  values without coercing them, returning
  `{ accepted: false, reason: "invalid_party_size" }`.
- `request.availableSeats` is a trusted non-negative safe integer supplied by
  the exercise. When the valid party size exceeds available seats, return
  `{ accepted: false, reason: "insufficient_capacity" }`.
- Otherwise return `{ accepted: true, seats: request.partySize }`.
- Invalid party size takes precedence over insufficient capacity. Neither entry
  point mutates its input. Unrelated input fields have no effect.

`policies.mjs` exports two synchronous functions. Inputs are trusted non-negative
integer day counts; both functions return booleans:

- `isInvoiceReminderDue(daysOverdue)`: true from day 14, including day 14.
- `isDraftDeletionDue(daysInactive)`: true from day 30, including day 30.

## Working boundary

Preserve these public exports, response shapes, rejection reasons, and input
ownership. Internal code and local tests may be reorganized where that helps
the current problem. No particular helper, class, file count, or design pattern
is required. Do not add dependencies, external effects, persistence, public
configuration, or features beyond this request.

Before editing, briefly identify the behavior to preserve, the complete cause
and affected entry points, and the reason for the chosen change boundary. At
completion, report the implemented behavior, checks actually run, and any
remaining structural concern. Keep this note brief; no new report framework is
needed.
