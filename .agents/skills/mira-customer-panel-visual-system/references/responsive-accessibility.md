# Responsive, Accessibility, and QA Standard

## Viewport contracts

| Viewport | Layout contract |
|---|---|
| 1440 px | Open 232–248 px sidebar; dense tables; optional two-column detail and sticky summary; 24–32 px main padding. |
| 1024 px | Compact/collapsed sidebar; 20–24 px padding; two-column becomes 60/40 or one column; actions wrap into an intentional overflow menu, never clip. |
| 390 px | Drawer/mobile navigation; 16 px padding; single-column forms; one/two-column prioritized KPIs; tables become summaries or a bounded scroller; side panels become sections/bottom drawers; primary action remains reachable. |

Page-level horizontal overflow must equal **0** at all three targets. A deliberate data-table scroller may overflow only inside its labeled, bounded container.

## Mobile transformation checklist

- Navigation: sidebar → labeled drawer/mobile navigation.
- Page header: compact title/context; one primary action; rare actions in overflow.
- KPI: reorder by task value; use one or two columns; do not shrink text below token scale.
- Table: choose prioritized list/card summary, detail drawer, or bounded horizontal table based on operations.
- Filters: toolbar → drawer/sheet with applied count and clear/apply controls.
- Form: multi-column → one column; preserve labels, help, errors, values, and save/cancel.
- Sticky right panel: inline summary section or bottom drawer.
- Chart: simplify to key trend/summary without losing accessible values.
- Modal/drawer: safe margins, visible close, reachable actions, no nested dialog.

## Accessibility acceptance

- WCAG AA contrast for text, controls, focus, and meaningful graphics.
- Visible focus indicator on every interactive element.
- Full keyboard navigation in logical visual order.
- Correct `h1` → `h2` → `h3` hierarchy; one clear page `h1`.
- Programmatic label and description/error relationship for fields.
- Status uses text plus icon/dot; information never depends on color alone.
- Modal focus trap, safe Escape close, and focus restoration to its trigger.
- Drawer/popover/menu ownership and expanded state are announced.
- Reduced-motion preference disables nonessential animation.
- Touch targets are at least 44×44 px even when the visible control is compact.
- Toast/live feedback is announced without stealing focus.

## State acceptance

**Loading:** skeleton matches the final desktop/mobile layout; only the running action is disabled; unrelated content remains usable.

**Empty:** states what is missing, why it is empty, what the user should do, and the single primary action.

**Error:** states what failed, whether input/data was preserved, whether retry is possible, and an alternative. Never expose raw API or SQL details.

## Future-screen acceptance checklist

```text
Approved visual direction: PASS
Existing functionality loss: 0
Ad hoc colors: 0
Colored heading/body text: 0
Primary CTA count: <= 1
Desktop 1440: PASS
Compact 1024: PASS
Mobile 390: PASS
Horizontal overflow: 0
Keyboard navigation: PASS
Visible focus: PASS
Console errors: 0
Unexpected 4xx/5xx: 0
Loading state: PASS
Empty state: PASS
Error state: PASS
Atlas visual review: PASS
```

## Required QA sequence

1. Compare the implementation with the function inventory.
2. Capture and inspect screenshots at 1440, 1024, and 390 px.
3. Navigate the complete flow by keyboard; inspect focus, trap, Escape, and restoration.
4. Check browser console and network during loading, success, empty, validation, and error paths.
5. Confirm no unexpected 4xx/5xx, clipped action, page-level overflow, or raw backend error.
6. Submit screenshots and the checklist to Atlas visual review.
