# Toshi product authoring reliability

**Goal:** Repair confirmed shared product-authoring rejection defects without changing credit charging, product facts or SEO limits, and publish both customer panels after server access is restored.

**Architecture:** Keep the existing generation, validation and metering boundaries. Normalize harmless Markdown before the existing factual checks. Recognize narrowly defined Turkish spatial expressions without weakening material claims. Record only trusted validation classifications so a rejected output can be distinguished from a provider failure without storing product text.

**Scope:** Product description and product SEO authoring. No wallet changes, free credits, database writes, external retry loops, merchant provider changes, feature grants or navigation redesign.

- [x] Reproduce harmless hard-break and italic rejection, and spatial apparel advice incorrectly identified as gold claims.
- [x] Add regression tests before the minimal parser and lexical fixes; preserve unsafe-claim, scope and marker counterexamples.
- [x] Add private, allowlisted validation reason/field diagnostics; test forged errors and sensitive text exclusion.
- [x] Run focused authoring and credit suites, customer-panel typecheck, fresh disposable PostgreSQL 16 signup proof and independent review.
- [x] Record provider-level network suspension in private incident evidence. Restored access requires account-owner action; do not bypass provider suspension or change server networking.
- [ ] After payment and restored access, capture fresh application/configuration/provider/native witnesses, deploy NET then SITE using the exact reviewed commit and official build guards, and verify real generation with no saved product changes.

**Release boundary:** Branch begins at accepted c3b14a393259bca981e93a6cc82e29dcaf239642. The rejected Ezmeo navigation variant is excluded from this source; preserve the existing disabled runtime flag and every other environment row. Owner, storefront and main applications are witnesses and are not deployment targets.

**Acceptance:** Valid formatted product content passes; unsupported gold/material/quantity/variant claims remain rejected; SEO limits remain 60/160; uncertain provider dispatch is not automatically replayed; failed generations never deduct credits; NET and SITE runtime sources match the accepted commit.
