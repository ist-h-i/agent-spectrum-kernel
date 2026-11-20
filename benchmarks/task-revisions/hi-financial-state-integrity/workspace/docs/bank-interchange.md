# Clearing advice, editions 2019 and 2024

Each page has `feed` (a bank lane), `after` (the integer position immediately before its first row), `codec` and `rows`. Positions start at one independently on each feed. Bodies arrive through either relay.

| | `tape` | `json` |
| --- | --- | --- |
| Ticket | `branch`, `issueDate` as YYYYMMDD, `slip` as the zero-filled serial | `ticket` as used by the teller |
| Advice number | `edition`, positive integer | `revision`, positive integer |
| Amount | `movement` in signed major units with two decimals, measured from the preceding **ticket advice number**. The predecessor of number one is zero. | `gross`, cumulative minor units |
| Reservation disposition | `release` is Y or N | `final` is a boolean |
| Customer value date | `valueDate` as YYYYMMDD | `valueDay` as YYYY-MM-DD |

An advice supplies the replacement cumulative settlement of one ticket. Advice numbers increase by one. Amount, disposition and value date together identify the advice terms. Either relay may represent the same advice. Gross outside 0 through face limit is rejected. At cumulative gross G, the source has paid G, the destination has received G less the tariff, and the collector has received the tariff. A newer advice replaces those entitlements. Either disposition can subsequently be corrected. A held order reserves its unutilized face even after earlier release if the new advice calls for it.

For a newly placed order the tariff effective on its issue date applies throughout. The tariff register is ordered by effective date. Bands contain marginal basis points up to each inclusive upper limit in minor units. The last band is unlimited. Sum the exact marginal charges, round once to nearest minor unit (an exact half goes to the even unit), then apply the tariff ceiling. No party pays a separate charge when a bank resends a row.

## Delivery receipt

The service returns the durable `through` position of this feed and one status string. A new feed starts at zero. Each accepted position is durable before the next row is considered. A page may stop after accepting a prefix. Higher positions on that page must then wait for redelivery.

| Status | Meaning |
| --- | --- |
| `ok` | The supplied positions were already recorded with equivalent terms or have now been accepted. |
| `gap` | The page starts after the known feed position. |
| `conflict` | Terms at a known feed position differ, or a previously recorded ticket advice number is contradicted. |
| `waiting` | The order or preceding advice is missing, or the net movement and reservations cannot be funded at this time. |
| `rejected` | The new ticket advice would put the cumulative amount outside its face. |

A conflict at a previously recorded feed position is settled by that position's record, including when the incoming row names another ticket. The signed archive has a special receipt boundary described by the close desk. At a fresh position, the bank accepts an equivalent already-booked advice without posting it again. On a new tape advice the preceding ticket revision must be known to interpret its movement. A stopped row has no accounting or receipt effect and can be presented again after other activity. Both codecs can carry one page with multiple orders.
