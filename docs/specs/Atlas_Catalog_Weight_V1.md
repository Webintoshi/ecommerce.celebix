# Atlas Catalog Weight V1

Status: approved implementation scope (2026-09-21)

This document records the narrow architecture chosen for the approved Güzide catalog-weight task.
The complete product requirements remain in the task brief; this file defines the implementation boundary.

## Boundary

- Declared catalog weight is admin-only catalog data. It is not `metalGrams`, a price input, stock,
  shipping weight, or a public product attribute.
- A store profile (`general` or `jewelry`) explicitly enables the editor. Missing profile means the
  safe generic-retail default and hides the section.
- Declarations may target a product or one exact variant and retain scope, sales unit, approximation,
  tolerance, source, source digest/version/import operation, and pricing-verification state.
- Saving a declaration never changes price, stock, pricing policy, dynamic activation, description,
  media, category, SKU, or publication state.
- Public storefront projections remain unchanged and never expose declaration source/audit fields.

## Import safety

The deterministic parser classifies each product into the six required manifest groups. Only group 1
(one exact value, one exact empty variant target, not approximate) is eligible. Application rechecks
store, product and variant IDs, source digest, product/variant versions, empty target and stable
operation identity. Rollback deletes only an unchanged description-imported declaration created by
that operation.

The first Güzide inventory was read from running source
`96764834f99a24f8c32ebd1d1ba246742d02740e`. The new schema is not present there, so this branch does
not write shared staging data. Migration, application deployment and the exact manifest must be
released together in a separately approved staging window.
