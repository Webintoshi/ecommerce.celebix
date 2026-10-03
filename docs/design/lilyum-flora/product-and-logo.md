# Lilyum Flora — product pages and logo refinement

User request, 2026-10-03: revise Lilyum Flora logo and individual product pages, then publish live. Keep the accepted homepage palette and existing tenant typography. Delivery remains information/contact based; no unsupported address/date inventory controls.

## Visual direction

Cream canvas, white product photography stage, restrained green purchase controls. Desktop uses a large actual photograph and thumbnail rail beside a calm purchase column. Product names wrap naturally in the tenant heading font. Mobile uses native horizontal photo scrolling, compact title/price, accessible quantity controls and a fixed price/add-to-cart strip when enabled by admin. The header exposes its cart control on mobile product routes; the normal four-tab homepage bar remains absent on products. Existing zoom/focus behavior is reused.

## Existing admin and commerce authority

Use exact Lilyum tenant ID 89e1e15f-8282-4e9b-ae3e-f417501bd54a for routing. Keep actual product/media/variant data, selected variant media, money/compare-at/SKU and availability. Honor breadcrumb, brand, SKU, gallery mode, quantity, mobile sticky, size-guide, information-section, approved-review and related-product options. Use existing cart client, drawer, favorites and event providers. Add opens the actual side cart; buy adds the selected variant then reaches /checkout. Pending purchase is single-flight; navigation away prevents a late redirect/drawer. Stock quantities bound purchase quantity; the customer sees availability labels. Single legacy default variants have no redundant chooser. Optional shipping/care/description information remains published content.

## Logo

Built-in Image Gen edit of the actual published JPG. Identity retained: lily line drawing, orange handwritten Lilyum and navy serif FLORA. Remove original off-white rectangle/JPEG noise and accidental clipped lower stroke, retain genuine transparency. Optimized lossless WebP asset apps/storefront-shared/public/themes/lilyum/logo-refined-v1.webp, 720×360, 76546 bytes. Original generated file remains in Codex generated images.

Prompt: identity-preserving cleanup of the existing Lilyum Flora logo; exact lily drawing/script/FLORA text and orange/navy colors, genuine transparent background including spaces between artwork, clear padding, roughly 2:1 lockup, no added tagline/icon/mockup/shadow/background.

The exact original tenant media pathname migrates to the refined asset for header, footer, checkout and account branding. A future admin logo remains authoritative; absent branding and other tenants are unchanged. Footer uses a white rendition through CSS filtering of this transparent asset alone. Published settings and database records are not rewritten.

## Verification

Real component tests exercise selected media/price/SKU, quantity bounds and cart payload, unavailable products, hidden admin options, default variant labels, pending duplicate prevention and navigation-away safety. Logo test verifies original migration, subsequent admin override, tenant isolation and absent branding. Shared storefront suite, typecheck and production build run before the guarded release. Actual Chrome desktop/mobile screenshots and live checks are recorded outside this repository.
