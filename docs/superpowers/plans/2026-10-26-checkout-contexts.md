# Independent checkout contexts

## Observed failure

A fresh checkout returned the latest pending cart payment before considering the submitted operation or contact. One hostname-wide hosted cookie and generic result route then selected another tab's payment. Multiple browser tabs are supported normal behavior.

## Contract

- Each explicit hosted operation gets an immutable native context (V4); existing V3 price/customer/promotion/hold/provider machinery remains authoritative. Same operation replay remains idempotent.
- Context UUID in a local path is a selector, never authorization. A Secure HttpOnly SameSite=Lax cookie scoped to that exact payment path supplies the existing hashed credential. Status/presentation verify both credential and the exact host-derived session; no latest-cart/global-cookie fallback.
- New operation snapshots submitted delivery, customer, items, amount and its own stock/promotion holds. Other contexts may coexist on the same source and settle out of order. Stock, expiry and usage caps remain enforced per context.
- Legacy sessions keep their admission uniqueness. A legacy V3 cart payment can settle after a new marked context converts its source only with captured-context + exact source/version/conversion-time provenance. Old expired payments are never marked paid or failed by this migration.
- New payment contexts never overwrite global guest customer/receipt cookies. Initial quotes retain existing behavior. A contact-aware native280 preflight binds the submitted exact contact and owned source to a private operation pricing context. Its eligibility credential is never exposed to the browser. Quote, hosted authority/begin and offline completion use that same context; a changed public total requires another explicit confirmation before payment. Real WhatsApp account sessions, native exact contact matching and existing customer promotions remain unchanged.
- Authenticated bank callbacks select the context after signature and immutable native settlement checks. PayTR iframe return sends a fixed navigation-only same-origin message to its own parent; the parent selects its own local result path. No token, outcome or customer data is sent in this message.
- Core provider adapters, initialization URLs, execution authority/profile/credential versions remain unchanged.

## Verification and publication

Focused runtime/repository/route/UI tests, native real PostgreSQL parallel/replay/provenance/stock/promotion fixtures and rollback rehearsal. Mandatory current + historical signup proof; official local owner, panel and storefront builds. Root reviews actual full native catalogue delta, applies279 and280 atomically under canonical lock, then publishes storefront NET followed by SITE. Four owner/panel source/runtime witnesses remain unchanged. Final browser check uses no card charge or callback replay.
