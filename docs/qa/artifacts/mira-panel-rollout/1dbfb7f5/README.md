# Mira panel rollout visual matrix

Application source: `1dbfb7f553ce1415eb2b6190106e3e68f804f073`

Captured: 2026-09-12 from the isolated Customer Panel acceptance fixture at `127.0.0.1:3517`. These images render the real frontend components and controlled fixture records; they are not authenticated or live-store evidence.

The package-level matrix uses the required 1440, 1024, and 390 px widths. Every capture below was taken after its target content loaded. Measured page-level horizontal overflow was `0`, no framework error overlay was present, and the current-page browser error/warning read was empty.

| Package / route | 1440 | 1024 | 390 |
|---|---|---|---|
| Customers — `/mira-customers/list` | [PNG](customers-list-1440x900.png) | [PNG](customers-list-1024x900.png) | [PNG](customers-list-390x844.png) |
| Catalog — `/mira-catalog/new` | [PNG](catalog-new-1440x900.png) | [PNG](catalog-new-1024x900.png) | [PNG](catalog-new-390x844.png) |
| Stock/barcode — `/mira-stock/barcode` | [PNG](stock-barcode-1440x900.png) | [PNG](stock-barcode-1024x900.png) | [PNG](stock-barcode-390x844.png) |
| Promotions — `/mira-promotions/new` | [PNG](promotions-new-1440x900.png) | [PNG](promotions-new-1024x900.png) | [PNG](promotions-new-390x844.png) |
| Order-adjacent — `/mira-order-adjacent/quick-links` | [PNG](order-quick-links-1440x900.png) | [PNG](order-quick-links-1024x900.png) | [PNG](order-quick-links-390x844.png) |
| Settings/content — `/mira-settings/policy-edit` | [PNG](settings-policy-edit-1440x900.png) | [PNG](settings-policy-edit-1024x900.png) | [PNG](settings-policy-edit-390x844.png) |

Interaction proof: [390 px customer search filtered to Ada QA](customers-search-390x844.png). The controlled search retained `Ada QA`, removed `Deniz QA`, kept the query `Ada`, and measured page overflow `0`.

This matrix proves representative package rendering at the three required breakpoints. It does not certify every route, a physical barcode print, a real provider mutation, or an authenticated merchant session.
