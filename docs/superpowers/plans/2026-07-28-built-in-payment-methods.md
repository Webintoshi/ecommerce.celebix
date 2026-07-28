# Built-in Payment Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each merchant configure and independently select one cash-on-delivery method and one bank-transfer method alongside the store's single active online provider.

**Architecture:** Put the exact built-in configuration contract in `@celebix/saas-contracts`, enforce it again at the authenticated HTTP and PostgreSQL boundaries, and reuse the existing replay-safe payment-method save/state/reorder lifecycle. Add one focused client controller and drawer, while the existing payment console remains the orchestration shell.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, Node test runner, PostgreSQL 16, existing `@celebix/saas-contracts` and `@celebix/saas-data` packages.

## Global Constraints

- A store has at most one `cash_on_delivery` row and one `bank_transfer` row.
- Both built-in methods may coexist with each other and with one active `provider` method.
- New built-in methods become active only by chaining the returned save version into the existing state mutation.
- Editing never changes the current method state and never clears an emergency stop.
- Cash-on-delivery config is exactly `{ instructions }`.
- Bank-transfer config is exactly `{ accountHolder, bankName, iban, instructions }`.
- Turkish IBAN is canonical uppercase `TR` plus 24 digits and passes ISO 13616 MOD-97.
- No fee, surcharge, private tenant authority, provider secret, or new checkout settlement rail is added.
- Existing untracked `.codex-evidence/` and `apps/customer-panel/docs/` content is never staged or modified.

## File structure

- `packages/saas-contracts/src/payment-providers/built-in-methods.ts`: shared immutable definitions, exact config parsers, text bounds, IBAN normalization/checksum.
- `apps/owner/scripts/sql/saas/202607280062_builtin_payment_methods.*.sql`: database uniqueness, config validator, save-function replacement, preflight, ACLs, rollback.
- `tests/saas-phase3/built-in-payment-methods/`: isolated PostgreSQL and static-security gates for migration 062.
- `apps/customer-panel/lib/built-in-payment-methods/controller.ts`: create/edit selection and replay-safe save-then-activate orchestration.
- `apps/customer-panel/components/settings/payment/BuiltInPaymentMethodDrawer.tsx`: accessible bounded form only.
- Existing payment handler/client/console/catalog files: finite error mapping, strict boundary validation, and UI integration.

---

### Task 1: Shared built-in configuration contract

**Files:**
- Create: `packages/saas-contracts/src/payment-providers/built-in-methods.ts`
- Create: `packages/saas-contracts/src/payment-providers/built-in-methods.test.ts`
- Modify: `packages/saas-contracts/src/payment-providers/index.ts`
- Modify: `packages/saas-contracts/src/index.ts`

**Interfaces:**
- Produces `BUILT_IN_PAYMENT_METHODS`, `BuiltInPaymentMethodKind`, `normalizeTurkishIbanInput(value)`, `parseBuiltInPaymentMethodConfig(kind, value)`, and `isBuiltInPaymentMethodKind(value)`.
- The parser returns a deeply frozen exact `Readonly<Record<string, MerchantAdminJson>>` and throws `TypeError("built_in_payment_method_invalid")` for every rejected input.

- [ ] **Step 1: Read the good-test rules and write failing contract tests**

Cover exact definitions, frozen outputs, cash instructions, bank field bounds, inherited/accessor/proxy/extra keys, controls, UTF-8 byte limits, IBAN normalization, valid `TR330006100519786457841326`, and checksum failures.

```ts
assert.deepEqual(normalizeTurkishIbanInput("tr33 0006 1005 1978 6457 8413 26"),
  "TR330006100519786457841326");
assert.deepEqual(parseBuiltInPaymentMethodConfig("cash_on_delivery", {
  instructions: "Teslimatta ödeme yapın.",
}), { instructions: "Teslimatta ödeme yapın." });
assert.throws(() => parseBuiltInPaymentMethodConfig("bank_transfer", {
  bankName: "Örnek Bankası",
  accountHolder: "Örnek Ticaret Ltd. Şti.",
  iban: "TR330006100519786457841327",
  instructions: "Sipariş numaranızı yazın.",
}), /built_in_payment_method_invalid/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/payment-providers/built-in-methods.test.ts`

Expected: FAIL because the module/exports do not exist.

- [ ] **Step 3: Implement the minimal exact parser**

