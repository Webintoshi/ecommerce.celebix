# Modular Homepage Builder and Quality Score Design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı
**Date:** 2026-08-11
**Target:** `apps/customer-panel` design workspace and the shared starter storefront

## Goal

Replace the two competing homepage-editing experiences with one simple, visual, server-authoritative **Ana sayfayı düzenle** workflow. A merchant must be able to add, configure, hide, remove, and reorder safe storefront sections without understanding theme internals. The builder must calculate a deterministic 0–100 quality score that rewards a complete, usable storefront rather than merely counting sections.

## Current Problem

The repository currently exposes the same `StorefrontDesignDocument` through both the newer visual canvas and the older `StarterThemeComposer`-style section editor. Both eventually change `composition.sections`, but they present different controls and make the merchant believe there are two homepage authorities. Category showcase editing has also historically existed as a separate management surface. This creates duplicated decisions, stale projections, and a failure mode where an empty or partially reconciled composition can make the storefront unavailable.

The existing ordered `composition.sections` array is the correct foundation. It already supports hero, category, product, campaign, brand-story, value-proposition, and testimonial content. The new design keeps that authority, gives every editable section a stable identity, and makes every editor surface project the same draft.

## Product Principles

1. There is one homepage editing authority and one visible entry named **Ana sayfayı düzenle**.
2. Direct manipulation is primary: the merchant works on a realistic live preview rather than a long configuration form.
3. Every action has a plain-language label suitable for a first-time merchant.
4. Safe defaults are always available; deleting all optional content must never make the storefront return 503.
5. Draft changes autosave, but the public storefront changes only after an explicit `Yayınla` action.
6. The quality score is advisory and educational. It never invents content and never replaces strict publication validation.
7. Tenant, store, catalog, media, and publication authority remain server-owned. Browser state is never an authority source.

## Chosen Architecture

### One visual builder

`/settings/design` remains the design route. The existing duplicate homepage controls are removed or converted into links that open the same builder location. The top-level action and canvas label are both **Ana sayfayı düzenle**; there is no second section composer that can write independently.

On desktop, opening the builder presents a focused overlay with three coordinated regions:

- **Left — Bölümler:** a visual section library with short descriptions and previews.
- **Center — Canlı önizleme:** the current draft rendered with real design tokens and responsive storefront components.
- **Right — Bölüm ayarları:** only the settings for the currently selected section.

On narrow screens these regions become three consecutive steps: `Bölüm seç`, `Düzenle`, and `Önizle`. The same draft and commands power both layouts.

The hero remains the first homepage surface. Body sections are inserted after it. The hero can be enabled or disabled but cannot accidentally be dragged into the middle of body content. Header, announcement, product detail, cart, and footer remain site-wide surfaces and do not appear as reorderable homepage sections.

### Section library

The initial library is intentionally limited to components already supported by the shared starter storefront:

| Section | Multiplicity | Merchant controls |
| --- | --- | --- |
| Kategori vitrini | One | Heading, layout, categories, category images, visibility |
| Ürün bölümü | Up to four | Heading, latest/sale/category source, category, 4/8/12 products, visibility |
| İkili kampanya | One | Two images, copy, destinations, visibility |
| Marka hikâyesi | One | Eyebrow, heading, body, image, destination, visibility |
| Değer önerileri | One | Two to four verified merchant messages and approved icons |
| Müşteri yorumları | One | Heading, approved-review source, limit, minimum rating |

Sections may be added by clicking **Ekle** or dragging a library card into the preview. Existing sections can be reordered by a dedicated drag handle. `Yukarı taşı` and `Aşağı taşı` buttons remain available for keyboard and touch users. Product sections may be duplicated within the four-row limit; singleton sections cannot be duplicated.

Each selected section exposes exactly five common actions when applicable: `Düzenle`, `Göster/Gizle`, `Çoğalt`, `Yukarı/Aşağı taşı`, and `Kaldır`. Removing a section requires a local confirmation inside the builder and supports one-step `Geri al` until the next destructive action.

### Stable, versioned data model

Introduce a new composition schema version in `@celebix/saas-contracts`. Every section receives an immutable `sectionId` generated by the server or by the trusted draft command model and validated server-side. Section IDs make repeated product rows, drag ordering, focused editing, React keys, and audit messages deterministic.

