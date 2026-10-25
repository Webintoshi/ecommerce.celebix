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
