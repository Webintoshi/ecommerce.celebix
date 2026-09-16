# Store administrator invitations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved invitation through email and verified, explicit recipient acceptance, without granting access at send time.

**Architecture:** Dedicated store-admin invitation lifecycle, durable encrypted email outbox, and invitation-purpose OIDC acceptance controlled by Owner. First establish additive public contracts; then persist authority and delivery atomically, integrate identity, and connect the panel. Provider acceptance is not inbox delivery.

**Tech Stack:** TypeScript, Node test runner, Next.js, PostgreSQL, existing Logto OIDC and Resend provider.

**Spec:** `docs/superpowers/specs/2026-09-16-store-admin-invitations-design.md`

## Global Constraints

- No production, payment calls, payment-policy changes, unrelated app deployment, DNS changes, owner-role assignment, or PR merge. Existing schema/readers remain compatible.
- Initial live acceptance is restricted to guzide-kuyumcu-4, store a828862c-4cc1-475a-89cc-5fbee31eb43f, and the specified test recipient.
- The existing generic record is preserved and converted explicitly once; sending does not create membership.
- Never expose tokens in panel lists, logs, QA artifacts or analytics.
- Invitation states: pending, accepted, revoked, expired. Delivery states: queued, sending, provider_accepted, delivered, failed, outcome_unknown.
- Only verified provider events may mark delivered. No silent reactivation or downgrade of existing membership.
- Preserve unrelated dirty CategoryManager, OrderDraftListConsole, operational-visibility and reservation-repair files.
- This plan is staged: the executable contract task below is the first independently reviewable subsystem. Persistence, OIDC, delivery and UI implementation briefs are written after inspecting their actual authority interfaces, before editing those subsystems. This does not reduce the approved end-to-end completion criteria.

## Integration sequence and release gates

1. Additive public invitation contracts and normalization (Task 1).
2. Additive PostgreSQL lifecycle/outbox/grants under current least-privilege roles. Reserve the next available migration number only after listing existing migrations. Prove atomic issue, resend, revoke, accept, source-record uniqueness, immutable audit, operation replay, concurrent acceptance and lease fencing in disposable PostgreSQL; never substitute a string-matching SQL test for execution.
3. Invitation-purpose durable OIDC and browser-bound verified acceptance grant. Fragment-to-POST landing prevents token access logs. Current returning-login functions require store_owner; add an explicit post-acceptance session authority for active allowed roles without widening owner-only mutations. Exact host is centrally resolved, never a request returnTo.
4. Dedicated encrypted invitation email adapter and worker. Stable namespace store-admin-invitation/v1, generation-bound payload, bounded retries, 24-hour provider horizon subject to official verification, outcome_unknown after unsafe retry horizon; authenticated webhook events only. Inspect configured sender/provider without displaying secrets before enabling.
5. Dedicated panel list/form/actions, with legacy records shown as not sent. Existing generic create is not presented as successful delivery. Preserve inputs and stable operation IDs; include pending/delivery/error labels, resend eligibility and revoke confirmation. No raw tokens in projections.
6. Cross-app regressions, independent security review, approved staging migration/release readiness and rollback capture. Exact candidate and actual running sources must match. Keep AutoDeploy/Preview OFF. Convert the one approved existing record and send once only after these gates. User performs mailbox login/acceptance, then verify the correct membership and protected page.

### Task 1: Additive public invitation contracts

**Files:**
- Create `packages/saas-contracts/src/store-admin-invitations/types.ts`.
- Create `packages/saas-contracts/src/store-admin-invitations/validation.ts`.
- Create `packages/saas-contracts/src/store-admin-invitations/index.ts`.
- Create `packages/saas-contracts/src/store-admin-invitations/validation.test.ts`.
- Modify `packages/saas-contracts/src/index.ts` with one additive export.
- Modify `packages/saas-contracts/src/contracts.test.ts` frozen public export snapshot with the seven deliberate additive exports; retain all existing entries.

