# Checkout payment instructions compatibility

## Goal and cause

Restore checkout summaries, delivery fees and offline payment choices for every
store when optional bank-transfer or cash-on-delivery instructions are empty.
The native payment configuration permits an empty string, but the shared public
quote/receipt parser previously required at least one character. A valid quote
was rejected, hiding all three checkout sections.

## Implementation and verification plan

- [x] Reproduce the live checkout failure and compare persisted configuration
  with a read-only native quote. Shipping and bank transfer are active and valid;
  the native quote succeeds and includes an empty instructions string.
- [x] Add failing bank-transfer and cash-on-delivery regressions across V1/V2
  quotes and receipts, then permit empty instructions only for these methods.
- [x] Retain required fields, canonical string validation, length limits,
  bank-account validation and nonempty hosted-card instructions.
- [ ] Run focused contract, repository, route and UI checks; refresh the official
  source-bound signup proof in disposable PostgreSQL 16.
- [ ] Build the exact candidate and publish shared storefront NET, then SITE,
  preserving native/payment authorities and owner/customer-panel deployments.
- [ ] Verify the original live cart displays its summary, delivery fee and bank
  transfer before any order is submitted.

## Compatibility

No tenant override, schema migration, price change or payment-method activation
is required. The optional instructions remain a present string in the API.
Existing populated strings and hosted-card requirements retain their behavior.

## Verification scope

The focused commerce tests pass. The wider contracts suite has an unrelated
frozen-export-list failure for previously added exports; this change adds no
exports. A live purchase is outside the pre-submit checkout acceptance.
