# İKAS-Quality Product Onboarding Design

**Date:** 2026-07-28

**Status:** Kullanıcı tarafından 28 Temmuz 2026 tarihinde yazılı olarak onaylandı.

**Design branch:** `codex/ikas-quality-product-onboarding-design`

**Implementation base:** `6fadaa05ad6e7422bda463ccb7c785f8326ee24b`

**Live donor evidence:** Read-only inspection of the authenticated İKAS product list, quick-create dialog, simple-product editor, variant-product editor, and CSV/XLSX import dialogs on 28 July 2026.

## 1. Outcome

Raise Celebix product onboarding to İKAS-quality while making the common path faster and less confusing than the donor. A merchant must be able to create and publish a valid physical product in approximately sixty seconds using only a name and price, while every advanced field remains available without forcing a long wizard.

The implementation must provide real durable behavior. No field, selector, success state, sales channel, category, stock location, media item, or AI result may be shown unless it is backed by the shared PostgreSQL authority or an explicitly configured provider.

This program is split into three independently reviewable deliveries:

1. **Product onboarding foundation:** quick create, advanced simple/variant create, product merchandising profile, categories, resource assignments, location stock, channel assignments, advanced editing, and multi-image completion.
2. **Import parity:** XLSX ingestion, selective column mapping, expanded field coverage, special-field imports, and safe remote-media ingestion.
3. **Final UX acceptance:** authenticated desktop/mobile browser acceptance, performance, accessibility, recovery, and visual parity review.

This design specifies Delivery 1 completely and fixes the boundaries for Deliveries 2 and 3. Delivery 2 must receive its own implementation plan after Delivery 1 closes.

## 2. Existing authority that remains unchanged

- The merchant application remains `apps/customer-panel`.
- `apps/admin/**` remains read-only and receives zero diff.
- Tenant and store authority remains `__Host-celebix_panel` -> durable PostgreSQL session -> membership/store revalidation -> server-only `TenantContext`.
- Browser input never supplies tenant, store, principal, membership, plan, subscription, database, or provider authority.
- Existing `Product`, `ProductVariant`, product-media, inventory, catalog-admin-resource, and multichannel import contracts remain backward-compatible.
- Existing product list, detail, archive, media, variant, import, inventory, storefront, and order behavior must remain functional.
- All mutations require exact same-origin authority, an opaque operation UUID, a canonical fingerprint, durable replay handling, and server-side action authorization.
- `celebix_saas_app` receives no direct table write privilege.
- Production deployment, production credential mutation, and merge are not part of this design.

## 3. Donor observations and Celebix improvements

The inspected İKAS workflow exposes:

- a quick-create dialog for image, name, rich description, price, discount, overselling, category, and immediate publication;
- an advanced simple/variant choice;
- advanced sections for core facts, media, brand/tag/category/supplier, variants, inventory, shipping, SEO, custom fields, customization, and sales channels;
- CSV/XLSX import with product or special-field mode and twenty-eight selectable fields.

Celebix keeps the useful donor concepts but removes the most costly friction:

- no mandatory multi-page wizard;
- no requirement to manually enter a slug for the common path;
- no requirement to understand variants for a one-option product;
- no hidden partial success when media fails;
- no sales-channel selector containing unavailable or fake channels;
- no long form that must be completed before the first save;
- no product loss when an optional external media operation fails.

## 4. Entry points and route behavior

### 4.1 Product list

The existing `Ürün Ekle` action on `/products` becomes a real client-side dialog launcher. The current `/products/new` deep link remains supported and renders the same quick-create experience as a page for refresh, direct navigation, and assistive technology.

The product list continues to expose import, export, search, filter, bulk status, refresh, publication, edit, and archive actions. The quick dialog must not weaken any current list authority or reconciliation behavior.

### 4.2 Quick-create dialog

Desktop uses a compact modal. Widths at and below the existing 1024px mobile boundary use a full-height bottom sheet. The dialog contains:

Required:

- product name;
- sale price.

Visible with safe defaults:

- stock quantity, default `0`;
- product image, optional;
- category, optional and populated only from active persisted categories.

Actions:

- `Taslak kaydet`;
- primary `Kaydet ve satışa aç`;
- `Gelişmiş ürün eklemeye geç`;
- `Vazgeç`.

