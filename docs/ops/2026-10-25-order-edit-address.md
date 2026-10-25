# Order editing and Basit Kargo compatibility

## Findings

- Modern storefront orders store the delivery recipient separately from the
  address snapshot. Order detail already supplies that recipient on reads;
  the edit workspace returned the raw address and failed its strict parser.
- Preparing an order does not create a carrier shipment. The controlled flow is
  package measurements, quote, carrier choice and explicit shipment creation.
- A real quote request exposed a second issue: the Basit Kargo response includes
  documented fields that the existing exact provider parser rejected.

## Implementation

- Native276 reuses the established order-detail shipping-address projection for
  non-POS orders. POS address handling, stored snapshots, money, stock, access
  checks and strict edit intents retain their existing behavior.
- Initial edit-read failures have read-specific recovery text; uncertain saves
  and restored operations retain their existing recovery protections.
- Update only the documented provider response compatibility, retain bounded
  validation and controlled shipment creation, and clarify failed quote retry.

## Verification and rollout

- Native regression exercises the real missing-recipient case through the
  shared parser, preview, unchanged business records and guarded rollback.
- Exact 2,060-routine catalogue rehearsal changes one reader definition and
  preserves the other 2,059 routines and all authority metadata.
- Rehearse signup with disposable PostgreSQL 16, build the exact candidate,
  back up the native database, apply the reader migration, then publish shared
  Customer Panel NET followed by SITE with existing provider settings preserved.
- Accept the real order editor and a real quote before shipment creation.
  No real order edits, carrier purchases or barcode creation are test actions.

Provider reference: [Basit Kargo API documentation](https://www.basitkargo.com/api).

## Completed live acceptance and retired legacy hook

- Shared Customer Panel NET and SITE run
  `f2d64d57ba5da1b03546341dae26dfc767862c37`; owner and storefront applications
  retained their existing sources and provider settings.
- The real Ezmeo order editor loaded, and a quote-only request returned six
  carrier options. No shipment, paid barcode, order edit or collection was
  submitted as a test. The order total and line total remained 152,400 cents.
- The first panel rollout exposed an obsolete post-deployment invocation of
  `apply-staging-order-address-migration.mjs`. Its data-based readiness check
  replayed native112 when a modern order stored the recipient separately. It
  added the missing stored recipient and incremented the order version, then
  replaced the detail reader with its pre157 definition. This was independent
  of native276 and did not change prices or line quantities.
- Restore only the captured, approved detail reader, preserving its native157
  null/POS behavior. The full 2,060-routine catalogue was verified again at
  `49818ebae58044d34b86f66ecc74d566faca13b6095a5a994fd7d3abdd0025d7`.
- After both panel deployments were accepted, retire only the order-address
  command suffix from both shared panel posthooks. Keep the modular-homepage
  command, all prehooks, environment rows, timestamps, source pins and other
  applications unchanged. This retirement was applied and verified on
  2026-10-25 at 03:57 UTC; runtime, native and order-amount witnesses matched.
- Do not restore this historical one-off posthook on future deployments. Modern
  address compatibility belongs to the canonical reader; missing stored
  recipient fields must not trigger an old schema replacement or backfill.
