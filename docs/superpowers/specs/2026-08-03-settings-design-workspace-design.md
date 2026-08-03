# Settings and Storefront Design Workspace

## Goal

Turn Celebix settings into a quiet, grouped control center and replace the scattered storefront appearance forms with one child-friendly, live Design workspace. A merchant must be able to change the store logo, favicon, colors, typography, hero, promotion, and announcement strip without understanding technical terms. Every published value must come from tenant-scoped PostgreSQL authority and must change the real storefront for that store.

This design applies to the shared customer panel and shared storefront runtime, so it applies to every tenant, including Güzide Kuyumcu.

## Product Principles

- The panel is operational, not conversational. It uses short labels, useful state, and actions instead of explanatory paragraphs.
- The page canvas stays open. Decorative outer cards and repeated body titles remain prohibited.
- Controls use merchant language: `Ana sayfa üst alanı` instead of `Hero`, and `Tarayıcı simgesi` instead of requiring the merchant to understand `favicon`.
- A merchant never types a database ID or guesses an internal URL. Products, collections, pages, and media are selected from live tenant data.
- Preview and storefront use one validated design contract. Demo content, local storage, and parallel hidden sources of truth are prohibited.
- A publication is atomic. The storefront must never show half of a design change.

## Scope

### Included in the first release

- a grouped, ikas-inspired Settings landing page;
- one `Tasarım` destination in Settings and in the Settings navigation tree;
- logo and browser icon selection from tenant media;
- primary, accent, background, and text colors;
- a curated font-family selector with an immediate preview;
- hero content, image, destination, and enabled state;
- scheduled promotion content, destination, start/end time, and enabled state;
- announcement strip messages, icon, speed, direction, animation, and enabled state;
- desktop and mobile preview modes using live store identity and catalog data;
- durable draft saving and atomic publishing;
- storefront consumption of the published design;
- redirects from the old hero, promotion, and marquee routes;
- responsive, accessible, tenant-isolated behavior.

### Not included in the first release

- arbitrary HTML, JavaScript, or unrestricted CSS;
- arbitrary remote fonts or arbitrary external image URLs;
- drag-and-drop page composition;
- multiple installable themes or per-product page layouts;
- moving collection, product, or page management into Design;
- redesigning payment, shipping, notification, language, administrator, or AI workflows.

Those capabilities can be added after the first publication contract is proven in production. The initial schema is versioned so they do not require another source of truth.

## Settings Information Architecture

`/settings` becomes a flat, grouped index. Each destination is an icon, a short title, and an optional truthful state such as `Bağlı`, `Eksik`, or `2 yönetici`. It does not use large card shells or generic descriptions.

The initial groups are:

1. `Mağaza`
   - Genel
   - Dil
   - Yöneticiler
2. `Satış ve teslimat`
   - Ödeme
   - Kargo
3. `İletişim ve otomasyon`
   - Bildirimler
   - Yapay Zeka
4. `Görünüm`
   - Tasarım

`Hero Banner`, `Promosyon Banner`, and `Kayan Duyuru` no longer appear as Settings siblings. Collections remain under Products because they are catalog data, but Design controls may select a live collection as a destination or content source.

Settings states are optional projections from their owning runtime, not labels inferred by the browser. For example, payment state comes from the active payment-method authority and administrator count comes from current memberships. A destination without a trustworthy state shows no state label; `Hazır`, `Bağlı`, or a count must never be hard-coded.

## Design Workspace Experience

`/settings/design` is an open workspace with three stable regions:

- a compact section rail for `Marka`, `Renkler`, `Yazı`, `Ana sayfa`, `Promosyon`, and `Duyuru`;
- the active section's simple controls;
- a bounded storefront preview, because containment is functional for a preview.

The fixed top bar contains:

- the route identity `Tasarım`;
- `Kaydediliyor`, `Taslak kaydedildi`, `Yayınlanmamış değişiklik`, or an honest failure state;
- desktop/mobile preview controls;
- the primary `Yayınla` action.

