# Shared Google Merchant integration

User authorized implementation of the researched Merchant API approach, requested a short plan, safe complete code, concise targeted tests, and shared marketplace placement. No new design approval round is required by the user's direct instruction.

## Scope
Pazaryeri → Google Merchant connects each tenant's own existing Merchant account with OAuth, validates the store's canonical verified domain, creates/reuses a Celebix-owned API source, and queues published purchasable variants for transmission. A Merchant account creation link guides users through Google's required business/terms steps; unrestricted partner account creation is not assumed. Connecting and applying valid settings must take effect directly without draft/publish stages. Existing marketplaces remain available.

## Correctness and load
Merchant API v1 only. Stable variant UUID offer IDs; accurate public effective TRY price, availability, actual variant image/URL; manufacturer GTIN validated and internal 98/99 barcodes never passed as GTIN. No fabricated brand or SKU-to-MPN fallback. Unsupported continuously reference-priced offers are excluded with actionable explanation. A dedicated durable coalescing queue handles initial transmission, changes, withdrawal, bounded retry, connection generations, leases, and unchanged-product refresh within 30 days. No Google calls in catalog/order save requests or browser polling. Unknown provider responses are reconciled using stable IDs before claiming success; submitted and Google approval remain distinct.

## Security
Use current native shared apps, existing Google OAuth state/session binding, tenant-bound authenticated credential encryption, native authority/RLS and origin/idempotency controls. Never accept tenant/account IDs without server selection validation. Never silently transfer domain claims, overwrite external data sources, or accept Google's ToS for a merchant. No customer records, costs, phone numbers or credentials in product export. Disconnect invalidates queued generations; no foreign-feed deletion.

## Verification/release
Targeted provider/auth/projection/queue and UI checks, TypeScript, one production build per affected app. Root is sole release owner. Compatible native migration first, shared panels NET then SITE; shared storefronts if variant URL/schema change is required. No broad test suite/load test. Google developer registration/API enablement/OAuth consent prerequisites must be reported accurately; UI must not claim publication without Google evidence.
