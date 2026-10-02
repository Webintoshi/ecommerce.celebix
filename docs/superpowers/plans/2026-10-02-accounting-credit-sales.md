# Muhasebe, müşteri hesabı ve veresiye satış — uygulama

User-approved source: current chat's complete plan of 2026-10-02. This file is the durable implementation brief, not a new product decision.

## Accepted behavior

- Four shared admin pages: overview, customer accounts, cash/bank, paid expenses. Retain legal profile and invoicing settings.
- POS V3: customerId, initialCollectionCents, card/cash/bank_transfer or null, optional dueDate. Default collection is full total. Zero and partial allowed with named customer plus phone; email/address optional. CRM customer only, no auth account or OTP.
- Customer search/create is narrow POS authority; same-store phone/email duplicates including archived are detected, never auto-reactivate.
- Delivery and stock consume once on completion; credit debt is independent of delivery. Sale1100000/collection500000 => balance600000; later200000 =>400000; later400000 =>0. Later price changes do not alter debt.
- V3 prepare freezes contact, amounts and prices. Positive collection needs method; zero can complete without receipt. Immutable initial receipt survives uncertain completion. Old V1/V2 operation fingerprints and replays survive; enhanced sales block old mutations.
- Owner/admin finance. Cashier search/create allowed; canSellOnCredit and canCollectReceivables initially false and granted individually. No broad customers.manage.
- Customer collections default oldest debts, preview allocations. Order collections only that order. Overpay rejected, row/version locks + operation idempotency/recovery.
- Opening customer debts have date/note, no revenue/stock. Opening account balances owner/admin only. Accounts have currency and type cash/bank/card. Collections, paid expenses and transfers update balances; card-to-bank settlement records gross/net/commission without duplicate income. Never invent historic accounts/commission.
- Sales counted on completion date, collections on receipt date. Overview has channel/period filters and currency-separated totals. WEB uses actual recorded payment data, not estimated money movement. No net profit indicator.
- Immutable ledger events with actor/time/source/currency/cents. Corrections are reasoned reversal, never delete. Archived order/customer doesn't hide open debt.
- Returns reduce sale balance separately from actual cash refunds. 1100000 sale/500000 collected/300000 return =>300000 debt. Full return =>500000 refund due until refund. Restock explicitly separately validated. Credit never creates payment-provider attempts/jobs.
- `/api/accounting` overview, receivables, collections, accounts, expenses, operation recovery; expectedVersion and Idempotency-Key. V3 finance summary unpaid/partial/paid, collected/due/refund due. Base order pending until settled, completed when settled; existing global enum retained.

## Ownership and interfaces

1. Ledger agent: new accounting contracts/data, SQL200 core ledger, disposable PostgreSQL fixture/assertions. Expose minimal SQL internal POS posting helper and finance/order projection; agree signature with POS agent before implementation.
2. POS agent: existing in-store contracts/data, SQL201 V3, V1/V2 guards, grants, POS-customer SQL/repository. Own in-store HTTP handler/request/server files. No changes to shared index files; root integrates exports.
3. UI agent: components/orders/InStoreSalesConsole, in-store-sales-ui, accounting components/UI/pages, order-detail finance display. No server/API routes or shared navigation; root owns these.
4. Root: ledger HTTP/runtime/routes, navigation/actions/exports/package integration, durable evidence, tests, review and NET→SITE release coordination.

## Gates

Meaningful tests first, actual RED then GREEN; no production writes outside disposable fixture before local acceptance. Test partial/zero/full + later receipts, permissions, duplicate customers, archive, tenant boundaries, overpay/race/retry, stock-once, frozen price, exclusion from provider workers, opening/expenses/transfers/commission/reversal/returns, cross-month reports and old replays. Build affected admin/owner/shared storefront packages, review finance/security invariants. Integrate latest shared panel including Mira SQL199 before deployment. NET→SITE, feature enabled only after compatible readers verified. Production acceptance uses reads; do not post fabricated finance.
