# Customer Panel Page Patterns

Choose the pattern only after inspecting the current screen, inventorying every function/action, and naming the user's primary task. Turkish examples illustrate Celebix UI copy; they are not fixed product strings.

## Pattern matrix

| Pattern | Header | Main content | Primary CTA | Secondary actions | Mobile transformation | Loading / empty / error |
|---|---|---|---|---|---|---|
| Dashboard | “Genel Bakış” + one-line operational context | Neutral KPI strip, one primary trend, prioritized exceptions/recent activity | Only the highest-value next action, if needed | Date range and view controls stay quiet | Priority KPIs first; charts become summaries; activity becomes list | Layout-matched skeleton; actionable onboarding empty; widgets fail independently |
| List and table | Entity title, count/context, short description | Filter toolbar then dense operational table | “Yeni ürün” / “Yeni müşteri” | Export, saved view, columns in compact menu | Filter drawer; prioritized row/card summary; bounded table scroll only if necessary | Row skeleton; distinguish no records from no filter matches; preserve filters on retry |
| Detail page | Entity identity, status, essential metadata | Primary detail plus history/related sections; optional 60/40 layout | Contextual edit or state action | Overflow menu for rare actions | Single column; side summary becomes section or bottom drawer | Preserve shell; identify failed section; retain other readable data |
| Create/edit form | Task title and brief outcome | Clear sections or steps; labels/help/errors; optional sticky summary | Save/create at end or sticky action area | Cancel/back and low-frequency options | One column; summary becomes review section/drawer; action remains reachable | Skeleton only for dependencies; never clear input after save error; identify recoverability |
| Wizard | Outcome and current step | One decision group per step, progress, review before commit | Continue / final commit | Back and save-exit when supported | Single column and short steps; no cramped horizontal stepper | Preserve completed values; show step-local error; explain blocked progression |
| Settings | “Ayarlar” with scoped account/store context | Grouped sections; use tabs/sidebar only for stable categories | Save changes, one primary per active scope | Reset/cancel where safe | Category selector or stacked sections; sticky save only when unobtrusive | Preserve current values; dirty-state warning; section-level retry |
| Analytics | Metric scope and date range | Neutral summary, focused charts, supporting table | Usually none; export only if task-critical | Compare/filter controls | Prioritized summary; simplified chart; detailed data in list/drawer | Preserve selected range; honest no-data cause; independent chart errors |
| Empty state | Context title remains visible | Explanation: what is missing, why, next step | One relevant creation/import action | Help link only if useful | Compact centered or inline composition | Empty state is the content; do not disguise errors as empty |
| Error state | Keep page identity and safe navigation | What failed, whether data is preserved, retryability, alternative | Retry or safe recovery | Support/back when relevant | Place error near failed task; keep primary navigation available | Never expose raw API/SQL code; partial failures stay local |
| Read-only state | Identity plus explicit read-only reason | Same information hierarchy, non-editable controls visually clear | None unless request-access is supported | Copy/export permitted by existing behavior | Single-column readable detail | Explain why read-only and what can still be done; never show fake enabled controls |

## Required function inventory

Before restyling, record:

```text
Primary user task:
Visible information:
Primary action:
Secondary and bulk actions:
Filters/search/sort/pagination:
Row/card actions:
Navigation and deep links:
Loading/empty/error/read-only states:
Desktop-only behavior that needs a mobile transformation:
```

The implemented screen must retain every inventoried item. A visual redesign cannot silently remove an action, field, state, or piece of information.

Long forms use clear sections or steps, progressive disclosure, explicit advanced settings, and a sticky summary only when they reduce cognitive load without hiding required information.

## Choosing table versus cards

Keep a table when users compare columns, scan many rows, sort, select, or run bulk actions. Use summary cards for mobile prioritization or genuinely independent records, and expose full detail in a drawer/page. A desktop hybrid is valid only when it preserves high-density comparison and complete actions.
