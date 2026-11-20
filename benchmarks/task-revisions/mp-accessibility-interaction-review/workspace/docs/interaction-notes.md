# Formatting toolbar interaction notes

The formatting controls form one keyboard interaction group.

- `Tab` enters the toolbar at its current active control. Exactly one button has `tabindex="0"`; the other toolbar buttons use `tabindex="-1"`.
- Left and Right Arrow move focus between buttons and wrap at either end.
- Home and End move focus to the first and last button respectively.
- A handled navigation key consumes its browser default so moving focus does not also move the page viewport.
- Every keyboard move updates the single tab stop and moves DOM focus to the same button.

Bold, italic, and underline remain native toggle buttons and expose their current state with `aria-pressed`.
