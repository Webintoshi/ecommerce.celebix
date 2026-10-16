# Commercial packages and shared upgrade experience

Status: User approved the package table, Free monthly order capacity of 50, the shared positive upgrade visual, and explicitly requested implementation and four store assignments on 17 October 2026.

## Outcome

Create Free, Başlangıç, Büyüme and Profesyonel as real versioned permissions, quotas and prices. Assign Güzide Kuyumcu and Butik Siora to Profesyonel; Alpler Spor and Lilyum Flora to Büyüme. Preserve business records, existing subscription deadlines, central TOTP and payment recovery.

| Code/version | Deterministic plan ID suffix | Monthly / annual TRY cents | Products / SKUs | Owner-inclusive seats | Bytes | Monthly orders | Native custom hostnames |
|---|---|---|---|---|---|---|---|
| free_starter/2 | 000000000003 | 0 / 0 | 100 / 500 | 1 | 1000000000 | 50 | 0 |
| starter/1 | 000000000004 | 199000 / 1990000 | 1000 / 5000 | 2 | 5000000000 | 1000 | 4 |
| growth/1 | 000000000005 | 349000 / 3490000 | 5000 / 25000 | 5 | 20000000000 | 5000 | 4 |
| professional/1 | 000000000006 | 599000 / 5990000 | 10000 / 50000 | 15 | 50000000000 | 20000 | 4 |

Full plan IDs use `00000000-0000-4000-8000-<suffix>`. Prices exclude VAT, annual is upfront and equals ten monthly payments. Each package is one store. Four native hostname slots support storefront, www and admin aliases for its custom brand domain; do not regress Güzide's two existing bindings.

## Capabilities

- All four: catalog, content/design/media, customers, checkout, payment/shipping connections, basic dashboard/SEO and WhatsApp login.
- Başlangıç+: manual_orders, coupons, google_connections, google_merchant, seo_tools, ai, staff management and custom brand domain.
- Büyüme+: growth_tools (popup/wheel/order bump/recovery/tools), email_marketing, advanced_analytics.
- Profesyonel: cashier, accounting, reference_pricing. Accounting includes debt, collections/discounts, suppliers, accounts/counts, expenses and profitability.
- Separate AI/message/payment/cargo provider charges; no unlimited claims or new automated charges.
- Retain the existing 13 feature keys and five-limit v1 DTO. Separate immutable plan-ID policies supply fine capabilities and SKU limits. Legacy plans preserve their existing behavior.
- Role permission is checked separately and cannot be granted by package changes. Owner-only billing/upgrade requests; staff lacking role permission receive a neutral owner-contact state, not an upsell.

## Shared interface

Keep navigation visible with small locks. Server page guard runs before feature data loaders and redirects to `/upgrade?feature=<finite-key>`; one shared component serves every feature, no bespoke previews. Minimum sufficient package is selected from authoritative policy.

Exact positive copy: `Bu özelliğe indirimli sahip olabilirsiniz`, `Yıllık pakette 12 ay kullanın, 10 ay ödeyin.`, `Mevcut paketiniz`, `Önerilen paket`, `İndirimli paketi incele`, `Paketleri karşılaştır`. Show actual annual upfront price plus VAT note and separate monthly option. If no discounted target exists, omit the discount claim. Page title remains semantic; sidebar/topbar stay mounted and responsive at 390/1024/1440.

`/settings/plan` compares the four plans, current usage and the same prices. Its owner action creates an idempotent plan-change request; it neither charges nor self-assigns access. Existing TOTP owner package controls show requests and apply changes through the existing audited assignment authority.

## Native integrity and limits

- Enforce capability at native entrypoints as well as page/API boundaries, preserving historical read/recovery and earned coupon redemption where appropriate.
- Active + draft nonarchived products, aggregate SKUs, active owner/staff people and combined merchant product/theme/reserved bytes are counted. Shared store locks prevent concurrent overshoot.
- Monthly order usage counts successfully created web/manual/POS orders in the store calendar month. Idempotent retries do not add usage. Already accepted/payment-in-flight orders must always settle; reserve capacity before starting a new payment flow, never fail a paid callback because a later order used capacity.
- New capacity requires explicit store-owner approval; no silent billing. Existing records are never deleted for downgrade or quota.
- Subscription assignment preserves the locked active valid_until; expired subscriptions are not renewed. Preserve open-debt/pending-payment downgrade guards and operation replay protections.
- Default new registration uses free_starter v2 after compatible owner deployment; completion accepts replayed v1 and new v2, with unchanged result shape.

## Deployment

Root is sole release owner. Fresh baseline: native245, 1858 functions digest `552ccc5dbb5725b3eb2623fa8f7b22e1af4ab396d635181e6c78a7df752eda39`; six runtime/config/queue evidence `.tmp/package-release-20261017`.

Install backward-compatible native policies/seeds disabled for assignment first; preserve all legacy function/ACL witnesses outside the reviewed change set. Preserve live owner signup/profile source `2d258a...`; shared candidate must not regress it. Deploy compatible panels and owners, verify actual sources/payment/native/domain/UI, then enable new default and assign exactly the four authorized stores with their expected versions/deadlines. Storefront stays a verified independent witness unless its code needs changing.

Use focused contract, UI, native concurrency/quota/payment-recovery tests; one final affected suite/build and independent review. No unrelated cleanup, credentials changes or financial test mutations in live stores.
