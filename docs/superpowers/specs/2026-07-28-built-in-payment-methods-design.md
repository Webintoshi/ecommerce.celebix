# Built-in Payment Methods Design

## Goal

Add `cash_on_delivery` and `bank_transfer` to the customer panel payment-settings flow so each merchant can configure, enable, disable, emergency-disable, and order these built-in methods independently. Both built-in methods may coexist with each other and with the store's single active online provider.

This feature does not add payment surcharges, invent a second online-provider slot, or broaden the current quick-order hosted-payment authority.

## User experience

The existing **Ödeme Yöntemi Ekle** dialog will show a dedicated **Yerleşik yöntemler** section above the provider catalog.

- **Kapıda ödeme** opens a compact configuration drawer containing:
  - checkout label;
  - customer-facing instructions.
- **Banka havalesi** opens the same bounded drawer pattern containing:
  - checkout label;
  - bank name;
  - account holder;
  - Turkish IBAN;
  - customer-facing payment instructions.

Saving a new built-in method creates the durable method and activates it. Saving an existing method updates its label and configuration without changing its current state. Existing methods expose a **Düzenle** action from the desktop table and mobile card. The existing enable/disable, emergency stop, and ordering controls remain authoritative.

The add dialog will show an already-created built-in method as **Yapılandırıldı** and route its action to editing instead of attempting a duplicate create. Read-only users may inspect state but cannot save or change activation.

## Persistence and invariants

The existing `saas.payment_methods` table and repository remain the source of truth.

- `cash_on_delivery` and `bank_transfer` continue to use `profile_id = NULL` and `provider_code = NULL`.
- A store may have at most one row for each built-in kind.
- Built-in methods do not participate in the single-active-online-provider exclusion rule.
- Create begins through the existing replay-safe `payment_method_save` operation. The returned version is then used by the existing replay-safe `payment_method_set_state` operation to activate a newly created method.
- An edit reuses the existing row ID and exact version.
- A new migration adds database-level uniqueness and a built-in configuration preflight. It must refuse rollout if pre-existing duplicate built-in rows are present.
- A provider method can never be converted into a built-in method, and one built-in kind can never be converted into the other.

The save path will acquire a store-and-kind advisory transaction lock before checking or inserting a built-in method. A partial unique index on `(store_id, kind)` for the two built-in kinds is the final concurrency guard. Duplicate creation returns the finite `method_already_exists` error instead of leaking a database error.

## Canonical configuration

All configuration objects are exact: unknown, inherited, accessor-backed, oversized, or control-character-bearing fields are rejected before repository access.

### Cash on delivery

```json
{
  "instructions": "Teslimat sırasında nakit veya mağazanın desteklediği yöntemle ödeme yapın."
}
```

- `instructions`: trimmed UTF-8 text, 0–500 bytes.
- `label`: existing top-level method label, trimmed UTF-8 text, 1–120 bytes.

### Bank transfer

```json
{
  "accountHolder": "Örnek Ticaret Ltd. Şti.",
  "bankName": "Örnek Bankası",
  "iban": "TR330006100519786457841326",
  "instructions": "Açıklama alanına sipariş numaranızı yazın."
}
```

- `bankName`: trimmed UTF-8 text, 2–120 bytes.
- `accountHolder`: trimmed UTF-8 text, 2–160 bytes.
- `iban`: uppercase, space-free Turkish IBAN (`TR` plus 24 digits) with ISO 13616 MOD-97 checksum validation.
- `instructions`: trimmed UTF-8 text, 0–500 bytes.
- `label`: existing top-level method label, trimmed UTF-8 text, 1–120 bytes.

The browser normalizes typed IBAN text by removing ASCII spaces and uppercasing it for usability, but the server and repository accept only the canonical result. No bank data is treated as a secret, and no tenant authority is accepted from the browser.

## Components and boundaries

1. A pure built-in payment-method module owns definitions, canonical form parsing, IBAN validation, drawer view state, and save/activate orchestration.
2. `PaymentProviderCatalogDialog` renders the two built-in cards separately from the 58-provider catalog and delegates selection upward.
3. A focused built-in configuration drawer owns accessible fields, validation messages, pending state, close/focus behavior, and submission.
4. `PaymentSettingsConsole` selects create or edit state from the durable methods list, runs the orchestration, displays finite feedback, and reloads canonical data.
5. The HTTP handler validates the exact built-in configuration before the repository.
6. The PostgreSQL migration enforces exact built-in configuration, uniqueness, ACLs, and an immutable preflight callable by application startup.

Provider credentials, provider activation, Iyzico evidence, and the one-active-provider rule remain unchanged.

## Data flow

1. The merchant opens **Ödeme Yöntemi Ekle** and chooses a built-in card.
2. The console checks the already-loaded durable method list for that exact kind.
3. The drawer opens in create or edit mode with bounded public fields only.
4. On submit, the client sends the existing same-origin, cookie-authenticated, idempotent payment-method save command.
5. The server re-resolves session, membership, store, plan, and manage capability; canonicalizes the built-in payload; and calls the application-role repository.
6. PostgreSQL revalidates tenant authority, kind/config shape, uniqueness, version, and operation identity.
7. For a new record, the client activates only the exact returned ID and version. It then reloads the durable list before reporting success.
8. If create or activation has an ambiguous result, the UI reloads canonical state and never submits a blind duplicate.

## Errors and recovery

- Field errors remain next to the relevant field and do not issue a request.
- `method_already_exists` reloads the list and opens/points to the existing method.
- `version_conflict` reloads canonical state and leaves a visible conflict message.
- A definitive create rejection permits retry with a new operation ID.
- An ambiguous transport result locks that submit attempt until canonical reload resolves whether the method exists.
- Emergency-disabled methods are never silently reactivated by editing.
- Provider catalog/profile failures do not disable built-in method management.

## Testing

Implementation follows red-green-refactor.

- Unit tests first for exact built-in definitions, Turkish IBAN checksum, normalization, form validation, duplicate selection, create activation, edit-without-reactivation, and ambiguous outcomes.
- HTTP tests first for accepted canonical payloads and rejection of unknown keys, invalid IBANs, mismatched kind/config, private headers, and cross-origin mutations.
- Repository and PostgreSQL migration tests first for per-store/per-kind uniqueness, coexistence of both built-ins and one provider, replay/version behavior, exact ACLs, and preflight truth.
- Component behavior tests first for add cards, create/edit drawer, disabled/read-only states, focus recovery, desktop/mobile actions, and truthful feedback.
- Full customer-panel, SaaS phase-3, typecheck, and production builds run before deployment.
- Rendered QA covers the payment-settings route, both drawer variants, enable/disable, order preview, console errors, desktop, and one mobile viewport. If staging authentication remains disabled, the authenticated rendered flow is recorded as blocked rather than claimed.

## Rollout

1. Create and verify a pre-migration database backup.
2. Apply the built-in-method migration and assertions before deploying application code that requires its preflight.
3. Deploy customer panel and owner/runtime changes from one immutable commit.
4. Verify database preflight, container commit, health endpoints, and the built-in-method API's unauthenticated fail-closed response.
5. Do not seed either method globally. Each merchant chooses and configures its own methods.
