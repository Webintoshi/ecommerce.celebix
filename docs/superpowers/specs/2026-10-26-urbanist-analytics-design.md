# Urbanist and analytics — approved implementation scope

The user approved the interactive Urbanist analytics and variant product concepts on 26 October 2026 and requested implementation of the panel-wide font and analytics screen, with frontend optimization. Product creation itself is not part of this implementation.

## Approved direction

Use the existing graphite navigation, warm `#F8F7F5` analytics canvas, off-white surfaces, thin neutral boundaries, compact controls and restrained Celebix orange. Use Urbanist for inherited Customer Panel interface text. Preserve functional monospace and storefront font previews. Keep page identity semantic without decorative titles or repeated introductions.

The analytics overview has one five-metric strip, a focused lightweight sales chart, a visitor/context column, a product table, source bars and a compact journey. Preserve all existing detail views and every available data field through primary or secondary presentation. Live numbers and country totals must have honest, explicit scopes. The concept's example cities and historical live bars cannot be fabricated from the active-count-only API.

## Function inventory

- Primary task: assess actual sales, visitors and conversion, then inspect products, acquisition, funnel or carts.
- Five URL-driven tabs; today, 7/30/90 days, custom dates/timezone and comparison.
- Tab-specific filters, applied count, reset, keyboard navigation, focus-contained mobile filters, URL history and pagination.
- Currency separation, current/prior sales, daily sales/order tables, paid orders, traffic, conversion, cart/recovery metrics, largest measured drop, measured journey, products and dimensions.
- Loading layout, recoverable request errors, partial measurements, real zero versus unavailable values, stale-request abort protection and worker disclosure.
- No new backend contracts, SQL, auth, tenant, payment or business calculations.

## Implementation decisions

Self-host one normal Urbanist variable WOFF2 using `next/font/local`, preload and swap, with a metric-adjusted system fallback. Preserve Turkish and currency fallback. Urbanist has proportional figures; right-align comparable amounts instead of claiming it supports tabular figures.

Retain SVG charts and existing endpoint/poll behavior. Reuse Intl formatters, index product metrics/acquisition joins once, memoize substantive overview derivations. Do not introduce a chart library, cross-tenant response cache or extra API requests.

Canonical base: `e6ac39db4974155c0d92dc0afab51be14c3fe6ad`. Preserve every current runtime pin by ancestry. The unrelated old primary branch is excluded. Root is the coordinated release owner; publish both shared Customer Panel applications, NET then SITE, with fresh guarded metadata and source/asset acceptance.
