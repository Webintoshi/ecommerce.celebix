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

### Task 4: Durable invitation lifecycle and least-privilege acceptance

Implement the persistence boundary only. Read the approved spec and the focused
`.superpowers/sdd/2026-09-16-store-admin-invitations/persistence-map.md` if present.
This is ordinary project-managed PostgreSQL16, not a Supabase migration system.
The migration sequence currently ends128; re-list and reserve129 if still free.

**Files:** Add up/down/assertions SQL under `apps/owner/scripts/sql/saas/` using
the existing numbered migration convention, and a dedicated executable harness
under `tests/saas-phase3/store-admin-invitations/`. Add a narrowly-scoped Owner
repository under `apps/owner/lib/store-admin-invitations/` with behavioral tests
if needed to establish the typed SQL interface. No route/UI/runtime wiring yet.
Do not edit existing migrations, payment modules or unrelated dirty files.

**Authority and storage requirements:**
- Central identity role alone creates/resends/revokes invitations and records
  verified grants/acceptance. Workflow alone claims/settles mail jobs. App role
  may list safe projections with the authenticated merchant tuple only. Owner
  checks repeat inside functions using current active membership, principal,
  store, subscription and plan. Browser-supplied identities are never trusted.
- Tables: store-scoped invitations (one-to-one source generic record), immutable
  operations and audit, generation-bound encrypted outbox, short-lived verified
  acceptance grants. Enable/FORCE RLS, revoke PUBLIC execution and direct table
  access, grant exact function signatures only to intended roles. Functions use
  a fixed safe search_path; no dynamic caller-controlled identifiers.
- Issue atomically snapshots source name/email/role/expiry at expected version,
  validates ASCII canonical email and allowed roles admin/editor/analyst, active
  source and future expiry, inserts invitation+outbox+operation+audit. Source is
  not deleted. No membership is created at issue. Freeze edits to converted
  source fields so an unrelated generic edit cannot mutate invitation intent.
- Persist digest only in invitation. Outbox accepts opaque bounded encrypted
  payload+key ID+digest, stable idempotency key
  `store-admin-invitation/v1/<invitation UUID>/<generation>` and rendering version.
  No plaintext token or provider raw body in operations/audit/projections.
- Replay is bound to exact operation intent and owner/store; concurrent duplicate
  issue yields exactly one invitation+job. Recovering unknown commit must be safe.
- Resend only pending/unexpired, once/minute and max5/hour, increments generation,
  rotates digest, invalidates old jobs/grants, and creates a new durable payload.
  Revoke invalidates generation authority. Expired/accepted/revoked invitations
  cannot be sent or accepted. Operations use expectedVersion and operationId.
- Grant creation is identity-role-only from server-verified issuer/subject/email,
  emailVerified must be true, canonical email must match, and grant is bound to
  invitation+generation+browser digest. It never grants membership by itself.
- Explicit acceptance consumes a matching unexpired grant+browser proof once,
  locking/rechecking pending invitation, digest/generation, expiry, current inviter
  owner authority, active store/plan. Create or validate principal by issuer+subject;
  membership unique principal/store. Preserve higher existing active role (rank
  owner>admin>editor>analyst), never reactivate revoked/inactive membership, and
  never transfer ownership. Atomic accepted state+membership+grant+audit; concurrent
  same-intent acceptance cannot create duplicates; replay returns prior result.
- Canonical admin destination comes from active verified admin_domains centrally,
  canonical first, never request returnTo. Acceptance result does not itself issue
  a panel session; the next task adds safe session issuance for accepted roles.
- Claim bounded batch via SKIP LOCKED, fenced lease token/attempt, no stale worker
  completion, current-generation/current authority recheck. Preserve first attempt
  timestamp and exact encrypted payload. Stop retries before24h replay horizon
  (include a safety margin) and classify unknown outcome rather than duplicate send.
  Provider accepted != delivered. No delivered transition from ordinary settlement.
  Dedicated verified-event ingestion must be idempotent and not broaden worker role.
- Use safe constant outcome codes and separate invitation and delivery states.
  Public projections conform to Task1 StoreAdminInvitationView exactly.

