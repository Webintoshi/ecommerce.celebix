# Platform package and tool payments

This integration sells Celebix's software only. Tenant product checkout and provider authority remain unchanged. Existing paid subscriptions and licensed tools are preserved. The initial release supports paid package purchase from the free package and new one-time tool licenses. Monthly/yearly terms are prepaid, with no stored card or recurring charge.

## Configuration

Owner-only secrets:

- `CELEBIX_PLATFORM_COMMERCE_ENABLED=true`
- `CELEBIX_PLATFORM_IYZICO_MODE=live` (or `test` for sandbox)
- `CELEBIX_PLATFORM_IYZICO_API_KEY`
- `CELEBIX_PLATFORM_IYZICO_SECRET_KEY`
- `CELEBIX_PLATFORM_COMMERCE_BRIDGE_KEY_B64URL`: canonical random 32-byte base64url key
- `CELEBIX_PLATFORM_COMMERCE_DATA_KEY_B64URL`: different random 32-byte base64url encryption key

Main site:

- `CELEBIX_PLATFORM_COMMERCE_OWNER_ORIGIN=https://owner.saas-staging.celebix.net`
- The same `CELEBIX_PLATFORM_COMMERCE_BRIDGE_KEY_B64URL`

Shared panels need only `CELEBIX_PLATFORM_COMMERCE_ENABLED=true`. Their existing handoff key has a separate purpose for purchase tickets. They receive no bank or bridge secret.

NET/SITE owners and panels currently share the same native purchase database. Recheck this topology before splitting deployments; a single Main bridge origin cannot route purchases held in a different database.

## Data and money

Apply native migration281 before enabling buyer actions. It adds private purchase/attempt/audit records and restricted machine fulfillment. Quotes use the immutable native catalog, integer kuruş and explicit 20% VAT. A five-minute body-posted ticket creates an order-scoped HttpOnly checkout session. Ticket/session digests are stored, not bearer values. Buyer details and provider tokens are sealed with AES-GCM and bound to their exact attempt.

Initialize is claimed once. Timeout or uncertain persistence must never cause automatic reinitialization. A verified failed payment permits an explicit new attempt; a ready attempt resumes its original provider page. Approval requires the exact signed order, attempt, token, currency, gross amount, fraud acceptance and single basket transaction. Native settlement records the bank payment ID once and atomically grants rights. Concurrent entitlement changes or additional approvals enter `paid_review` while preserving the first entitlement.

## Notifications and recovery

The merchant notification URL is `https://celebix.net/api/platform-payments/iyzico/webhook`. Request V3 signatures from iyzico if they are not already enabled. URL configuration alone does not establish signature activation. Accept only the documented Checkout Form HPP event and verify the V3 HMAC before querying an attempt; notification status itself never grants rights. An uncertain bank retrieval returns503 so iyzico can retry. The browser callback and scoped manual result refresh also retrieve the actual signed bank result.

Do not replay customer callbacks, invent approvals, blindly retry unknown attempts, rotate bank credentials with open attempts, or mutate old payments to test this integration. When investigating, use order/attempt UUID and sanitized state; never log identity fields, credentials, checkout tokens or raw callback bodies. Inspect `saas.platform_checkout_orders` with `status='paid_review'` through an authorized operator connection and reconcile the real provider receipt before any manual resolution. No automatic refund is implemented.

## Rollout

1. Run focused service/HTTP/provider/UI tests and disposable PostgreSQL281 rehearsal.
2. Refresh and commit the source-bound signup proof; build the exact shared candidate.
3. Back up the actual database and apply281 atomically with full old routine/schema witnesses.
4. Publish owner compatibility, then Main checkout, then shared panels; keep storefront runtimes unchanged.
5. Verify running source, secret placement, headers, authenticated purchase handoff and provider page without charging a card.
6. The human operator completes any real card test. Configure and verify the merchant notification account feature separately.

Official protocol: [Checkout Form](https://docs.iyzico.com/en/payment-methods/checkoutform), [response validation](https://docs.iyzico.com/en/advanced/response-signature-validation), [V3 webhook](https://docs.iyzico.com/en/advanced/webhook).