Use descriptor inspection rather than object spread, byte-count through `TextEncoder`, and the standard rearranged IBAN MOD-97 loop. Do not accept spaces in `parseBuiltInPaymentMethodConfig`; only `normalizeTurkishIbanInput` removes ASCII spaces for form UX.

- [ ] **Step 4: Verify GREEN and package regression**

Run:

```bash
node --experimental-strip-types --test packages/saas-contracts/src/payment-providers/built-in-methods.test.ts
npm run test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all pass, zero failures.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/payment-providers/built-in-methods.ts packages/saas-contracts/src/payment-providers/built-in-methods.test.ts packages/saas-contracts/src/payment-providers/index.ts packages/saas-contracts/src/index.ts
git commit -m "feat(payments): define built-in method configs"
```

### Task 2: PostgreSQL uniqueness and config authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607280062_builtin_payment_methods.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607280062_builtin_payment_methods_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/202607280062_builtin_payment_methods.down.sql`
- Create: `tests/saas-phase3/built-in-payment-methods/postgres-harness.mjs`
- Create: `tests/saas-phase3/built-in-payment-methods/static-security.test.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Interfaces:**
- Produces `saas.built_in_payment_method_config_valid(text,jsonb)` and `saas.built_in_payment_methods_preflight()`.
- Replaces the same-signature `saas.payment_method_save(...)` without changing existing provider inputs or result envelopes.
- Adds finite SQL outcome `method_already_exists`.

- [ ] **Step 1: Write the failing 062 harness and static gate**

The harness must apply migrations through 061, prove duplicates are possible before 062, apply 062, then report exact scenarios for:

```text
valid COD create
valid bank create with checksum-valid IBAN
second COD denied as method_already_exists
second bank denied as method_already_exists
COD and bank coexist
one provider coexists with both built-ins
unknown config key denied
bad IBAN checksum denied
cross-store same kind allowed
operation replay remains exact
versioned edit preserves identity
preflight and ACLs are exact
down refuses unsafe duplicate-producing rollback conditions
```

- [ ] **Step 2: Run the harness and verify RED**

Run: `node tests/saas-phase3/built-in-payment-methods/postgres-harness.mjs`

Expected: FAIL because migration 062 and its functions/index are missing.

- [ ] **Step 3: Implement migration 062**

The up migration must:

```sql
CREATE UNIQUE INDEX payment_methods_one_builtin_kind_per_store
ON saas.payment_methods(store_id,kind)
WHERE kind IN ('cash_on_delivery','bank_transfer');
```

It must reject pre-existing duplicates before index creation, validate exact JSON key sets and canonical text, calculate IBAN MOD-97 without dynamic SQL, acquire `saas.payment.method.builtin:<store>:<kind>` advisory locks, return `method_already_exists` for a different ID of the same kind, preserve every provider branch from migration 059, and expose an exact security-definer preflight to owner/app/workflow roles only.

- [ ] **Step 4: Verify GREEN and current suite registration**

Register this exact cumulative gate in `run-current-suite.mjs` after migration 061:

```js
Object.freeze({
  file: "tests/saas-phase3/built-in-payment-methods/postgres-harness.mjs",
  total: 13,
  line: /^PASS \d+\/13 .+$/gm,
  completion: /^PASS 13\/13 .+$/m,
})
```

Add `built-in-payment-methods` after `iyzico-iframe-tenant-activation-runtime` in `gateRank`, and require `tests/saas-phase3/built-in-payment-methods/static-security.test.mjs` as a current test.

Run:

```bash
node tests/saas-phase3/built-in-payment-methods/postgres-harness.mjs
node --test tests/saas-phase3/built-in-payment-methods/static-security.test.mjs
```

Expected: exact harness total and static test pass.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607280062_builtin_payment_methods.up.sql apps/owner/scripts/sql/saas/202607280062_builtin_payment_methods_assertions.sql apps/owner/scripts/sql/saas/202607280062_builtin_payment_methods.down.sql tests/saas-phase3/built-in-payment-methods tests/saas-phase3/run-current-suite.mjs
git commit -m "feat(payments): enforce built-in method authority"
```

### Task 3: HTTP, repository, and startup boundaries

**Files:**
- Modify: `packages/saas-data/src/payment-methods/errors.ts`
- Modify: `packages/saas-data/src/payment-methods/repository.test.ts`
- Modify: `apps/customer-panel/lib/payment-method-http/handler.ts`
- Modify: `apps/customer-panel/lib/payment-method-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/payment-method-ui/client.ts`
- Modify: `apps/customer-panel/lib/payment-method-ui/client.test.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts`

