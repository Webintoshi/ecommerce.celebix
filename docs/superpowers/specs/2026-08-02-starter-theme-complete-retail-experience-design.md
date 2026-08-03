# Celebix Starter Theme Complete Retail Experience Design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı

**Approved on:** 2026-08-02

**Design base:** `c6327e60c67a34be59da81a32e012063befd3bbe`

**Supersedes presentation details in:** `docs/superpowers/specs/2026-08-01-impulse-quality-starter-theme-design.md`

**Target:** the existing `starter` theme rendered by `apps/storefront-shared`, configured from `apps/customer-panel`, projected through `packages/saas-contracts` and `packages/saas-data`, and persisted by the shared SaaS PostgreSQL authority.

**Visual reference:** the nine merchant-provided retail-theme screenshots attached on 2026-08-02. They define composition, density, interaction, and quality expectations only. Celebix will not copy the reference brand, copy, images, theme package, proprietary source code, or private identifiers.

## Problem

The current Campaign Starter foundation is safe and functional but does not yet implement the complete retail experience shown in the approved visual references. Its published home composition supports only `hero`, `category_grid`, `product_row`, `split_campaign`, and `brand_story`. The footer is fixed and shallow. Product detail has a working gallery, Markdown description, canonical purchase actions, and policy links, but it lacks a coherent merchant-managed information model for materials, care, certifications, size guidance, review presentation, and section ordering.

This is not primarily a CSS defect. The missing visual sections cannot be truthfully rendered because they are not represented in the admin-owned composition or immutable public projection. Adding hardcoded JSX would create a theme that looks complete for one store while failing the central requirement: every new merchant must receive the same high-quality starter whose visible merchant content is controlled by their own panel and isolated PostgreSQL data.

## Decision

Extend the existing starter architecture additively:

- retain `themeKey: "starter"` and the shared storefront application;
- advance the admin composition from schema version 1 to version 2;
- advance the public presentation from schema version 2 to version 3;
- provide pure adapters from composition v1 and public presentations v1/v2;
- add finite, validated retail section types instead of an arbitrary page builder;
- resolve all products, categories, assets, reviews, policies, prices, stock, and links on the server under the hostname-selected store;
- give newly provisioned stores the richer default section order without inventing merchant content;
- preserve existing product, cart, checkout, payment, favorite, search, account, and policy authorities.

CSS-only imitation is rejected because it cannot make missing sections admin-driven. A generic drag-and-drop page builder is rejected because arbitrary component trees, HTML, URLs, and scripts would enlarge the security surface and delay a reliable starter. The finite union gives the required visual range while remaining testable and fail-closed.

## Authority boundaries

### Store selection

The public hostname resolver remains the only store-selection authority. Browser body, query, cookie, local storage, forwarded tenant identifiers, component props, or client state cannot select a tenant or store. Every downstream read receives the store already selected by the trusted resolver.

### Admin mutations

Theme changes continue through authenticated customer-panel server access and immutable `TenantContext`. Draft/save/publish operations use operation IDs, payload fingerprints, expected versions, and the existing atomic publication boundary. A draft never reaches a public request.

### Referenced records

The publication transaction must verify that every referenced category, product, catalog resource, review source, and R2 storefront asset belongs to the same active store. It must reject inactive, archived, deleted, cross-store, malformed, duplicate, or incompatible references. Public projection contains resolved presentation values, never raw tenant IDs, store IDs, admin record IDs, R2 object keys, credentials, or unpublished content.

### Commerce truth

Product price, compare-at price, variant availability, stock, cart totals, shipping, checkout readiness, and payment methods remain canonical server projections. Theme configuration may choose visibility and layout but cannot provide or override commerce values.

## Versioned contracts

### Admin composition v2

The exact conceptual contract is:

```ts
type StarterThemeCompositionConfigV2 = Readonly<{
  schemaVersion: 2;
  visual: StarterThemeVisualV2;
  announcement: StarterAnnouncementConfig;
  navigation: StarterNavigationConfig;
  sections: readonly StarterThemeSectionConfigV2[];
  productDetail: StarterProductDetailConfigV2;
  cart: StarterCartConfig;
  footer: StarterFooterConfig;
}>;
```

`StarterThemeVisualV2` retains existing color, heading, corner, header, card, and image-ratio choices and adds only bounded layout choices required by the references:

```ts
type StarterThemeVisualV2 = Readonly<{
  colorScheme: "neutral" | "warm" | "dark" | "ocean";
  headingStyle: "serif" | "sans";
  cornerStyle: "square" | "soft";
  headerStyle: "overlay" | "solid";
  headerWidth: "contained" | "wide";
  productCardStyle: "editorial" | "compact";
  productImageRatio: "portrait" | "square";
  sectionSpacing: "compact" | "balanced" | "airy";
}>;
```

No custom CSS, JavaScript, font URL, arbitrary color token, or HTML field is accepted.

### Home section union

The v2 union retains the five existing section kinds and adds two finite kinds:

```ts
type StarterThemeSectionConfigV2 =
  | ExistingStarterThemeSectionConfig
  | Readonly<{
      kind: "value_propositions";
      enabled: boolean;
      items: readonly Readonly<{
        icon: "sparkles" | "cotton" | "heart" | "shield" | "truck" | "return";
        heading: string;
        body: string;
      }>[];
    }>
  | Readonly<{
      kind: "testimonials";
      enabled: boolean;
      heading: string;
      source: "approved_product_reviews";
      limit: 3 | 6 | 9;
      minimumRating: 4 | 5;
    }>;
```

Rules:

- at most 12 enabled home sections;
- at most one `hero`, `category_grid`, `split_campaign`, `brand_story`, `value_propositions`, or `testimonials` section;
- at most three `product_row` sections with unique derived public keys;
- value propositions contain two to four unique, bounded items;
- testimonial text is never entered in the theme composer; it comes only from active products and `approved` reviews for the selected store;
- empty or unresolved optional sections are omitted without blank bands;
- headings, body text, array lengths, icon values, identifiers, and safe relative destinations are exact and bounded.

### Footer contract

```ts
type StarterFooterConfig = Readonly<{
  tone: "light" | "dark";
  groups: readonly Readonly<{
    heading: string;
    links: readonly StarterFooterLinkConfig[];
  }>[];
  newsletter: Readonly<{
    enabled: boolean;
    heading: string;
    body: string;
    consentLabel: string;
  }>;
  social: readonly Readonly<{
    network: "instagram" | "facebook" | "youtube" | "pinterest" | "tiktok" | "x";
    url: string;
  }>[];
}>;
```

Footer links are discriminated references, not free-form URLs:

```ts
type StarterFooterLinkConfig =
  | Readonly<{ kind: "fixed_policy"; policyKey: StorefrontPolicyKey }>
  | Readonly<{ kind: "category"; categoryId: string }>
  | Readonly<{ kind: "page"; pageId: string }>
  | Readonly<{ kind: "system"; destination: "/" | "/products" | "/favorites" | "/account" }>;
```

The footer permits two to four link groups, one to eight links per group, and no duplicate destination within a group. Category and page references are resolved under the store. Unpublished pages and policies are not projected as usable links. Social URLs require canonical HTTPS, no credentials, no fragment, no non-default port, exact trimmed input, and a host matching the selected network's reviewed allowlist. Generic external links are not accepted.

### Product-detail contract

```ts
type StarterProductDetailConfigV2 = Readonly<{
  galleryStyle: "grid" | "rail";
  showSku: boolean;
  showBrand: boolean;
  showBreadcrumbs: boolean;
  showRelatedProducts: boolean;
  showApprovedReviews: boolean;
  mobileStickyPurchase: boolean;
  showSizeGuide: boolean;
  informationSections: readonly (
    | "description"
    | "materials_and_care"
    | "certifications"
    | "shipping_and_returns"
  )[];
}>;
```

The public product projection is extended with optional, resolved merchandising data sourced from active same-store catalog resources associated with the product:

```ts
type PublicProductMerchandising = Readonly<{
  highlights: readonly string[];
  materialsAndCare?: string;
  certifications: readonly string[];
  sizeGuide?: Readonly<{
    heading: string;
    body: string;
  }>;
}>;
```

The mapping is deterministic:

- `definition` resources with reviewed fixed config roles provide bounded highlights or size-guide copy;
- `attribute` resources with reviewed fixed roles provide materials/care content;
- `extra` resources are not interpreted as product information unless their config matches a newly documented exact schema;
- Markdown is parsed only by the existing safe renderer; raw HTML remains forbidden;
- absent data hides the matching control instead of displaying filler text.

