# Dashboard controls, analytics and Extras polish

## Scope and task inventory

Customer Panel presentation only. Keep #f8f7f5, neutral controls, modest orange, approved flat outline SVGs and minimal copy.

- Dashboard: inspect active visitors and sales; change today/week/month/year; retain full date range in the accessible description; enter store sale via /orders/quick-links. Visitor polling, visibility pause, cancellation, loading and unavailable values are unchanged.
- Analytics: keep all five tabs, query-backed date/compare/currency/filter controls, pagination, retry and detailed worker diagnostics. Remove the two requested delay phrases without claiming delayed measurements are current. Genuine missing traffic warnings remain.
- Extras: create, search name/slug/description/category, filter type, clear filters, preview, edit, archive with confirmation/version checking, category retry and readonly access. Creation is one main-canvas CTA; empty state adds a lightweight inline illustration.
- No production API, database, authentication, promotion, payment or inventory changes.

## Local verification

- Existing dashboard behavior checks: 2/2 pass (topbar controls appear once; changed period does not show retained analytics under the new range).
- Existing Extras behavior suite: 10/10 pass.
- Existing analytics workspace behavior suite: 15/15 pass.
- Focused analytics presentation checks: 3/3 pass. Two unrelated full analytics-console baseline failures remain unchanged (abandoned-cart copy and settings count); they reproduce on the untouched baseline.
- Independent static review: no P1/P2 findings.
- Browser 1440, 1024 and 390 px: page-level horizontal overflow 0 on dashboard, analytics and empty Extras. Listed Extras also has overflow 0 at 390 px.
- Dashboard native period selection changes value and its full accessible range; 44 px control height. Mobile retains complete period text after removing the old narrower 390 px override. Keyboard focus has a visible outline.
- Empty Extras CTA activated with Enter opens the actual two-type chooser. Search no-match and clear return the original row. Error state keeps retry and creation; readonly empty state has no creation action.
- Delayed-worker fixture: requested delay phrases absent, no false fresh label. Detailed worker retry=2, oldest=480 seconds and delivery statistics remain available. Combined missing-traffic fixture keeps the genuine traffic unavailable warning.
- Console observations: browser extension adds a __processed_* body attribute before hydration, producing the same dev-only hydration diagnostic across fixture routes; no application exception was observed.

Fixtures are isolated test routes with memory responses; no live customer record was created, saved or archived.

## Release

Published combined source `4c477071f86bf0053bb95fd7ca25c04b5204f50e` through the coordinated, serialized normal two-panel rollout:

- NET: `sin13ehzluhyklg1xqwt3mhj` — finished.
- SITE: `my2j4w4lhuf0sajrjm96pcf6` — finished.
- The seven UI production files remain byte-identical to the approved `2fa18642` UI candidate. The separate large-stock-list read fix is documented in `stock-workspace-2026-10-04.md`.
- Exact combined production build reports exit 0 and 95 generated pages. Independent inspection found all five UI feature groups in its actual compiled chunks. The release coordinator verified both running images, source, 14 routes, eight combined feature groups and the balance read limit.
- Final native, financial, payment and raw configuration guards passed; global deployment queue was idle. Storefront witnesses remain `7d864534c4f3d71f6a20717135aa20ded2a03f15`.

## Live browser acceptance

Authenticated Chrome checks used the actual Güzide and Butik Siora panels; no live record was created, saved or archived.

- Both at 1471 px: flat Extras illustration and one main-canvas CTA; Enter opens the actual two-type chooser. Dashboard has compact visitors, 44 px period and store-sale controls, working today/month selection and the full accessible date range. Analytics loads real data with the compact visitor indicator; both requested delay phrases are absent, including with diagnostics expanded. Genuine missing-source information and worker counters remain available. No page-level horizontal overflow at this size.
- Actual Güzide at 390 × 844: Extras CTA is 44 px high and reachable; Extras and Analytics have zero page-level horizontal overflow. Dashboard header fits 390 px and retains the complete “Bu hafta” label and accessible date range.
- Existing dashboard limitation outside these changed controls: filled recent-order rows retain an unchanged `min-width: 580px` rule, producing horizontal page overflow at 390 px. The table rules are unchanged between the live baseline and this release; the header itself does not overflow. Do not infer full-dashboard mobile overflow acceptance from the empty fixture.
- Temporary viewport override was reset after verification. Nine live screenshots are in `evidence/controls-extras-polish/live-*.jpg`; the Güzide Extras tab was left as the deliverable.

This receipt and screenshots are documentation only; the running source remains `4c477071` and needs no additional deployment.
