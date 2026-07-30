# Admin-managed starter theme design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı
**Date:** 2026-07-30
**Implementation base:** `8d6b7897a04e406346c7f2ba18f4f67a600e6ec4`
**Target application:** `apps/storefront-shared`
**Management application:** `apps/customer-panel`

## Objective

Turn the shared `starter` storefront into a simple, production-usable theme whose public presentation is controlled by durable merchant settings from the customer panel. A newly created store must render a complete safe default immediately, while an authorized merchant can change the supported presentation fields without creating a second tenant authority, exposing private admin records, or weakening the storefront host and media boundaries.

## Current-state findings

The repository already contains durable merchant-admin record kinds and customer-panel routes for:

- `general_setting` at `/settings/general`;
- `hero_banner` at `/settings/hero-banner`;
- `promotion_banner` at `/settings/promotion-banner`;
- `marquee_setting` at `/settings/marquee`.

Migration `202607220039_typed_storefront_settings` validates these records and the customer panel can create, update, activate, draft, and archive them. The design hub currently links to these editors.

The public storefront does not consume any of those records. `saas.resolve_public_storefront` projects only the store identity, verified domain, currency, locale, and `themeKey`. The `PublicStorefront` contract therefore cannot carry theme presentation data, and `apps/storefront-shared` renders hardcoded hero, announcement, brand-story, and header copy.

There are four correctness gaps:

1. Admin settings are durable but do not affect the public storefront.
2. More than one active record of a singleton setting kind can exist, so no explicit winner is documented for storefront rendering.
3. `imageUrl` accepts a canonical HTTPS URL, while the storefront CSP admits only the configured Celebix media origin. An externally hosted hero can be valid in the admin repository but blocked in the browser.
4. New tenants receive `themeKey: "starter"` but no theme records. The storefront must therefore own deterministic safe defaults rather than depend on seeded mutable records.

## Design principles

- PostgreSQL remains the durable authority for merchant settings.
- Customer-panel cookies, headers, query parameters, and client state never become storefront authority.
- The public storefront receives an allowlisted projection, never generic `merchant_admin_records` rows.
- Only active records can affect the storefront. Draft and archived records are invisible.
- All tenant selection is derived from the already verified exact storefront hostname.
- Every projected media URL must belong to the configured Celebix public media origin and the selected store namespace.
- Missing, ambiguous, malformed, cross-store, or unsupported presentation data fails closed to safe starter defaults.
- Existing catalog, checkout, payment, session, Owner, and production activation behavior is preserved.

## Considered approaches

### Direct storefront reads from merchant-admin records

Rejected. Granting the host-resolver role generic merchant-admin access would expose private configuration and couple the storefront to admin record internals.

### Duplicate theme JSON on `saas.stores`

Rejected. Copying settings into a second JSON column would create two authorities and require synchronization/recovery semantics for every admin save.

### Server-owned public presentation projection

Approved. Merchant-admin remains the only writer. A new security-definer SQL projection resolves a bounded public presentation snapshot for the already selected store and current time. The host-resolver role receives execute permission only on the public resolver, not table access.

## Public presentation contract

The storefront contract advances from `PublicStorefront.schemaVersion: 1` to `schemaVersion: 2`. It retains the existing identity fields and adds one immutable `presentation` object.

```ts
type PublicStarterThemePresentation = Readonly<{
  schemaVersion: 1;
  displayName: string;
  supportEmail?: string;
  theme: Readonly<{
    colorScheme: "neutral" | "warm" | "dark" | "ocean";
    headingStyle: "serif" | "sans";
    productCardStyle: "editorial" | "compact";
    productImageRatio: "portrait" | "square";
    homeProductLimit: 4 | 8 | 12;
    showBrandStory: boolean;
  }>;
  hero: Readonly<{
    enabled: boolean;
    headline: string;
    body: string;
    destination: string;
    image?: PublicStorefrontAsset;
  }>;
  promotion?: Readonly<{
    headline: string;
    body?: string;
    destination: string;
  }>;
  marquee?: Readonly<{
    items: readonly string[];
    icon: "none" | "sparkle" | "truck" | "shield";
    speed: "slow" | "normal" | "fast";
    direction: "left" | "right";
    animation: "continuous" | "step";
  }>;
  seo: Readonly<{
    title?: string;
    description?: string;
    allowIndex: boolean;
    socialImage?: PublicStorefrontAsset;
  }>;
}>;

type PublicStorefrontAsset = Readonly<{
  url: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  altText: string;
  width: number;
  height: number;
}>;
```