Server-owned defaults:

- product type `physical`;
- currency `TRY`;
- one initial variant titled `Standart`;
- stock tracking enabled;
- continue-selling-when-out-of-stock disabled;
- storefront channel selected only when an active canonical storefront authority exists;
- slug generated from the title and allocated uniquely inside PostgreSQL;
- SKU remains absent unless entered or explicitly generated in the advanced editor.

The quick path does not ask for a slug, SKU, barcode, supplier, SEO copy, shipping details, or variant attributes.

### 4.3 Advanced create

`Gelişmiş ürün eklemeye geç` first presents two choices in the existing surface:

- `Basit ürün`;
- `Varyantlı ürün`.

Choosing a type opens one editor. It is not a sequential wizard. Sections are collapsible, validation is local to the opened section, and saving does not require opening optional sections.

Sections:

1. Temel bilgiler
2. Fiyat ve stok
3. Varyantlar
4. Medya
5. Kategori, koleksiyon, marka ve etiket
6. Kargo ve gümrük
7. SEO
8. Satış kanalları
9. Nitelikler ve ekstralar

A sticky summary shows product state, variant count, media count, selected channels, and the exact missing requirements for publication. It never invents readiness.

### 4.4 Product detail editing

The existing `/products/[productId]` screen consumes the same editor sections and the same DTOs. Quick and advanced create do not fork into separate persistence models. A merchant may create quickly and complete advanced fields later without migration or data conversion.

## 5. Persistence model

The current `saas.products`, `saas.product_variants`, `saas.product_media`, `saas.inventory_locations`, `saas.inventory_balances`, `saas.catalog_admin_resources`, and `saas.catalog_admin_resource_products` tables remain authoritative and backward-compatible.

Delivery 1 adds the following store-scoped structures.

### 5.1 Product merchandising profile

`saas.catalog_product_profiles` is one-to-one with a non-archived product and contains:

- `store_id`, `product_id`;
- `product_type`: `physical` or `digital`;
- optional bounded `supplier_name`;
- optional canonical `google_product_category_id`;
- optional `seo_title` and `seo_description`;
- `minimum_purchase_quantity`, default `1`;
- optional `maximum_purchase_quantity`, always greater than or equal to the minimum;
- monotonic `version`, timestamps.

The base product slug remains the canonical public path. SEO fields cannot introduce another URL authority.

### 5.2 Categories

`saas.catalog_categories` contains:

- `id`, `store_id`;
- optional `parent_id` in the same store;
- bounded `name`, normalized `slug`;
- `position`, `status`, `version`, archive and timestamps.

`saas.catalog_product_categories` links products to active categories in the same store and records deterministic position. A product may belong to multiple categories. Cycles, cross-store parents, archived categories, duplicate assignments, and depth above eight are rejected.

Collections remain merchandising groups and are not silently reclassified as categories.

### 5.3 Resource assignments

The existing `saas.catalog_admin_resource_products` relation remains the source for collection, brand, tag, attribute, extra, and definition assignments. The onboarding mutation validates:

- at most one active brand;
- at most fifty active tags;
- bounded active collection, attribute, extra, and definition selections;
- every resource belongs to the same store and matches its declared kind.

The implementation adds a product-centric mutation boundary so editing one product does not require the browser to rewrite unrelated resource records.

### 5.4 Variant commerce profile

`saas.catalog_variant_commerce_profiles` is one-to-one with an active variant and contains:

- `store_id`, `product_id`, `variant_id`;
- `continue_selling_when_out_of_stock`, default `false`;
- optional unit-pricing values represented as bounded integer thousandths plus a closed unit enum;
- optional `shipping_desi_milli`, stored as a non-negative integer thousandth;
- optional canonical `hs_code`;
- monotonic `version`, timestamps.

Floating-point quantities are forbidden. Digital products cannot carry desi or HS values.

### 5.5 Sales channels

`saas.catalog_product_channels` links a product to a server-resolved active channel:

- canonical storefront channel derived from the active store/domain authority;
- active configured marketplace connections from the existing merchant-admin authority.

