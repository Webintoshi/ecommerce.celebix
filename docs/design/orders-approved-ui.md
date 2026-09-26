# Approved orders UI — 2026-09-26

Approval: user accepted the standalone orders-concept/orders-preview.html and requested implementation. Scope is shared Customer Panel frontend; no deploy in this turn.

Integration: isolated branch `codex/orders-approved-ui`; newest deployed source `29afede4319f733560a20e3fae068331048816d9` is a merge parent. Existing categories160 and WEB/POS161 releases are preserved without replaying any SQL.

Primary task: find an order, scan products/payment/delivery, and perform the permitted next operation.

Function inventory: list search/status/sort are server-side; date/payment/fulfillment/CSV operate on loaded rows. Preserve columns, cursor load-more, draft creation, mobile fields, numeric/WEB/POS codes. Detail retains authorized order/payment transitions, shipping quote/create/refresh/label/cancel/return, manual address/tracking, notes/archive, notification retries, history, neighbors/print, archive eligibility/restore evidence, deletion impact/exact confirmation/idempotency.

Implementation:
1. Separate list and detail CSS modules, matching #f8f7f5 open canvas and graphite actions. Keep existing shell, neutral sidebar and hidden semantic headings.
2. Shared native dialog with labelled close, Escape, inert background and focus restoration. No nested dialogs.
3. Compact list filters with visible applied filters and honest loaded scope, usable error/empty/loading states. Preserve rows when a cursor append fails.
4. Detail: one contextual primary action, products/totals dominant, rail contact/address, open shipping/notes/history, rare actions in overflow. Preserve versions/conflicts and form drafts after failures.
5. Shipping: compact result and on-demand package/quote dialog; existing provider contract and authority unchanged.

Verification: Customer Panel typecheck + production build; focused existing order-console/shipping and mocked-DOM behavior tests for version conflicts, failed saves, role gates, cursor errors and stale shipments/quotes; native dialog focus checks. Independent Atlas review of full diff. Browser screenshots 1440/1024/390 and console/network checks if the browser allows the test fixture; explicitly record limits if it does not.

Backend files changed: NONE. No auth, MerchantAction, repository, handler, SQL, provider calculation, infrastructure or deployment changes.
