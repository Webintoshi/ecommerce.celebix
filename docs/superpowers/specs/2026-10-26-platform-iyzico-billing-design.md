# Celebix platform sales through iyzico

## Intent and decisions

The user requested Celebix's own package and one-time store-tool sales through its approved iyzico merchant, with checkout on `https://celebix.net`. Existing merchants retain their packages and licensed tools; no migration invoice, automatic charge, forced renewal, card storage, or recurring subscription is introduced. The first release supports an explicit purchase of a paid monthly/yearly package from the free package, and explicit one-time tool purchases. Existing active paid packages are already covered and must not be charged by this release. Existing manual administration stays available.

The user delegated implementation choices. We choose iyzico Checkout Form with a hosted provider card page, a separate platform payment ledger and server-verified fulfillment. Reusing tenant checkout would mix merchant credentials, tenant orders, and SaaS entitlements; adding recurring Subscription now would introduce an unrequested financial commitment. Neither is appropriate for this first release.

## Architecture

- Shared customer panels derive the purchasing store and actor from the existing verified hostname/session; accept an offer identifier, billing term and idempotency UUID, never browser amounts or authority IDs.
- A new additive native platform-commerce ledger freezes the actual offer identity, net/VAT/gross TRY amount, store, purchaser, term and intended entitlement before payment. Current paid package rights, immutable historical tariffs, and grandfathered licenses remain untouched.
- A body-posted short-lived handoff transfers the purchase to `celebix.net/checkout/saas/<orderId>`. Store only token digests; issue a Secure, HttpOnly, SameSite=Lax cookie scoped to that order path. Never use a site-wide latest-payment selector or put a bearer handoff in a URL.
- The public marketing site is the separate `/Users/Celebix/Desktop/Celebix` repository. It proxies only bounded checkout commands to a dedicated owner internal endpoint over HTTPS with an HMAC-authenticated bridge. iyzico keys stay solely in the owner server environment, separate from tenant provider profiles and the browser.
- The owner uses a new platform-only iyzico protocol module. Initialize is claimed once outside any open database transaction. Ambiguous initialization is not automatically retried. Callback input is only a signal: retrieve the payment server-side, check the response signature, exact attempt/order/token/currency/amount and fraud status before fulfillment.
- A unique provider payment ID and atomic native settlement make repeated callbacks harmless. Tool settlement produces the existing settled purchase/receipt/license projection without inventing a human operator. Package settlement creates an explicit paid term, platform billing period and card receipt. A concurrent entitlement change requires review rather than overwriting rights after collecting payment.
- Failed and uncertain payments remain visible as such; no financial status is inferred from a browser redirect. Safe result refresh can reconcile the same known attempt; no continuous browser polling or blind initialize retries.
- The main site's bounded HPP webhook forwards the original JSON text and V3 signature through the authenticated bridge. The owner verifies V3 before lookup and then retrieves the signed bank result. Unknown retrieval returns a retryable failure, never a successful notification acknowledgment. Merchant-side V3 activation must be confirmed separately from saving the notification URL.
- Buyer identity and billing fields required by iyzico are explicitly collected for this purchase and encrypted at rest. Card fields never enter Celebix. Provider secrets, buyer identifiers, callback tokens and request bodies are not logged.

## Verification and rollout

Use tests for request/response signatures, mismatched money/context, duplicated callbacks, ambiguous network results, authorization, quote/term tampering, existing-paid-package preservation, tool ownership, and atomic fulfillment. Run real disposable PostgreSQL native tests, affected app builds, exact-candidate signup compatibility, and an independent financial/security review. Configure actual credentials only through an authorized secure path. No real card charge, refund or account financial changes are performed by the agent. Publish shared runtime/data compatibility before enabling purchase buttons; verify running candidate and actual checkout on the approved domain before claiming live readiness.