The parser remains exact: unknown keys, getters, exotic prototypes, unbounded strings, malformed paths, noncanonical URLs, invalid enums, incomplete image dimensions, and unsupported schema versions are rejected.

## Durable setting model

The existing setting kinds remain authoritative for their current fields. A new typed singleton record kind, `theme_setting`, adds the controlled visual options listed in the public contract. It accepts enum/boolean/integer values only and cannot carry CSS, HTML, JavaScript, font URLs, arbitrary color strings, or executable configuration.

The singleton kinds are:

- `general_setting`;
- `theme_setting`;
- `hero_banner`;
- `promotion_banner`;
- `marquee_setting`;
- `seo_control`;
- `social_preview`.

The public winner for a singleton kind is the active record with the greatest `(updated_at, id)` tuple. This mirrors the repository's existing ordered list semantics and the payment-setting compatibility migration. The selection is deterministic even when historical data contains multiple active rows.

New saves must not silently mutate another record. The customer panel presents singleton settings as one effective profile: it edits the current winner, creates a record only when none exists, and clearly labels any older active records as superseded. A later cleanup migration may normalize historical duplicates, but storefront correctness must not depend on destructive cleanup.

## Storefront asset authority

Theme images must be first-party, store-scoped R2 assets. A new `saas.storefront_assets` table stores only public presentation assets and is separate from product media.

Allowed asset kinds:

- `logo`;
- `hero`;
- `social`;
- `favicon`.

The immutable object-key format is:

```text
stores/<storeId>/storefront/<assetKind>/<assetId>.<ext>
```

Each row binds the store, asset kind, object key, exact public URL, media type, byte size, dimensions, alt text, state, and timestamps. Upload authority uses the existing authenticated panel session, `TenantContext`, storage quota, image decoder, R2 adapter, and commit/cleanup semantics. No client-supplied store ID or public origin is trusted.

The merchant editor selects an uploaded asset ID rather than persisting a free-form external image URL. Existing valid `imageUrl` records remain readable only when the URL exactly matches an active asset owned by the same store. An external, missing, inactive, wrong-kind, wrong-origin, or cross-store image is omitted from the public projection.

The storefront CSP remains bounded to the exact configured `CELEBIX_R2_PUBLIC_ORIGIN`; it is never widened from merchant input.

## PostgreSQL public projection

A new migration adds:

1. the `theme_setting` record kind and exact config validation;
2. the `storefront_assets` table, indexes, RLS, immutable guards, and operation/audit tables required by the existing media pattern;
3. authenticated asset mutation functions for the application role;
4. a private helper that resolves the deterministic effective singleton record;
5. a public presentation projection that accepts only `store_id` and `now` from the verified storefront resolver;
6. an updated `saas.resolve_public_storefront(hostname, now)` result containing the schema-v2 presentation snapshot.

The host-resolver role receives execute only on the existing public resolver. It receives no direct table privileges on merchant-admin or storefront-asset tables. Helper functions remain owner-only.

Promotion resolution requires:

- status `active`;
- `enabled = true`;
- `startsAt` absent or `startsAt <= now`;
- `endsAt` absent or `endsAt > now`.

Hero and marquee require status `active` and `enabled = true`. Draft, archived, disabled, future, and expired records do not appear.

## Safe defaults for new stores

No mutable merchant setting rows are required during tenant creation. When a setting is missing or invalid, the public projection emits deterministic defaults:

- `displayName`: persisted store name;
- neutral color scheme;
- serif headings;
- editorial product cards;
- portrait product media;
- eight home products;
- brand story enabled;
- hero enabled with the store name, a short fixed Turkish discovery sentence, `/products` destination, and no configured image;
- no promotion;
- no marquee;
- indexing disabled unless an active SEO record explicitly allows it.

The starter hero renderer uses the first available product image as a visual fallback without persisting or claiming that product as a banner. If the catalog is empty, the layout remains complete and does not render a broken media frame.

## Customer-panel experience

`/settings/design` becomes the single starter-theme control center while preserving the existing deep links.

It contains:

- a desktop/mobile preview toggle;
- the exact verified storefront hostname when available;
- cards for Theme, General, Hero, Promotion, Marquee, and Assets;
- active/draft state and last-updated information;
- a same-origin link to the existing editor for each setting;
- explicit copy that only active settings are public;
- controlled empty/loading/error states.

The new theme editor exposes only the enum/boolean/home-limit controls. Hero, promotion, marquee, and general editors retain their durable repository workflow but switch to singleton presentation. The hero and social-image controls use the storefront-asset upload/selection workflow.

The preview consumes the same pure presentation model and CSS token mapping as the real storefront. It may render local unsaved form values for preview, but those values cannot reach the public storefront until an authorized save commits and the record is active.

## Starter storefront behavior

### Header

- Uses `presentation.displayName`.
- Provides Home and Products navigation.
- Uses an accessible mobile disclosure/drawer.
- Removes the inert `Çanta 0` display. No fake cart state is shown.
- Promotion or marquee appears only when projected.

### Home

- Renders the configured hero when active.
- Uses an exact safe internal destination.
- Uses the configured first-party hero asset, otherwise the first real product image, otherwise a media-free layout.
- Renders 4, 8, or 12 real products according to the effective theme setting.
- Does not invent categories, discounts, shipping promises, testimonials, or metrics.
- Shows the brand-story band only when enabled.

### Product list

- Shows the real public product count.
- Adds client-side search over the bounded public result set.
- Supports truthful filters: all, available, discounted.
- Supports title and price ordering without creating new tenant authority.
- Uses the configured product-card and image-ratio variants.

### Product detail

- Preserves the real gallery, price, stock, variants, secure Buy Now flow, analytics, and safe Markdown description.
- Adds breadcrumb and consistent presentation tokens.
- Never synthesizes inventory, delivery dates, reviews, or variant attributes.

### Footer and metadata

- Uses public display name and optional support email.
- Metadata uses active SEO settings with safe store-derived fallbacks.
- `robots` remains noindex unless an active `seo_control` explicitly allows indexing and the exact domain is an active verified primary/custom authority supported by the existing rollout policy.

## Shared presentation model

A pure, framework-independent starter-theme model maps the parsed public presentation into bounded CSS tokens and view data. It is used by:

- `apps/storefront-shared` for the real storefront;
- `apps/customer-panel` for the design preview;
- tests for defaulting, enum mapping, visibility, media fallback, and copy integrity.

The model contains no database, environment, cookie, hostname, session, or fetch access. Full `TenantContext` never crosses into client components.

## Caching and freshness

The shared storefront currently uses dynamic rendering. No browser-controlled theme cache key is introduced. The PostgreSQL projection reads the current effective records on each storefront resolution. Future server caching may use store ID plus a durable presentation version, but is out of scope.

## Error handling

- Invalid public projection: controlled storefront unavailable response; do not partially trust the malformed payload.
- Missing optional setting: render safe default.
- Invalid or unowned asset: omit the asset and render fallback media.
- Merchant-admin save conflict: preserve the existing version-conflict UI and reload behavior.
- Asset upload failure: no setting record is updated; best-effort cleanup removes the uncommitted R2 object.
- Asset database commit unknown: fail closed, perform only the authorized read-only recovery, and never upload a second object automatically.
- Storefront repository/database unavailable: preserve the existing controlled unavailable response.