**Interfaces:**
- Adds `method_already_exists` to repository, HTTP 409, and Turkish client error mappings.
- HTTP `saveInput` calls `parseBuiltInPaymentMethodConfig(kind, config)` for non-provider kinds.
- Startup requires `saas.built_in_payment_methods_preflight()` under `SET LOCAL ROLE celebix_saas_app`.

- [ ] **Step 1: Write failing boundary tests**

```ts
assert.equal(response.status, 409);
assert.deepEqual(await response.json(), { code: "method_already_exists" });
assert.equal(calls.some(({ kind }) => kind === "save"), false); // invalid IBAN rejected first
```

Also prove provider config behavior is unchanged and exact valid built-in config reaches the repository unchanged and frozen.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/payment-method-http/handler.test.ts apps/customer-panel/lib/payment-method-ui/client.test.ts apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts
node --experimental-strip-types --test packages/saas-data/src/payment-methods/repository.test.ts
```

Expected: FAIL on missing code/parser/preflight behavior.

- [ ] **Step 3: Implement minimal boundary changes**

Map only the new finite code; do not return PostgreSQL text. For built-ins, replace the generic `safeConfig` result with the shared exact parser. Extend the one startup preflight transaction after `SET LOCAL ROLE celebix_saas_app`.

- [ ] **Step 4: Verify GREEN**

Rerun the focused commands. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/payment-methods/errors.ts packages/saas-data/src/payment-methods/repository.test.ts apps/customer-panel/lib/payment-method-http apps/customer-panel/lib/payment-method-ui apps/customer-panel/lib/server-panel-access/postgres-runtime.ts apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts
git commit -m "feat(payments): validate built-in method requests"
```

### Task 4: Built-in form controller and drawer

**Files:**
- Create: `apps/customer-panel/lib/built-in-payment-methods/controller.ts`
- Create: `apps/customer-panel/lib/built-in-payment-methods/controller.test.ts`
- Create: `apps/customer-panel/components/settings/payment/BuiltInPaymentMethodDrawer.tsx`
- Modify: `apps/customer-panel/components/settings/payment/payment-settings.module.css`
- Modify: `apps/customer-panel/lib/payment-settings-console.test.ts`

**Interfaces:**
- Produces `selectBuiltInPaymentMethod(methods, kind)` and `saveBuiltInPaymentMethod({ kind, method, label, config, api, methodId })`.
- Result union is exactly `active | updated | emergency_disabled | conflict | ambiguous` with method ID and safe Turkish message owned by the console.
- Drawer receives an existing method or null, `canManage`, `busy`, `onSubmit`, and `onClose`.

- [ ] **Step 1: Write failing controller and component behavior tests**

Cover new save then activation with the returned version, edit without state mutation, emergency-disabled edit, exact-kind duplicate selection, synchronous double-submit ownership, IBAN normalization before parse, field focus, Escape/close, and read-only controls.

```ts
assert.deepEqual(calls, [
  ["save", { expectedVersion: 0, kind: "cash_on_delivery" }],
  ["setState", { expectedVersion: 1, state: "active", emergencyReason: null }],
]);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/built-in-payment-methods/controller.test.ts apps/customer-panel/lib/payment-settings-console.test.ts`

Expected: FAIL because controller/drawer do not exist.

- [ ] **Step 3: Implement controller and drawer**

Generate the create method UUID once per owned submit, use the existing API, normalize IBAN only at the input boundary, validate through the shared parser, and clear pending state only after canonical reload ownership returns to the console. Use 48px controls and the existing drawer/focus tokens.

- [ ] **Step 4: Verify GREEN**