**Interfaces:**
- Consumes existing `StoreMembershipRole` only for compile-time compatibility; no change to existing enum/readers.
- Produces `StoreAdminInvitationRole = 'admin' | 'editor' | 'analyst'`.
- Produces `StoreAdminInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'` and `StoreAdminInvitationDeliveryStatus = 'queued' | 'sending' | 'provider_accepted' | 'delivered' | 'failed' | 'outcome_unknown'`.
- Produces `StoreAdminInvitationView { readonly id: string; readonly sourceRecordId: string; readonly email: string; readonly displayName: string; readonly role: StoreAdminInvitationRole; readonly status: StoreAdminInvitationStatus; readonly deliveryStatus: StoreAdminInvitationDeliveryStatus | null; readonly expiresAt: string; readonly createdAt: string; readonly updatedAt: string; readonly version: number; readonly generation: number }`.
- Produces `StoreAdminInvitationSendIntent { readonly sourceRecordId: string; readonly expectedRecordVersion: number; readonly operationId: string }` for explicit conversion. Recipient, role and expiry come from the authenticated source record, not this request.
- Produces `StoreAdminInvitationActionIntent { readonly invitationId: string; readonly expectedVersion: number; readonly operationId: string }` shared by resend/revoke.
- Produces `normalizeStoreAdminInvitationEmail(value: unknown): string`, `parseStoreAdminInvitationView(value: unknown): StoreAdminInvitationView`, `parseStoreAdminInvitationSendIntent(value: unknown): StoreAdminInvitationSendIntent`, `parseStoreAdminInvitationActionIntent(value: unknown): StoreAdminInvitationActionIntent`.
- Parsers throw `TypeError` with constant safe error codes only. Never echo untrusted values.
- Review clarification: displayName must be trimmed, matching source merchant record `name=btrim(name)`. Email trims only U+0020 outer spaces; all other control/non-ASCII whitespace is rejected before normalization.

