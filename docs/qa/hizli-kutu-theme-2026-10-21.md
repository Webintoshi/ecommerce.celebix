# Hızlı Kutu Ambalaj — storefront theme

Tenant: `eae7be09-f362-4681-9df7-18de95eff4cf`. Baseline: `babffd0394a4152bf2ef53847fc698a2aa3d87a4`.

## Scope and content authority

- Tenant ID selects the theme. Other tenants keep their existing theme and the shared checkout remains unchanged.
- Homepage banner, category vitrines, product rows and short shopping steps were configured through the authenticated design panel. Concurrent owner edits to logo, navigation and header width were retained using the editor's conflict comparison and current-version recovery.
- All uploaded graphics are plain light backgrounds with the word **Placeholder**. The generated research photograph is deliberately excluded following the user's instruction. Product creation and photography remain with the merchant. No QA products were inserted into the merchant database.
- Navigation, published sections, real variant prices, stock eligibility, quantity visibility, SKU visibility, product details, footer links and contact data come from the existing public projections. No invented MOQ, bulk tier, free delivery promise or manufacturing workflow was added.
- Package unit pricing appears only with an explicit valid package-piece attribute; order quantities still use the canonical selected variant and cart APIs. Drawer action goes directly to `/checkout`; backend checkout blockers remain truthful.

## Verification

- Storefront suite: **910 server + 264 browser tests passed**, zero failures. This includes tenant isolation, purchase payload/price/stock caps, shared cart, route rendering/SEO, catalog continuation, and published announcement/hotspot regressions.
- Storefront typecheck and optimized production build passed. Admin optimized build passed using inert build-only public Supabase placeholders, with no credential or runtime configuration changes.
- Navigation regression was observed failing with nine published children before the fix, then passed. Root menu slots remain eight and depth remains two; descendant arrays accept up to64 with duplicate and malformed input rejection retained. No database schema/query changes.
- Contracts package:595/596 passed. The export-surface snapshot failure also reproduces on the untouched baseline and concerns pre-existing Google Merchant exports. The directly affected navigation suite passed16/16.
- A read-only code review identified and resolved search continuation path rejection, duplicated/lost announcement links, dropped product hotspots, optional legacy marquee handling, and gallery placement/zoom stacking. Additional heading/layout/cart overlay polish followed rendered browser checks.

## Visual fidelity decisions

1. Layout: open white composition, strong left-aligned headline and large right media; responsive stacked mobile layout and safe-area-aware navigation.
2. Type: published Inter heading/body fonts remain authoritative; scoped rules prevent the starter serif defaults from overriding them.
3. Color: preserve the current published white/near-black/orange palette, rather than forcing the research concept's yellow accent. Button hover derives from the published primary color.
4. Assets: the real uploaded merchant logo is retained; all banner/category placeholder images are intentionally plain, as explicitly requested.
5. Interaction: page-local live search, nested real category navigation, native dialogs, automatic catalog continuation, package choice and direct checkout preserve the existing commerce engine.

The loopback-only fixture under `tests/saas-phase3/hizli-kutu-theme/` uses30 clearly labelled QA records and plain placeholder gallery media to exercise unavailable live product states. It is not a storefront catalog import or production route. Physical-device input, real payment submission and field Core Web Vitals were not measured.

Final live release identifiers and screenshots are recorded separately after deployment verification.
