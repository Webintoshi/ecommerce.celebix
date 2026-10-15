# Shared cash opening, closing and counts

## Intent
Store owners and managers need a simple way to count a physical cash drawer, follow the expected amount, and see shortages or surpluses. Implement and publish for every shared Customer Panel without changing customer debt, sales, payment execution, stock, or cashier permissions.

## Flow and arithmetic
Add `Muhasebe → Kasa sayımı`, linked from cash accounts. Select a cash account, enter the counted opening cash (blank initially; explicit zero valid), and save the opening directly. One open session per store/account. For an open session display opening count, net recorded cash movement, expected cash, and recorded ledger balance. Expected cash = opening count + current ledger balance − opening ledger snapshot. Show opening discrepancy separately; never fold it into the current session discrepancy.

Close by entering counted cash. Difference = counted − expected; display `Eksik`, `Fazla`, or `Fark yok`, plus the total difference from the recorded balance. Require a note when opening count differs from the ledger or closing count differs from expected. Counts never move money or silently correct financial balances. Existing physical transfers, expenses, refunds and collection actions remain available. These also affect the cash ledger delta. Closing does not block subsequent sales; they belong to a future session or to the gap between sessions.

## Durable model
Add separate cash-session contracts and private native tables/RPCs. Store opening ledger/count/version and frozen closing ledger/count/version snapshots. Closed sessions cannot be edited, deleted or recomputed. Session identity/sequence and actor membership IDs are durable; server time records opening/closing. Never assign movements by occurredAt/createdAt timestamps because older requests can commit after opening and events can be backdated. V1 shows net movement, not a misleading timestamp-derived transaction list.

Use existing release → operation → catalog-store → accounting-store locks, then account row locks. Open validates expected account version and expected last session ID; close validates active session identity and account version. Prevent stale reopen and simultaneous open/close. Use SQL numeric and JS BigInt intermediates, reject safe-integer overflow, and preserve negative expected amounts without clamping.

## Recovery and access
Existing owner/admin accounting permissions only. Cashier/customer/storefront/Owner responses and grants unchanged. New requests use existing same-origin/session authority and strict bodies; actor/store-scoped UUID operations and canonical fingerprints support immutable replay and dedicated recovery lookup. Unknown outcomes retain the same frozen command across reloads; no polling or auto retry. Normal cancellation works; unknown-result cancellation cannot discard the original operation.

## Validation and publication
Focused parser, repository/HTTP and component tests; real PostgreSQL tests for sums, cash-only/cross-tenant authority, replay/mismatch, concurrency, stale versions, gap activity and immutable closed results. Real component visual/keyboard checks at390/1024/1440. Normal production build. Root alone applies compatible native support and publishes NET then SITE, verifying six runtimes, native ACLs, payment/auth/Google/domain preservation, authenticated read-only UI and final source. No real financial records created for QA.

## Research
Shopify also separates opening and closing discrepancies and bases closing expectations on opening cash plus cash movements: https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/cash-tracking-reports-by-location . New functions follow existing private-schema authority and restricted EXECUTE patterns; Supabase documentation: https://supabase.com/docs/guides/database/functions .
