# Approved Analytics implementation

## Function inventory (before implementation)

Primary task: compare store performance in a selected period, identify conversion losses, and inspect supporting commerce and traffic records.

- Five URL-addressable reports: overview, funnel, carts, acquisition, products.
- Period presets today / 7 / 30 / 90 days, custom inclusive calendar dates, timezone and previous-period comparison for presets.
- Tab-specific currency, device, source, campaign, category, product, brand, lifecycle, contactability, search and amount filters; apply, active count and clear. Preserve supported query fields and reset pagination on navigation/filter changes.
- Overview: per-currency paid revenue, total paid orders, visitors and purchase rate; currency-specific daily sales and accessible daily table; commerce/traffic comparisons, interaction journey, source/product drill-down, behavior metrics and breakdowns.
- Funnel: six measured events, adjacent/overall rates, largest observed loss and paid order to checkout ratio.
- Carts: currency totals, lifecycle/payment/recovery metrics; customer/products, amount breakdown, activity, source/device/campaign/contact status, detail link and pagination.
- Sources: first/last attribution, commerce and behavioral rows; preserve all original columns and unavailable behavior indicators.
- Products: category/brand, views/adds, checkout/orders/quantity/revenue/abandonment/recovery and pagination.
- Visibility-aware live visitor poller, measurement health and analytics-settings link.
- Abort obsolete requests; layout loading, retry on failure; empty records versus unavailable traffic; preserve currency separation.
- Mobile: two-column prioritized KPI strip, stacked chart/insight, filter sheet, complete row cards, shell drawer/dock; keyboard tabs, focus, Escape and summary restoration.

## Approved direction

Reference: `celebix-analytics-concept.html`. Reuse the existing merchant shell. Respect the user's exact #f8f7f5 canvas and no visible repeated heading. Replace prototype-only sample/outage controls and fabricated example numbers with existing endpoint data. All five reports and advanced measurements stay available through progressive disclosure.

Frontend scope only: components and UI helpers/tests. Production API, authentication, database and deployment changes: NONE.

## Verification

Implemented in the shared `apps/customer-panel` workspace, reusing its existing shell and live visitor component. No extra dependency, chart library or external font was added.

### Data and interaction acceptance

- Existing five reports, supported filters, source attribution modes, cart/product pagination, detail links, comparison totals and secondary measurements remain available.
- Overview revenue stays separated by currency. Previous-period chart points use the endpoint's previous range and a shared ordinal-day scale. A partial calendar-day bucket is retained when its midnight precedes a partial range start.
- Overview independent interaction counts are retained separately. Its journey and loss insight now use an independent read from the existing ordered `/funnel` endpoint; top products use the existing `/products` endpoint. No invented conversion sequence, sales trend or product imagery is rendered.
- The loss insight ranks absolute lost sessions. Daily paid-order/session ratio is labelled as a ratio, not a daily unique-visitor conversion rate.
- Intentional absent traffic for carts and first-touch attribution is distinguished from provider failure. Partially available traffic remains visible; unavailable event data is never replaced with measured zero. Delayed commerce is not described as current when traffic is also missing.
- Query identity and abort guards prevent old results appearing under a new report or period. Main and supplementary errors preserve independent available reports. Comparison survives preset changes. Custom dates reject reversed or more than 400-day ranges and associate feedback with the affected field.
- Keyboard report navigation, filter apply/clear, Escape and focus restoration verified. At <=1024px the sheet has initial focus, Tab/Shift+Tab containment, a focus guard, background inertness and scroll locking; closure restores background access and the trigger focus. Desktop remains a nonmodal popover.

### Browser acceptance

Real production components mounted in the local existing presentation fixture, with deterministic sample endpoint payloads (not live merchant data).

| Width | Result |
| --- | --- |
| 1440 px | Zero page overflow, four neutral KPI cells, chart and insight columns, comparison legend and readable dates |
| 1024 px | Zero page overflow, stacked chart and insight, bounded report tables |
| 390 px | Zero page overflow, two-column KPIs, complete product/cart row cards, readable chart endpoint dates, filter sheet above dock |

- Exact canvas verified as `rgb(248, 247, 245)` / `#f8f7f5`.
- No visible repeated working-page heading; semantic h1 retained for assistive navigation.
- Enabled main controls meet 44x44 touch targets. Native sheet opening, both keyboard wraps, Escape and trigger restoration verified at 390px.
- Fresh final browser session warning/error console: none. Normal fixture report requests resolved successfully; deliberate failed/partial/empty cases covered in mounted tests. No live authenticated acceptance was claimed.
- Native viewport screenshots saved in `~/.codex/visualizations/2026/09/25/01a0d5e7-979f-74e0-a9a5-657befede0df/analytics-implementation/`: `desktop-1440.png`, `tablet-1024.png`, `mobile-390.png`, `mobile-products-390.png`, `mobile-filters-390.png`. Full-page screenshot stitching was unreliable, so the final desktop proof uses the normal native 1440x1000 capture.
- Temporary browser viewport override reset; local sample-data review tab retained.

### Final gates

- Final focused analytics suite: **76/76 passed**, exit 0. Command: `node --experimental-transform-types --test apps/customer-panel/lib/analytics-ui/*.test.ts apps/customer-panel/lib/analytics-console.test.ts apps/customer-panel/lib/analytics-workspace.behavior.test.ts`.
- Customer Panel production build: **passed**, exit 0; compilation, TypeScript validation and all 90 generated pages completed successfully. Command: `npm run build --workspace @celebix/customer-panel`.
- `git diff --check`: clean.
- Atlas final code and screenshot review: **APPROVED** after resolving intentional first-touch traffic absence, common comparison-day alignment, mixed worker/traffic freshness wording and sheet keyboard containment. No outstanding concrete finding.

Backend files changed: **NONE**. Fixture-only HTTP handlers live under `tests/`; no production HTTP handler, API contract, authentication, SQL, tenant, deployment, infrastructure or environment changes. No deployment performed.