The next `StorefrontDesignDocument` version consumes the new composition type. Parsers continue accepting existing document/composition versions and normalize them into the new in-memory model. Legacy records receive deterministic stable IDs during normalization and are written back only through the normal versioned draft save. The public storefront projection does not expose editor-only IDs unless a renderer key is required.

The JSON document remains the single persisted homepage authority. No new homepage table, browser cache authority, category-showcase write path, or client-only shadow copy is introduced.

Server validation enforces:

- unique, canonical section IDs;
- no unknown section kinds or keys;
- no more than twelve body sections;
- no more than four product rows;
- singleton multiplicity for all other initial section kinds;
- valid category, product-source, media, page, and destination references;
- bounded text, item counts, and image metadata;
- exact ordering as submitted in the validated draft;
- rejection of cross-store resource references.

### Command model

The UI does not mutate nested arrays ad hoc. A pure command layer owns all homepage changes:

- `addHomepageSection`
- `duplicateHomepageSection`
- `moveHomepageSection`
- `updateHomepageSection`
- `setHomepageSectionVisibility`
- `removeHomepageSection`
- `restoreRemovedHomepageSection`

Every command returns a new frozen document or a typed, safe error. The same command tests cover mouse, touch, keyboard, and arrow-button entry points.

## Quality Score

The score is a pure, deterministic projection of the current draft plus server-authoritative catalog, media, destination, policy, and publication metadata. The browser may show an immediate preview, but save and publish responses contain the server-recomputed result. The score itself is not persisted as authority.

### 100-point rubric

| Area | Points | Requirements |
| --- | ---: | --- |
| Hero and first impression | 20 | Enabled usable hero, desktop media, mobile-safe media/fallback, meaningful destination and alt text |
| Category discovery | 20 | Enabled category section, valid active categories, distinct real images, valid category destinations |
| Shopping readiness | 20 | At least one enabled product row resolving to available products, meaningful heading, valid source and collection destination |
| Trust and reassurance | 15 | Complete custom value propositions and reachable required policy/footer links |
| Content quality | 15 | Useful headings and calls to action, no placeholder text, no empty enabled section, healthy section variety |
| Mobile and accessibility | 10 | Valid image ratios, alt text, keyboard-safe ordering, mobile-compatible configuration and no unresolved references |

The rubric does not require every section kind. A concise, high-quality page can reach 100. Adding an empty or redundant section never increases the score.

### Score presentation

The top bar shows a compact circular score and one plain-language state:

- `0–39 Başlangıç`
- `40–69 Gelişiyor`
- `70–89 Güçlü`
- `90–99 Çok iyi`
- `100 Çok başarılı bir ana sayfa oluşturdunuz`

Selecting the score opens **Puanımı nasıl yükseltirim?**, containing no more than five ordered, actionable recommendations. Examples are `Kategori kartlarına gerçek görsel ekleyin`, `Ürün bölümünüz henüz aktif ürün göstermiyor`, and `Banner bağlantısını seçin`. Completing an item updates the preview score immediately and the authoritative score after autosave.

Publishing below 100 is allowed when strict design validation passes. The merchant sees a warning, not a blocker. Existing hard failures—such as an enabled hero slide without required media—remain publication blockers.

## Draft, Publish, and Failure Behaviour

All edits use the existing optimistic draft version and serialized autosave chain. Dragging emits one final reorder command on drop rather than saving each pointer movement. The preview changes locally immediately; the status reports `Kaydediliyor`, `Taslak kaydedildi`, `Başka bir oturumda değişti`, or `Kaydedilemedi`.

Publication resolves the current tenant and store again, validates the complete document, resolves every referenced resource against the store, recomputes the score, and atomically publishes an immutable snapshot. A failed publication never modifies the last public version.

An empty section array is valid. It renders the safe site shell, header, optional hero, and footer without a body section. The editor displays an inviting empty state with `İlk bölümünüzü ekleyin`; the storefront must not return 503. Invalid legacy data is normalized when safe and rejected with a controlled editor error when unsafe. It is never silently replaced with another store's data.

## Accessibility and Child-Simple Language