**TDD and verification:** Write executable PostgreSQL assertions/harness first,
record RED before migration exists, then implement. Use the socket-only isolated
PostgreSQL16 harness pattern from `tests/saas-phase3/order-transactional-email/`;
apply the required real migration chain, never a live database. Verify successful
issue/list/accept; wrong tenant, role and revoked inviter; unverified/wrong email;
expired/revoked/rotated token/grant; existing higher and revoked membership; duplicate
operations, concurrent issue/accept; rollback atomicity; source freeze; immutable
audit; app cannot issue/accept/write memberships/read secrets; workflow cannot
grant membership; stale lease; bounded retries; outbox payload stability; down/up
on empty disposable schema. Do not substitute SQL substring assertions for execution.
Document exact commands/counts/warnings and affected files. Commit only task files
after green, then independent review. No real migration, deploy, email or membership
write. Full task remains incomplete until auth, UI, release and real acceptance gates.

### Task 5: Exact-request encryption and durable invitation dispatch

Execution amendment: the original global claim can perform terminal housekeeping
on unrelated jobs not returned to the caller. Therefore the minimal rollback-only
option below is superseded: Task5 updates the NEW/unreleased migration129 claim
with required trusted store+recipient scope before candidate locks/housekeeping,
plus assertions/down/grants and real-PG harness. Repository captures validated
scope at construction; per-call input cannot override it. Keep decrypted-request
allowlist validation too. Unrelated expired/exhausted/cross-store rows must remain
identical, and old/missing/noncanonical scope must fail closed.
Runtime consumes existing validated Owner database/CA configuration and fixed
identity/workflow roles; no new database credential variables or NOLOGIN username
requirement. Exact database and role capabilities are preflighted in Task8.

**Files:** `apps/owner/lib/store-admin-invitations/request-seal.ts`,
`request-seal.test.ts`, `service.ts`, `service.test.ts`, `worker.ts`,
`worker.test.ts`, `runtime-config.ts`, `runtime-config.test.ts`, and narrow
repository adaptations only if Task4 interface needs them. Runtime startup and
HTTP routes belong to the subsequent combined wiring task. No live sending.

Task4 establishes SQL signatures but need not create a TypeScript repository.
If absent, add `repository.ts` and `repository.test.ts` here using existing
PostgresPoolLike: explicit SET LOCAL identity/workflow roles, transaction deadlines,
strict result parsing, rollback/discard on unknown COMMIT and fresh-connection
operation recovery. Never return raw SQL errors or let caller choose SQL roles.
Include narrow grant/accept/recovery methods needed by Task6; no generic SQL escape.
Task4 list includes `{items,hasMore}`: preserve completeness metadata through all
layers. Missing lifecycle row when hasMore=true is unknown, not 'unsent'. Use
`resend_source` for immutable snapshot/storeName, `grant_preview` only server-side
(issuer/subject must not reach browser), and fenced `delivery_authorize` immediately
before dispatch. Consume actual reviewed SQL shapes, not outdated map guesses.
Some logically read-only source/authority functions deliberately acquire row locks;
do not wrap them in PostgreSQL BEGIN READ ONLY, which forbids those locks. Use
bounded normal role transactions without introducing any state write beyond the
called reviewed function. Accepted effective role may preserve existing store_owner;
requested invitation role remains only admin/editor/analyst.

Consume Task4's reviewed SQL/repository, Task1 intents/projections, Task2 token,
Task3 renderer/transport. Preserve `ai1` payload decoder unchanged. Add `ar1`
AES256GCM seal for EXACT validated `{from,to,subject,html,text}` request serialized
once before issue. Separate AAD/purpose, same invitation+generation binding,
dedicated keyring only; maximum64KiB encrypted bytes, strict exact fields,
32-byte key,12-byteIV,16-bytetag, SHA256 digest; wipe transient plaintext and key
buffers on all paths including tag failure. Do not log secret content or provider
errors. Request equality survives decrypt/retry; no re-render in worker.

Service receives authenticated merchant authority separately from parsed public
intent. Read source, enforce configured store+recipient allowlist, generate token
and candidate IDs centrally, render+seal exact request, issue atomically through
Task4; existing converted source is not recreated. Same operation replays original
job despite fresh random candidates; unknown commit uses recovery and does not
blindly send again. Resend uses persisted snapshot and next generation with rate
limits repeated inDB. Revoke never revokes accepted memberships. Service public
results contain only safe projections and codes, never tokens/seals/provider IDs.

