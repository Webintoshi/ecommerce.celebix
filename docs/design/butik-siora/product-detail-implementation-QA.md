# Siora immersive product detail — 2026-10-01

The approved `product-detail-hermes.html` prototype is implemented as a Siora-only product experience. The shared route selects it only after resolving storefront ID `ff465e64-1491-40ef-8840-c66281155a1d`; other merchants keep their existing product detail and checkout chrome.

## Data and behavior

- Native horizontal scroll-snap gallery with 44.9vw desktop panels, full-width mobile panels, real variant media order, mouse drag, keyboard navigation, thumbnails and native zoom dialog.
- Floating desktop purchase panel and normal-flow mobile panel. Mobile purchase control follows the published `mobileStickyPurchase` setting and hides when the main action is fully visible.
- Color/size choices preserve public variant IDs, availability, actual prices and explicit media selection. Display labels never determine API identity. No stock quantities are displayed.
- Existing cart, favorites, analytics, and checkout APIs remain authoritative. Buy adds to the shared cart before entering `/checkout`. A departed product page cannot open a late drawer or force a late checkout navigation.
- Published SKU, brand, size-guide, information, policies, approved reviews, related-products, breadcrumb and quantity-visibility settings remain respected. Missing content is omitted; descriptions and guide text use the existing sanitizer.
- Shared catalog scroll restoration continues across the immersive page's omitted header. Browser Back and catalog return retain browsing coordinates. Catalog-return permission is consumed once and bound to the actual Next history entry.
- No dependency, schema, environment, account, payment-adapter or provider changes belong to this design.

## Validation

- Shared storefront 749 tests (712 server and 37 browser) and production build passed against baseline `ebdd5dad561dd9ce6f74570da44ce6236fae9628` (includes the latest account and bank-return fixes).
- Focused tests cover explicit choice, unavailable sizes, exact raw option preservation, real variant cart/analytics values, checkout order, retry, tracked quantity limits and provider defaults, deferred-request departure and history-entry binding.
- Real published Siora denim fixture checked at 1872×862, 390×844 and 320×740. No horizontal document overflow at 320px. Native swipe advances the gallery; zoom closes on Escape and restores focus; mobile sticky control hides when main purchase is visible.
- Real MAVI/L cart line matches the selected variant. Kahve/M buy reaches the existing checkout. Catalog return restoration also checked in the browser and an unmount/remount hook harness.
- Saved implementation screenshots: `product-detail-implemented-desktop.jpg`, `product-detail-implemented-mobile.jpg`.

## Verified live release

- Deployed frontend source: `f3a5ee2200a56be8096c8b058f93d8338708eaba`, branch `codex/alpler-deniz-theme`, on both shared storefront targets.
- NET owned deployment `tt0zpsvn81gnptsncxlhwagt`; SITE owned deployment `e6f2e8dq8350ndv5xcmedtbr`; both finished and shared queue idle at final verification.
- Exact running images, health, runtime SOURCE_COMMIT, payment source manifest and generated artifacts verified. Existing SITE TEST/LIVE authority matches; no provider request or migration was run.
- Live product: https://butik-siora.saas-staging.celebix.net/urun/lunea-noir-denim-crop-ceket-pantolon
- Live desktop and 390px mobile verified. Renk Mavi changes to actual blue media; M/S are unavailable and disabled. Native mobile drag advances thumbnails; zoom Escape restores focus. Sticky mobile purchase is visible when main action is below the screen. Existing cart was not modified during live visual verification; purchase APIs were verified in the real-data local fixture and interaction tests.
- Live evidence: `product-detail-live-desktop.jpg`, `product-detail-live-mobile.jpg`.
- This report commit is documentation only; deployed source remains the exact SHA above. No further application pin/environment/queue operations were performed after the final verification.