There is no duplicate body heading. Desktop uses controls beside the preview. Tablet and mobile show the preview below the controls; the section rail becomes a horizontally scrollable tab row. Interactive targets remain at least 48 pixels high.

### Child-friendly controls

- Image fields show the current image and a `Görsel seç` action backed by the store's media library.
- Color controls combine a visual picker, a swatch, and a validated hex value. Each color has `Varsayılana dön`.
- Fonts come from a curated, locally supported list. Every option previews the store name in that font.
- Destinations use searchable selectors populated from active products, collections, and published pages. `Bağlantı yok` is always available.
- Scheduling uses the store timezone and displays the resolved active period before publishing.
- Enabled controls use direct `Göster/Gizle` language.
- Validation appears next to the affected control and moves keyboard focus to the first invalid field.

## Durable Data Model

Introduce one `saas.storefront_designs` row per store. It contains:

- `store_id` as the primary and tenant boundary;
- `schema_version`;
- `draft_config` and `published_config` as separately validated JSONB documents;
- `draft_version` and `published_version` for optimistic concurrency;
- `draft_updated_at` and `published_at`;
- the principal that last saved and published.

The version-one document contains four exact subdocuments:

- `brand`: media references for logo and favicon, four validated colors, and one allowed font key;
- `hero`: headline, optional body, media reference, typed destination, and enabled state;
- `promotion`: headline, optional body, typed destination, UTC start/end timestamps, and enabled state;
- `announcement`: one to twelve messages, icon, speed, direction, animation, and enabled state.

Media is stored by tenant media identifier, not an arbitrary URL. Public projections resolve those identifiers to safe public media URLs. Destination values are typed references to a product, collection, page, or `none`; the server resolves the canonical path and rejects cross-store or inactive resources.

The schema permits one migration-only `legacy_https` image variant so deployment can preserve a previously published hero image that cannot be matched to the tenant media library. Only the owner migration may create this variant. Admin draft and publication endpoints reject new or changed `legacy_https` values. The editor identifies the legacy image and provides a media-library replacement; after replacement it can never be converted back to a remote URL.

PostgreSQL constraints and security-definer functions validate exact keys, field lengths, colors, enum values, time ranges, media ownership, destination ownership, permissions, and optimistic versions. Direct table access remains revoked from application roles.

## Legacy Data Migration

The deployment seeds `saas.storefront_designs` idempotently for every existing store:

- brand defaults come from the store identity and the starter theme defaults;
- the newest valid active `hero_banner`, `promotion_banner`, and `marquee_setting` records are transformed into the corresponding design sections;
- a hero URL that resolves to an existing tenant media export is converted to its media identifier; any other already-published valid HTTPS hero URL uses the read-only migration variant until the merchant replaces it;
- missing records use explicit starter defaults, never invented merchant activity;
- the initial draft and publication are identical, so deployment cannot visually change an existing storefront.

Legacy merchant-admin records remain immutable audit evidence but stop being writable UI sources. The old routes redirect to anchored Design sections:

- `/settings/hero-banner` to `/settings/design?section=hero`;
- `/settings/promotion-banner` to `/settings/design?section=promotion`;
- `/settings/marquee` to `/settings/design?section=announcement`.

There is no dual-write period and therefore no split-brain behavior.

## API and State Flow

1. The server-authorized Design page loads the tenant's draft, published version, media choices, destinations, store identity, and a small live catalog sample.
2. The client creates a working copy from the durable draft and renders it through shared storefront design components.
3. Valid edits autosave after a short debounce through an idempotent `save draft` endpoint using the expected draft version.
4. A successful save updates the version and top-bar state. Failed saves remain visible and are never reported as saved.
5. `Yayınla` calls a separate idempotent publication endpoint with the expected draft and published versions.
6. PostgreSQL validates the complete document and atomically copies the draft to `published_config`, records the actor and time, increments the publication version, and appends an immutable publication event.
7. The public storefront resolver reads only `published_config`. Draft data is never returned to anonymous storefront requests.
8. Storefront cache keys include the publication version, so a successful publish invalidates the old design without leaking one tenant's configuration to another.

