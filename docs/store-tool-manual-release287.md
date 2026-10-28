# Audited release of an unpaid manual tool request

Migration287 adds a private owner-maintenance RPC, not a public cancellation API.
An active platform operator must explicitly attest `confirmedUnpaid=true`, provide
a nonempty reason, the exact store/purchase and expected purchase version, and a
stable UUID operation key. Reusing that key with different arguments is rejected.

Only a pending, receipt-free, unlicensed manual purchase with no prospective282
origin qualifies. Every linked quote must be past its deadline and have an unpaid
lifecycle status. **Any provider attempt, including failed, prevents release.**
The operator must resolve payment uncertainty separately; the RPC cannot override it.

The lock order is operation287 → store-version row → commercial.store →
store-tools.store → whatsapp settings → linked order advisory/row locks in UUID
order → purchase row. Eligibility and database time are reread after waits.
Eligible linked quotes are durably expired with the reviewed282 transition and
machine audit metadata naming the operator and release operation. This prevents a
begin that captured an earlier clock from dispatching after release.

An immutable manual-release row and platform audit record close the legacy
request through the existing released282 predicate. The original purchase,
receipt history, prices, entitlements, checkout intents and282 origins are never
rewritten. Other stores and unrelated quotes are not expired by this RPC.

PUBLIC and runtime roles have no execute or table privileges. The RPC runs as
invoker and requires the explicit `celebix_saas_owner` role. Run only through the
reviewed maintenance channel after native proof and human unpaid confirmation.
No live operation is part of the migration or test. Rollback is forward-only
because release and expiry are permanent audit history.