- Every interactive target is at least 48×48 CSS pixels.
- Drag handles expose accessible names and keyboard instructions.
- Reorder results are announced through a polite live region.
- Focus returns to the originating section card after closing its editor.
- Modal focus is trapped; Escape closes the current settings level without losing saved changes.
- Section cards use a thumbnail, a one-line purpose, and one primary `Ekle` action.
- Technical words such as schema, source key, UUID, or projection never appear in merchant copy.
- Reduced-motion mode removes drag and panel animations without changing functionality.

## Security and Authority Boundaries

- `TenantContext` and store identity stay on the server and never cross into client section commands.
- Resource options are projected by the server for the active store only.
- Draft and publish routes keep their existing same-origin, session, method, content-type, size, and version checks.
- Section IDs are identifiers, not authorization.
- No arbitrary HTML, CSS, JavaScript, remote iframe, raw URL, or unapproved media source can be stored in a section.
- Public storefront rendering consumes only the immutable published projection.
- Logs and analytics must not contain session credentials, cookies, draft bodies, or private catalog data.

## User-Class Verification

Testing must model real merchant behaviour, not only component internals.

### User class A — First-time merchant

A clean account opens `Ana sayfayı düzenle`, understands the section library without documentation, adds category and product sections, edits their visible copy, reorders them, sees the quality recommendations, publishes, reloads, and observes the same order on the real storefront.

### User class B — Catalog-heavy merchant

A store with more than one thousand products and nested categories configures category-sourced product rows, searches category choices, reorders multiple product sections, and publishes without client hangs, oversized requests, cross-store results, or placeholder products.

### User class C — Mobile merchant

At a 390×844 viewport, the merchant adds a section through the stepped builder, edits it, moves it, reads the score, and publishes without horizontal overflow or controls covered by the bottom action bar.

### User class D — Restricted panel member

A member without design-management permission can inspect the published design and score but cannot add, reorder, save, upload, or publish sections. Direct API attempts remain denied.

### User class E — Recovery and conflict

Two sessions edit the same draft. The stale session receives a controlled conflict, cannot overwrite the newer draft, can reload safely, and sees the authoritative order. Network failure during autosave keeps the local draft visible with a retry state; the public storefront remains on the last published version.

### Required user-flow assertions

- only one visible homepage-editing entry exists;
- click-to-add and drag-to-add produce the same document;
- drag, keyboard reorder, and arrow reorder produce the same order;
- removing every optional section does not cause a 500/503;
- undo restores the exact removed section and position;
- score preview and server score match;
- empty, placeholder, broken-reference, and cross-store content does not earn points;
- score changes do not silently publish;
- reload preserves the saved draft order;
- publication preserves the exact section order in the storefront;
- mobile and desktop previews use the same document;
- no production or unrelated service is contacted during isolated tests.

## Test Strategy

1. **Contract tests:** schema upgrades, strict parsing, stable IDs, multiplicity, size limits, unknown keys, and legacy normalization.
2. **Pure model tests:** every command, undo, score rubric, score recommendations, order stability, and immutable returns.
3. **Repository tests:** tenant isolation, optimistic version conflicts, exact JSON round-trip, publication snapshot, and empty composition.
4. **HTTP tests:** session/origin/method/content-type/body-size protection and authoritative score responses.
5. **Component tests:** single entry, library cards, modal/step behaviour, drag and keyboard parity, focus restoration, live region, and 48px targets.
6. **Storefront tests:** exact published order, each supported section renderer, empty homepage resilience, mobile layout, and no placeholder leakage.
7. **User-class browser tests:** the five user classes above against isolated staging with genuine session and server APIs.
8. **Regression tests:** customer-panel, shared storefront, Owner, typecheck, build, secret scans, forbidden browser-authority scans, and production-impact checks.

## Delivery Boundaries

This feature changes the existing customer-panel design experience, shared storefront design contracts/data projection, and shared starter storefront renderer. It does not create another admin application, a theme marketplace, arbitrary page scripting, a second homepage service, or production activation. Staging deployment and authenticated browser acceptance occur only after the code, migrations if genuinely required, tests, commit history, and security review are complete.

## Acceptance Criteria

The work is accepted when a novice merchant can construct and publish a responsive homepage through the single builder; the exact server-authoritative section order appears on the storefront; the quality score and recommendations are truthful; all optional sections can be removed without storefront failure; all five user classes pass; legacy designs remain readable; and no second homepage write authority remains.
