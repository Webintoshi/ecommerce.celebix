# Ezmeo Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for implementation; independent header and commerce styles may be delegated.

**Goal:** Give Ezmeo a confident, youthful and fast storefront while retaining all published admin controls.

**Architecture:** Add a UUID-scoped theme to storefront-shared. Reuse CampaignHome, ProductCard, ProductDetailExperience, cart and checkout contracts. A focused header uses current published navigation and shared search/cart APIs; scoped styles improve the existing commerce UI.

**Tech Stack:** Existing Next.js 16 / React 19 / TypeScript / CSS; no new dependencies.

**Spec:** User selected “Bu yönde doğrudan uygula” on 25 October 2026 after reviewing the direction: existing burgundy logo and warm photography, compact navigation, balanced product cards, simpler weight selection and smooth mobile use. This explicitly opts out of another concept/review stage. Research: docs/research/ezmeo/2026-10-25/competitor-design-summary.md.

## Global Constraints

- Exact verified tenant UUID: `7892a771-67a9-42d7-9b36-f4c3e8562e95`; never match names, slugs or hostnames for theme authorization.
- Preserve published brand colors and typography, banner layout/media/ordering, section layout/spacing/ordering/visibility, product image ratio, menu links, product and variant prices, availability and stock policy.
- Preserve cart, favorites, consent, auth, checkout, required footer pages and Celebix signature behavior. No live design/settings/database writes.
- Existing brand snapshot: primary #710F1C, background #F8F8F8, text/accent #171717; Montserrat configured for headings/body. Consume CSS variables, not permanent overrides of these values.
- Current admin image ratio is portrait. Do not force square; square must still work when selected in panel.
- No fabricated promotions, certificates, nutrition, reviews, delivery promises or product claims.
- Existing header layout, style and width selections remain meaningful.
- Keep visible content concise; no new eyebrow labels, fake section headings or ornamental trust rows.
- Reuse the existing attached checkout, preserve pre-existing untracked files, work on codex/ezmeo-theme from de4b3325c.
- User chose direct implementation; no new approval gate or Image Gen concept pass is needed for this code-native restyle of existing published surfaces.

## Review Focus

1. Another tenant with the same display name must not receive this theme.
2. Multi-level published navigation, explicit page destinations and long category names must remain reachable on mobile.
3. Empty, out-of-stock and variable products must keep correct actions and stock policy.
4. Font and image-ratio changes from admin must win over theme CSS.
5. Header overlays must trap focus, dismiss on Escape/navigation and release scroll lock; product navigation must start at top and Back restore catalog context.

## Task 1: Header

Files: themes/ezmeo/EzmeoHeader.tsx, EzmeoHeaderClient.tsx, ezmeo-header.css.
Consumes PublicStorefront and PublicStorefrontDesign. Produces EzmeoHeader with dynamic logo/navigation, compact desktop/mobile controls, real shared search form, accessible category dialog and existing cart action. Preserve header layout/style/width data attributes. No hardcoded commercial content or external image resources.

- [ ] Implement focused server/client header using existing route helpers and providers.
- [ ] Verify nested category navigation, search submit, dialog focus/close, cart opener and route scroll behavior.

## Task 2: Commerce styles

File: themes/ezmeo/ezmeo-commerce.css.
Consumes existing semantic selectors/classes and --store-* variables. Produces tenant-scoped homepage, card, product detail, variant, footer and drawer polish without changing components' data contracts. Respect explicit admin section settings, ratio and layout.

- [ ] Implement scoped styles with responsive sizing, clear selected states, gentle focus states and reduced-motion support.
- [ ] Verify cards in both ratio modes, long names, variants, footer and purchase actions at desktop/mobile widths.

## Task 3: Integrate, verify and hand off

Files: theme.ts, theme.test.ts, themes/visual-theme.ts, StorefrontFrame.tsx, Header.tsx, app/layout.tsx, preview fixture only if needed.
Produces ezmeoThemeFor(Pick<PublicStorefront,'id'>) returning 'ezmeo-deniz' for only the verified UUID.

- [ ] Add UUID isolation tests first; see them fail before implementation.
- [ ] Wire theme union, frame marker, header branch and scoped CSS imports. Checkout uses the same shared flow and published variables.
- [ ] Run focused storefront tests, typecheck and production build; run exact candidate signup release guard before any shared publication.
- [ ] Inspect rendered local real-contract fixture in browser on desktop, 390px and 360px; verify menu, search, variant/cart, favorites and scroll restoration without real payment or customer submissions.
- [ ] Independent whole-diff review; fix material regressions and record evidence.
- [ ] Commit only task-owned files. Deployment requires a reviewed fresh release baseline and existing shared guards; user requested theme work, so do not claim live release unless actually completed and verified.

## Progress and decisions

- Research complete: official Züber, Wefood and Servet home/category/product pages; root inspected desktop/mobile home screens.
- Authoritative read-only native lookup confirmed Ezmeo UUID and published design version 23; no record changed.
- Direct implementation authorized; reuse existing architecture rather than inventing a hardcoded home page.
- Ruling: no separate image-generated concept because the user explicitly chose direct application over a visual proposal; use existing approved brand/media and code-native components.

- User resource constraint (25 October): sequential local checks only, low priority and capped memory; no parallel test suites/builds/dev servers. Thirty focused tests passed with --test-concurrency=1 and 384 MiB heap. Previous full suite was interrupted, not a passing full-suite result.
