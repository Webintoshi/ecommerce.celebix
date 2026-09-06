# Customer Panel Component Rules

Use existing shared components before creating variants. Every component must preserve its current actions, information, keyboard behavior, loading/error handling, and responsive purpose.

## Component contract

| Component | When to use | Visual character and density | Color discipline | Mobile behavior | Forbidden use |
|---|---|---|---|---|---|
| Sidebar | Primary desktop navigation | Fixed graphite surface; 232–248 px open, 68–76 px collapsed; thin icons; store switcher and user menu at bottom | Neutral inverse text; subtle active surface plus a small gold line/dot | Replace with drawer/mobile navigation | Bright full-gold active row, multicolor icons |
| Topbar | Global search, notification, account, necessary page actions | Quiet and compact | Neutral; accent only for focus/selection | Prioritize search/account; move overflow actions into menu | Duplicating every page action |
| Page header | Page identity and actions | Optional short eyebrow, 24–28 px title, one-line description; 96–128 px maximum normally | Neutral title/body | Stack content and keep primary action reachable | Hero scale; 3–4 equal-weight CTAs |
| KPI card | Small operational summary | White, 1 px border, 10–12 px radius, dark 24–30 px value, small comparison | Neutral value/icon; semantic trend only | One or two columns, priority ordered | Rainbow cards or a different icon color per KPI |
| Data table | Dense comparison and bulk operations | 44–48 px rows; primary info first; checkbox left; actions right; sticky header when useful | Neutral cells, low-contrast hover, calm status | Prioritized list/cards, detail drawer, or bounded horizontal scroller | Card wall by default; hidden critical actions; every cell as badge |
| Filter toolbar | Search, sort, filters, saved views | Compact control row with explicit applied-filter count | Neutral controls; accent for selected state | Collapse into filter drawer; retain clear/apply | Unbounded wrapping or hidden active filters |
| Search input | Find records by known terms | 40–44 px, visible label or accessible name, clear control | Neutral surface; visible focus | Full available width | Placeholder as the only label |
| Status badge | Genuine state such as “Aktif” or “Hazırlanıyor” | Small, calm, icon/dot + text, muted fill if needed | Semantic only | Preserve text and meaning | Large bright pills; color-only state |
| Button | Commit an action | 40–44 px, 8–10 px radius; one primary CTA maximum per screen | Primary graphite; secondary neutral; danger only for destructive commit | At least 44×44 target; full width only when hierarchy benefits | Gold with low-contrast white text; oversized buttons |
| Form field | Labeled data entry | Visible label, short help, required marker, inline error | Neutral; semantic error with text/icon | One column at 390 px | Placeholder-only label; clearing values after failed save |
| Select | Choose from a manageable set | Same height/radius as inputs; clear current value | Neutral; focus accent | Native/mobile-friendly sheet when needed | Searchless select for very large sets |
| Tabs | Switch peer views in context | Compact; clear selected indicator | Neutral labels; small gold selected indicator | Horizontally bounded tab scroller or select when numerous | Multiple bright fills; color-only selection |
| Modal | Short decision, confirmation, delete, small form | Focused 12–16 px surface; concise actions | Neutral; danger reserved for destructive confirmation | Near-full-width sheet/dialog with safe margins | Nested modal; long editing flows |
| Drawer | Detail, filters, long edit, context-preserving task | Structured sections; 12–16 px radius where exposed | Neutral surfaces; accent for focus/selection | Bottom/full-height drawer as appropriate | Hiding the only route to essential data |
| Toast | Transient confirmation or recoverable notice | Brief, non-blocking, closeable; announce to assistive tech | Semantic only when meaningful | Avoid covering navigation/primary action | Raw API/SQL errors; sole error explanation |
| Inline feedback | Field/section success, warning, or error | Adjacent to affected content; states outcome and next step | Semantic icon/text plus readable copy | Remain adjacent in single-column flow | Color-only feedback |
| Empty state | No records or no filtered results | Explain what is absent, why, what to do, and primary action | Neutral illustration/copy; one action | Compact; no decorative hero | Generic “No data”; unrelated CTA |
| Skeleton | Loading known layout | Mirror final structure and density | Neutral subtle blocks | Mirror transformed mobile structure | Full-page spinner blocking unrelated work |
| Chart container | Trends/relationships that aid decisions | Clear title, range, legend, tooltip, data fallback | Graphite + one gold main series by default | Replace complex chart with summary when necessary | Rainbow palette; gratuitous donut/pie; color-only distinction |
| Timeline | Ordered events/history | Compact vertical sequence with readable timestamps | Neutral rail; semantic marker only for true state | Single column | Decorative multicolor steps |

## Interaction details

- Modal: focus trap, Escape close when safe, initial focus, and focus restoration.
- Drawer: preserve page context, label its close control, and prevent background keyboard interaction.
- Dangerous action copy names the consequence, reversibility, and safer alternative.
- A running action alone becomes disabled; do not block the entire screen.
