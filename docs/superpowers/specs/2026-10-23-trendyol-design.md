# Shared Trendyol integration

Approved by the user's direct instruction on 2026-10-23 to implement and publish the researched integration. Release owner: root. Reuse the attached cart-empty-removal worktree at baseline 14d4df3276b842fd4d907d927e99c2db271df373. No store is connected or product sent without its owner's deliberate credential/mapping save.

## User outcome

One shared native Trendyol page under Pazaryerleri. Each store supplies its seller ID, API key/secret, commission percentage, whether commission includes VAT, and average shipping charge. Preserve the website price; calculate a separate marketplace price so after the configured cash deductions at least that website amount remains. Default optional withholding coverage is off; expose its effect separately from actual profit. Example web100 + shipping90, effective commission17% =>228.92TRY. Rates are per store/provider, never hardcoded. Store only integer cents and basis points; round up and verify the retained target after rounded deductions.

Use the existing immutable plan feature `marketplaces`; current/historical paid packages have it and commercial free does not. UI upgrade screen, authenticated HTTP, native SQL and background workers enforce it. No historical tariff/policy rewrites. Marketplace import must not require manual_orders or a cashier permission.

Connection save validates the real seller connection, encrypts secrets with tenant-bound authenticated encryption and installs a durable connection. Secrets never return to the browser or logs. Deliberate mapping save applies directly; existing listing matching and new V2 listing creation are separate explicit choices. Category/brand/required attributes, variants, barcode, VAT and dimensional weight must be validated. API acceptance and live publication are separate statuses, with actionable per-item failures.

## Architecture

New native `trendyol` subsystem in saas-contracts, saas-data and shared Customer Panel, independent of legacy public-schema marketplace adapters. Native migration266 owns tenant connections, listings, jobs, operation receipts and transactional order/import/stock evidence. Reuse existing credential crypto, tenant authority, effective prices and inventory primitives. Durable coalesced jobs; at most two worker jobs in parallel, bounded batches, webhook wakeups and a 10-minute changed-order fallback. No browser polling. Separate order cursor and catalog delivery progress. Current Turkish ProductV2/OrderV2 and order stream endpoints only.

Import buyer-paid orders into the existing native order list as source marketplace/payment completed. One logical provider order identity with child package/line evidence, atomic stock deltas and immutable operation receipts. Duplicate/out-of-order events and reconnects cannot duplicate orders or stock changes. Preserve split/partial cancellation evidence; parent UnPacked alone must not release stock. Return requests never restock until physical receipt. Imported orders remain provider-managed for price/items/status; shipping/returns/fatura actions must use provider operations or clearly direct the seller to the relevant provider exception. Do not send duplicate buyer marketing/transactional emails from backfill. Buyer relay emails are not marketing consent.

Customer debt is zero for provider-confirmed payment. No fabricated bank/POS collection. Preserve financial evidence; payment to marketplace and merchant bank settlement remain distinct as accepted in the discussion. Missing variants, insufficient unreserved stock or quota conflicts keep durable actionable evidence for retry, never silently discard external orders.

## Reliability and rollout

SQL independently checks current subscription/store and credentials generation on claim/read/finalize/import. Leases have expiry and fencing; no network request while a SQL transaction is open. Stable fingerprints coalesce identical inventory/price payloads. Respect 429/backoff, wait at least5seconds between stream pages, check per-item batch results before their4-hour expiry. Ambiguous non-idempotent actions require provider reconciliation rather than blind resubmission. Webhooks use x-api-key authentication and a URL without the provider name.

Tests focus on money rounding, credentials isolation, plan restrictions, operation replay, duplicate/stale import, split/partial cancellation, stock holds, old orders and outage recovery. Run shared TypeScript/build checks plus exact-source current and historical signup rehearsals. Publish compatible native schema first, then reviewed shared panel NET and SITE sequentially. Verify running candidate and live protected/upgrade screens. Real seller acceptance requires an authorized active seller account; never claim a successful provider transaction without evidence.