The preview renderer and public storefront renderer share the same contract and visual components. The preview may use the current working copy, but store and catalog facts come from the authenticated tenant APIs. This gives immediate feedback without pretending unsaved data is already public.

## Storefront Behavior

The shared storefront frame consumes the published brand configuration for CSS variables, typography, logo, and favicon. The home route consumes the published hero and currently active promotion. The frame consumes the published announcement strip.

Promotion activity is calculated on the server using UTC timestamps and the current request time. Disabled or out-of-window content is omitted, not replaced by fake promotional copy. Invalid or unavailable design authority fails safely to the validated starter design and emits an operational error; it never exposes draft JSON or another store's values.

## Permissions and Security

- `configuration.read` can view the workspace and preview.
- `configuration.manage` is required to save a draft or publish.
- Every read and mutation derives store authority from the verified panel session, never a browser-supplied store identifier.
- Media and destination ownership are rechecked on every mutation and public projection.
- Arbitrary markup, script, CSS, external font imports, unsafe URLs, and secrets are rejected at the contract and PostgreSQL boundaries.
- Save and publish operations are idempotent and recoverable after an unknown commit result.
- Concurrent edits produce a clear conflict state with a `Son sürümü yükle` recovery action; silent overwrite is prohibited.

## Error and Empty States

- Missing design row: initialize from validated store defaults on the server, then return a real versioned draft.
- Draft save failure: keep the working copy, show `Kaydedilemedi`, and allow retry.
- Publication validation failure: keep the previous publication active and focus the first invalid control.
- Version conflict: preserve the local working copy, show that another session changed the design, and require an explicit reload or comparison.
- Missing media or destination after deletion: mark the affected control as unavailable and prevent publishing until it is replaced or removed.
- Storefront design read failure: keep the storefront available with the validated starter design and log the failure with store and publication identifiers only.

## Verification

Implementation follows failing-first tests and verifies the complete vertical slice:

- Settings information architecture tests prove the grouped, flat index and the absence of separate hero, promotion, and marquee navigation items.
- Contract tests reject unknown keys, unsafe values, cross-store media, cross-store destinations, invalid colors, invalid schedules, and hostile JSON shapes.
- PostgreSQL assertion tests prove tenant isolation, permissions, optimistic concurrency, idempotent recovery, one row per store, atomic publication, and public-draft separation.
- Migration tests prove existing typed settings are preserved and rerunning the migration is harmless.
- API tests cover read, autosave, publish, conflict, forbidden, unavailable dependency, and unknown-commit recovery states.
- Component tests cover every section, honest top-bar state, searchable real-data selectors, desktop/mobile preview switching, validation focus, and keyboard navigation.
- Storefront tests prove published brand, hero, active promotion, and announcement values render while drafts never render.
- Browser verification publishes a reversible Güzide Kuyumcu change, observes it on the real storefront, verifies mobile and desktop layouts, restores the original publication, and checks console/network errors.

## Acceptance Criteria

1. Settings is a grouped open-canvas index with one Design destination and no duplicate appearance routes.
2. Logo, favicon, colors, typography, hero, promotion, and announcement are editable from one simple workspace.
3. Selectors use live tenant media, products, collections, and pages; merchants never enter internal identifiers.
4. Draft save and publication states are truthful and survive reloads.
5. Publishing is atomic, tenant-scoped, versioned, idempotent, and auditable.
6. The real storefront renders only the latest published design and never renders a draft.
7. Existing storefront appearance is preserved during migration and old URLs redirect correctly.
8. Desktop and mobile previews use the shared storefront renderer and match the published result.
9. The workflow is usable without technical terminology, supports keyboard and touch use, and exposes actionable errors.
10. All shared tests, PostgreSQL assertions, type checks, responsive browser checks, and the reversible Güzide publication test pass before deployment.