Worker uses a separate workflow connection/role, bounded single run/batch/leases,
decryption context and trusted clock refreshed before send/settlement. Recheck
allowlisted store+recipient+sender, generation, expiry and dispatch eligibility
immediately before send; do not send if state changed or lease expired. Send via
Task3 adapter under persisted key; accepted->provider_accepted, never delivered.
Bound8attempts and conservative replay deadline before24h (5min margin); retry
with identical key/body; after ambiguity horizon record outcome_unknown. Stale
worker cannot settle; no implicit reactivation. Surface persistence failures
without uncaught secret-bearing error messages. In-flight revoke cannot unsend
email; link acceptance must still fail and report delivery truthfully.
Claim currently has no allowlist SQL parameters. Do not claim then terminally fail
unrelated jobs or consume their attempts merely because this worker is scoped.
Minimal initial-release option: inspect claimed immutable store/request under its
still-open bounded claim transaction, commit only if every item matches configured
allowlist; otherwise rollback the entire claim and report worker configuration
blocked without sending. A blocked mixed queue is truthful and safe; do not silently
drop/rewrite recipients. If a scoped SQL claim is needed instead, report the narrow
interface change before adding it. Test nonallowlisted claim leaves persisted state
and attempts unchanged; never hold DB transaction over provider network calls.

Runtime config disabled by default, explicitly approved_staging+tierstaging only;
require dedicated provider config, dedicated payload keyring, exact database
name/role connection and bounded worker ID. Never fallback to another app's key,
enable production, or install runtime secrets in this implementation task.

TDD first: real crypto tamper/context/cleanup tests; exact repeat body/key; wrong
store/recipient causes zero provider calls; stale/expired/revoked job cannot send;
timeouts/maxattempts/horizon/commit-unknown; deterministic replay; provideraccepted
distinct from delivery; stable service operations. Mock only network/DB boundary,
exercise actual service/worker/crypto. Run focused new tests and existing invitation
token/seal/transport plus order-email regression and Owner typecheck. Commit only
task files after green; independent review. Full build remains final combined gate.

### Task 6: Purpose-bound invitation identity and member login

Consume the reviewed Task4 repository and the inspected auth proposal in this
plan's SDD workspace. Implement Owner identity/service and additive session SQL
only; wire signed HTTP and Panel routes in Task7. No live operation.

**Files:** Owner `lib/self-serve-oidc.ts`,
`lib/saas-persistence/postgres-oidc-transaction-store.ts` and existing tests;
`lib/store-admin-invitations/auth-service.ts` and focused tests; narrow Task4
repository extensions; a new additive numbered session migration/assertions/down
and disposable invitation harness tests. Do not edit historical SQL or generalize
owner-only operations. Reserve the next free migration number after Task4.

Invitation acceptance runs at configured central `authority.panelOrigin`: OIDC
callback and host-only pre-auth proof already reside there. Enforce delivery
acceptanceOrigin equality at runtime before enabling; never hardcode/infer host.
Add exclusive encrypted OIDC payload schema3, `pinvite_` state, literal returnTo
`/invitations/confirm`, existing fixed redirectUri and PKCE/nonce/issuer/audience
checks. Preserve existing schema1 registration/schema2 returning login unchanged.
Invitation context contains server-created invitationId, generation, tokenDigest,
browser-binding keyId/digest, grantId and opaque grant credential. It must exclude
panelLoginBinding and panelLoginDestinationHostname. Never store raw invite token.
Grant credential is `ig1.<canonical32-byte-base64url>` with separate digest purpose;
only its encrypted OIDC copy supports lost-callback recovery. DB stores digest.

Add invitation binding inspection on active schema3; state prefix alone is never
authority. Malformed schema/prefix/context fails closed. Completion independently
verifies same browser proof against consumed transaction and yields trusted
invitation context plus verified identity. Prompt login for explicit identity
selection; verified normalized email equality remains authoritative. Provider
error rejection and replay stay purpose-bound and must never create a tenant.

