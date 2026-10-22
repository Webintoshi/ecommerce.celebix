# Existing-order editing and cashier access

**Goal:** Edit real saved orders from their detail screen and let managers assign cashier Orders access; publish to shared panels without disrupting receipts, inventory, historical tariffs or existing access.

**Architecture:** Add strict additive order-edit contracts, authoritative PostgreSQL workspace/search/preview/apply/recover functions, a scoped repository and same-origin session-bound HTTP endpoints. Editing has immutable before/after revisions, optimistic order version + fresh preview fingerprint, and a durable operation UUID. Actual cash/refunds are recorded only in existing collection/refund flows. Existing customers are never reassigned by editing a snapshot.

## Decisions

- Fields: product/variant lines, quantities, permitted unit prices and discounts, shipping charge, customer contact snapshots, delivery/billing address, required change reason.
- One visible Siparişi düzenle entry in order detail. One Kaydet action internally validates preview and applies; show estimated total, actual collected amount, settlement discount, remaining debt and refund due separately.
- Preserve source/order number/customer identity, original receipts, inventory evidence and cashier/rate attribution. Reflect actual product-net change in commission. No gateway charge/refund or fabricated cash on editing.
- Completed POS pickup sales remain editable if there is no shipping, cancellation or return/refund evidence. Existing physical fulfilment, returns/refunds, archival/cancellation or unresolved provider payment prevent edits with a clear reason.
- Native259: can_manage_orders default false; staff contract7; existing v1–6 readers and writes preserve the new permission. Grant requires active membership and enabled grant, and permits orders read/manage/fulfill/payment/note; permanent deletion remains separately protected.
- Native260: authoritative edit, stock delta with original provenance and current reservations, finance adjustments/history, commission and profit readers. Protect historical order-item references.
- Native/database tests run only in disposable PostgreSQL16. No customer OTP/order/payment mutations for testing.

## Execution

- [x] Permission slice: contracts, staff editors, durable native gates, request-local navigation/detail capabilities, tests (merchant agent).
- [x] Native edit slice: functions, immutable histories, inventory, financial/profit/commission reconciliation, native tests (backend agent).
- [x] Root: contracts + typed repository, origin/session-bound HTTP and operation recovery; editor UI using existing order visuals and preserved form buffers.
- [x] Focused tests: malicious/stale/duplicate payloads, foreign tenant and cashier revoked access, stock/rate/collection concurrency, financial decreases, waiver versus cash, partial/full payment, preview mismatch, lost Save response and retry, product removal with historical references.
- [ ] Independent source review, source-bound signup proof refresh with disposable PG16, affected app builds/typechecks.
- [ ] Root only: capture six-app pins/config/runtime, compatible data first, shared panels NET→SITE, storefront/owner compatibility readers if required by shared contract changes. Verify actual running source, live read-only UI and unchanged settings/tariffs.

## Verification evidence

- Staff native259: 14 scenarios; existing v1–6 payloads preserved, new grants default false.
- Order native260: 28 scenarios in disposable PostgreSQL16, including completed POS, dated cost differences, partially paid cancellation, per-warehouse stock restoration and immutable original line references.
- Editor/client/detail: 31 focused cases; browser checks at 1440/1024/390 px, no horizontal overflow or application errors.
- Root contracts, repository and HTTP tests pass; inventory reader accepts signed nonzero order-edit deltas.
- Contracts, data, customer panel, owner and shared storefront TypeScript checks pass.
- Combined259→260 atomic rehearsal preserves all 68 protected business/tariff tables, creates no order edits or cashier grants.
- Current signup and historical tariff rehearsals pass; generated signup release proof refreshed with the frozen sources.
- Existing live storefront commit `5cd16d435` merged to preserve deployed WhatsApp layout and stable button labels. Only the two customer panels are publication targets; both owners and storefronts remain unchanged witnesses.
