# Akbank browser return incident plan

## Observed evidence
Ezmeo's latest 109 TRY attempt had only begin + form_post_ready, with no callback events. Existing authenticated reconciliation recovered it after 16 minutes and created one paid order. No operator changed money/order rows or called a sale. The original raw callback was not logged, so its precise rejection trigger is unknown. Private incident receipts retain the exact identifiers.

## Confirmed defects and scope
1. Real browser customer returns can contain unrelated cookies, >32 bounded headers or ordinary chunked proxy transport; current customer-return reader rejects them before signature verification. Accept these bounded transport shapes only for the fixed Akbank/iyzico return providers; discard cookies, never use them as payment authority. Preserve PayTR server acknowledgment policy.
2. Runtime incorrectly treats X-Forwarded-For comma chains as host authority; trusted tenant authority remains proxy token+single canonical host+HTTPS.
3. Production default factory drops isStandardCheckoutContext, despite the real default runtime providing it. Forward the function so verified standard payments return to their exact multi-tab context instead of the quick-order result route.
4. Failed customer return shows raw INVALID. For browser navigation only, retain failed HTTP status and show a static, non-authoritative recovery view that never claims failure/success or offers a new payment. Add bounded finite diagnostics without body, URL, cookies, identifiers or credentials.

## Execution
- Add RED regressions, including real Akbank HMAC+authenticated1010 fixtures, real trusted-host selector, production factory context wiring and safe customer error response.
- Fix isolated reader/runtime/factory only. Adapter closure, hash rules, merchant/terminal/attempt/currency/amount binding, native settlement and all financial rows stay unchanged.
- Run focused tests, typecheck, full relevant suite, source-bound signup guard and official shared storefront build/generator checks. Native proof refresh only via disposable PG16 if stale.
- Independent security/release review. Publish shared storefront NET then SITE under canonical lock; all owner/panel/Main models/env and native catalogue remain witnesses. No paid transaction and no bank callback replay.
- Verify Ezmeo recovered order in authenticated panel and shared public result/error response behavior; report that an additional real-bank return has not been exercised automatically.