Auth service start resolves token digest and pins immutable intent. Successful
callback only creates the short-lived verified grant, not membership/session.
Recover consumed schema3 only by matching browser proof plus a real durable grant;
never infer identity verification from consumed status, rerun code exchange, extend
expiry or recreate a grant from caller identity. Confirmation preview is read-only.
Explicit accept uses stable operation ID, safe commit recovery, DB-owned role and
destination, then issues the normal session using server-resolved verified identity.
If acceptance commits but session fails, return truthful accepted/access-retry
state recoverably, not a false unaccepted result. No session before confirmed commit.

Additive SQL replaces only exact-host returning session issue/recover membership
predicate with active store_owner/admin/editor/analyst. Preserve issuer/subject,
verified email, store, active verified exact admin domain, plan/subscription,
expiry/locking/recovery guards. Normal subsequent login must work, not merely
first acceptance. Existing owner-only writes/invitation issuance stay owner-only.
Existing cross-host handoff120/custom redemption125 must work under real admin
role without broadening authorization elsewhere.

TDD first: schema1/2 regression; schema3 roundtrip/AAD, mismatched prefix/context,
wrong/missing proof, wrong issuer/audience/nonce/unverified or mismatched email,
callback replay only with committed grant, provider errors never registration;
explicit accept recovery and no session before commit; revoked/stale grant denied.
Real disposable PG tests active admin/editor/analyst normal login+recovery, denied
revoked/invited membership, preserved owner-only writes, exact-host handoff120/125.
Run focused OIDC/persistence/returning-login/invitation tests and Owner typecheck.
Commit explicit task files, independently review. No release or real email.

### Task 7: Signed invitation flow and explicit browser acceptance

Routing refinement: implement public accept/confirm as route-handler HTML surfaces
with escaped safe markup and a small first-party fragment client/restrictive CSP.
Next cannot mount page.tsx and route.ts at one path, and GET must issue CSRF cookie.
Preserve scanner-safe GET + explicit POST /invitations/accept, not a conflicting
page/route pair or Server Component cookie writes. No third-party assets/redesign.

Implement against Task6 actual interfaces and existing signed gateways, not an
unsigned identity shortcut. Read the detailed auth proposal in the SDD workspace.
Files: Owner panel-browser-binding/internal-gateway and tests;
panel-session-handoff internal-response/internal-gateway/internal-callback-handler
and tests; Panel panel-browser-binding-bootstrap transport and tests,
panel-session-completion transport/completion and tests; new Panel
lib/store-admin-invitations auth-handler/cookie/client and app/invitations pages
and routes; narrowly related auth composition/runtime/mount and readiness tests.

Add exact signed browser gateway requests4 invitation_start(token, browser proof),
5 invitation_preview(grant credential, browser proof),6 invitation_accept(grant,
browser proof, operationId). Browser never supplies role/store/identity/return URL.
Preserve HMAC domains, exact keys/canonical bytes/body limits, timestamp/deadline,
request-bound response verification, private-header rejection. New response3 kinds
login_ready, confirmation safe projection, session_ready, allowlisted rejection;
strict discriminated parsers, no arbitrary pass-through. Callback request2 stays
byte compatible. Add signed callback response2 invitation_confirmation_ready with
grant credential, expiry and literal `/invitations/confirm` continuation only.
Dispatch invitation before both returning login and registration, including errors;
recognized invitation failure never falls through to registration/tenant creation.

Public landing `/invitations/accept#token=...` is scanner-safe GET, no-store,
no-referrer, no analytics/third-party assets. First-party client reads fragment,
immediately removes it with replaceState, keeps token in memory only until user
Continue. Same-origin CSRF POST `/invitations/start` creates browser proof and OIDC
redirect; no query/storage/token-bearing DOM links. Callback preserves pre-auth
cookie and creates separate short-lived `__Host-celebix_invitation_grant` cookie
Secure/HttpOnly/SameSite=Lax/Path=/, expiry bounded by grant+proof, no Domain.
It redirects to confirmation without panel session or membership. Confirmation
GET resolves safe store/role/email projection and renders explicit Accept. POST
accept validates exact external origin, bounded body and host-only random CSRF
cookie/hidden nonce with timing-safe comparison; reject duplicate/ambiguous cookies.
Stable operation ID survives uncertain retries. No GET can consume an invitation.
Keep the acceptance operation ID stable across confirmation refresh as well as
duplicate clicks (for example a separate short-lived host-only HttpOnly operation
cookie associated with the current grant, rotated only for a genuinely new grant).
An opaque operation UUID is deduplication, not authority. Do not put raw token/grant
in browser storage or mint a new acceptance intent after an uncertain commit.
Test lost acceptance response followed by refresh and retry; it must recover the
same committed acceptance without duplicate membership or a misleading failure.

