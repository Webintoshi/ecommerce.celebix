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

Screenshots under `docs/qa/evidence/category-size-guides/` include local disposable content and live Lilyum acceptance. No sizing instructions were invented or published to a merchant shop.

## Release status

Released application commit: `758334185e072ddceb2f5ca7b38c9c02b50bf40f`.

- SQL203 applied first in one repeatable-read transaction with guarded preimages and catalog locks. In-transaction comparison preserved all 149 business tables / 217,923 rows. Postcommit check verified expected function changes and no ownership, ACL or security drift across 1,557 objects. Six production-envelope tests passed before application.
- Existing preview environments and payment approval configuration were preserved. Actual existing scenarios remain storefront NET live-only, storefront SITE test/live, Customer Panel NET no approval and Customer Panel SITE test/live. Each running container's generated payment metadata matched its official proof.
- Both storefronts and both Customer Panels run the released commit; image identities match. Three guide routes are present in each built panel. All four representative health checks returned HTTP200/statusok. Final coordinated release verification reported four targets verified and the global deployment queue idle.

| Target | Official deployment | Result |
|---|---|---|
| Storefront NET | `drwnn80c5x1kolzl0p71juhf` | finished; runtime verified |
| Storefront SITE | `dlxk10o2l9pdtw6t4o5v1e5u` | finished; runtime verified |
| Customer Panel NET | `pxaxbxc529iqhzhsjmuthgpe` | finished; runtime verified |
| Customer Panel SITE | `eq533ou3b6j0392vvphel4hp` | finished; runtime verified |

## Live acceptance

- Authenticated Lilyum owner opened Extras and the new two-type library.
- Created one technical acceptance guide assigned to Lilyumlar with storefront display disabled. The body explicitly contained no measurement instructions.
- Uygula saved version1; reopening retained the body, category, heading and disabled state. Changing the heading then Vazgeç preserved the original saved heading/version.
- Live preview used the shared modal, correct heading, initial close focus, Escape/return focus and no horizontal page overflow.
- Archived only the agent's acceptance record through the ordinary recoverable archive action. The active Extras list then showed “Henüz ekstra yok.” No merchant content, prices, media or stocks were changed.
- Live evidence: `live-extras-library.png`, `live-guide-saved-disabled.png`, `live-guide-preview.png`, `live-guide-archived.png`.
- Enabled guide inheritance, child precedence, new/reclassified products and archive filtering were tested in isolated PostgreSQL and frontend fixtures; no temporary sizing content was exposed to live shoppers.

Private SQL/deployment receipts are excluded from Git. SQL rollback is intentionally blocked once any typed guide record exists, including an archived one; subsequent recovery must preserve guide content with a compatible forward change.
