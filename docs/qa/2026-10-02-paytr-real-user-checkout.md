# Güzide real-user PayTR checkout — 2 October 2026

## Scope and evidence

The user requested a real normal Chrome checkout of Güzide's Test product, quantity one, 10.00 TRY. Customer contact/address details and the card were supplied by the user. No card data or private customer contact data is included in this record. No card data was entered by the agent.

The authorized PayTR payment button was clicked once. Chrome then displayed a blocked frame. Its actual Console reported that framing `https://inbound.apigateway.vakifbank.com.tr` violated the merchant policy `frame-src https://www.paytr.com`. This is an observed bank ACS navigation, not an inferred provider error.

## Bank frame correction

Commit `ebdd5dad561dd9ce6f74570da44ce6236fae9628` adds a bounded shared payment-frame policy: exact PayTR origin, observed exact Vakifbank HTTPS origin, and the verified merchant's `/odeme/hizli/sonuc` return path. Existing Iyzico origins retain only their original origin permission. Invalid provider origins and unsafe merchant names fail closed. The return bridge's authentication and nonce policy remain intact.

Verification: RED observed, then 44/44 relevant tests; shared storefront typecheck, production build and independent security review passed. Both shared storefront deployments finished:

- NET: `z565qqs24w7w8nbhvviido2c`
- SITE: `q14b3uqzpjb4jqh325yrmcar`

Post-release private snapshot verification reported global idle, exact commit and preserved configuration. Running image/source/manifest/generated artifacts were independently verified. NET remains noApproval; SITE canonical TEST/LIVE execution identities and database authority match their prior approved identities.

## Current payment evidence

The bank ACS page did not complete. The user reported that no transaction appeared in the card activity. This alone is not used to declare a payment failed.

The submitted attempt expired its local presentation/hold while investigation continued. It was moved to `provider_outcome_unknown` using the existing durable operation, exact store/attempt/session/cart/version/credential/amount/real-expiry checks and a successful rollback rehearsal. The approved LIVE reconciliation runtime queried only this submitted attempt and returned `processing`. No callback or paid order was synthesized; no payment cancellation or second card submission was made.

The merchant PayTR panel confirms its callback URL is `https://guzidekuyumcu.com/api/payments/paytr/callback`. It reports actual callback delivery failures: HTTP 400 / INVALID, with automatic retries. The panel's payment status is `-`; this is not interpreted as a successful or failed payment. The binding, LIVE amount and approved database execution authority were found and matched in a read-only check.

## Callback investigation

The existing generic callback outcome diagnostic recorded success callbacks only, leaving failed callback rejection opaque. Finite diagnostic classes are added for status, total amount shape, payment context presence, payment type, test mode and generic outcome. They contain no raw amount, provider ID, hash, reason message, card data, headers or credential. Authentication and HTTP behavior are unchanged; diagnostic exceptions cannot alter acknowledgement.

Verification: RED observed, then 42/42 relevant callback tests and typecheck passed. Genuine fixture signatures preserve failed → OK and wrong hash → INVALID with logging absent, active or throwing. Adapter source and execution manifest are unchanged. Diagnostic deployment and the actual callback rejection classification are pending at this record's initial commit.

## Acceptance still pending

A successful real bank authentication, genuine successful provider callback, paid WEB order, 10.00 TRY total and exactly-once inventory effect have not yet been verified. The current unknown outcome must be resolved before another charge attempt. Evidence screenshots and reviewed operational scripts are private under `.tmp/paytr-real-checkout-20261001/`.