Extract narrowly typed existing trusted session presenter from completion.ts so
accepted signed session result reuses exact-host handoff; never fabricate callback
code, expose session credential as public JSON/HTML or copy cookies across hosts.
Clear invitation cookies after completed handoff/final invalidation, retain safe
recovery state on transport uncertainty. Preserve old callback cookie semantics.
Runtime disabled by default and approved-staging only; origin equality mandatory.

TDD: signed tamper/time/schema/extra authority rejection, purpose isolation/no tenant
creation, pre-auth preservation, fixed redirect/cookie flags, GET no accept, bad
Origin/CSRF/cookies, fragment hygiene, stable acceptance retry, post-commit session
failure, exact-host handoff. Existing registration/returning login regressions.
Browser fixture flow includes fake IdP, keyboard/focus/narrow viewport; never real
recipient impersonation. Run focused tests plus both app typechecks, commit explicit
files, independent review. Combined builds/security/release remain later gates.

### Task 8: Owner-authorized management UI and gated runtime startup

Integration refinements: preserve200-view/hasMore list contract with separately
bounded management-response limit at most256KiB, retaining existing16KiB auth
limits and all stream/deadline/signature checks. Test worst-sized valid list and
oversize rejection. Source-save server validation must require absolute ISO UTC
expiry, canonical email and allowed role for administrator_invite only. New129
source reader also rejects relative/date-style expiry before source/render/issue
can disagree. Add HTTP and real-PG coverage, no live correction/backfill.

Read the management-ui-runtime proposal in this plan's SDD workspace and consume
reviewed Tasks4–7. No existing merchant Panel-to-Owner transport exists; ordinary
merchant HTTP calls the app-role repository locally. Do not pretend generic record
saving sends mail or grants authority. Add one narrow signed schema7 management
variant to the existing Owner browser-binding gateway, not arbitrary RPC:
sessionCredential + validated actual requestHostname + action(list/send/resend/
revoke) + exact Task1 intent where needed. Never transmit caller authority tuples
as sufficient proof. Owner independently resolves durable session, active verified
same-store admin domain, current owner/plan using its own clock. Add narrow identity-
only SQL resolver if existing roles lack host lookup; no runtime role grants.
Safe signed response schema4 returns exact invitation views, replay bit or safe
rejection only. Preserve cryptographic/protocol checks and all prior schemas.

Files: narrow Owner gateway/runtime/composition updates; new invitation
management-service/runtime/default/worker-runtime/worker-default and tests; Panel
invitation management-http/default/client/presentation and tests, four API routes
under `/api/store-admin-invitations`, dedicated StoreAdminInvitationsConsole,
administrators list/new/edit page guards, scoped CSS and route tests. Add numbered
resolver migration and disposable tests if required. No unrelated module redesign.

Public APIs GET list and POST send/resend/revoke reuse strict method/path/body,
same-origin+CSRF, cookie/private-header protections and durable Panel host/session
resolution; require explicit store_owner locally and centrally. Never accept store,
actor, role, email or plan from action JSON. Retry uses same operation ID and exact
intent/version, including ambiguous transport outcomes. No duplicate source save
or silently regenerated operation. Unknown lifecycle read displays unknown, not
unsent. Join successful lifecycle list to source records by sourceRecordId only.

Replace only administrators list with dedicated invitation statuses. Unconverted
generic Active record reads 'Henüz gönderilmedi'; pending 'Kabul bekliyor', accepted
'Davet kabul edildi', revoked 'İptal edildi', expired 'Süresi doldu'. Delivery states
are separate: queued/sending/provider accepted/delivered/failed/outcome unknown.
Provider accepted never means inbox received; accepted invite never proves current
membership remains active. Show Send only valid unconverted record; Resend only
eligible pending; Revoke only pending, never imply membership deletion. Preserve
both source records and select only the explicitly requested recipient at release.
Converted snapshot is immutable/read-only. Owner-only new/edit source forms retain
existing allowed roles (no owner), label save 'Kaydet (göndermez)', preserve errors.
No bulk conversion, automatic send, unsupported active-manager count or fake success.
Owner-only source-form policy must be enforced at its server handler too, not just
page/button visibility. If reusing generic merchant source endpoints, apply the
narrow administrator_invite-kind owner check there with forged-admin tests; leave
all unrelated generic kinds and configuration permissions unchanged.

