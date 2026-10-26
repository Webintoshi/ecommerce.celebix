# Customer detail and search polish — 2026-10-26

## Observed issue

Authenticated NET screen confirmed the search action used the soft neutral fill and detail scattered nine sections across eight framed cards. Name, status and edit actions were repeated. Mobile financial summary followed activity.

## Changes

Two runtime files only. Search now uses graphite/inverse tokens with dark hover, pointer, native submit and single 2px keyboard focus. Detail has three outer surfaces: profile/contact/facts/metadata, order history plus internal notes, and customer information. Canonical edit remains once. Removed only duplicate breadcrumb name, status badge and two redundant edit entry points. All contact, date/version, order/payment, address, consent, taxonomy and note facts remain. Controller/import/helper bytes and authority gates are preserved. Shared shell gap is 24px.

## Verification

- Regression first failed against original source for missing profile hierarchy and soft search fill; then all five new behavior/CSS tests passed.
- Existing focused customer suite 34/34 passed; Customer Panel typecheck exited 0.
- Root repeated new regression and changed existing assertion files: 14/14 passed.
- CUA rendered actual production components in unchanged isolated fixture at 1440, 1024 and 390px: zero page overflow, exactly three surfaces, financial summary before activity. Screenshots independently reviewed by Atlas.
- Enter search returned only Deniz; Ara computed graphite rgb(43,43,43), inverse rgb(255,253,252), 44px height, pointer. Keyboard focus was 2px outline with no shadow.
- Local simulated version conflict preserved typed note; read-only/archived disallowed edit/note/archive; taxonomy disabled read-only; locked growth retained facts; empty sections truthful; service error recovered through actual Tekrar dene.
- No live merchant data writes. No dependencies, assets, global font, API/auth/schema/payment or environment changes.

## Render evidence

Final screenshots: `/Users/Celebix/.codex/visualizations/2026/09/25/01a0d5e7-979f-74e0-a9a5-657befede0df/customers-detail-polish-{1440,1024,390}.png` and `customers-detail-polish-search.png`.

## Release

Both shared runtimes require fresh exact-candidate source/build/signup/provider/compiled/runtime acceptance before completion is reported. Root release journal remains private under `.tmp/customers-detail-polish-release-20261026`.