The browser sends only an opaque channel ID returned by the onboarding options endpoint. PostgreSQL revalidates channel/store/type/status before every mutation. An unavailable marketplace is omitted rather than displayed as connected.

### 5.6 Operation proof

`saas.catalog_onboarding_operations` stores immutable operation ID, store ID, kind, canonical fingerprint, exact result projection, and commit time. Supported kinds are:

- `quick_create`;
- `advanced_create`;
- `update_merchandising`;
- `publish_after_media`.

Update and delete are trigger-rejected. Replay with the same fingerprint returns the stored result. Reuse with a different payload returns `operation_mismatch`.

## 6. Atomic create and media completion

One PostgreSQL onboarding function creates, in one transaction:

- product;
- every submitted variant;
- product profile;
- category assignments;
- resource assignments;
- channel assignments;
- variant commerce profiles;
- initial balances for selected active inventory locations;
- immutable operation proof.

Product limit, slug allocation, SKU uniqueness, role/action, subscription, feature, category/resource/channel membership, location authority, and all bounds are checked under the required row locks.

Slug allocation is server-owned. The first title uses its normalized base. Concurrent or existing collisions receive the smallest available numeric suffix under the same transaction. Replay returns the original slug.

Media remains a separate R2-backed operation because PostgreSQL and object storage cannot share one transaction.

For `Taslak kaydet`:

1. create the product as draft;
2. upload optional images;
3. report exact completion or partial media failure.

For `Kaydet ve satışa aç`:

1. create the product as draft;
2. upload optional images;
3. verify the latest product/media state;
4. activate through `publish_after_media` using the expected version.

When no image is selected, activation follows immediately. When image upload fails, the product remains draft. The UI reports `Ürün oluşturuldu, görsel yüklenemedi` and offers `Görseli yeniden yükle` plus `Ürüne git`. It never retries a write automatically after an unknown result.

Delivery 1 supports bounded multi-image JPEG, PNG, and WebP using the existing safe media authority. HEIC and video require a separately reviewed R2 processing/playback contract and are reserved for the later media delivery; unsupported formats are not advertised.

## 7. Server and browser contracts

New immutable DTO families:

- `CatalogOnboardingOptions`;
- `CatalogQuickCreateIntent`;
- `CatalogAdvancedCreateIntent`;
- `CatalogProductEditorProjection`;
- `CatalogProductMerchandisingUpdate`;
- `CatalogOnboardingResult`.

The options projection contains only bounded safe display fields for active categories, catalog resources, inventory locations, and configured channels. It contains no tenant, store, principal, membership, provider secret, database, or internal authority identifiers.

HTTP routes:

- `GET /api/catalog/onboarding/options`;
- `POST /api/catalog/onboarding/products`;
- `GET /api/catalog/products/[productId]/merchandising`;
- `PATCH /api/catalog/products/[productId]/merchandising`;
- the existing media routes for image upload and ordering;
- a narrow publication completion route only when media completion requires it.

Every mutation requires exact method, path, canonical JSON, bounded body, exact public Origin, same-origin session credentials, idempotency key, and no private authority headers. GET projections are `no-store`.

The quick and advanced UI call the same create route with an exact discriminated intent. The server supplies defaults for quick intent and rejects advanced-only keys in quick requests.

## 8. Validation and error behavior

Stable browser-visible outcomes include:

- invalid input;
- unauthenticated;
- membership denied;
- feature disabled;
- product limit reached;
- SKU conflict;
- resource/category/location/channel no longer available;
- version conflict;
- operation mismatch;
- media unavailable;
- completion unknown;
- service unavailable.

Errors never expose SQL, provider output, object keys, raw session values, internal IDs, secrets, stack traces, or submitted media bytes.

Inline validation focuses the first invalid field. Cross-section errors open and focus their section. Version conflict preserves the merchant's draft in browser memory and offers a canonical reload; it does not overwrite a newer persisted version.

The form locks duplicate submission synchronously. Navigation and dialog close while a known mutation is active require a clear confirmation. Unknown commit state remains locked until one read-only recovery determines the canonical result.

## 9. Accessibility and interaction requirements

