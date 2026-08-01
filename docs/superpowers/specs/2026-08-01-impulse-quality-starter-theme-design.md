# Impulse-Quality Celebix Starter Theme Design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı

**Design base:** `22664867f87d120d1a502143c591e4faa2111ad0`

**Target:** `apps/storefront-shared`, the customer-panel storefront design controls, SaaS contracts/data, and the existing shared PostgreSQL storefront authority

**Research reference:** Shopify Theme Store Impulse preset, inspected on desktop and mobile on 2026-08-01. The reference is used only to establish interaction and quality expectations. No Shopify/Archetype source code, assets, copy, trademarks, or proprietary theme package will be copied.

## Problem

The current Celebix starter storefront has real product, category, R2 media, cart, checkout, policy, search, favorite, and tenant authority. Its presentation remains much simpler than the quality expected from a modern conversion-focused commerce theme. The home page has one hero, one category block, one product grid, and one generic brand-story block. Navigation exposes only Home and Products. The product detail, product cards, and existing side cart work, but they do not yet form one coherent premium merchandising system.

New merchants must receive a storefront that is immediately usable without fake products or a separate manual theme project. At the same time, every merchant-specific value must remain controlled by the merchant panel and persisted tenant-owned authority. A visually impressive hardcoded demo would be unacceptable.

## Reference findings

The inspected Impulse experience establishes these quality characteristics:

- a bounded announcement layer and a transparent-to-solid sticky header;
- desktop mega navigation with category groups and optional editorial media;
- a compact mobile header and nested off-canvas navigation;
- immersive full-width hero media with concise calls to action;
- category and collection merchandising blocks with strong image rhythm;
- dense but readable product rows, badges, compare-at prices, and fast product access;
- split campaign panels and editorial brand-story sections;
- mobile product hotspots that disclose a small real product card;
- consistent product-detail, quick-shop, cart, and checkout visual language;
- restrained motion, large imagery, and responsive composition rather than a scaled-down desktop page.

Celebix will implement an original campaign-commerce system with these quality characteristics. It will not reproduce the donor's exact layout, typography, copy, assets, or identifiers.

## Decision

Upgrade the existing `starter` theme in place into a modular **Celebix Campaign Starter**. It remains `themeKey: "starter"`; a second application, iframe, reverse proxy, or copied theme package is not created. New stores receive the new composition by default. Existing stores keep their real content and commerce data and are projected through a backwards-compatible adapter until the merchant publishes the richer composition.

The theme is a shared rendering engine driven by one immutable public presentation and real public catalog projections. The browser never supplies tenant, store, product price, stock, category ownership, media ownership, checkout readiness, or payment authority.

## Authority and persistence

### Admin-owned composition

Add one versioned `starter_theme_composition` merchant-admin singleton. It is the atomic draft/publish authority for layout and references; the existing `general_setting`, `theme_setting`, `hero_banner`, `promotion_banner`, `marquee_setting`, and `category_showcase` records remain supported and are used by the compatibility adapter.

The stored composition contains only bounded merchant input and tenant-owned references:

```ts
type StarterThemeCompositionConfig = Readonly<{
  schemaVersion: 1;
  visual: Readonly<{
    colorScheme: "neutral" | "warm" | "dark" | "ocean";
    headingStyle: "serif" | "sans";
    cornerStyle: "square" | "soft";
    headerStyle: "overlay" | "solid";
    productCardStyle: "editorial" | "compact";
    productImageRatio: "portrait" | "square";
  }>;
  announcement: Readonly<{
    enabled: boolean;
    items: readonly string[];
    destination?: string;
  }>;
  navigation: Readonly<{
    rootCategoryIds: readonly string[];
    featuredCategoryId?: string;
    featuredAssetId?: string;
  }>;
  sections: readonly StarterThemeSectionConfig[];
  productDetail: Readonly<{
    galleryStyle: "grid" | "rail";
    showSku: boolean;
    showBrand: boolean;
    showRelatedProducts: boolean;
    mobileStickyPurchase: boolean;
  }>;
  cart: Readonly<{
    showCheckoutReadiness: boolean;
    showShippingProgress: boolean;
    trustMessage?: string;
  }>;
}>;

type StarterThemeSectionConfig =
  | Readonly<{ kind: "hero"; enabled: boolean; slides: readonly StarterHeroSlideConfig[] }>
  | Readonly<{ kind: "category_grid"; enabled: boolean; heading: string; categoryIds: readonly string[] }>
  | Readonly<{ kind: "product_row"; enabled: boolean; heading: string; source: "latest" | "sale" | "category"; categoryId?: string; limit: 4 | 8 | 12 }>
  | Readonly<{ kind: "split_campaign"; enabled: boolean; panels: readonly StarterCampaignPanelConfig[] }>
  | Readonly<{ kind: "brand_story"; enabled: boolean; eyebrow?: string; heading: string; body: string; assetId?: string; destination?: string }>;
```