Shipping and returns content comes from the store's published fixed policy authority. Theme configuration cannot supply legal text.

### Public presentation v3

`PublicStarterThemePresentationV3` contains only resolved immutable values:

- resolved public R2 asset URLs, intrinsic dimensions, alt text, and reviewed media type;
- resolved category/page/policy destinations;
- value propositions with finite public icon tokens;
- approved review summaries with reviewer display name, rating, title/body, and optional merchant reply;
- resolved footer link groups and approved social URLs;
- newsletter availability as a boolean and bounded display copy, never database or transport configuration;
- resolved product-detail visibility and information-section order.

Public v1 and v2 inputs are adapted through pure functions. The v2 adapter creates an equivalent v3 presentation with no fabricated value propositions, testimonials, social links, or newsletter capability. Existing stores therefore keep their content and gain new features only after publishing composition v2.

## Default composition for new stores

New stores receive the following ordered skeleton:

1. announcement, disabled until merchant copy exists;
2. overlay hero, disabled until a tenant-owned hero asset exists;
3. category grid, shown only when at least two active image-backed categories resolve;
4. latest products row;
5. value propositions, disabled until the merchant supplies truthful copy;
6. split campaign, disabled until both panels resolve;
7. sale products row, omitted when no canonical compare-at discount exists;
8. brand story, disabled until merchant copy exists;
9. testimonials, enabled only when enough approved reviews resolve.

The default footer contains system navigation and the seven fixed policy definitions, but it exposes only published policy links as active destinations. Newsletter and social areas remain hidden until explicitly configured and valid. There are no fake products, collections, reviews, material claims, certifications, shipping promises, discounts, or social profiles.

## Customer-panel theme composer

The existing `/settings/theme` composer is expanded rather than replaced. It must provide:

- visual controls for header width, section spacing, card style, image ratio, color scheme, and heading style;
- an accessible ordered-section editor for all seven section kinds;
- real same-store R2 asset pickers for hero, category, navigation promotion, split campaign, and brand story media;
- real product/category/page selectors rather than raw IDs;
- finite icon selection and bounded text fields for value propositions;
- testimonial source, minimum rating, and limit controls without editable quote text;
- footer tone, ordered link groups, reviewed social profiles, and newsletter copy;
- product-detail visibility and accordion-order controls;
- deterministic desktop/mobile previews using the same v3 contract consumed by the storefront;
- validation messages that name missing merchant data without leaking private identifiers;
- save/publish version status, optimistic concurrency, and safe retry guidance.

Controls with no working backend or public behavior are forbidden. The composer cannot accept external image URLs, arbitrary route strings, custom scripts, custom HTML, browser tenant IDs, or private object keys.

## Storefront experience

### Header and announcement

- A narrow announcement bar renders persisted merchant messages and optional resolved relative destination.
- The logo is visually centered at desktop widths while category navigation and utility controls occupy balanced side regions.
- Overlay mode uses contrast-safe controls above hero media and transitions to a solid sticky header after the hero threshold.
- Solid mode is used on listing, product, cart, checkout, policy, search, favorite, and account pages.
- Desktop category groups support exact nested disclosures; mobile uses an accessible off-canvas tree.
- Search, account, favorite, and cart controls stay connected to their real existing routes and state providers.
- Menu, account, favorite, and cart hit areas are at least 48 by 48 CSS pixels.

### Hero and hotspots

- The first eligible hero may occupy the full initial viewport beneath the announcement bar.
- Desktop and mobile media use their exact resolved R2 assets with stable dimensions and responsive sources.
- Copy remains concise, readable, contrast-safe, and admin controlled.
- Each configured hotspot resolves a real active product. It discloses title, canonical price, and product destination; it cannot change price or add an unavailable variant.
- Missing hotspot products remove only the hotspot, not the entire valid hero.

### Category editorial grid

- Two to eight real categories render in a responsive editorial grid comparable in rhythm to the reference.
- Each card uses the resolved category image, name, and canonical category destination.
- Parent/child hierarchy remains visible in navigation but slugs and internal IDs are never displayed as merchant-facing labels.
- Missing images use the established neutral media fallback without broken external requests.

### Product rows and cards

