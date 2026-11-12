# ADR 0002 — Explicit row/column cells, never reflow

- Status: Accepted (D5, Nov 9, 2026)

## Context

The original schema stored one `position` integer per button. With configurable columns, changing
the grid or resizing the window reflows buttons. iPadOS 26 and Android 16/17 make tablet apps
resizable, so reflow would happen without any adult action, breaking motor patterns AAC users rely
on.

## Decision

Each cell stores `row` and `col`, unique per board. Resizing the window scales cells; it never
moves them. Shrinking the grid flags out-of-range cells in the builder rather than dropping them.
Cells may be empty or hidden.

## Consequences

Layout code must handle very small windows (minimum cell size, then scale) without wrapping.
Imports from formats that use linear order (some `.obf` files) are mapped to rows/columns once,
on import.
