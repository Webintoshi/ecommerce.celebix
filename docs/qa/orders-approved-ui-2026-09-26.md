# Orders approved UI — 2026-09-26

## Scope

User approved the Orders list/detail HTML and requested implementation. Shared Customer Panel presentation/controllers only. No deployment or live merchant writes. Canvas `#f8f7f5`, graphite actions, neutral sidebar, hidden semantic page headings, open operational layout.

Branch: `codex/orders-approved-ui`. Isolated worktree: `/Users/Celebix/.codex/worktrees/orders-approved-ui/Saas-Celebix`. Includes current deployed source `29afede4319f733560a20e3fae068331048816d9`, preserving category160, numbering161 and register behavior. Incoming SQL161 files belong to that existing release; this UI task authors/applies no migration.

## Implemented

- Compact search/status/sort toolbar, column/CSV/filter dialogs, visible loaded-row filter scope; desktop table and mobile operational records.
- Cursor append failures retain existing rows and retry. Requests from obsolete filter/order scopes cannot overwrite the current view.
- Detail contextual next action, product/totals paper, customer/address rail, open notes/shipping/history, notification retries and overflow actions.
- Native labelled modal, Escape, focus return, keyboard navigation and disabled busy controls. Failed writes retain entered values; conflicts refresh the version without closing the draft.
- Existing payment status, manual shipping, quote/package/COD/create/label/refresh/cancel/return, notes, archive eligibility/evidence, restore proof, deletion impact/exact confirmation, neighbors and print preserved.
- POS avoids generic fulfillment/payment/shipping workflows. Role and transition helpers remain authoritative. Payment state changes are clearly distinguished from moving funds.
- Shipping datetime-local values serialize to ISO; unchanged recorded seconds/milliseconds are retained. Restore intent survives form remounts. Async completions from earlier visits cannot close or clear a new operation, including A→B→A navigation.

## Verification

Focused command:

```sh
node --experimental-transform-types --test \
  apps/customer-panel/lib/order-console.test.ts \
  apps/customer-panel/lib/order-detail-behavior.test.ts \
  apps/customer-panel/lib/order-list-behavior.test.ts \
  apps/customer-panel/components/shipping/OrderShipmentConsole.test.ts \
  apps/customer-panel/components/shipping/OrderShipmentConsole.behavior.test.ts
```

**57/57 passed**, exit0. Includes41 existing console/permission/idempotency/CSV/contracts checks,14 DOM/controller behavior cases and2 shipping checks. Atlas independently reran the14 behavior cases and approved the settled source/boundary review. Review findings around local datetime, timestamp precision, overflow focus, restore retry proof and stale mutation completion were fixed and covered.

`npm run build --workspace @celebix/customer-panel`: **exit0**. Optimized compilation passed; production TypeScript completed; all90 static pages, route data and build traces completed. A prior standalone typecheck identified a DOM test-harness type mismatch; that was corrected before the successful production TypeScript pass. `git diff --check` and staged diff checks are clean.

## Browser acceptance

Actual Next/React fixture at `/mira-orders-approved`, using real `OrderListPresentation`, `OrderDetailPresentation`, native dialog and `PanelLayoutClient`. Synthetic `example.test` customer records and in-memory handlers; no live records or provider actions. Fixture readiness marker prevents interacting before hydration.

- Screenshots inspected for list/detail at1440,1024 and390px. Document scroll width equals viewport width at each size; no page-level horizontal overflow. Mobile retains quantity, unit price, totals and accessible actions.
- Filter apply correctly restricts failed-payment rows; search reduces to the matching record. Cursor failure keeps12 records and shows retry.
- Native state save closes after success, updates progress and returns focus to the contextual action. Column/filter Escape returns focus to the opener. Tab and reverseTab navigate dialog fields/close control; the modal background is inert.
- Analyst has metadata only, no editable controls. POS presents pickup, with no generic payment/shipping/status workflow.
- Browser warning/error logs empty at final check. Fixture route and asset requests completed with200. Initial local server startup required restarting the test server; application checks ran after readiness.
- Shipping provider capability is disabled in this browser fixture. Package/quote/COD failures, precision, stale order/version responses and stage gating were tested against the real component with mocked API responses. No claim of live provider/end-to-end payment verification.

## Boundaries

Mira-authored backend/API/SQL/auth/role/payment/infrastructure files changed: **NONE**. No new dependencies or font/animation payload. Existing161 migration is preserved by ancestry and was not executed. Live deployment remains a separate step.