## Security invariants

- Exact hostname resolution precedes every presentation lookup.
- A presentation lookup cannot select another store's records or assets.
- Public functions never return record names, IDs, versions, audit events, principal IDs, membership IDs, plan data, operation IDs, object keys, storage credentials, or private configuration.
- Merchant strings are rendered as text; arbitrary HTML and CSS are prohibited.
- Destinations are canonical same-origin paths and cannot be protocol-relative or traversal paths.
- Media URLs are exact canonical HTTPS URLs on the configured Celebix media origin and are backed by active store-owned assets.
- CSP is never widened by data.
- Storefront roles cannot mutate settings or assets.
- Application roles cannot call owner-only public-projection helpers directly unless explicitly required by an authenticated admin operation.

## Test strategy

### Contract and pure-model tests

- exact schema-v2 parsing;
- defaults for a new store;
- enum-to-token mapping;
- unknown key/prototype/getter/control-character rejection;
- hero/media fallback;
- promotion time boundaries;
- marquee bounds;
- metadata/indexing rules;
- search/filter/sort behavior;
- full TenantContext absence from client props.

### PostgreSQL tests

- migrations and rollback/reapply;
- deterministic effective singleton selection;
- active vs draft/archived/disabled settings;
- future/active/expired promotion boundaries;
- cross-tenant setting and asset isolation;
- store-owned asset URL and object-key binding;
- wrong origin, wrong kind, inactive asset, and orphan rejection;
- exact ACL/catalog assertions;
- host-resolver read-only behavior;
- backup/restore preservation;
- concurrent admin saves and asset operations;
- commit-unknown recovery and R2 cleanup evidence.

### Customer-panel tests

- design hub cards and verified live-store link;
- role-based manage/read-only behavior;
- singleton create/edit semantics;
- desktop/mobile preview;
- active/draft messaging;
- upload, replacement, failure, and focus restoration;
- no browser tenant/store authority;
- no raw secret, cookie, object key, or TenantContext exposure.

### Storefront tests

- configured and default header/home/list/detail/footer rendering;
- no inert cart counter;
- exact first-party asset rendering;
- search/filter/sort interaction;
- empty catalog and missing-image states;
- safe Markdown descriptions;
- desktop, 1024/1025 breakpoint, 390x844, and 320x720 layouts;
- zero horizontal overflow;
- keyboard navigation, visible focus, 48px touch targets, contrast, and reduced motion;
- CSP and secret-pattern scans;
- checkout, analytics, Owner, customer-panel, and existing PostgreSQL regressions.

## Rollout

1. Implement contract/model tests and schema-v2 parsing.
2. Add migration and disposable PostgreSQL proof.
3. Add storefront-asset repository/runtime and customer-panel upload UI.
4. Add singleton theme editor and shared preview model.
5. Wire the public projection into the storefront repository.
6. Implement the approved starter UI using projected settings and safe defaults.
7. Run complete local and disposable PostgreSQL verification.
8. Commit and push in independently reviewable boundaries.
9. Stop before deployment.
10. Deploy only the isolated shared storefront and customer-panel staging services after separate authorization, then complete authenticated admin-to-storefront browser acceptance.

Production deployment, production credential mutation, migration execution against production, merge, and customer-domain cutover are not authorized by this design.

## Acceptance criteria

- A newly created store with no setting records renders a complete usable starter theme.
- An authorized merchant can change every supported starter presentation field through the customer panel.
- Only committed active settings affect the public storefront.
- Admin changes are visible on the exact store and never another tenant.
- All public images are store-owned R2 assets accepted by the existing strict CSP.
- The storefront has no hardcoded merchant-specific content or inert controls.
- Catalog, product detail, checkout, analytics, and session behavior remain intact.
- All security, contract, workspace, PostgreSQL, responsive, accessibility, and browser acceptance checks pass before staging completion is claimed.
