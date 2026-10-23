# Shared Trendyol integration

The shared Customer Panel exposes **Pazar Yerleri → Trendyol**. Access derives from the exact subscription's existing `marketplaces` feature; browser, HTTP, native writes and worker leases all enforce it. Immutable historical tariff arrays remain unchanged.

## Store setup

A store administrator saves its Trendyol seller ID, API key/secret, commission and average shipping charge. Connection is checked before saving. Credentials are encrypted with the existing merchant-provider keyring and bound to store ID and credential version. Neither API secret nor webhook secret is returned to the browser. Pricing settings have a separate optimistic concurrency version.

Prices use integer cents and basis points, with upward rounding. The target is the website product amount after configured commission, shipping and fixed fees. Commission VAT and optional withholding coverage are explicit. Expected payment is a cash estimate, not accounting profit. Website prices are never rewritten. Average shipping remains an estimate, especially for multi-item orders and category-specific fees.

Existing listings are matched by an explicit variant/barcode mapping. New listings require category, brand, carrier, VAT, description, images and category attributes. Up to eight images are sent. Saving a valid mapping applies directly; there is no separate draft/publish stage. An accepted asynchronous batch is shown as submitted; inventory updates become active only after successful item results; new product creation also requires provider approval. An existing pending listing is reconciled before any new create request, and its inventory/price is applied after approval.

## Delivery and orders

- Only changed price/quantity fingerprints are submitted; product, pricing and reservation changes create bounded native dirty work. No browser polling.
- A single primary panel worker claims at most two globally fenced jobs. Catalog batches contain at most fifty listings; approval/create lookups are bounded per lease.
- Authenticated provider callbacks create durable order wakeups. A ten-minute fallback checks changed orders. Larger supported catch-up windows are sliced to fourteen days.
- Full point queries reconcile logical orders and split packages before importing. Stable seller/order identity, receipts and native stock commitments prevent duplicate order/stock effects.
- Imported paid orders use the existing **Pazar yeri** order channel and completed buyer payment. They create neither customer debt nor an invented bank/cash receipt. Marketplace settlement is a separate event.
- Awaiting/Verified payment-control records stay pending. Missing mapping, quota, stock and inconsistent package evidence are retained for explicit retry and shown as actionable issues.
- Cancelled quantities restore only their original stock commitments. Returned goods are not automatically restocked. Generic order editing/status mutation is blocked for provider-managed records.
- Marketplace buyer relay/absent email never creates marketing consent or duplicate order messages.

## Operational safety

`CELEBIX_TRENDYOL_WORKER_ENABLED=true` only on the primary NET Customer Panel; secondary SITE uses `false`. The worker reuses the approved authority database configuration and `CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_*` keyring. It verifies database identity, workflow role membership, RPC existence and execution privilege. No additional service or package dependency is introduced.

Catalog POSTs have a durable dispatch intent. Expired uncertain dispatches become action required, not automatic replays. Unknown outcomes and expired batch evidence preserve uncertainty. An unknown write stays blocked for operator reconciliation, even when a current inventory read or an older fingerprint matches the target; neither proves that an earlier asynchronous write cannot still apply. Definitive provider errors stop recurring delivery; temporary failures back off. Known asynchronous batches serialize later writes per variant. Reconnects retain their batch IDs, fence old leases and schedule fresh inventory only after the older result is terminal. Disconnection preserves uncertain write evidence. Every finalization checks the current connection, plan, mapping version and lease.

Native migration266 is additive, with two reviewed predecessor function patches. Forward migration267 adds asynchronous batch serialization with exact predecessor checks; previously installed266 is unchanged. New tables have FORCE RLS; applications receive only narrow RPC execution grants. Rollback refuses to erase committed connection/order evidence. Publication requires the exact candidate signup proof, native preconditions and protected-data checks, followed by NET → SITE acceptance.

## Verification and remaining acceptance

Focused tests cover pricing, provider transport, credential isolation, HTTP authority, client recovery, package gating, durable dispatch and native order/stock behavior. The native suite contains33 behavioral checks. Current and historical signup rehearsals run on disposable PostgreSQL16 without external accounts.

Real Trendyol seller acceptance is a separate prerequisite: a store must supply its actual account credentials and deliberately map a test product. Product V2 attribute reference/guide documentation differs; the implemented current reference shape is fixture-tested, but real seller creation/approval is not claimed without that acceptance. Provider history beyond supported ranges stays actionable; no old-order gap is silently skipped. Provider invoice, fulfillment and claim transport helpers are not exposed as a complete outbound fulfillment workflow in this release.
