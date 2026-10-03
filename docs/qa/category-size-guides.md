# Category size guides acceptance — 2026-10-03

## Scope

Common Customer Panel Extras and shared product guide modal. Category-linked merchant content; child category wins closest parent; enabled/archive and tenant authority enforced. Existing priced extras and direct-product legacy guides preserved. No product, price, stock, media, checkout or payment changes.

## Local evidence

- Native PostgreSQL16: 20/20 scenarios passed, including concurrent assignment/replay, authority, inheritance, new products and exact rollback.
- Contracts: 528 passed. Data: 830 passed, two existing skips.
- Shared storefront merged suite: 783 server + 137 browser tests passed, zero failures.
- Shared design UI: 17 passed.
- Final Extras UI + client + route titles: 53/53 passed. Reused content field and targeted table tests included in agent checks27/27.
- Customer Panel and shared storefront production builds passed.
- Whole Customer Panel historical suite:1976passed/51failed/1skipped. One new route-title failure fixed and focused navigation33/33passed. Other failures are unrelated pre-existing source/style assertions and existing auth/inventory cases; do not claim the whole suite green.
- Chrome real components with isolated in-memory APIs: create/apply recorded one new disabled guide, cancel preserved existing heading, list keeps priced option, table renders tbody safely, 1440/1024/390 viewport checks, zero horizontal page overflow, mobile100dvh, close initial focus, reverse/forward Tab loop, Escape restores guide trigger.
- Admin HTML table warning reproduced then fixed using public product-description sanitizer and browser HTML parsing. Mobile tables scroll within content, readable minimum cell widths, no global rich editor CSS change.

## Screenshots

Screenshots under `docs/qa/evidence/category-size-guides/` use local disposable content only. No sizing instructions were invented or published to a merchant shop.

## Release status

Pending coordinated SQL203 → storefront NET/SITE → Customer Panel NET/SITE deployment and live acceptance. Preserve current shared UI/source baselines, preview environments and payment approval configuration. Private deployment receipts are excluded from Git.