Rerun the focused tests and `npm run typecheck --workspace @celebix/customer-panel`.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/built-in-payment-methods apps/customer-panel/components/settings/payment/BuiltInPaymentMethodDrawer.tsx apps/customer-panel/components/settings/payment/payment-settings.module.css apps/customer-panel/lib/payment-settings-console.test.ts
git commit -m "feat(payments): add built-in method editor"
```

### Task 5: Payment catalog and console integration

**Files:**
- Modify: `apps/customer-panel/components/settings/payment/PaymentProviderCatalogDialog.tsx`
- Modify: `apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.test.ts`
- Modify: `apps/customer-panel/lib/payment-settings-console.test.ts`

**Interfaces:**
- View model exposes two immutable built-in cards with `kind`, label, description, configured state, active state, and action label.
- Catalog dialog gets `builtInCards` and `onBuiltInSelect(kind)` without merging these cards into the 58-provider count/filter semantics.
- Console opens create/edit drawer and adds **Düzenle** only for built-in rows.

- [ ] **Step 1: Write failing view and console tests**

Prove the dialog always displays exactly two built-in cards, provider count remains 58, existing methods show **Yapılandırıldı**, both kinds coexist, active built-ins appear in checkout/order preview, and provider errors leave built-in controls enabled.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-settings-ui/model.test.ts apps/customer-panel/lib/payment-settings-console.test.ts
```

Expected: FAIL on missing built-in cards/actions.

- [ ] **Step 3: Implement minimal UI integration**

Render **Yerleşik yöntemler** before provider filters, use `Banknote` and `Truck` icons, keep the provider grid/image behavior unchanged, and reload durable methods after every save/state result before showing success.

- [ ] **Step 4: Verify GREEN and customer regression**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-settings-ui/model.test.ts apps/customer-panel/lib/payment-settings-console.test.ts
npm run test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Expected: zero failures.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/components/settings/payment/PaymentProviderCatalogDialog.tsx apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx apps/customer-panel/lib/payment-settings-ui/model.ts apps/customer-panel/lib/payment-settings-ui/model.test.ts apps/customer-panel/lib/payment-settings-console.test.ts
git commit -m "feat(payments): expose built-in payment methods"
```

### Task 6: Full verification, rollout, and browser QA

**Files:**
- Modify only if verification reveals a tested defect.
- Update plan checkboxes as tasks finish.

**Interfaces:**
- Requires all Task 1–5 interfaces and migration 062 preflight.
- Produces one pushed immutable commit and a verified Coolify deployment.

- [ ] **Step 1: Run complete local verification**

```bash
npm run test --workspace @celebix/saas-contracts
npm run test --workspace @celebix/saas-data
npm run test --workspace @celebix/customer-panel
npm run test:saas-phase3:current
npm run typecheck
SOURCE_COMMIT=$(git rev-parse HEAD) CELEBIX_IYZICO_APPROVAL_MODE=approved_test_sandbox CELEBIX_IYZICO_APPROVED_EVIDENCE_DIGEST=sha256:716afbeeed413db1c6f1943ec544e8c77fb72f5e942ea402471f5eab423cb66e npm run build:coolify:customer-panel
```

Expected: all commands exit 0; restore generated Iyzico metadata to the repository's fail-closed source state after the build and verify `git diff --check`.

- [ ] **Step 2: Review and commit any final tested correction**

Run `git status --short`, inspect every changed path, leave `.codex-evidence/` and `apps/customer-panel/docs/` untouched, then create one narrowly named correction commit only if required.

- [ ] **Step 3: Push the branch**

```bash
git push origin codex/celebix-managed-umami-analytics
```

Expected: remote branch resolves to local `HEAD`.

- [ ] **Step 4: Back up and migrate staging**

Create a mode-600 custom-format backup of `celebix_saas_staging_auth01`, verify it with `pg_restore -l`, apply 062 up then assertions with `ON_ERROR_STOP=1`, and run `saas.built_in_payment_methods_preflight()` under `celebix_saas_app` in `BEGIN READ ONLY`.

- [ ] **Step 5: Deploy and verify runtime**

Deploy customer panel and owner from the exact pushed SHA. Verify container image SHA, `SOURCE_COMMIT`, health endpoints, zero restart count, unauthenticated payment-method API returns 401 rather than 500, and Coolify temporary access tokens are deleted.

- [ ] **Step 6: Rendered Browser QA**

The flow under test is: `/settings/payment` → **Ödeme Yöntemi Ekle** → configure each built-in method → observe active durable rows and order preview.

Use the Browser plugin first. Verify URL/title, meaningful DOM, no framework overlay, relevant console errors/warnings, desktop and mobile screenshots, unique interactive locators, create/edit, enable/disable, and ordering. If staging authentication is still intentionally disabled, record the authenticated interaction as blocked and do not claim it passed.

- [ ] **Step 7: Final evidence**

Report the pushed SHA, migration/backup result, exact test totals, deployment health, browser evidence or authentication blocker, and the truthful scope: merchant configuration is live; no surcharge or new checkout settlement rail was added.