- [ ] **Step 1: RED behavioral tests.** Use node:test and node:assert/strict. Example seed:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStoreAdminInvitationEmail, parseStoreAdminInvitationSendIntent } from './index.ts';
test('canonical email is shared with acceptance', () => {
  assert.equal(normalizeStoreAdminInvitationEmail('  Recipient@Example.com '), 'recipient@example.com');
  for (const invalid of ['a\n@example.com', 'x@y', 'ü@example.com', 'x+<bad>@example.com', 'a b@example.com', null]) {
    assert.throws(() => normalizeStoreAdminInvitationEmail(invalid), TypeError);
  }
});
test('client cannot inject invitation authority', () => {
  assert.throws(() => parseStoreAdminInvitationSendIntent({
    sourceRecordId: '11111111-1111-4111-8111-111111111111', expectedRecordVersion: 1,
    operationId: '22222222-2222-4222-8222-222222222222', role: 'store_owner'
  }), TypeError);
});
```

Add passing projection examples for all states, rejection of unknown keys (token, digest, providerResponse, storeId, inviterPrincipalId), invalid UUIDs/roles/status, unsafe display strings, invalid/non-ISO dates, unsafe/non-positive versions/generations. Distinguish provider_accepted and delivered. Verify output is a new whitelisted object, not the input object. Do not normalize mailbox aliases or strip plus tags.

- [ ] **Step 2: Record expected failure.** Run `node --experimental-strip-types --test packages/saas-contracts/src/store-admin-invitations/validation.test.ts`; before implementation expect missing-module failure and record it.
- [ ] **Step 3: Implement types and strict boundary parsers.** Export frozen state arrays and types; validate plain objects with exact key sets, UUID strings, finite safe positive integer versions/generations, ISO UTC timestamps and displayName 1..160 characters excluding control characters and angle brackets. Email policy is ASCII mailbox syntax, max254 total/max64 local, trim outer spaces only, lowercase, dotted DNS domain labels, no control characters, quoted local part or Unicode/IDN conversion. Preserve valid plus addressing. ISO UTC strings must round-trip through Date.toISOString; accept whole seconds by canonicalizing to milliseconds. No time-dependent expiry rejection in a read projection; expired records remain readable. Representative implementation:

```ts
function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('invalid_store_admin_invitation');
  }
  return value;
}
```

Unknown keys fail closed, including authority overrides on send/action intents. Parsing is not authorization and must be documented as such. No Node crypto dependency in browser-consumable contracts, no public token type, no membership mutations.

- [ ] **Step 4: GREEN verification.** Run focused command above, `npm run test --workspace @celebix/saas-contracts` once, then `npm run typecheck --workspace @celebix/saas-contracts`. Record exact counts, warnings and baseline failures, never claim pristine if noisy. Use only installed dependencies; no package upgrades.
- [ ] **Step 5: Commit only the six Task 1 files** with message `feat(contracts): define safe store administrator invitation projections`; independent task review follows. No push, migration, provider call or deployment in this task.

### Task 2: Server-only invitation token and encrypted delivery payload

**Files:**
- Create `apps/owner/lib/store-admin-invitations/token.ts` and `token.test.ts`.
- Create `apps/owner/lib/store-admin-invitations/seal.ts` and `seal.test.ts`.

**Interfaces:**
- Consumes `normalizeStoreAdminInvitationEmail` from Task 1; no browser export of these modules.
- Produces `createStoreAdminInvitationToken(): { token: string; digest: string }` and `digestStoreAdminInvitationToken(token: unknown): string`. Exactly 32 cryptographic random bytes encoded canonical base64url (43 characters); hash SHA256 with prefix `celebix-store-admin-invitation-token:v1\n`. Invalid input throws constant `store_admin_invitation_token_invalid` without input values. Decode and re-encode to reject noncanonical final bits.
- Produces `buildStoreAdminInvitationUrl(acceptanceOrigin: string, token: string): string`. Only normalized HTTPS origins without port, credentials, path other than /, query or fragment; caller provides server-configured platform origin, never request input. Output fixed `/invitations/accept#token=<canonical token>`, no query secret.
- Produces `InvitationSealContext { invitationId: string; generation: number }`, `InvitationPayloadKeyring { activeKeyId: string; keys: Readonly<Record<string, Buffer>> }`, `InvitationSealedPayload { version: 'ai1'; keyId: string; bytes: Buffer; digest: string }` and `InvitationDeliveryPayload { token: string; recipient: string; sender: string; displayName: string; storeName: string; role: 'admin'|'editor'|'analyst'; expiresAt: string; acceptanceOrigin: string }`.
- Produces `sealInvitationDeliveryPayload(payload: InvitationDeliveryPayload, context: InvitationSealContext, keyring: InvitationPayloadKeyring): InvitationSealedPayload` and `openInvitationDeliveryPayload(envelope: InvitationSealedPayload, context: InvitationSealContext, keyring: InvitationPayloadKeyring): InvitationDeliveryPayload`.
- AES256GCM with 12 random IV bytes and 16 tag bytes, version-prefixed envelope bytes. AAD `celebix-store-admin-invitation:ai1:<keyId>:<invitationId>:<generation>`. Dedicated 32-byte keys with keyId matching `[a-z][a-z0-9_-]{2,31}`; never use order-email envelope or its AAD. Envelope SHA256 digest detects corruption; GCM tag verifies integrity. Validate key selection without mutating caller buffers. Keys and transient plaintext copies are wiped in finally; no logging.

- [ ] **Step 1: RED tests**, including this behavior:

```ts
test('token entropy and canonical digest', () => {
  const a = createStoreAdminInvitationToken();
  const b = createStoreAdminInvitationToken();
  assert.notEqual(a.token, b.token);
  assert.equal(Buffer.from(a.token, 'base64url').length, 32);
  assert.equal(digestStoreAdminInvitationToken(a.token), a.digest);
  assert.match(a.digest, /^[a-f0-9]{64}$/);
});
```

Cover malformed token/canonical trailing bits, HTTPS-origin rejection including open redirects, no query token. For seal round trip use fake keys and fake token; assert ciphertext does not contain plaintext token/recipient; two seals differ; wrong context (id or generation), wrong key, keyId, version, digest, truncation, modified tag and ciphertext fail with constant `store_admin_invitation_seal_invalid`. Assert inputs remain unchanged. Validate exact payload/context/envelope/keyring fields, UTF8 size bound 8192 for plaintext, bounded names (1..160, trimmed, no controls/angle brackets), canonical ASCII emails via Task 1, valid role, ISO UTC expiry, canonical origin/token. Reject malformed keyring and empty/unknown key. Do not reject a past expiry while decrypting: lifecycle decides eligibility separately.

- [ ] **Step 2: Record RED.** Run `node --experimental-strip-types --test apps/owner/lib/store-admin-invitations/token.test.ts apps/owner/lib/store-admin-invitations/seal.test.ts`; expect missing modules before implementation.
- [ ] **Step 3: Implement typed boundary and encryption.** Follow existing `apps/owner/lib/order-email/seal.ts` mechanics without modifying/importing its order-specific module. Core cryptographic binding:

```ts
const cipher = createCipheriv('aes-256-gcm', keyCopy, randomBytes(12), { authTagLength: 16 });
cipher.setAAD(Buffer.from(`celebix-store-admin-invitation:ai1:${keyId}:${context.invitationId}:${context.generation}`, 'utf8'));
```

Retain IV in envelope; open validates maximum encrypted size before allocation and checks version/digest before GCM decryption. Error wrappers discard JSON/crypto errors (never echo payload). Do not implement public routes or write runtime secrets in this task.
- [ ] **Step 4: GREEN and regression.** Run focused command above; run `node --experimental-strip-types --test apps/owner/lib/order-email/seal.test.ts` for compatibility and `npm run typecheck --workspace @celebix/owner`. Record unrelated baseline failures separately. Full Owner build is deferred to final combined validation, subject to disk/readiness gate (current 2GiB free); no cleanup or dependency install.
- [ ] **Step 5: Commit only four Task 2 files** as `feat(owner): protect administrator invitation delivery payloads`. Independent task security review follows. No real email/deploy/migration.

## Coverage and decisions

### Task 3: Dedicated invitation email configuration and transport

**Files:** Create `apps/owner/lib/store-admin-invitations/delivery-config.ts`, `delivery-config.test.ts`, `email.ts`, `email.test.ts`, `resend.ts`, `resend.test.ts`. Do not edit existing order-email files or wire routes/worker yet.

**Interfaces:**
- `parseInvitationDeliveryConfig(env: Readonly<Record<string,string|undefined>>): InvitationDeliveryConfig | null`. Absent or literal false `CELEBIX_ADMIN_INVITATIONS_ENABLED` returns null without requiring other values; literal true requires all fields below; any other mode fails constant `store_admin_invitation_config_invalid`. Output readonly `{apiKey,sender,acceptanceOrigin,allowedStoreId,allowedRecipient}`. No process.env access at module initialization.
- Required variables: `CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY` (trimmed printable ASCII, /^re_[A-Za-z0-9_-]{6,500}$/); `CELEBIX_ADMIN_INVITATIONS_FROM` (canonical ASCII email); `CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN` (canonical HTTPS origin via existing URL builder); `CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID` (lowercase UUID); `CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT` (canonical ASCII email). No fallback to Storefront or order-email keys. These only name configuration: no secret creation, reading live env values, runtime installation or enabling.
- `InvitationEmailRequest = Readonly<{from:string;to:string;subject:string;html:string;text:string}>`; `renderInvitationEmail(payload: InvitationDeliveryPayload): InvitationEmailRequest`. Deterministic Turkish email containing store name, display name, role label, ISO expiry and single fragment-token acceptance link. Roles: admin=Yönetici, editor=Editör, analyst=Analist. Subject constant `Mağaza yönetim daveti`. Explain login uses the invited email and permission starts only after explicit acceptance. No external images/tracking/assets. Escape HTML &,<,>,double/single quotes. Validate plain exact payload with data descriptors (no getters/extra keys), canonical token/origin/emails, role, bounded safe trimmed names and canonical ISO expiry. Constant invalid error `store_admin_invitation_email_invalid`. Never write/render raw token anywhere except the fragment acceptance URL. Do not add tokens to subject or tags. Render validates but does not authorize or check expiry against clock; future worker owns eligibility.
- `sendInvitationEmail(request: InvitationEmailRequest, options: Readonly<{apiKey:string;idempotencyKey:string;timeoutMs:number;fetch?:typeof fetch}>): Promise<InvitationSendResult>`. Result union `{kind:'accepted',providerMessageId:string}` or `{kind:'retryable'|'permanent',code:string}`. Exact request/options validation, no accessors/symbols; canonical email, bounded subject250/html200000/text100000, body permits LF not other controls. API key same rule as config; timeout integer1..30000. Key `store-admin-invitation/v1/<lowercase uuid>/<positive safe integer generation>`, max256. This is the generation-bound namespace; future worker must persist exact rendered payload and reuse key, enforce24h horizon. Do not retry inside adapter.
- Fixed endpoint `https://api.resend.com/emails`, POST, redirect:'error', Authorization header, JSON to:[recipient], subject/html/text/from and Idempotency-Key. Reject endpoint override and attachments/extra fields. Timeout spans both headers and streamed body (abort and deadline race so a stalled body cannot hang). Bound response16384 bytes, fatal UTF8 decode, cancel reader on timeout/overflow without awaiting an untrusted cancellation promise. No logging/return of provider bodies or thrown error text. Validate accepted response exact `{id}` nonempty safe printable ASCII max256, only for2xx. Provider response invalid/malformed/oversized is retryable, not delivered. Return constant-safe classifications:401/403 permanent provider_configuration_invalid;429 retryable provider_rate_limited;5xx retryable provider_unavailable;409 concurrent_idempotent_requests retryable provider_request_concurrent;409 invalid_idempotent_request permanent idempotency_payload_conflict;other409 permanent provider_conflict;other4xx permanent request_invalid;network retryable provider_network_error;timeout retryable provider_timeout. No delivered state inferred.

