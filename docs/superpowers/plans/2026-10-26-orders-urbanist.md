# Orders Urbanist Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the bounded presentation tasks below.

**Goal:** Apply the approved Urbanist analytics/overview language to orders and every reachable child screen, then verify and publish both shared Customer Panels.

**Architecture:** Reuse the current operational components and shared visual tokens. Restyle local CSS and, only when necessary, rendered markup; retain all data loading, controllers, permissions, calculations, mutations, operation keys and recovery behavior. No new dependency or backend contract.

**Tech Stack:** Existing React/Next.js, CSS Modules, Urbanist variable font, Lucide, native dialogs and flat SVG artwork.

**Spec:** User's direct request for `/orders` and child screens, extending the accepted overview direction documented in `2026-10-26-dashboard-urbanist.md` and customer-panel AGENTS.

## Global constraints

- Source base: `af030a7d896c1676acf68a8a191180fb1c508a80`; root is sole publisher, coordinated with Cemo.
- Use current global tokens, body500/control600/heading700/value700/helper400. Warm canvas, white surfaces, thin borders, radius12, restrained orange selection, graphite primary.
- No visible repeated page heading/introduction. Keep semantic headings and all critical feedback.
- One primary task action; secondary actions visibly actionable;44px targets,2px focus. Preserve all fields and facts on mobile, with zero page overflow.
- No APIs, SQL, permissions, package gates, order/payment/inventory rules, external assets or environment changes.
- Preserve redirect-only draft routes, dormant draft list and physical print behavior.

## Function inventory / primary tasks

**List: find and open the correct order.** Preserve server search/status/sort/channel/platform and20-row cursor pagination; loaded-page date/payment/fulfilment filters, filter drafts/cancel/clear, column visibility, truthful loaded-scope CSV/formula escaping, keyboard search, refresh/append retries, plan-gated manual sale, every desktop/mobile fact and detail link. Old records never appear under a changed query; refresh may retain rows.

**Detail: inspect and perform the permitted next operation.** Preserve authorized status/payment transitions, current and historic contact/address facts, real finance/shipment integrations, lazy edit, back/neighbours/print, items and all totals/history/notifications, internal note add/archive, archive/restore/exact-impact permanent-delete and stable uncertain operation retry. Keep stale record guards and loaded-data refresh recovery.

**Manual/POS: scan/select products and complete the chosen payment safely.** Preserve locations/channel/reference, pickup/shipping/billing, SKU/barcode/name search, quantity/price/discount/customer/note, held/pending/recent drawers, takeover permissions, contract3/4 full/partial/credit/split payment branches, physical receipts/refund confirmation, pending recovery, controller/localStorage/idempotent keys and every staff/plan gate.

**Payment links: find or build the correct link.** Preserve list filters/clear/refresh/pagination, copy/open/duplicate/cancel, mounted-hidden builder and buffers, keyboard product/customer pickers, stock/qty/type, contacts/addresses/expiry/shipping/discount/payment provider readiness, notes, create/reset and uncertain create fingerprint/key.

**Abandoned carts: identify and recover an eligible cart.** Preserve four metrics/search/status/sort/clear/pagination, complete desktop/mobile facts; detail products/totals/contacts/times, recovery link generate/copy/fallback, archive/contact/note and permissions/busy gates.

**Legacy draft: inspect historical information.** Preserve read-only notices, all products/contact/address/totals/stock policy, back and converted-order link. Draft list/new redirect to manual sales.

**Overlays/print:** Preserve native dialog containment/Escape/return focus, busy locks, edit drafts/close warning/uncertain retry/finance preview; shipping package/quote/expiry/action gates; complete authenticated printable snapshot and physical print layout.

## Review focus

- Cashier/plan/provider-managed read-only states must not acquire mutations or lose permitted actions.
- Unknown payment/edit/archive outcomes retain operation keys and do-not-charge-again recovery copy.
- Mobile filters/dialogs/long names/addresses and dense tables remain fully readable and operable.
- Refresh retains safe loaded content; changed route/query hides prior authority; failed forms retain input.
- Print content and real money/stock/shipping consequences remain unchanged.

## Tasks

- [x] List/detail: `OrderListConsole.tsx`, `OrderDetailConsole.tsx`, `order-list.module.css`, `order-detail.module.css`; consolidate style layers, clear toolbar/table/mobile cards and main/rail sections. Keep behavior helpers exact. Verify existing list/detail/stability tests.
- [x] Adjacent: `InStoreSalesConsole`, `QuickOrderLinksConsole`, `AbandonedCartConsole`, `OrderDraftEditor`, `OrderPrintView` and their local CSS. Favor CSS; retain controller/helper/hook/data prefixes and bindings. Only screen print chrome changes. Verify payment/POS/adjacent behavior.
- [x] Root overlays: `OrderEditDrawer.module.css`, `order-action-dialog.module.css`, `shipping/order-shipment.module.css`; align controls/sections/focus/surfaces, preserve all TSX behavior. Verify edit/shipment tests and native keyboard behavior.
- [x] Reuse existing orders-approved/order-adjacent/POS fixtures. Add only missing fixture states. Inspect1440/1024/390 for list/detail/manual/payment list+builder/cart list+detail/legacy draft/print and relevant overlays. No live merchant writes during visual QA.
- [x] Independent Atlas visual/source review; source-bound typecheck/official build/signup/provider checks. Record existing baseline failures separately; do not weaken behavior tests to hide regressions.
- [ ] Fresh locked orders release kit with exact routes/CSS/client/source witnesses, unchanged Urbanist and five roles, native278/full2062 routines, payment/environment/all6runtime safeguards. Review final SHA with Cemo; root fresh capture/build/seal then NET acceptance/live UI, SITE acceptance/live UI, final global-idle/four unchanged witnesses. Restore only generated metadata owned by this build.

## Baseline verification before edits

153 relevant order/shipment tests:146 pass,7 pre-existing failures. Log `/tmp/orders-urbanist-baseline-tests.log`. Failures are old adjacent palette/semantic/geometry/focus/legacy expectations and the existing focus-refresh table test. Review exact causes before modifying expectations; preserve meaningful authority, lifecycle, state and access assertions.

## Implementation / verification record

All production changes are ten local CSS modules. Production TSX, APIs, controllers, contracts, permissions, operation keys, calculations and print content remain byte-identical.

Rendered actual components with synthetic local data at1440/1024/390: list, detail, manual/POS, payment link list+builder, abandoned cart list+detail, legacy readonly draft, edit drawer, shipping quote dialog and print preview. Zero page overflow. Payment builder inputs survived list/back navigation; shipping Escape returned focus. Corrected shared-dialog specificity for wide edit drawer (1120/976/390px). Mobile print prices stay unbroken inside the bounded table scroller. Existing physical-print/base AST is unchanged.

Fresh broader targeted suite:280 tests,277 passed,3 existing failures (quick-link recovery focus source identifier, legacy route source string and focus-refresh table assertion); these same failures existed before edits. No behavior assertions weakened. Customer Panel typecheck passed. Release kit13Python+21Node checks passed, including print media-query bypass negatives. Independent source review found no remaining material issue. Development hydration warnings identify extension-injected bis_skin_checked/bis_register attributes.

Screenshots saved under the task visualization folder as orders-urbanist-*.png. Official exact-candidate build and both live runtime acceptance remain separate release gates.