Every array is length-bounded, every string is trimmed and bounded, every destination is an exact safe storefront-relative route, and every identifier is validated under the authenticated `TenantContext`. The repository rejects cross-store products, categories, assets, and inactive/deleted references. Draft configuration never reaches the public storefront.

Publishing is one transactional version transition. A public request sees either the previous complete composition or the next complete composition, never a mixture of records. Existing singleton editors remain available and update the compatibility view until the new composer is published.

### Public projection

Advance `PublicStarterThemePresentation` to schema version 2. The public projection contains only resolved, immutable, storefront-safe data:

- public R2 asset URLs and alt text instead of asset IDs;
- category names, slugs, hierarchy, and optional public imagery instead of category IDs;
- product-row sources resolved by the server using the selected store;
- hero and campaign destinations validated as same-store relative routes;
- no tenant ID, private store ID, admin record ID, object key, credential, or unpublished content.

The server resolves navigation and home sections using the hostname-selected storefront. Product rows are loaded from the same repository context. Category, sale, latest, and related-product queries cannot accept a store selector from the browser.

### New-store defaults and compatibility

New stores receive the Campaign Starter section order:

1. announcement, when merchant text exists;
2. hero;
3. category grid, when categories with imagery exist;
4. latest-product row;
5. split campaign, when configured;
6. sale-product row, when real sale products exist;
7. brand story, when configured;
8. related editorial content, when configured.

Defaults never create fake products, categories, discounts, reviews, shipping claims, social links, currencies, policy content, or payment methods. An empty store renders a polished brand-first empty state and setup guidance; unavailable optional sections are omitted without leaving blank bands.

For existing schema-version-1 presentations, a pure compatibility adapter maps current logo, theme tokens, hero, promotion, marquee, category showcase, and brand-story flag into the new public shape. Commerce state and existing merchant records are not rewritten merely to render the new theme.

## Storefront experience

### Header and navigation

- The announcement bar renders only persisted merchant messages.
- An overlay header may sit above hero media and becomes an opaque sticky header after the hero threshold.
- Desktop navigation is built from the persisted parent/child category tree. The optional promotional tile appears only when its category and asset both resolve.
- Mobile navigation is an accessible off-canvas dialog with nested category disclosure, focus trapping, Escape/backdrop/close handling, body-scroll lock, and focus restoration.
- Search, favorites, account, and cart utilities remain connected to their real routes and providers.
- Utility links, social links, locale controls, and currency controls are not shown unless a real system authority exists.

### Home composition

- Hero slides support separate validated desktop/mobile R2 media, bounded overlay copy, one CTA, and an optional real-product hotspot.
- Category grids use real category hierarchy and category media.
- Product rows use canonical public products and derived truth-based badges such as sale or unavailable. No rating, popularity, scarcity, or “new” claim is invented.
- Split campaigns use at most two real panels and safe relative destinations.
- Brand-story blocks render only persisted copy and tenant-owned media.
- Section ordering is admin-controlled but constrained to the finite union, maximum counts, and at most one instance of singleton section kinds.

### Product cards and quick access

Product cards render the first product image, optional second-image hover, title, brand when public, canonical price, compare-at price, availability, favorite state, and a real add/choose-options action. A product requiring variant selection cannot be added with an invented default. Quick view uses the same public product projection, traps focus, and never accepts price or stock from the browser.

### Product detail

The product page becomes a coherent premium composition while retaining the existing product authority:

- responsive image gallery with thumbnail/rail navigation, zoom, intrinsic dimensions, and stable aspect ratio;
- title, optional public brand, SKU, canonical price/compare-at price, availability, variant attributes, quantity, add-to-cart, and buy-now;
- Markdown description through the existing safe renderer;
- delivery, return, and policy accordions linked to real merchant policy content;
- mobile sticky purchase controls that never obscure content;
- related products selected server-side from the same category, with latest products as a safe fallback.

Buy-now creates or updates the real cart through the existing mutation and then enters the existing checkout. It does not create a parallel checkout state.

### Side cart and checkout

The existing canonical cart and `CartStatusProvider` remain the single browser cart state. The side cart is restyled and extended, not replaced:

- first product image, title, selected variant, quantity controls, remove, canonical line total, subtotal, shipping, total, and checkout readiness;
- backdrop, explicit close control, Escape, focus trap, focus restoration, body-scroll locking, empty/loading/error states, and 48×48 px targets;
- shipping-progress presentation only when a real canonical threshold exists; no fake “free shipping” claim;
- cart and checkout calls to action use the existing `/cart` and `/checkout` flows;
- checkout remains the existing single-screen, server-authoritative checkout and payment-method flow.