Compose existing verified-TLS Owner DB config (CA + rejectUnauthorized) and separate
explicit identity/workflow transactions; no connectionString-only TLS shortcut.
Runtime disabled by default, exact approved staging DB/tier, configured acceptance
origin equals central panelOrigin, dedicated payload keyring/provider config and
store/recipient allowlist. Preflight exact signatures/roles/schema, never perform
runtime GRANT. Missing invitation readiness must not disable ordinary auth/catalog.
Independent worker instrumentation entry, singleton/no overlapping ticks, delayed
retry, graceful drain/close and owned-buffer wipe. Disabled means no pool or network.
Verify fresh state before send; nonallowlisted jobs must not be silently claimed
and dropped. Existing order/provider/domain workers and their keys remain unchanged.

TDD: forged/nonowner/wrong-session-host/Origin/CSRF denial; schema7 crossover and
signature checks; central authority revocation; client stable retry/version conflict;
legacy unknown vs unsent; lifecycle/delivery labels; admin forbidden owner actions;
input preservation, keyboard/narrow UI; disabled no-op, real TLS config, capability
preflight and isolated worker failure. Update intentional generic-route expectations
only. Both apps typecheck, focused regressions and independent review. No live send.
Register new Panel invitation tests in its existing explicit test command with the
appropriate react-server conditions; Owner already discovers tests recursively.
Do not change dependencies or unrelated test selection. Final combined verification
also runs existing auth/session suites not covered by Panel's merchant-focused glob.
Add a narrowly named invitation staging migration runner and focused injected-client
tests under apps/owner/scripts, not a rewrite of the existing runner hardcoded088.
Allowlist exact final invitation SQL/assertions only; approved staging tier/database,
verified TLS, migration-owner capability, predecessor/PG16 checks, bounded locks,
complete-state idempotency and fail-closed partial-state checks. No ambient arbitrary
SQL filename. Secret-free outputs. Runner is local code here; never execute it
against real DB in Task8. Existing100/112 hooks remain untouched.

### Task 9: Combined verification and controlled staging acceptance

Whole-feature independent security review across approved baseline to exact candidate.
Run both app test/typecheck/build plus shared contracts/data and focused isolated PG
auth/session/handoff/invitation regressions on combined source. Preserve baseline
warnings/skips and unrelated dirty files. No cleanup, resets or broad staging.
Browser fixture verifies recipient landing/explicit acceptance and owner management;
label it isolated, not actual mailbox/login evidence. Fix only task findings.

Then record fresh exact app pins/images/running metadata, four automatic trigger
settings and queue, existing hooks and a staging DB rollback/backup plan. Preserve
previous images and matched config. Use only approved additive migrations on exact
staging DB after readiness+backup, no down with material invitation/audit data.
Controlled Owner+Panel release only, no other apps/production/payment-policy/DNS/
merge/auto-deploy change. Existing release safety generators remain required; do
not bypass checks or silently transfer a separate exact-SHA authorization.

Configure dedicated invitation runtime only within approved staging scope, preserving
secret confidentiality. Verify exact source/build/runtime identity, HTTP health,
normal owner login/session and worker/readiness before conversion. Resolve matching
requested recipient's source ID/version read-only (identity kept privately). Send that single existing record exactly
once through dedicated UI/service, verify durable operation/job/provider response.
Provider acceptance, delivery and user acceptance are separate evidence. Recipient
must personally open mailbox/verified IdP and explicitly accept; no impersonation,
password/code requests or cookie transfer. Only then verify correct admin membership
and protected Güzide page. Preserve previous recipient record without sending.
If recipient interaction is necessary, request only that concrete step with safe
screen/link; never claim entire completion before actual acceptance/access evidence.
