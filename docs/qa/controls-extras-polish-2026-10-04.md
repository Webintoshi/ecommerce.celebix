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

Pending exact combined source, production build, fresh release guards and serialized normal two-panel rollout after the coordinated Stock release. Storefront witnesses and existing backend contracts must remain unchanged.