- Four desktop columns and responsive two/single-column layouts use stable portrait or square media ratios.
- The first canonical product image is the primary image; a second image may be used only for a hover/focus preview.
- Sale and unavailable badges are derived from canonical values. A `new` badge is shown only if a reviewed server-side recency rule exists; no popularity or scarcity claim is invented.
- Cards show title, optional public brand, canonical price, compare-at price, favorite state, and a real add/choose-options action.
- Product cards never accept price, stock, badge, or destination from client-controlled state.

### Split campaigns and brand story

- Split campaigns render one or two image-led panels with safe destinations and readable overlays.
- Brand story supports an image, eyebrow, heading, body, and optional resolved destination.
- Both use tenant-owned R2 assets and collapse cleanly on mobile.

### Value propositions

- Two to four columns render a finite icon, heading, and body.
- Copy is merchant-authored and cannot state unconfigured shipping, return, material, or certification claims by default.
- The section becomes a stacked, readable list on narrow screens.

### Testimonials

- Only approved same-store product reviews belonging to active products may appear.
- Selection is deterministic: rating threshold, newest approved timestamp, and stable ID tie-break.
- The UI shows the true rating, reviewer display name, bounded review text, and optional merchant reply.
- No city, purchase status, verified badge, product usage claim, or avatar is invented.
- Fewer than the configured minimum hides the section. Motion is optional, user-controlled, and disabled under reduced motion.

### Footer

- Desktop renders two to four navigation columns plus an optional newsletter/social column.
- Mobile renders accessible disclosures with the same resolved links.
- The footer uses the configured light/dark tone and displays store identity, published policies, safe social profiles, and support email when present.
- Locale or currency selectors remain absent until real switching authority exists.

## Durable newsletter subscription

Because the approved reference includes a newsletter form, the starter will not ship an inert input or fake success state. Add one tenant-isolated public subscription authority.

### Persistence

Create a dedicated table for normalized subscriber email digests and access-restricted normalized email values. The normalized email is retained because an authorized merchant must be able to use the consented address; confidentiality is enforced by forced RLS, no direct table privileges, and narrow security-definer procedures rather than an unspecified second encryption/key-distribution system. The table is keyed by store and subscriber identity and records:

- store ID;
- normalized email digest and protected email value;
- status `subscribed` or `unsubscribed`;
- exact consent version;
- consented timestamp;
- version, created, and updated timestamps.

Raw email is not written to logs, operation payloads, analytics events, URLs, cookies, or client storage. Different stores may subscribe the same email without sharing records.

### Public write

`POST /api/newsletter/subscriptions` is same-origin and hostname-resolved. It accepts exact JSON `{ email, consent: true }`, rejects extra keys, malformed email, wrong content type, body over limit, cookies/authorization/private service headers when prohibited by the gateway, and non-POST methods. The server derives store authority from the trusted request runtime and calls one idempotent PostgreSQL function.

Repeated subscription for the same store returns the same public success shape without disclosing whether the address already existed. A transaction or commit-unknown result is fail-closed; the browser never receives fabricated success. Public errors are fixed codes without SQL, driver, store ID, digest, or email detail.

### Admin read

Authorized merchant users may list subscribers under the existing marketing/email-campaign authority. The panel receives bounded display data and status, not cross-store counts or raw storage metadata. Export, provider synchronization, bulk messaging, and automated campaigns remain separate features and are not implied by capturing consent.

## Product-detail experience

The desktop product page uses a two-column retail layout: a gallery region with vertical thumbnails and a large image, and a purchase/information region. Mobile stacks the gallery, summary, variants, purchase actions, and disclosures.

Required behavior:

- thumbnail rail, keyboard selection, active state, image zoom, stable aspect ratio, and descriptive alt text;
- title, brand when enabled, SKU when enabled, canonical price/compare-at price, stock, variant attributes, quantity, add-to-cart, and buy-now;
- highlights and size guide only from valid same-store resources;
- safe Markdown product description;
- ordered disclosure panels for description, materials/care, certifications, and published shipping/returns policies;
- share controls generate only canonical public product URLs and never include private state;
- approved reviews and related products use server-side same-store projection;
- mobile sticky purchase controls do not obscure content, footer, or form fields.

Add-to-cart opens the existing side cart with the canonical returned cart. Buy-now updates that same cart and enters the existing checkout. No duplicate cart or checkout state is introduced.