- Every interactive target is at least 48×48 CSS pixels.
- Dialog has a labelled title, modal semantics, focus containment, Escape/backdrop/close behavior, and focus return to `Ürün Ekle`.
- Mobile sheet respects safe areas and does not cover focused inputs.
- Advanced accordions use native button semantics and accurate expanded state.
- Errors use `role=alert`; progress and completion use bounded `role=status` messages.
- Reduced-motion duration remains approximately `0.01ms`.
- Horizontal document overflow is zero at 320, 390, 1024, and 1025 widths.
- Turkish labels remain concise; technical concepts such as idempotency, fingerprints, TenantContext, and object storage never appear in merchant copy.

## 10. Performance requirements

- Quick dialog code is loaded only when the launcher is invoked.
- Onboarding options use one bounded server projection and no client-side N+1 requests.
- Opening the dialog does not fetch product history or full catalog collections.
- Quick create uses one PostgreSQL create call, optional bounded media calls, and at most one publication completion call.
- Advanced resource search is paged and abortable.
- No new external font, image, script, or analytics dependency is introduced.

## 11. Test strategy

### Contracts and validation

- exact quick and advanced shapes;
- immutable projections;
- Turkish money, quantity, unit, desi, HS, SEO and purchase bounds;
- unknown/private keys rejected;
- backward compatibility of existing catalog contracts.

### PostgreSQL 16

- migration apply, assertions, rollback, reapply and cleanup;
- quick create with only name and price;
- multi-variant atomic create;
- category/resource/channel/location tenant isolation;
- one-brand and bounded relation rules;
- server-owned slug collision allocation under concurrency;
- SKU collision and product-limit enforcement;
- operation replay and mismatch;
- role, subscription and feature denial;
- update version conflict;
- no direct app-role table mutation;
- backup and restore projection integrity.

### Repository and HTTP

- exact TenantContext authority forwarding;
- exact method/path/query/origin/header/body gates;
- safe options projection;
- quick defaults applied only server-side;
- one repository mutation per operation;
- unknown commit read-only recovery;
- stable secret-free error mapping.

### UI

- quick create completes with name and price;
- optional stock, image and category;
- draft and publish paths;
- simple/variant advanced selection;
- collapsed optional sections;
- active-only category/resource/location/channel options;
- image partial failure recovery;
- focus, keyboard, screen-reader and responsive behavior;
- no double submission;
- no fake AI, channel, media, product, category or success state.

### Regression and security

- existing customer-panel catalog, media, inventory, import and storefront suites;
- saas-contracts and saas-data tests/typechecks;
- Owner tests/typecheck/build when migrations change;
- disposable PostgreSQL cumulative Phase 3 harnesses;
- `apps/admin/**` diff count zero;
- forbidden tenant/browser authority, secret, private-ID, Supabase and `/api/admin/**` scans;
- local authenticated desktop/mobile browser acceptance before any separately authorized staging gate.

## 12. Delivery boundaries

Delivery 1 includes the complete quick and advanced product onboarding/editor behavior described above.

Delivery 2 will add:

- XLSX parsing with bounded worksheets and exact cell types;
- product versus special-field import modes;
- selectable/mappable fields equivalent to the inspected donor set;
- product profile, category, resource, channel, variant-commerce and active-state import support;
- safe remote image ingestion to R2 with bounded concurrency, content validation and durable job recovery;
- explicit create/update/conflict strategy and preview.

Delivery 3 will run the final authenticated UX, performance, accessibility, recovery and visual acceptance matrix across quick, advanced and import flows.

HEIC/video, AI-generated copy, automatic recurring feed schedules, production deployment, credential mutation, merge, and production activation are not silently included in Delivery 1. Each requires its own real provider/lifecycle authority. The UI must remain truthful until those deliveries are approved and implemented.

## 13. Definition of done for Delivery 1

Delivery 1 is complete only when:

- a merchant can create a draft or published product with only name and price;
- advanced simple and multi-variant creation persist atomically;
- every displayed category, resource, location and sales channel is server-authorized and durable;
- the complete merchandising profile can be edited with version safety;
- optional multi-image completion has truthful recovery;
- the quick path contains no mandatory long wizard;
- all PostgreSQL, authority, regression, accessibility, responsive and security gates pass;
- `apps/admin/**`, production, Owner/storefront deployment, credentials and infrastructure remain untouched.
