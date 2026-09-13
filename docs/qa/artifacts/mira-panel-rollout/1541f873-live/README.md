# Mira authenticated staging capture matrix

Evidence type: authenticated Customer Panel staging QA, not fixture evidence.

- Runtime URL: `https://admin.guzidekuyumcu.com.tr`
- Coolify application: `celebix-panel-staging-auth01`
- Deployed application source: `1541f873e70098fe46e2d0bd9f8847c39c2d1f22`
- Application source validated by the retained full suite: `1dbfb7f553ce1415eb2b6190106e3e68f804f073`
- Deployment ID: `oybegs8djzvx57yg0xy8rub9`
- Running container: `yk1h6d97z7ex0h74ok3zrj5c-191817054688`
- Capture date: 2026-09-12

The commits between `1dbfb7f5` and the deployed candidate change only `docs/qa/**`; they do not change Customer Panel application source. The retained test result is 1414 pass, 0 fail, 1 existing opt-in skip. No successful live mutation, payment/refund/provider call, physical barcode print, merge or production deployment was performed.

The Customers captures use a synthetic no-result query so no real customer record is present. The remaining captures contain only empty creation forms, fixed policy UI, or the minimum authenticated merchant catalog context needed to exercise the barcode editor.

| Package / authenticated route | 1440×900 | 1024×900 | 390×844 |
|---|---|---|---|
| Customers — `/customers`, synthetic empty search | [JPG](customers-search-empty-1440x900.jpg) | [JPG](customers-search-empty-1024x900.jpg) | [JPG](customers-search-empty-390x844.jpg) |
| Catalog — `/products/new`, empty form | [JPG](catalog-new-1440x900.jpg) | [JPG](catalog-new-1024x900.jpg) | [JPG](catalog-new-390x844.jpg) |
| Stock / Barcode — `/products/barcode-labels`, client-side editor | [JPG](stock-barcode-editor-1440-viewport.jpg) | [JPG](stock-barcode-editor-1024-viewport.jpg) | [JPG](stock-barcode-editor-390-viewport.jpg) |
| Promotions — `/discounts/new`, template chooser | [JPG](promotions-new-1440x900.jpg) | [JPG](promotions-new-1024x900.jpg) | [JPG](promotions-new-390x844.jpg) |
| Order-adjacent — `/orders/quick-links`, empty form | [JPG](order-quick-links-1440x900.jpg) | [JPG](order-quick-links-1024x900.jpg) | [JPG](order-quick-links-390x844.jpg) |
| Settings / Content — `/content/policies`, edit drawer without save | [JPG](settings-policy-edit-1440x900.jpg) | [JPG](settings-policy-edit-1024x900.jpg) | [JPG](settings-policy-edit-390x844.jpg) |

All 18 captures were made with explicit browser viewport overrides matching their matrix column. Measured document horizontal overflow was 0 on every representative surface. The current QA tab returned 0 browser console warnings/errors after the route pass.

PR #75 Orders list/detail presentation is not included in this candidate. The order-adjacent evidence is limited to quick links, drafts and abandoned carts; it must not be described as Orders list/detail acceptance.