- [ ] **Step 1: RED behavioral tests** through real parser/renderer/adapter, mocking only fetch boundary; no real network or live key. Example:

```ts
test('disabled invitations do not require or reuse another service key', () => {
  assert.equal(parseInvitationDeliveryConfig({CELEBIX_ORDER_EMAIL_RESEND_API_KEY:'re_fakefixture'}), null);
});
test('permission error stays failure without provider detail leakage', async () => {
  const result = await sendInvitationEmail(validRequest, {...validOptions,
    fetch: async () => new Response('{"message":"sensitive fixture"}', {status:403})});
  assert.deepEqual(result, {kind:'permanent',code:'provider_configuration_invalid'});
});
```

Cover enabled missing fields, malformed modes, private-key fallback rejection, canonical recipient/sender/origin, fixed recipient/sender preservation, HTML escaping and correct fragment link, three roles, invalid extra/getter payloads, deterministic rendering. Adapter tests inspect exact outgoing endpoint/body/redirect/key, distinguish accepted from delivery, stable repeat key/body, malformed input makes zero requests, no role grants. Test all above provider classes, malformed UTF8/JSON/id, oversized and indefinitely stalled body, timeout/network errors and safe errors excluding fixture secrets. Use literal expected values independent of implementation.
- [ ] **Step 2: Run RED** `node --experimental-strip-types --test apps/owner/lib/store-admin-invitations/delivery-config.test.ts apps/owner/lib/store-admin-invitations/email.test.ts apps/owner/lib/store-admin-invitations/resend.test.ts`; record expected absent modules, then implement.
- [ ] **Step 3: Implement minimal modules.** Consume Task1 normalizer, Task2 URL/token and payload types. No new dependencies. Structure rendering as validated fields, escaped HTML, deterministic text. Transport deadline must reject a promise race on abort and cleanup timer/listener/reader on every path; catch errors into constant classifications. Example outgoing body `JSON.stringify({from:request.from,to:[request.to],subject:request.subject,html:request.html,text:request.text})`. No retry loop, worker or central authority bypass.
- [ ] **Step 4: Verify** new focused tests; existing token/seal tests; existing `apps/owner/lib/order-email/resend.test.ts`; `npm run typecheck --workspace @celebix/owner`. Record exact results/warnings. Full build remains combined final gate, not this task.
- [ ] **Step 5: Commit only six files** `feat(owner): add isolated administrator invitation mail transport`. Independent review required. No real email/config changes/deploy/migration/push.

Provider contract checked against official Resend send-email and idempotency docs on 2026-09-17. The24h bound is a worker responsibility, not proof of safe lifecycle from a transport test.

Task 1 defines only public contracts, not working email delivery. Later integrations remain mandatory and uncompleted until separately executed and verified. The ASCII normalization policy fails closed on internationalized email rather than silently mapping a different recipient. Existing approved ASCII Gmail recipient is unaffected. Source-of-truth identity mapping is documented in the read-only integration map; owner-only session guards are not loosened as a shortcut.

Task 1 review clarification: displayName must already be trimmed (ordinary U+0020 outer spaces rejected), consistent with the source merchant record's `name=btrim(name)` constraint. Email normalization trims only ordinary U+0020 outer spaces; NBSP, BOM, tabs/newlines and all other non-ASCII/control whitespace are rejected, not silently stripped.
