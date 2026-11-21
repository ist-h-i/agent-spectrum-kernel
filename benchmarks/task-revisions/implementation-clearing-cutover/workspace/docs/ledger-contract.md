# Teller desk circular

The only application entry point is `openBook(snapshot)` in `src/ledger.mjs`. It opens an independent in-memory book. Every call on that book is synchronous. All wire amounts returned to clients are base-10 strings in minor units, with no separator, decimal point or redundant leading zero. There are two minor digits to one major unit. The account system has amounts larger than JavaScript's safe integer range.

The four desks call these methods:

| Method | Return |
| --- | --- |
| `place({ticket, from, to, limit})` | `"opened"`, `"replayed"`, `"conflict"` or `"unfunded"` |
| `receive(page)` | Object with `status` and integer `through`, defined in the bank interchange note |
| `balance(account)` | Object with `posted` and `available` minor-unit strings |
| `turn(firstOpen)` | Advances the first open posting date. Callers pass the current date or a later one. Return value is unused. |
| `statement(account, postingDay)` | That account's daybook lines in entry order, defined in the close instructions |
| `attest({ticket, first, rows})` | Registers a certified fragment for a deployed kiosk ticket as defined by the close desk |
| `dump()` | Independent JSON snapshot. Opening a JSON round trip of this value must continue the same book. |

A teller ticket has three fields, `office`, `day` (ISO issue date) and `serial` (an unpadded positive decimal string). Serial numbering restarts on each office's business day. The face limit, source and destination constitute the order. A matching order presented again gets its original ticket without another reservation. A different order on that ticket conflicts. A refused new order leaves the ticket free.

Posted balances are cash already booked. An unreleased order reserves its remaining face amount at its source. Available cash is the posted balance less all outstanding reservations at the account. A new order reserves its whole face, provided the source can fund it. The destination differs from the source. The collector on a tariff can be either party or a third account. The desk accepts a transfer only when cash available to every affected account after the transaction is nonnegative. It makes this decision on each account's net position.

The supplied callers use valid shapes, defined accounts, canonical amounts and valid calendar dates. Orders have positive limits. A bank can nevertheless present an unsupported amount, interrupt a sequence or disagree with another bank report. No network, wall clock, dependencies or external account service is needed. Sources under `src/` may be replaced or reorganized within the four supplied file paths. Other files are fixed.