## Customer-panel experience

`/settings/theme` becomes the entry point for the Campaign Starter composer while preserving the existing focused setting routes. It provides:

- visual tokens, announcement, header, navigation, section ordering, hero slides, product rows, split campaigns, brand story, product-detail, and cart controls;
- store-scoped product, category, and R2 asset pickers rather than raw identifier inputs;
- deterministic desktop and mobile previews that consume the same public contract as the storefront;
- draft/save/publish state with optimistic concurrency and an explicit published version;
- field-level validation and truthful missing-data explanations;
- keyboard-reorder controls in addition to pointer-based ordering.

The panel cannot paste arbitrary external media URLs for theme sections. Media must be an active, tenant-owned storefront image asset. A future video section requires a separate bounded R2 video authority and is not simulated with arbitrary embeds in this implementation.

## Error handling and fail-closed behavior

- Invalid public presentation data produces the existing controlled unavailable storefront, never a partially trusted page.
- An invalid optional section reference is excluded by the server and reported in the admin preview; it does not expose another store's data.
- Product/card/cart mutations retain fixed public error codes and never expose SQL, driver, object-key, credential, or internal authority details.
- Missing images use an aspect-ratio-safe neutral placeholder; broken external fallback URLs are never introduced.
- If a merchant deletes an asset/category/product used by a draft, publishing is rejected. If an active reference becomes unavailable after publication, the resolved section is safely omitted until the merchant republishes.
- Production, DNS, credentials, provider configuration, and deployment are outside this implementation task.

## Accessibility, performance, and responsive requirements

- WCAG 2.2 AA color contrast; primary text and controls at least 4.5:1.
- All interactive targets at least 48×48 px on touch layouts.
- Correct landmark, heading, dialog, disclosure, live-region, and form semantics.
- Complete keyboard operation for mega navigation, mobile menu, quick view, gallery, variants, cart, and composer.
- Motion reduces to approximately `0.01ms` under `prefers-reduced-motion`.
- Zero horizontal overflow at 320, 390, 768, 1024, 1025, and 1440 px.
- Stable image dimensions and responsive R2 variants prevent layout shift; representative staging CLS target is at most 0.1.
- Representative mobile staging LCP target is at most 2.5 seconds under the agreed test profile.
- No carousel, animation, or theme-builder dependency is added unless native CSS/React primitives prove insufficient. Above-the-fold client JavaScript is kept bounded and noninteractive sections remain server-rendered.

## Test and acceptance strategy

Implementation follows red/green TDD with independently reviewable commits:

1. contract v2, validation, defaults, and v1 compatibility;
2. migration and repository authority for draft/publish and cross-tenant negative cases;
3. customer-panel composer and real pickers;
4. header, mega navigation, and mobile drawer;
5. home section renderer and product rows;
6. product cards, quick view, and product-detail composition;
7. side-cart visual/interaction integration;
8. accessibility, performance, static security, and visual acceptance.

Required automated coverage includes:

- exact contract parsing, freezing, unknown-key rejection, array/string bounds, safe destinations, and schema compatibility;
- PostgreSQL cross-tenant asset/category/product rejection, draft invisibility, atomic publish, concurrency, rollback/reapply, RLS/ACL, backup/restore, and cleanup;
- admin picker, ordering, validation, preview, save conflict, publish, and disabled-state tests;
- storefront empty/partial/full compositions, category hierarchy, product-source truthfulness, product-detail, cart, checkout, and error states;
- focus trap/restoration, Escape/backdrop, keyboard navigation, reduced motion, touch targets, semantics, and contrast;
- forbidden tenant/store/browser-authority imports, external media, arbitrary URLs, Shopify identifiers/assets, secrets, object keys, and private IDs;
- complete customer-panel, storefront, Owner, contract, data, typecheck, build, and current PostgreSQL regression suites.

The exact visual matrix is:

- home: 1440×1000, 1025×768, 1024×768, 390×844, 320×720;
- mega navigation: 1440×1000;
- mobile navigation: 390×844;
- product detail: 1440×1000 and 390×844;
- quick view: 1440×1000 and 390×844;
- side cart: 1440×1000 and 390×844;
- cart and checkout: 1440×1000 and 390×844;
- empty-store and missing-media states: 1440×1000 and 390×844.

Authenticated isolated-staging acceptance and deployment are separate gates after local code completion. No production deploy, mutation, merge, DNS change, or credential change is part of this design.

## Success criteria

The work is complete only when a newly provisioned store receives the new Campaign Starter defaults, every visible merchant value is admin- or catalog-backed, existing stores remain compatible, the premium desktop/mobile experience passes the visual and accessibility matrix, real product/cart/checkout behavior remains intact, cross-tenant and browser-authority tests stay fail-closed, and all regression suites pass.