## Visual reference coverage ledger

The nine approved screenshots map to concrete owned behavior as follows:

| Reference characteristic | Celebix implementation authority | Acceptance evidence |
| --- | --- | --- |
| Announcement, centered navigation, four image categories | announcement, navigation, logo, and `category_grid` public projection | desktop and mobile home screenshots; exact category routes |
| Dark multi-column footer, newsletter, social row | `StarterFooterConfig`, published fixed pages/policies, social allowlist, durable newsletter endpoint | footer screenshots, link crawl, durable subscriber row and tenant-isolation test |
| Three icon-led value statements | `value_propositions` finite section | composer preview and storefront 2–4 item layouts |
| Two image campaign panels | existing `split_campaign` with stricter responsive styling | desktop/mobile screenshot and safe-destination tests |
| Full-bleed hero, overlay header, product hotspots | existing hero assets/product references plus overlay header state | hero scroll-state, hotspot truth, keyboard and mobile tests |
| Four editorial product cards with truthful badges/prices | canonical public product rows | price/compare-at/media assertions and responsive screenshots |
| Two-column product gallery and purchase summary | canonical product projection and product-detail config | desktop/mobile product-detail acceptance |
| Description/material/certification/shipping disclosures | same-store catalog resources, safe Markdown, and published policies | disclosure keyboard tests and missing-data negative cases |
| Review/testimonial presentation | approved same-store product-review projection | moderation/status, tenant isolation, empty-state, and rendered review evidence |

The ledger is a parity requirement, not permission to reproduce the reference brand or assets.

## Error handling

- Invalid required presentation data produces the existing controlled unavailable response.
- Invalid optional references are omitted and surfaced as actionable admin validation.
- Publication fails atomically when referenced active records do not validate.
- Missing optional merchandising data hides the corresponding UI.
- Newsletter failures preserve input locally only in component memory, reveal no existence information, and do not display success.
- Product/cart/checkout errors retain their existing finite safe codes.
- Broken media never falls back to arbitrary external URLs.
- No raw email, review private state, product draft, R2 object key, tenant/store ID, SQL, driver detail, token, cookie, or secret is logged or rendered.

## Accessibility and responsive acceptance

The required viewport matrix is:

- home: 1440×1000, 1025×768, 1024×768, 390×844, 320×720;
- desktop navigation disclosure: 1440×1000;
- mobile navigation drawer: 390×844 and 320×720;
- product listing: 1440×1000 and 390×844;
- product detail: 1440×1000, 1024×768, 390×844, and 320×720;
- side cart: 1440×1000 and 390×844;
- footer and newsletter: 1440×1000 and 390×844;
- empty, partial, missing-media, and unavailable states: 1440×1000 and 390×844.

Acceptance requires:

- zero horizontal overflow at every viewport;
- minimum 48×48 CSS-pixel touch targets;
- WCAG 2.2 AA, including at least 4.5:1 primary text/control contrast;
- correct landmarks, heading hierarchy, link/button semantics, dialog/disclosure state, labels, errors, and live regions;
- complete keyboard operation, focus trapping/restoration, Escape/backdrop/close handling, and body-scroll locking;
- no auto-rotating essential content;
- motion duration near `0.01ms` under `prefers-reduced-motion`;
- stable responsive image dimensions, no avoidable layout shift, and no footer/form overlap;
- a local screenshot comparison ledger against all nine approved reference characteristics, using Celebix content rather than reference assets.

## Performance requirements

- Noninteractive home sections remain server-rendered.
- Client components are limited to navigation disclosures, hotspots, gallery/zoom, favorites, purchase/cart, newsletter form state, and optional testimonial controls.
- No carousel or page-builder dependency is added unless native React/CSS primitives cannot meet the reviewed behavior.
- R2 responsive variants and intrinsic dimensions are used for all above-the-fold imagery.
- Desktop and mobile images are selected without downloading both full-resolution sources.
- Representative staging targets remain CLS at most 0.1 and mobile LCP at most 2.5 seconds under the agreed acceptance profile.

## Migration and repository design

Create the next versioned SaaS migration after `074`. It must:

- extend campaign starter validation for composition schema v2 while preserving v1 validity;
- preserve the current atomic publication table and operation history;
- add same-store publication checks for pages and new catalog-resource roles;
- add public projection functions for presentation v3, approved reviews, product merchandising, and newsletter availability;
- add the tenant-isolated newsletter table and idempotent public subscribe function;
- keep base tables inaccessible to public/application roles;
- expose only the minimum reviewed procedures to the existing runtime roles;
- update assertions and manifest checksums;
- provide rollback that removes only the new surface and restores the exact previous function graph;
- support backup, restore, rollback, reapply, concurrent publish, concurrent subscription, RLS, ACL, and cleanup rehearsal under disposable PostgreSQL 16.

Public review projection must filter `status = 'approved'`, active store, active product, and selected store before aggregation. Product-detail merchandising must join resource mappings by the same store on every edge.

## TDD and verification strategy

Implementation proceeds in independently reviewable red/green slices:

1. composition v2 and public presentation v3 exact contracts, defaults, deep freezing, and v1/v2 adapters;
2. PostgreSQL migration, publication validation, approved-review/product-information projections, newsletter persistence, RLS, and repository methods;
3. customer-panel composer controls and deterministic preview;
4. announcement/header/navigation and responsive shell;
5. hero, category, product, campaign, value-proposition, testimonial, and footer sections;
6. newsletter public endpoint and admin subscriber read;
7. product gallery, purchase summary, information disclosures, reviews, and related products;
8. visual, accessibility, performance, static-security, and full regression acceptance.

Automated tests must prove:

- exact-key parsing, bounds, enums, uniqueness, safe destinations, social allowlists, and deep immutability;
- no composition v1 or public v1/v2 regression;
- cross-store product/category/asset/page/resource/review rejection;
- draft invisibility, atomic publication, version conflict, operation replay, and concurrent publish;
- approved-review-only and active-product-only testimonials;
- newsletter exact request shape, tenant isolation, idempotency, concurrency, existence privacy, RLS/ACL, rollback/reapply, backup/restore, and cleanup;
- truthful hiding of unconfigured sections and merchandising panels;
- header, navigation, hero hotspots, card badges, footer links, social profiles, and newsletter semantics;
- product image rail, zoom, variant selection, canonical price/stock, add-to-cart, buy-now, Markdown, disclosures, review source, and policy authority;
- focus trap/restoration, Escape, backdrop, swipe where supported, keyboard navigation, reduced motion, touch target size, contrast, and overflow;
- no Shopify/Impulse identifiers, copied assets/copy, arbitrary HTML/CSS/script, private API, browser tenant authority, fake review/KPI/claim, object key, secret, or forbidden ID;
- complete contract, data, customer-panel, storefront, Owner, typecheck, build, current Phase 1/2/3, and disposable PostgreSQL suites.

## Expected source areas

The implementation plan will name exact files and line ranges. The reviewed source areas are expected to include:

- `packages/saas-contracts/src/storefront/**`;
- `packages/saas-data/src/storefront/**` and the narrow merchant/newsletter repositories;
- the next migration, assertion, manifest, and PostgreSQL harness under `apps/owner/scripts/sql/saas/**` and `tests/saas-phase2/**`;
- `apps/customer-panel/lib/starter-theme-composer-model.ts`, its tests, and `apps/customer-panel/components/settings/**`;
- `apps/storefront-shared/components/**`, `apps/storefront-shared/lib/**`, and the exact storefront API/page routes required by the contract;
- focused tests and styles colocated with those areas.

`apps/admin/**` remains read-only and byte-for-byte unchanged. No second storefront/admin application, iframe, reverse proxy, arbitrary theme runtime, production deploy, DNS change, credential mutation, migration against production, or merge is part of this design.

## Success criteria

The redesign is complete only when:

- a newly provisioned merchant receives the polished Campaign Starter skeleton;
- all visible merchant-specific content is controlled by their own admin/catalog/policy/review authority;
- the nine reference characteristics are represented by real configurable sections and product behavior;
- existing stores and commerce flows remain compatible;
- newsletter submission is durable and tenant-isolated rather than decorative;
- desktop and mobile acceptance passes the exact viewport, accessibility, security, and performance matrix;
- all PostgreSQL and repository authority tests pass;
- all workspace regressions pass;
- `apps/admin/**` diff is zero;
- deployment and production impact remain zero until separately authorized.
